import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, getJakartaDate, getWeekRange } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';

export default function StaffMealTab() {
  const store = useAppStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [tanggal, setTanggal] = useState('');
  const [namaPegawai, setNamaPegawai] = useState('');
  const [items, setItems] = useState<{ id_menu: string, qty: number }[]>([]);

  // Filter & Pagination State
  const [activeWeeks, setActiveWeeks] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [limit, setLimit] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [staffMealList, setStaffMealList] = useState<any[]>([]);

  useEffect(() => {
    fetchWeeks();
  }, [store.staff_meal]);

  useEffect(() => {
    fetchData();
  }, [selectedWeek, limit, currentPage, store.staff_meal]);

  async function fetchWeeks() {
    const { data } = await supabase.from('staff_meal').select('tanggal').order('tanggal', { ascending: false });
    if (data) {
      const weeksMap = new Map();
      data.forEach(p => {
        const wr = getWeekRange(p.tanggal);
        if (wr) weeksMap.set(wr.key, wr.label);
      });
      const sorted = Array.from(weeksMap.entries()).sort((a,b) => b[0].localeCompare(a[0]));
      setActiveWeeks(sorted);
      if (sorted.length > 0 && !selectedWeek) {
        setSelectedWeek(sorted[0][0]);
      }
    }
  }

  async function fetchData() {
    if (!selectedWeek) return;
    let query = supabase.from('staff_meal')
      .select('*')
      .gte('tanggal', selectedWeek.split(' to ')[0])
      .lte('tanggal', selectedWeek.split(' to ')[1])
      .order('id_meal', { ascending: false });

    if (limit !== 1000) {
      query = query.range((currentPage - 1) * limit, currentPage * limit - 1);
    }
    
    const { data } = await query;
    if (data) setStaffMealList(data);
  }

  const handleOpenModal = () => {
    setTanggal(getJakartaDate());
    setNamaPegawai('');
    setItems([{ id_menu: '', qty: 1 }]);
    setModalOpen(true);
  };

  const getMenuHpp = (id_menu: string) => {
    const m = store.menu.find(x => x.id_menu === id_menu);
    if (!m || !m.resep) return 0;
    
    let hpp = 0;
    m.resep.forEach((r: any) => {
        if (m.tipe_menu === 'Satuan') {
            const b = store.bahan.find(x => x.id_bahan === r.id_bahan);
            if(b) hpp += Number(b.harga_per_unit || 0) * Number(r.qty);
        } else {
            const ms = store.menu.find(x => x.id_menu === r.id_menu_satuan);
            if (ms && ms.resep) {
                ms.resep.forEach((r2: any) => {
                    const b = store.bahan.find(x => x.id_bahan === r2.id_bahan);
                    if (b) hpp += Number(b.harga_per_unit || 0) * Number(r2.qty) * Number(r.qty);
                });
            }
        }
    });
    return hpp;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter(i => i.id_menu && i.qty > 0);
    if (validItems.length === 0) {
      alert("Harap tambahkan setidaknya 1 menu.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payloads = validItems.map(item => {
        const hppSatuan = getMenuHpp(item.id_menu);
        return {
            tanggal: tanggal,
            nama_ic: namaPegawai,
            id_menu: item.id_menu,
            qty: item.qty,
            total_hpp: hppSatuan * item.qty
        };
      });

      await supabase.from('staff_meal').insert(payloads);
      
      setModalOpen(false);
      const { data } = await supabase.from('staff_meal').select('*').gte('tanggal', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      if (data) store.setStaffMeal(data);
      
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Yakin ingin menghapus catatan staff meal ini? Stok bahan akan dikembalikan otomatis.")) {
      await supabase.from('staff_meal').delete().eq('id_meal', id);
      const { data } = await supabase.from('staff_meal').select('*').gte('tanggal', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      if (data) store.setStaffMeal(data);
    }
  };

  const isReadOnly = document.body.classList.contains('role-waiters') || document.body.classList.contains('role-chef');

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action">
        <div>
          <h1 style={{ display: 'inline-block' }}>Konsumsi Pegawai (Staff Meal)</h1>
        </div>
        {!isReadOnly && <button className="btn btn-warning" onClick={() => handleOpenModal()}>+ Input Konsumsi Staff Meal</button>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3>Riwayat Konsumsi Staff Meal</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <select className="form-control" style={{ width: 'auto', padding: '5px' }} value={selectedWeek} onChange={e => { setSelectedWeek(e.target.value); setCurrentPage(1); }}>
              {activeWeeks.map(w => (
                <option key={w[0]} value={w[0]}>{w[1]}</option>
              ))}
              {activeWeeks.length === 0 && <option value="">Belum ada data</option>}
            </select>
            <label style={{ fontSize: '0.9rem', margin: 0 }}>Tampilkan:</label>
            <select className="form-control" style={{ width: 'auto', padding: '5px' }} value={limit} onChange={e => { setLimit(Number(e.target.value)); setCurrentPage(1); }}>
              <option value="5">5 baris</option>
              <option value="10">10 baris</option>
              <option value="1000">Semuanya</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table id="table-staff-meal">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Nama Pegawai</th>
                <th>Menu Konsumsi</th>
                <th>Jumlah (Porsi)</th>
                <th>Total HPP (Modal)</th>
                {!isReadOnly && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {staffMealList.length === 0 ? (
                <tr><td colSpan={isReadOnly ? 5 : 6} style={{ textAlign: 'center' }}>Belum ada log konsumsi staff meal</td></tr>
              ) : staffMealList.map(d => {
                const menu = store.menu.find(m => m.id_menu === d.id_menu);
                const namaMenu = menu ? menu.nama_menu : "Unknown Menu";
                const wr = getWeekRange(d.tanggal);
                const isClosed = wr ? store.periode_ditutup.includes(wr.key) : false;
                
                return (
                  <tr key={d.id_meal}>
                    <td>{d.tanggal}</td>
                    <td>{d.nama_ic}</td>
                    <td>{namaMenu}</td>
                    <td className="text-primary font-weight-bold">{d.qty}</td>
                    <td className="text-danger font-weight-bold">{formatCurrency(d.total_hpp)}</td>
                    {!isReadOnly && (
                      <td>
                        <button className={`btn btn-sm ${isClosed ? 'btn-secondary' : 'btn-danger'}`} disabled={isClosed} onClick={() => handleDelete(d.id_meal)}>Hapus</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-sm btn-secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(c => c - 1)}>Prev</button>
            <span>Halaman {currentPage}</span>
            <button className="btn btn-sm btn-secondary" disabled={staffMealList.length < limit && limit !== 1000} onClick={() => setCurrentPage(c => c + 1)}>Next</button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <span className="close-btn" onClick={() => setModalOpen(false)}>&times;</span>
            <h2>Input Laporan Staff Meal</h2>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Tanggal Konsumsi</label>
                <input type="date" required value={tanggal} onChange={e => setTanggal(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Dikonsumsi Oleh (Pegawai)</label>
                <select required value={namaPegawai} onChange={e => setNamaPegawai(e.target.value)}>
                  <option value="">-- Pilih Pegawai --</option>
                  {store.pegawai.filter(p => p.status_kontrak === 'Aktif').map(p => (
                    <option key={p.nama_ic} value={p.nama_ic}>{p.nama_ic} ({p.jabatan})</option>
                  ))}
                </select>
              </div>

              <h3 style={{ margin: '15px 0', fontSize: '1.1rem' }}>Daftar Makanan/Minuman</h3>
              <div id="staff-meal-items-container">
                {items.map((ti, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <select className="form-control" required style={{ flex: 1 }} value={ti.id_menu} onChange={e => {
                      const newItems = [...items];
                      newItems[idx].id_menu = e.target.value;
                      setItems(newItems);
                    }}>
                      <option value="">-- Pilih Menu --</option>
                      {store.menu.filter(m => m.tipe_menu === 'Satuan').map(m => (
                        <option key={m.id_menu} value={m.id_menu}>{m.nama_menu}</option>
                      ))}
                    </select>
                    <input type="number" className="form-control" placeholder="Qty" min="1" required style={{ width: '80px' }} value={ti.qty || ''} onChange={e => {
                      const newItems = [...items];
                      newItems[idx].qty = Number(e.target.value);
                      setItems(newItems);
                    }} />
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => {
                      const newItems = [...items];
                      newItems.splice(idx, 1);
                      setItems(newItems);
                    }}>X</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-sm btn-primary" style={{ marginBottom: '15px' }} onClick={() => {
                setItems([...items, { id_menu: '', qty: 1 }]);
              }}>+ Tambah Item</button>

              <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>Simpan Log Konsumsi</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
