import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { formatCurrency, getJakartaDate, getWeekRange } from '../../lib/utils';
import { useLocation } from 'react-router-dom';

export default function PenjualanTab() {
  const store = useAppStore();
  const location = useLocation();
  const isWaiter = location.pathname.startsWith('/waiter');
  const activeWaiter = sessionStorage.getItem('active_waiter_name') || '';
  
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [idDuty, setIdDuty] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [namaPegawai, setNamaPegawai] = useState(isWaiter ? activeWaiter : '');
  const [waktuMulai, setWaktuMulai] = useState('');
  const [waktuSelesai, setWaktuSelesai] = useState('');
  const [items, setItems] = useState<{ id_menu: string, qty: number }[]>([]);
  const [totalOmset, setTotalOmset] = useState<number>(0);

  // Filter & Pagination State
  const [activeWeeks, setActiveWeeks] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [limit, setLimit] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [filterNama, setFilterNama] = useState<string>('');
  const [dutyList, setDutyList] = useState<any[]>([]);

  useEffect(() => {
    fetchWeeks();
  }, [store.duty]);

  useEffect(() => {
    fetchData();
  }, [selectedWeek, limit, currentPage, filterNama]);

  useEffect(() => {
    recalcOmset();
  }, [items]);

  async function fetchWeeks() {
    const { data } = await supabase.from('duty').select('tanggal').order('tanggal', { ascending: false });
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
    let query = supabase.from('duty')
      .select('*')
      .gte('tanggal', selectedWeek.split(' to ')[0])
      .lte('tanggal', selectedWeek.split(' to ')[1])
      .order('tanggal', { ascending: false })
      .order('id_duty', { ascending: false });

    if (filterNama) {
      query = query.ilike('nama_ic', `%${filterNama}%`);
    }

    if (limit !== 1000) {
      query = query.range((currentPage - 1) * limit, currentPage * limit - 1);
    }
    
    const { data } = await query;
    if (data) {
      const sortedData = [...data].sort((a: any, b: any) => {
        if (a.tanggal !== b.tanggal) {
          return b.tanggal.localeCompare(a.tanggal);
        }
        return (Number(b.id_duty) || 0) - (Number(a.id_duty) || 0);
      });
      setDutyList(sortedData);
    }
  }

  const recalcOmset = () => {
    let total = 0;
    items.forEach(item => {
      const m = store.menu.find(x => x.id_menu === item.id_menu);
      if (m) {
        total += Number(m.harga_jual) * item.qty;
      }
    });
    setTotalOmset(total);
  };

  const handleOpenModal = (d?: any) => {
    if (d) {
      const detail = d.detail_jual || {};
      setIdDuty(d.id_duty);
      setTanggal(d.tanggal);
      setNamaPegawai(d.nama_ic);
      setWaktuMulai(detail.waktu_mulai || '');
      setWaktuSelesai(detail.waktu_selesai || '');
      
      const pItems = detail.items || [];
      const newItems = pItems.map((i: any) => ({
        id_menu: i.id_menu,
        qty: i.qty
      }));
      setItems(newItems);
      setTotalOmset(d.total_omset);
    } else {
      setIdDuty('');
      setTanggal(getJakartaDate());
      setNamaPegawai(isWaiter ? activeWaiter : '');
      setWaktuMulai('');
      setWaktuSelesai('');
      setItems([]);
      setTotalOmset(0);
    }
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      let totalJam = 0;
      if (waktuMulai && waktuSelesai) {
          const t1 = new Date(`1970-01-01T${waktuMulai}:00`);
          const t2 = new Date(`1970-01-01T${waktuSelesai}:00`);
          let diff = (t2.getTime() - t1.getTime()) / (1000 * 60 * 60);
          if (diff < 0) diff += 24; 
          totalJam = Math.round(diff * 10) / 10;
      }

      let totalHpp = 0;
      const parsedItems = items.map(item => {
        const m = store.menu.find(x => x.id_menu === item.id_menu);
        const nama_menu = m ? m.nama_menu : "Unknown";
        
        // hitung hpp satuan dari resep menu
        let hpp = 0;
        if (m && m.resep) {
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
        }
        totalHpp += hpp * item.qty;

        return {
          id_menu: item.id_menu,
          nama_menu: nama_menu,
          qty: item.qty
        };
      });

      const detail_jual = {
        waktu_mulai: waktuMulai,
        waktu_selesai: waktuSelesai,
        items: parsedItems,
        total_hpp: totalHpp
      };

      const payload = {
        tanggal: tanggal,
        nama_ic: namaPegawai,
        total_jam: totalJam,
        total_omset: totalOmset,
        detail_jual: detail_jual
      };

      if (idDuty) {
        await supabase.from('duty').update(payload).eq('id_duty', idDuty);
      } else {
        await supabase.from('duty').insert([payload]);
      }
      
      setModalOpen(false);
      fetchData(); // Refresh list
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Yakin ingin menghapus Laporan Duty ini? Stok bahan akan dikembalikan secara otomatis.")) {
      await supabase.from('duty').delete().eq('id_duty', id);
      fetchData();
    }
  };

  const isWaiters = document.body.classList.contains('role-waiters');
  const isChef = document.body.classList.contains('role-chef');

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action">
        <div>
          <h1 style={{ display: 'inline-block' }}>Log Transaksi Duty</h1>
        </div>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>+ Input Laporan Duty</button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3>Daftar Log Duty</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input type="text" className="form-control" placeholder="Cari Nama Pegawai..." style={{ width: '180px', padding: '5px' }} value={filterNama} onChange={e => { setFilterNama(e.target.value); setCurrentPage(1); }} />
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
          <table id="table-duty">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Nama Pegawai</th>
                <th>Waktu Kerja</th>
                <th>Item Terjual</th>
                <th>Total Omset</th>
                <th>Status</th>
                {!(isWaiters || isChef) && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {dutyList.length === 0 ? (
                <tr><td colSpan={(isWaiters || isChef) ? 6 : 7} style={{ textAlign: 'center' }}>Belum ada log duty</td></tr>
              ) : dutyList.map(d => {
                const detail = d.detail_jual || {};
                const parsedItems = detail.items || [];
                const itemSummary = parsedItems.length > 0 ? parsedItems.map((i: any) => `${i.nama_menu} (x${i.qty})`).join(', ') : '-';
                
                const wr = getWeekRange(d.tanggal);
                const isClosed = wr ? store.periode_ditutup.includes(wr.key) : false;
                
                return (
                  <tr key={d.id_duty}>
                    <td>{d.tanggal}</td>
                    <td>{d.nama_ic}</td>
                    <td>{detail.waktu_mulai || '-'} - {detail.waktu_selesai || '-'} ({d.total_jam} Jam)</td>
                    <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }} title={itemSummary}>{itemSummary}</td>
                    <td className="text-success font-weight-bold">
                      {formatCurrency(d.total_omset)}<br/>
                      <small className="text-secondary">HPP: {formatCurrency(detail.total_hpp || 0)}</small>
                    </td>
                    <td><span className="badge badge-satuan">Approved</span></td>
                    {!(isWaiters || isChef) && (
                      <td>
                        <button className={`btn btn-sm ${isClosed ? 'btn-secondary' : 'btn-primary'}`} disabled={isClosed} onClick={() => handleOpenModal(d)}>Edit</button>
                        <button className={`btn btn-sm ${isClosed ? 'btn-secondary' : 'btn-danger'}`} disabled={isClosed} style={{ marginLeft: '5px' }} onClick={() => handleDelete(d.id_duty)}>Hapus</button>
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
            <button className="btn btn-sm btn-secondary" disabled={dutyList.length < limit && limit !== 1000} onClick={() => setCurrentPage(c => c + 1)}>Next</button>
          </div>
        </div>
      </div>

      {/* Modal Duty */}
      {modalOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <span className="close-btn" onClick={() => setModalOpen(false)}>&times;</span>
            <h2>{idDuty ? 'Edit Laporan Duty' : 'Input Laporan Duty'}</h2>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Tanggal Transaksi</label>
                <input type="date" required value={tanggal} onChange={e => setTanggal(e.target.value)} />
              </div>
              <div className="form-group">
              <label>Nama Pegawai</label>
              {isWaiter ? (
                <input 
                  type="text" 
                  className="form-control" 
                  value={namaPegawai} 
                  disabled 
                  style={{ background: 'var(--bg-dark)', cursor: 'not-allowed' }} 
                />
              ) : (
                <select className="form-control" required value={namaPegawai} onChange={e => setNamaPegawai(e.target.value)}>
                  <option value="">Pilih Pegawai...</option>
                  {store.pegawai.filter(p => p.status_kontrak === 'Aktif')
                    .sort((a, b) => (Number(b.rate_gaji_per_jam) || 0) - (Number(a.rate_gaji_per_jam) || 0))
                    .map(p => (
                    <option key={p.id_pegawai} value={p.nama_ic}>{p.nama_ic} ({p.jabatan})</option>
                  ))}
                </select>
              )}
            </div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Waktu Mulai Shift</label>
                  <input type="time" required className="form-control" value={waktuMulai} onChange={e => setWaktuMulai(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Waktu Selesai Shift</label>
                  <input type="time" required className="form-control" value={waktuSelesai} onChange={e => setWaktuSelesai(e.target.value)} />
                </div>
              </div>

              <h3 style={{ margin: '15px 0', fontSize: '1.1rem' }}>Daftar Pesanan Terjual</h3>
              <div id="duty-items-container" style={{ maxHeight: '250px', overflowY: 'auto', paddingRight: '5px', marginBottom: '15px', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '5px' }}>
                {items.map((ti, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                    <select className="form-control" required style={{ flex: 1, minWidth: 0 }} value={ti.id_menu} onChange={e => {
                      const newItems = [...items];
                      newItems[idx].id_menu = e.target.value;
                      setItems(newItems);
                    }}>
                      <option value="">-- Pilih Menu --</option>
                      {store.menu.map(m => (
                        <option key={m.id_menu} value={m.id_menu}>{m.nama_menu} ({formatCurrency(m.harga_jual)})</option>
                      ))}
                    </select>
                    <input type="number" className="form-control" placeholder="Qty" min="1" required style={{ width: '70px', flexShrink: 0 }} value={ti.qty || ''} onChange={e => {
                      const newItems = [...items];
                      newItems[idx].qty = Number(e.target.value);
                      setItems(newItems);
                    }} />
                    <button type="button" className="btn btn-danger btn-sm" style={{ flexShrink: 0 }} onClick={() => {
                      const newItems = [...items];
                      newItems.splice(idx, 1);
                      setItems(newItems);
                    }}>X</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-sm btn-primary" style={{ marginBottom: '15px' }} onClick={() => {
                setItems([...items, { id_menu: '', qty: 0 }]);
              }}>+ Tambah Item Pesanan</button>

              <div className="form-group" style={{ marginTop: '10px' }}>
                <label>Total Omset ($) - Dihitung Otomatis</label>
                <input type="number" className="form-control" readOnly value={totalOmset} style={{ background: 'var(--bg-dark)', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--success-color)' }} />
              </div>

              <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>Simpan Log Transaksi</button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
