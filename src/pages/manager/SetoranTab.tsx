import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, getWeekRange } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import { useLocation } from 'react-router-dom';

export default function SetoranTab() {
  const store = useAppStore();
  const [activeWeeks, setActiveWeeks] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [limit, setLimit] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [setoranList, setSetoranList] = useState<any[]>([]);
  
  const location = useLocation();
  const isWaiterPath = location.pathname.startsWith('/waiter');
  const activeWaiter = sessionStorage.getItem('active_waiter_name') || '';

  useEffect(() => {
    fetchWeeks();
  }, [store.duty]);

  useEffect(() => {
    fetchData();
  }, [selectedWeek, limit, currentPage]);

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
    
    // Instead of using rpc get_setoran_dashboard which we might not want to rely on fully if we want client logic,
    // we can use it since it exists:
    const { data, error } = await supabase.rpc('get_setoran_dashboard', { p_week_key: selectedWeek });
    if (!error && data) {
        // Jika waiter, filter hanya untuk waiter itu sendiri
        const filteredData = isWaiterPath ? data.filter((d: any) => d.nama_ic === activeWaiter) : data;
        
        // Pagination logic client-side
        const start = (currentPage - 1) * limit;
        const sliced = limit === 1000 ? filteredData : filteredData.slice(start, start + limit);
        setSetoranList(sliced);
    }
  }

  const handleToggleSetoran = async (ic: string, isChecked: boolean) => {
    const payload = {
        week_key: selectedWeek,
        nama_ic: ic,
        status: isChecked,
        tanggal_update: new Date().toISOString()
    };

    const existing = store.setoran.find(s => s.week_key === selectedWeek && s.nama_ic === ic);
    if (existing) {
        await supabase.from('setoran').update({ status: isChecked, tanggal_update: payload.tanggal_update }).eq('id_setoran', existing.id_setoran);
    } else {
        await supabase.from('setoran').insert([payload]);
    }
    
    // Optimistic update
    setSetoranList(prev => prev.map(item => {
        if (item.nama_ic === ic) return { ...item, is_lunas: isChecked };
        return item;
    }));
  };

  const isWaiters = document.body.classList.contains('role-waiters');
  const isChef = document.body.classList.contains('role-chef');
  const isReadOnly = isWaiters || isChef;

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action mt-20" style={{ marginTop: '30px' }}>
        <h2>Status Setoran Penjualan (Mingguan)</h2>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3>Daftar Status Setoran</h3>
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
          <table id="table-setoran">
            <thead>
              <tr>
                <th>Nama IC</th>
                <th>Jabatan</th>
                <th>Total Penjualan</th>
                <th>Status Setoran</th>
              </tr>
            </thead>
            <tbody>
              {setoranList.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center' }}>Tidak ada data duty pada periode ini</td></tr>
              ) : setoranList.map((d, i) => (
                <tr key={i}>
                  <td>{d.nama_ic}</td>
                  <td>{d.jabatan}</td>
                  <td className="text-success font-weight-bold">{formatCurrency(d.total_omset)}</td>
                  <td>
                    <label style={{ cursor: isReadOnly ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input 
                        type="checkbox" 
                        style={{ width: '20px', height: '20px' }} 
                        checked={d.is_lunas} 
                        disabled={isReadOnly}
                        onChange={(e) => handleToggleSetoran(d.nama_ic, e.target.checked)}
                      />
                      <span>Sudah Setor</span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-sm btn-secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(c => c - 1)}>Prev</button>
            <span>Halaman {currentPage}</span>
            <button className="btn btn-sm btn-secondary" disabled={setoranList.length < limit && limit !== 1000} onClick={() => setCurrentPage(c => c + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
