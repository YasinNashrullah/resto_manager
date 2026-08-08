import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { formatCurrency, floorToTwo } from '../../lib/utils';

export default function MenuTab() {
  const store = useAppStore();
  
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [idMenu, setIdMenu] = useState('');
  const [namaMenu, setNamaMenu] = useState('');
  const [tipeMenu, setTipeMenu] = useState('Satuan');
  const [hargaJual, setHargaJual] = useState<number | ''>('');
  
  // Array of resep items: either id_bahan (for Satuan) or id_menu_satuan (for Paket)
  const [resep, setResep] = useState<{ id: string, qty: number }[]>([]);

  const handleOpenModal = (m?: any) => {
    if (m) {
      setIdMenu(m.id_menu);
      setNamaMenu(m.nama_menu);
      setTipeMenu(m.tipe_menu);
      setHargaJual(m.harga_jual);
      
      const parsedResep = m.resep || [];
      const newResep = parsedResep.map((r: any) => ({
        id: m.tipe_menu === 'Satuan' ? r.id_bahan : r.id_menu_satuan,
        qty: r.qty
      }));
      setResep(newResep);
    } else {
      setIdMenu('');
      setNamaMenu('');
      setTipeMenu('Satuan');
      setHargaJual('');
      setResep([]);
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaMenu || !tipeMenu || hargaJual === '') return;
    
    setIsSubmitting(true);
    try {
      const resepPayload = resep.map(r => {
        if (tipeMenu === 'Satuan') {
          return { id_bahan: r.id, qty: r.qty };
        } else {
          return { id_menu_satuan: r.id, qty: r.qty };
        }
      });

      const payload = {
        nama_menu: namaMenu,
        tipe_menu: tipeMenu,
        harga_jual: Number(hargaJual),
        resep: resepPayload
      };

      if (idMenu) {
        await supabase.from('menu').update(payload).eq('id_menu', idMenu);
      } else {
        await supabase.from('menu').insert([payload]);
      }
      
      setModalOpen(false);
      
      // Refresh menu
      const { data } = await supabase.from('menu').select('*');
      if (data) store.setMenu(data);
      
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Yakin ingin menghapus menu ini?")) {
      await supabase.from('menu').delete().eq('id_menu', id);
      const { data } = await supabase.from('menu').select('*');
      if (data) store.setMenu(data);
    }
  };

  const typeOrder: Record<string, number> = {
    'Satuan': 1,
    'Paket': 2,
    'Wedding Package': 3,
    'Birthday Package': 4,
    'Package Kerjasama': 5
  };

  const sortedMenu = [...store.menu].sort((a, b) => {
    const orderA = typeOrder[a.tipe_menu] || 99;
    const orderB = typeOrder[b.tipe_menu] || 99;
    
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return floorToTwo(a.harga_jual) - floorToTwo(b.harga_jual);
  });

  const isWaiters = document.body.classList.contains('role-waiters');

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action">
        <h1>Menu & Resep</h1>
        {!isWaiters && <button className="btn btn-primary" onClick={() => handleOpenModal()}>+ Tambah Menu Baru</button>}
      </div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3>Daftar Menu</h3>
        </div>
        <div className="table-responsive">
          <table id="table-menu">
            <thead>
              <tr>
                <th>Nama Menu</th>
                <th>Kategori</th>
                <th>Harga Jual</th>
                <th>Total Modal (HPP)</th>
                <th>Keuntungan K. / Porsi</th>
                <th>Komposisi (Resep)</th>
                {!isWaiters && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {sortedMenu.length === 0 ? (
                <tr><td colSpan={isWaiters ? 6 : 7} style={{ textAlign: 'center' }}>Belum ada data menu</td></tr>
              ) : sortedMenu.map(m => {
                let resepText: string[] = [];
                let totalModal = 0;

                if (m.resep && m.resep.length > 0) {
                  if (m.tipe_menu === 'Satuan') {
                    m.resep.forEach((r: any) => {
                      const b = store.bahan.find(x => x.id_bahan === r.id_bahan);
                      if (b) {
                        resepText.push(`${b.nama_bahan} (x${r.qty})`);
                        totalModal += floorToTwo(b.harga_per_unit || 0) * floorToTwo(r.qty);
                      }
                    });
                  } else {
                    m.resep.forEach((r: any) => {
                      const ms = store.menu.find(x => x.id_menu === r.id_menu_satuan);
                      if (ms) {
                        resepText.push(`${ms.nama_menu} (x${r.qty})`);
                        if (ms.resep) {
                          ms.resep.forEach((r2: any) => {
                            const b = store.bahan.find(x => x.id_bahan === r2.id_bahan);
                            if (b) totalModal += floorToTwo(b.harga_per_unit || 0) * floorToTwo(r2.qty) * floorToTwo(r.qty);
                          });
                        }
                      }
                    });
                  }
                }

                const keuntungan = floorToTwo(m.harga_jual) - totalModal;

                return (
                  <tr key={m.id_menu}>
                    <td><strong>{m.nama_menu}</strong></td>
                    <td><span className={`badge ${m.tipe_menu === 'Paket' ? 'badge-paket' : 'badge-satuan'}`}>{m.tipe_menu}</span></td>
                    <td>{formatCurrency(m.harga_jual)}</td>
                    <td><span style={{ color: 'var(--danger-color)', fontWeight: 'bold' }}>{formatCurrency(totalModal)}</span></td>
                    <td><span style={{ color: 'var(--success-color)', fontWeight: 'bold' }}>{formatCurrency(keuntungan)}</span></td>
                    <td style={{ maxWidth: '250px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{resepText.join(', ') || '-'}</td>
                    {!isWaiters && (
                      <td>
                        <button className="btn btn-sm btn-primary" onClick={() => handleOpenModal(m)}>Edit</button>
                        <button className="btn btn-sm btn-danger" style={{ marginLeft: '5px' }} onClick={() => handleDelete(m.id_menu)}>Hapus</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <span className="close-btn" onClick={() => setModalOpen(false)}>&times;</span>
            <h2>{idMenu ? 'Edit Menu' : 'Tambah Menu Baru'}</h2>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Nama Menu</label>
                <input type="text" required value={namaMenu} onChange={e => setNamaMenu(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Tipe Menu / Kategori</label>
                <select required value={tipeMenu} onChange={e => {
                  setTipeMenu(e.target.value);
                  setResep([]);
                }}>
                  <option value="Satuan">Satuan (Minuman/Makanan)</option>
                  <option value="Paket">Paket</option>
                  <option value="Wedding Package">Wedding Package</option>
                  <option value="Birthday Package">Birthday Package</option>
                  <option value="Package Kerjasama">Package Kerjasama</option>
                </select>
              </div>
              <div className="form-group">
                <label>Harga Jual ($)</label>
                <input type="number" step="0.01" required value={hargaJual} onChange={e => setHargaJual(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>

              <h3 style={{ margin: '15px 0', fontSize: '1.1rem' }}>Resep / Komposisi</h3>
              <div id="resep-container">
                {resep.map((r, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <select className="form-control" style={{ flex: 2 }} required value={r.id} onChange={e => {
                      const newResep = [...resep];
                      newResep[idx].id = e.target.value;
                      setResep(newResep);
                    }}>
                      <option value="">-- Pilih --</option>
                      {tipeMenu === 'Satuan' ? 
                        store.bahan.map(b => <option key={b.id_bahan} value={b.id_bahan}>{b.nama_bahan} ({b.satuan})</option>) :
                        store.menu.filter(m => m.tipe_menu === 'Satuan').map(m => <option key={m.id_menu} value={m.id_menu}>{m.nama_menu}</option>)
                      }
                    </select>
                    <input type="number" className="form-control" style={{ flex: 1 }} placeholder="Qty" min="0.01" step="0.01" required value={r.qty || ''} onChange={e => {
                      const newResep = [...resep];
                      newResep[idx].qty = Number(e.target.value);
                      setResep(newResep);
                    }} />
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => {
                      const newResep = [...resep];
                      newResep.splice(idx, 1);
                      setResep(newResep);
                    }}>X</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-secondary btn-sm w-100" style={{ marginBottom: '15px' }} onClick={() => {
                setResep([...resep, { id: '', qty: 0 }]);
              }}>+ Tambah Bahan / Komposisi</button>

              <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>Simpan Menu</button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
