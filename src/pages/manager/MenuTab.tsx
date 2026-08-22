import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { formatCurrency, floorToTwo } from '../../lib/utils';
import ConfirmModal from '../../components/ConfirmModal';

export default function MenuTab() {
  const store = useAppStore();
  
  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [isDeleting, setIsDeleting] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [idMenu, setIdMenu] = useState('');
  const [namaMenu, setNamaMenu] = useState('');
  const [tipeMenu, setTipeMenu] = useState('Satuan');
  const [hargaJual, setHargaJual] = useState<number | ''>('');
  const [hppManual, setHppManual] = useState<number | ''>('');
  const [tampilDiKalkulator, setTampilDiKalkulator] = useState(true);
  
  // Array of resep items: either id_bahan for Satuan or id_menu_satuan for Paket
  const [resep, setResep] = useState<{ id: string, qty: number }[]>([]);

  const handleOpenModal = (m?: any) => {
    if (m) {
      setIdMenu(m.id_menu);
      setNamaMenu(m.nama_menu);
      setTipeMenu(m.tipe_menu);
      setHargaJual(m.harga_jual);
      setHppManual(m.hpp_manual !== null && m.hpp_manual !== undefined ? m.hpp_manual : '');
      setTampilDiKalkulator(m.tampil_di_kalkulator !== false);
      
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
      setHppManual('');
      setTampilDiKalkulator(true);
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
        hpp_manual: hppManual === '' ? null : Number(hppManual),
        tampil_di_kalkulator: tampilDiKalkulator,
        resep: resepPayload
      };

      if (idMenu) {
        await supabase.from('menu').update(payload).eq('id_menu', idMenu);
      } else {
        await supabase.from('menu').insert([payload]);
      }

      await supabase.rpc('recalculate_all_menu_hpp');
      setModalOpen(false);
      
      const { data } = await supabase.from('menu').select('*');
      if (data) store.setMenu(data);
      
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleKalkulator = async (m: any, isChecked: boolean) => {
    try {
      await supabase.from('menu').update({ tampil_di_kalkulator: isChecked }).eq('id_menu', m.id_menu);
      const { data } = await supabase.from('menu').select('*');
      if (data) store.setMenu(data);
    } catch (err: any) {
      console.error("Gagal memperbarui status tampil di kalkulator:", err);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Menu',
      message: 'Yakin ingin menghapus menu ini',
      onConfirm: () => executeDelete(id)
    });
  };

  const executeDelete = async (id: string) => {
    try {
      setIsDeleting(true);
      const { error } = await supabase.from('menu').delete().eq('id_menu', id);
      if (error) {
        console.error("Gagal menghapus menu:", error);
        alert("Gagal menghapus menu: " + error.message);
      }
      await store.fetchData();
    } catch (err: any) {
      console.error("Error menghapus menu:", err);
      alert("Error menghapus menu: " + err.message);
    } finally {
      setIsDeleting(false);
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
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
        <h1>Menu dan Resep</h1>
        {!isWaiters && <button className="btn btn-primary" onClick={() => handleOpenModal()}>Tambah Menu Baru</button>}
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
                <th>HPP</th>
                <th>Untung</th>
                <th>Komposisi</th>
                {!isWaiters && <th style={{ textAlign: 'center' }}>Visibility</th>}
                {!isWaiters && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {sortedMenu.length === 0 ? (
                <tr><td colSpan={isWaiters ? 6 : 8} style={{ textAlign: 'center' }}>Belum ada data menu</td></tr>
              ) : sortedMenu.map(m => {
                let resepText: string[] = [];
                let totalModal = 0;

                if (m.resep && m.resep.length > 0) {
                  if (m.tipe_menu === 'Satuan') {
                    m.resep.forEach((r: any) => {
                      const b = store.bahan.find(x => x.id_bahan === r.id_bahan);
                      if (b) {
                        resepText.push(`${b.nama_bahan} ${r.qty}`);
                        totalModal += floorToTwo(b.harga_per_unit || 0) * floorToTwo(r.qty);
                      }
                    });
                  } else {
                    m.resep.forEach((r: any) => {
                      const ms = store.menu.find(x => x.id_menu === r.id_menu_satuan);
                      if (ms) {
                        resepText.push(`${ms.nama_menu} ${r.qty}`);
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

                const hasManualHpp = m.hpp_manual !== null && m.hpp_manual !== undefined && Number(m.hpp_manual) > 0;
                const finalHpp = hasManualHpp ? Number(m.hpp_manual) : floorToTwo(m.hpp_terakhir || totalModal);
                const keuntungan = floorToTwo(m.harga_jual) - finalHpp;

                return (
                  <tr key={m.id_menu}>
                    <td><strong>{m.nama_menu}</strong></td>
                    <td><span className={`badge ${m.tipe_menu === 'Paket' ? 'badge-paket' : 'badge-satuan'}`}>{m.tipe_menu}</span></td>
                    <td>{formatCurrency(m.harga_jual)}</td>
                    <td>
                      <span style={{ color: 'var(--danger-color)', fontWeight: 'bold' }}>{formatCurrency(finalHpp)}</span>
                    </td>
                    <td><span style={{ color: 'var(--success-color)', fontWeight: 'bold' }}>{formatCurrency(keuntungan)}</span></td>
                    <td style={{ maxWidth: '250px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{resepText.join(', ') || '-'}</td>
                    {!isWaiters && (
                      <td style={{ textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                          checked={m.tampil_di_kalkulator !== false} 
                          onChange={e => handleToggleKalkulator(m, e.target.checked)} 
                        />
                      </td>
                    )}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group">
                  <label>Nama Menu</label>
                  <input type="text" required value={namaMenu} onChange={e => setNamaMenu(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Tipe Menu Kategori</label>
                  <select required value={tipeMenu} onChange={e => {
                    setTipeMenu(e.target.value);
                    setResep([]);
                  }}>
                    <option value="Satuan">Satuan Minuman Makanan</option>
                    <option value="Paket">Paket</option>
                    <option value="Wedding Package">Wedding Package</option>
                    <option value="Birthday Package">Birthday Package</option>
                    <option value="Package Kerjasama">Package Kerjasama</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="form-group">
                  <label>Harga Jual</label>
                  <input type="number" step="0.01" required value={hargaJual} onChange={e => setHargaJual(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label>HPP Manual Opsional</label>
                  <input type="number" step="0.01" placeholder="Otomatis jika kosong" value={hppManual} onChange={e => setHppManual(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
                <input 
                  type="checkbox" 
                  id="chk_kalkulator" 
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  checked={tampilDiKalkulator} 
                  onChange={e => setTampilDiKalkulator(e.target.checked)} 
                />
                <label htmlFor="chk_kalkulator" style={{ margin: 0, cursor: 'pointer', fontSize: '0.9rem' }}>Visibility Kalkulator</label>
              </div>

              <h3 style={{ margin: '15px 0', fontSize: '1.1rem' }}>Resep Komposisi</h3>
              <div id="resep-container">
                {resep.map((r, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <select className="form-control" style={{ flex: 2 }} required value={r.id} onChange={e => {
                      const newResep = [...resep];
                      newResep[idx].id = e.target.value;
                      setResep(newResep);
                    }}>
                      <option value="">Pilih Item</option>
                      {tipeMenu === 'Satuan' ? 
                        store.bahan.map(b => <option key={b.id_bahan} value={b.id_bahan}>{b.nama_bahan} - {b.satuan}</option>) :
                        store.menu.filter(m => m.tipe_menu === 'Satuan').map(m => <option key={m.id_menu} value={m.id_menu}>{m.nama_menu}</option>)
                      }
                    </select>
                    <input type="number" className="form-control" style={{ flex: 1 }} placeholder="Jumlah Qty" min="0.01" step="0.01" required value={r.qty || ''} onChange={e => {
                      const newResep = [...resep];
                      newResep[idx].qty = Number(e.target.value);
                      setResep(newResep);
                    }} />
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => {
                      const newResep = [...resep];
                      newResep.splice(idx, 1);
                      setResep(newResep);
                    }}>Hapus Item</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-secondary btn-sm w-100" style={{ marginBottom: '15px' }} onClick={() => {
                setResep([...resep, { id: '', qty: 0 }]);
              }}>Tambah Bahan Komposisi</button>

              <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>Simpan Menu</button>
            </form>
          </div>
        </div>
      )}

      {/* Reusable Modern Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        isLoading={isDeleting}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

    </div>
  );
}
