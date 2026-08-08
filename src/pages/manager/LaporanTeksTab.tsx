import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, getWeekRange, getJakartaDate } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';

export default function LaporanTeksTab() {
  const store = useAppStore();
  const [activeWeeks, setActiveWeeks] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  
  const [teks1, setTeks1] = useState('');
  const [teks2, setTeks2] = useState('');
  const [teks3, setTeks3] = useState('');
  const [teks4, setTeks4] = useState('');

  const [copiedStates, setCopiedStates] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetchWeeks();
  }, [store.duty]);

  useEffect(() => {
    generateLaporan();
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

  const safeParse = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  async function generateLaporan() {
    if (!selectedWeek) return;

    setTeks1('Memuat...');
    setTeks2('Memuat...');
    setTeks3('Memuat...');
    setTeks4('Memuat...');

    const label = activeWeeks.find(w => w[0] === selectedWeek)?.[1] || selectedWeek;
    let startDate = selectedWeek.split(' to ')[0] || getJakartaDate();

    try {
        const [resFin, resKasBefore, resSetoran] = await Promise.all([
            supabase.rpc('get_financial_dashboard', { p_week_key: selectedWeek }),
            supabase.rpc('get_kas_before_date', { p_start_date: startDate }),
            supabase.rpc('get_setoran_dashboard', { p_week_key: selectedWeek })
        ]);

        const statsArray = Array.isArray(resFin.data) ? resFin.data : [resFin.data];
        const stats = statsArray[0] || {};
        const kasTambahan = safeParse(stats.total_kas_tambahan);
        const gajiList = stats.gaji_pegawai || [];

        // 1. Laporan Gaji
        let t1 = `## laporan Gaji pegawai (${label})\n\`\`\`\n`;
        if (gajiList.length === 0) {
            t1 += `Nama IC    : -\nTotal Duty : 0 Jam\nTotal Gaji : $ 0\n`;
        } else {
            gajiList.forEach((g: any) => {
                const displayJam = Number.isInteger(parseFloat(g.total_jam)) 
                    ? parseInt(g.total_jam) 
                    : parseFloat(g.total_jam || 0).toFixed(2);
                const thpVal = parseFloat(g.thp) || 0;
                t1 += `Nama IC                 : ${g.nama_ic}\n`;
                t1 += `Total Duty              : ${displayJam} Jam\n`;
                t1 += `Total Gaji(periode ini) : ${formatCurrency(Math.round(thpVal))}\n\n`;
            });
        }
        t1 += "```";
        setTeks1(t1.trim());

        // 2. Rekap Gaji & Laba
        const pendapatan = safeParse(stats.total_pendapatan);
        const gaji = safeParse(stats.total_gaji);
        const pembelian = safeParse(stats.total_pengeluaran || stats.total_pembelian);
        const sisaLaba1 = pendapatan - gaji;

        let t2 = `## 💵 REKAP GAJI & LABA PERIODE (${label})\n\`\`\`\n`;
        t2 += `Total Pendapatan (Omset) : ${formatCurrency(Math.round(pendapatan))}\n`;
        t2 += `Total Beban Gaji         : ${formatCurrency(Math.round(gaji))}\n`;
        t2 += `Total                    : ${formatCurrency(Math.round(sisaLaba1))}\n\`\`\``;
        setTeks2(t2.trim());

        // 3. Data Keuangan Resto
        let rawSaldoAwal = parseFloat(resKasBefore.data);
        const saldoAwal = isNaN(rawSaldoAwal) ? 0 : rawSaldoAwal;
        const saldoAkhir = saldoAwal + sisaLaba1 + kasTambahan - pembelian;

        let t3 = `### DATA KEUANGAN RESTO (${label})\n\`\`\`\n`;
        t3 += `Saldo Awal      : ${formatCurrency(Math.round(saldoAwal))}\n`;
        t3 += `Laba Bersih     : ${formatCurrency(Math.round(sisaLaba1))}\n`;
        t3 += `Kas Tambahan    : ${formatCurrency(Math.round(kasTambahan))}\n`;
        t3 += `Pembelian Bahan : ${formatCurrency(Math.round(pembelian))}\n`;
        t3 += `SALDO AKHIR     : ${formatCurrency(Math.round(saldoAkhir))}\n\`\`\``;
        setTeks3(t3.trim());

        // 4. Status Setoran
        let t4 = `### STATUS SETORAN (${label})\n\`\`\`\n`;
        if (resSetoran.data) {
            let ada = false;
            resSetoran.data.forEach((s: any) => {
                const omset = parseFloat(s.total_omset) || 0;
                if (omset > 0) {
                    ada = true;
                    const checkmark = s.is_lunas ? ' ✅' : '';
                    t4 += `- ${s.nama_ic}: ${formatCurrency(Math.round(omset))}${checkmark}\n`;
                }
            });
            if (!ada) t4 += "Belum ada transaksi\n";
        }
        t4 += "```";
        setTeks4(t4.trim());

    } catch (e) {
        console.error(e);
    }
  }

  const handleCopy = (id: number, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
        setCopiedStates(prev => ({ ...prev, [id]: true }));
        setTimeout(() => {
            setCopiedStates(prev => ({ ...prev, [id]: false }));
        }, 2000);
    });
  };

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action mt-20" style={{ marginTop: '30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <h1>Laporan Teks & Export</h1>
          <button className="btn btn-success" onClick={() => alert('Fitur Export Excel akan segera hadir!')}>Export Excel</button>
        </div>
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
        <div className="card" style={{ gridColumn: 'span 12' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3>1. Gaji Pegawai</h3>
            <button onClick={() => handleCopy(1, teks1)} className="btn btn-primary btn-sm">
              {copiedStates[1] ? 'Tersalin!' : 'Salin Laporan'}
            </button>
          </div>
          <textarea 
            className="form-control" 
            style={{ width: '100%', height: '200px', fontFamily: 'monospace', resize: 'vertical', background: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '15px' }} 
            readOnly 
            value={teks1} 
          />
        </div>
        
        <div className="card" style={{ gridColumn: 'span 12' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3>2. Laporan Gaji Mingguan / Periode</h3>
            <button onClick={() => handleCopy(2, teks2)} className="btn btn-primary btn-sm">
              {copiedStates[2] ? 'Tersalin!' : 'Salin Laporan'}
            </button>
          </div>
          <textarea 
            className="form-control" 
            style={{ width: '100%', height: '130px', fontFamily: 'monospace', resize: 'vertical', background: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '15px' }} 
            readOnly 
            value={teks2} 
          />
        </div>
        
        <div className="card" style={{ gridColumn: 'span 12' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3>3. Data Keuangan Resto</h3>
            <button onClick={() => handleCopy(3, teks3)} className="btn btn-primary btn-sm">
              {copiedStates[3] ? 'Tersalin!' : 'Salin Laporan'}
            </button>
          </div>
          <textarea 
            className="form-control" 
            style={{ width: '100%', height: '130px', fontFamily: 'monospace', resize: 'vertical', background: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '15px' }} 
            readOnly 
            value={teks3} 
          />
        </div>
        
        <div className="card" style={{ gridColumn: 'span 12' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3>4. Status Setoran</h3>
            <button onClick={() => handleCopy(4, teks4)} className="btn btn-primary btn-sm">
              {copiedStates[4] ? 'Tersalin!' : 'Salin Laporan'}
            </button>
          </div>
          <textarea 
            className="form-control" 
            style={{ width: '100%', height: '150px', fontFamily: 'monospace', resize: 'vertical', background: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '15px' }} 
            readOnly 
            value={teks4} 
          />
        </div>
      </div>
    </div>
  );
}
