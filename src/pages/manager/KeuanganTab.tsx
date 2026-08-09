import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, getWeekRange } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';

export default function KeuanganTab() {
  const store = useAppStore();
  const [activeWeeks, setActiveWeeks] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  
  const [stats, setStats] = useState<any>(null);
  const [gajiPegawai, setGajiPegawai] = useState<any[]>([]);

  useEffect(() => {
    fetchWeeks();
  }, [store.duty]);

  useEffect(() => {
    fetchData();
  }, [selectedWeek]);

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
    
    setStats(null);
    setGajiPegawai([]);
    
    const { data, error } = await supabase.rpc('get_financial_dashboard', { p_week_key: selectedWeek });
    if (!error && data) {
        setStats(data);
        setGajiPegawai(data.gaji_pegawai || []);
    }
  }

  const handleToggleGaji = async (g: any, isChecked: boolean) => {
    const newStatus = isChecked ? 'Lunas' : 'Belum';
    const payload = {
        week_key: selectedWeek,
        nama_ic: g.nama_ic,
        status: newStatus,
        thp: g.thp,
        gaji_pokok: g.gaji_pokok,
        tunjangan: g.tunjangan,
        gaji_bonus: g.gaji_bonus,
        komisi_nilai: g.nilai_komisi,
        jam_pokok: g.jam_pokok,
        jam_tunjangan: g.jam_tunjangan,
        jam_bonus: g.jam_bonus,
        tanggal_update: new Date().toISOString()
    };

    const existing = store.status_gaji.find(s => s.week_key === selectedWeek && s.nama_ic === g.nama_ic);
    if (existing) {
        await supabase.from('status_gaji').update({ status: newStatus, tanggal_update: payload.tanggal_update }).eq('id_status_gaji', existing.id_status_gaji);
    } else {
        await supabase.from('status_gaji').insert([payload]);
    }

    // Refresh store status gaji
    const { data } = await supabase.from('status_gaji').select('*').gte('tanggal_update', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    if (data) store.setStatusGaji(data);
  };

  const safeParse = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const totalPendapatan = stats ? safeParse(stats.total_pendapatan) : 0;
  const totalGajiEstimasi = gajiPegawai.length > 0 
    ? gajiPegawai.reduce((acc, g) => acc + safeParse(g.thp), 0)
    : (stats ? safeParse(stats.total_gaji) : 0);
  const totalGaji = totalGajiEstimasi;
  const totalHpp = stats ? safeParse(stats.total_hpp) : 0;
  const totalPembelian = stats ? safeParse(stats.total_pembelian ?? stats.total_pengeluaran) : 0;

  const labaKotor = totalPendapatan - totalHpp;
  const labaBersihAktual = totalPendapatan - totalHpp - totalGaji - totalPembelian;

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action">
        <h1>Laporan Keuangan Mingguan & Penggajian</h1>
      </div>

      <div className="header-action" style={{ marginTop: '10px', paddingTop: '10px' }}>
        <h2>Filter Laporan</h2>
        <div>
          <label style={{ fontWeight: 'bold' }}>Filter Periode: </label>
          <select 
            className="form-control" 
            style={{ display: 'inline-block', width: 'auto', minWidth: '250px', marginLeft: '10px' }} 
            value={selectedWeek} 
            onChange={e => setSelectedWeek(e.target.value)}
          >
            {activeWeeks.map(w => (
              <option key={w[0]} value={w[0]}>{w[1]}</option>
            ))}
            {activeWeeks.length === 0 && <option value="">Belum ada data</option>}
          </select>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="stat-card">
          <h3>Total Pendapatan (Omset)</h3>
          <p className="stat-value text-success">{formatCurrency(totalPendapatan)}</p>
        </div>
        <div className="stat-card" style={{ border: '1px solid var(--warning-color)' }}>
          <h3>Belum Setor</h3>
          <p className="stat-value text-warning">{formatCurrency(stats ? safeParse(stats.total_piutang) : 0)}</p>
        </div>
        <div className="stat-card">
          <h3>Total HPP (Item Terjual)</h3>
          <p className="stat-value text-secondary">{formatCurrency(totalHpp)}</p>
        </div>
        <div className="stat-card">
          <h3>Total Biaya Pembelian Bahan</h3>
          <p className="stat-value text-danger">{formatCurrency(totalPembelian)}</p>
        </div>
        <div className="stat-card">
          <h3>Beban Gaji & Komisi</h3>
          <p className="stat-value text-danger">{formatCurrency(totalGaji)}</p>
        </div>
      </div>

      <div className="dashboard-grid mt-20" style={{ marginTop: '20px' }}>
        <div className="stat-card" style={{ border: '2px solid var(--accent-color)' }}>
          <h3>Laba Bersih (Versi HPP)</h3>
          <p style={{ fontSize: '0.8rem', color: '#aaa' }}>Pendapatan - Beban Gaji - HPP Penjualan</p>
          <p className="stat-value text-primary">{formatCurrency(labaKotor - totalGaji)}</p>
        </div>
        <div className="stat-card" style={{ border: '2px solid var(--success-color)' }}>
          <h3>Laba Bersih (Versi Cashflow Aktual)</h3>
          <p style={{ fontSize: '0.8rem', color: '#aaa' }}>Pendapatan - Beban Gaji - Biaya Pembelian Bahan</p>
          <p className="stat-value text-success">{formatCurrency(labaBersihAktual)}</p>
        </div>
      </div>

      <div className="card mt-20" style={{ marginTop: '30px' }}>
        <h2>Rincian Gaji</h2>

        <div className="table-responsive">
          <table id="table-gaji">
            <thead>
              <tr>
                <th>Nama Pegawai (IC)</th>
                <th>Total Jam</th>
                <th>Gaji Pokok</th>
                <th>Tunjangan Shift</th>
                <th>Insentif/Bonus</th>
                <th>Komisi Jual</th>
                <th>Take Home Pay (THP)</th>
                <th>Status Pembayaran</th>
              </tr>
            </thead>
            <tbody>
              {gajiPegawai.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center' }}>Tidak ada data duty pada periode ini</td></tr>
              ) : gajiPegawai.map((g, i) => {
                const totalJam   = safeParse(g.total_jam);
                const jamPokok   = safeParse(g.jam_pokok);
                const jamBonus   = safeParse(g.jam_bonus);
                const jamTunjangan = safeParse(g.jam_tunjangan);
                const gajiPokok  = safeParse(g.gaji_pokok);
                const tunjangan  = safeParse(g.tunjangan);
                const gajiBonus  = safeParse(g.gaji_bonus);
                const nilaiKomisi = safeParse(g.nilai_komisi);
                const thp        = safeParse(g.thp);

                const statusObj = store.status_gaji.find(s => s.week_key === selectedWeek && s.nama_ic === g.nama_ic);
                const isLunas = statusObj && statusObj.status === 'Lunas';

                return (
                  <tr key={i}>
                    <td>{g.nama_ic}</td>
                    <td>{Number.isInteger(totalJam) ? totalJam : totalJam.toFixed(2)} Jam</td>
                    <td>{formatCurrency(gajiPokok)} <br/><small className="text-secondary">({jamPokok} Jam)</small></td>
                    <td>{formatCurrency(tunjangan)} <br/><small className="text-secondary">({jamTunjangan} Jam)</small></td>
                    <td>{formatCurrency(gajiBonus)} <br/><small className="text-secondary">({jamBonus} Jam)</small></td>
                    <td>{formatCurrency(nilaiKomisi)}</td>
                    <td className="font-weight-bold text-primary">{formatCurrency(thp)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', cursor: 'pointer' }}>
                        <input type="checkbox" style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          checked={isLunas}
                          onChange={e => handleToggleGaji(g, e.target.checked)}
                        />
                        <span style={{ color: isLunas ? '#2ecc71' : '#e74c3c', fontWeight: 'bold', fontSize: '0.9rem' }}>
                          {isLunas ? 'Lunas' : 'Belum'}
                        </span>
                      </label>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
