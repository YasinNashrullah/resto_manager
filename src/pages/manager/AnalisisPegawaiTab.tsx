import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { floorToTwo, formatCurrency, getJakartaDate, getDutyHours, calculatePayrollForDutyList } from '../../lib/utils';

export default function AnalisisPegawaiTab() {
  const store = useAppStore();

  const [showResign, setShowResign] = useState(false);
  const activePegawaiList = (store.pegawai || []).filter(p => showResign || p.status_kontrak === 'Aktif');

  // Selected Employee & Period State
  const [selectedPegawai, setSelectedPegawai] = useState<string>('');
  const [periodType, setPeriodType] = useState<'bulan' | 'minggu' | 'kustom'>('bulan');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Loaded Employee Data State
  const [isLoading, setIsLoading] = useState(false);
  const [dutyLogs, setDutyLogs] = useState<any[]>([]);
  const [pengeluaranLogs, setPengeluaranLogs] = useState<any[]>([]);
  const [produksiChefLogs, setProduksiChefLogs] = useState<any[]>([]);

  // Computed Individual Metrics
  const [totalOmset, setTotalOmset] = useState(0);
  const [totalJamDuty, setTotalJamDuty] = useState(0);
  const [totalGajiEstimasi, setTotalGajiEstimasi] = useState(0);
  const [totalPembelianBahan, setTotalPembelianBahan] = useState(0);
  const [totalPorsiTerjual, setTotalPorsiTerjual] = useState(0);
  const [totalPorsiMasak, setTotalPorsiMasak] = useState(0);

  // Menu Sales & Ingredient Usage Analysis State
  const [pegawaiMenuList, setPegawaiMenuList] = useState<any[]>([]);
  const [bahanUsageList, setBahanUsageList] = useState<any[]>([]);
  const [heatmapMatrix, setHeatmapMatrix] = useState<any[]>([]);
  const [hoveredDay, setHoveredDay] = useState<any | null>(null);

  // Initialize Active Pegawai & Dates
  useEffect(() => {
    if (activePegawaiList.length > 0 && (!selectedPegawai || !activePegawaiList.some(p => p.nama_ic === selectedPegawai))) {
      setSelectedPegawai(activePegawaiList[0].nama_ic);
    }

    const today = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const cMonth = today.getMonth();
    const cYear = today.getFullYear();
    const startM = `${cYear}-${pad(cMonth + 1)}-01`;
    const lastDay = new Date(cYear, cMonth + 1, 0).getDate();
    const endM = `${cYear}-${pad(cMonth + 1)}-${pad(lastDay)}`;

    setStartDate(startM);
    setEndDate(endM);
  }, [store.pegawai]);

  // Main Data Processing Trigger
  useEffect(() => {
    if (selectedPegawai) {
      analyzePegawaiData();
    }
  }, [selectedPegawai, periodType, startDate, endDate, store.pegawai, store.menu, store.bahan]);

  const findMenuObj = (identifier: string) => {
    if (!identifier) return null;
    const str = String(identifier).toLowerCase().trim()
      .replace(/air\s*mineral/g, 'water')
      .replace(/air\s*putih/g, 'water')
      .replace(/^air$/g, 'water')
      .replace(/carrot/g, 'wortel')
      .replace(/potato/g, 'kentang');

    return (store.menu || []).find(m => 
      String(m.id_menu) === String(identifier) || 
      m.nama_menu.toLowerCase() === str ||
      m.nama_menu.toLowerCase().includes(str) ||
      str.includes(m.nama_menu.toLowerCase())
    );
  };

  const findBahanObj = (identifier: string) => {
    if (!identifier) return null;
    const str = String(identifier).toLowerCase().trim();
    return (store.bahan || []).find(b => 
      String(b.id_bahan) === String(identifier) || 
      b.nama_bahan.toLowerCase() === str ||
      b.nama_bahan.toLowerCase().includes(str) ||
      str.includes(b.nama_bahan.toLowerCase())
    );
  };

  async function analyzePegawaiData() {
    setIsLoading(true);
    try {
      const today = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      let filterStart = startDate;
      let filterEnd = endDate;

      if (periodType === 'bulan') {
        const cMonth = today.getMonth();
        const cYear = today.getFullYear();
        filterStart = `${cYear}-${pad(cMonth + 1)}-01`;
        const lastDay = new Date(cYear, cMonth + 1, 0).getDate();
        filterEnd = `${cYear}-${pad(cMonth + 1)}-${pad(lastDay)}`;
      } else if (periodType === 'minggu') {
        const d = new Date(today);
        const day = d.getDay(); // 0 = Minggu (Sunday)
        const sun = new Date(d);
        sun.setDate(d.getDate() - day); // Minggu (Sunday)
        const sat = new Date(sun);
        sat.setDate(sun.getDate() + 6); // Sabtu (Saturday)
        filterStart = `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`;
        filterEnd = `${sat.getFullYear()}-${pad(sat.getMonth() + 1)}-${pad(sat.getDate())}`;
      }

      // Fetch Duty Data for Selected Pegawai
      let dutyQ = supabase.from('duty').select('*').eq('nama_ic', selectedPegawai).gte('tanggal', filterStart).lte('tanggal', filterEnd);
      let pengeluaranQ = supabase.from('pengeluaran').select('*').eq('nama_pembeli', selectedPegawai).gte('tanggal', filterStart).lte('tanggal', filterEnd);
      let produksiQ = supabase.from('produksi_chef').select('*').eq('nama_ic_chef', selectedPegawai).gte('tanggal', filterStart).lte('tanggal', filterEnd);

      const [dutyRes, pengeluaranRes, produksiRes] = await Promise.all([
        dutyQ.order('id_duty', { ascending: false }),
        pengeluaranQ.order('id_pengeluaran', { ascending: false }),
        produksiQ.order('id_produksi', { ascending: false })
      ]);

      const dList = (dutyRes.data || []).sort((a: any, b: any) => {
        if (a.tanggal !== b.tanggal) {
          return b.tanggal.localeCompare(a.tanggal);
        }
        return (Number(b.id_duty) || 0) - (Number(a.id_duty) || 0);
      });
      const pList = pengeluaranRes.data || [];
      const cList = produksiRes.data || [];

      setDutyLogs(dList);
      setPengeluaranLogs(pList);
      setProduksiChefLogs(cList);

      // 1. Calculate Omset & Porsi Terjual
      let calcOmset = 0;
      let calcPorsiTerjual = 0;
      const dateDutyMap = new Map();
      const menuMap: Record<string, { nama_menu: string, tipe_menu: string, qty: number, harga: number, total_omset: number }> = {};

      dList.forEach(d => {
        const omset = floorToTwo(d.total_omset) || 0;
        calcOmset += omset;

        const detail = d.detail_jual || {};
        let dutyJam = 0;
        if (detail.waktu_mulai && detail.waktu_selesai && typeof detail.waktu_mulai === 'string' && typeof detail.waktu_selesai === 'string') {
          const mParts = detail.waktu_mulai.split(':').map(Number);
          const sParts = detail.waktu_selesai.split(':').map(Number);
          if (mParts.length === 2 && sParts.length === 2 && !isNaN(mParts[0]) && !isNaN(mParts[1])) {
            let m = (mParts[0] * 60 + mParts[1]);
            let s = (sParts[0] * 60 + sParts[1]);
            if (s < m) s += 24 * 60;
            dutyJam = (s - m) / 60;
          }
        }
        if (isNaN(dutyJam) || dutyJam < 0) dutyJam = 0;

        const items = detail.items || [];
        items.forEach((item: any) => {
          const itemQty = (Number(item.qty) || 0);
          calcPorsiTerjual += itemQty;

          if (itemQty > 0) {
            const mObj = findMenuObj(item.id_menu || item.nama_menu);
            const mName = (item.nama_menu && item.nama_menu !== 'Unknown') ? item.nama_menu : (mObj ? mObj.nama_menu : (item.id_menu || 'Menu'));
            const tipe = mObj ? mObj.tipe_menu : 'Satuan';
            const harga = mObj ? (floorToTwo(mObj.harga_jual) || 0) : (floorToTwo(item.harga) || 0);

            if (!menuMap[mName]) {
              menuMap[mName] = {
                nama_menu: mName,
                tipe_menu: tipe,
                qty: 0,
                harga: harga,
                total_omset: 0
              };
            }
            menuMap[mName].qty += itemQty;
            menuMap[mName].total_omset += (itemQty * harga);
          }
        });

        const dDate = d.tanggal || getJakartaDate();
        if (!dateDutyMap.has(dDate)) {
          dateDutyMap.set(dDate, { total_jam: 0, omset: 0, duty_count: 0, snapshot: detail.gaji_snapshot });
        }
        const dayStat = dateDutyMap.get(dDate);
        dayStat.total_jam += dutyJam;
        dayStat.omset += omset;
        dayStat.duty_count += 1;
      });

      const menuArray = Object.values(menuMap).map(m => ({
        ...m,
        total_omset: floorToTwo(m.total_omset),
        kontribusi: calcOmset > 0 ? floorToTwo((m.total_omset / calcOmset) * 100) : 0
      })).sort((a, b) => b.qty - a.qty);

      setPegawaiMenuList(menuArray);

      // 2. Calculate Total Jam & Gaji Estimasi (Unified with KeuanganTab)
      let calcJam = 0;
      dList.forEach(d => {
        calcJam += getDutyHours(d);
      });

      const payrollResult = calculatePayrollForDutyList(dList, store.pegawai || []);
      const calcGaji = payrollResult.totalBebanGaji;

      // 3. Calculate Pembelian Bahan & Produksi Chef
      let calcPembelian = 0;
      pList.forEach(p => {
        const qty = floorToTwo(p.jumlah_unit) || floorToTwo(p.qty) || 0;
        const dbHarga = floorToTwo(p.harga_aktual_per_unit) || floorToTwo(p.harga) || 0;
        let total = floorToTwo(p.total_biaya) || 0;
        if (total <= 0) {
          const bObj = findBahanObj(p.id_bahan || p._nama_bahan);
          const hUse = dbHarga > 0 ? dbHarga : (bObj ? floorToTwo(bObj.harga_per_unit) : 0);
          total = hUse * qty;
        }
        calcPembelian += total;
      });

      let calcPorsiMasak = 0;
      cList.forEach(c => {
        calcPorsiMasak += (floorToTwo(c.qty) || 0);
      });

      setTotalOmset(calcOmset);
      setTotalJamDuty(calcJam);
      setTotalGajiEstimasi(calcGaji);
      setTotalPembelianBahan(calcPembelian);
      setTotalPorsiTerjual(calcPorsiTerjual);
      setTotalPorsiMasak(calcPorsiMasak);

      // 4. Ingredient Usage Analysis for This IC's Sales
      const bUsageMap: Record<string, { qty_used: number, total_value: number, nama_bahan: string, satuan: string }> = {};

      const processIngredient = (menuIdOrName: string, soldQty: number, depth = 0) => {
        if (!menuIdOrName || soldQty <= 0 || depth > 5) return;
        const menuObj = findMenuObj(menuIdOrName);
        if (menuObj && Array.isArray(menuObj.resep) && menuObj.resep.length > 0) {
          if (menuObj.tipe_menu === 'Satuan' || !menuObj.tipe_menu) {
            menuObj.resep.forEach((r: any) => {
              const bId = r.id_bahan || r.id;
              const bQty = Number(r.qty) || 0;
              if (bId && bQty > 0) {
                const bObj = findBahanObj(bId);
                const bName = bObj ? bObj.nama_bahan : String(bId);
                const bSatuan = bObj ? bObj.satuan : 'Unit';
                const bHarga = bObj ? (floorToTwo(bObj.harga_per_unit) || 0) : 0;
                const reqQty = bQty * soldQty;

                if (!bUsageMap[bName]) {
                  bUsageMap[bName] = { qty_used: 0, total_value: 0, nama_bahan: bName, satuan: bSatuan };
                }
                bUsageMap[bName].qty_used += reqQty;
                bUsageMap[bName].total_value += (reqQty * bHarga);
              }
            });
          } else {
            menuObj.resep.forEach((r: any) => {
              const unitMenuId = r.id_menu_satuan || r.id_menu || r.id;
              const unitQty = Number(r.qty) || 0;
              if (unitMenuId && unitQty > 0) {
                processIngredient(unitMenuId, soldQty * unitQty, depth + 1);
              }
            });
          }
        }
      };

      dList.forEach(d => {
        const items = d.detail_jual?.items || [];
        items.forEach((item: any) => {
          const itemQty = Number(item.qty) || 0;
          const itemIdOrName = item.id_menu || item.nama_menu;
          processIngredient(itemIdOrName, itemQty);
        });
      });

      const usageArray = Object.values(bUsageMap).map(u => ({
        ...u,
        qty_used: floorToTwo(u.qty_used),
        total_value: floorToTwo(u.total_value)
      })).sort((a, b) => b.qty_used - a.qty_used);

      setBahanUsageList(usageArray);

      // 5. Generate Dynamic Activity Grid (7 Days for Weekly, Full Month for Monthly)
      const matrix: any[] = [];
      const startDateObj = new Date(filterStart);
      const endDateObj = new Date(filterEnd);

      for (let dt = new Date(startDateObj); dt <= endDateObj; dt.setDate(dt.getDate() + 1)) {
        const yyyy = dt.getFullYear();
        const mm = pad(dt.getMonth() + 1);
        const dd = pad(dt.getDate());
        const dateStr = `${yyyy}-${mm}-${dd}`;

        const dayData = dateDutyMap.get(dateStr);
        const jamVal = dayData ? dayData.total_jam : 0;
        const omsetVal = dayData ? dayData.omset : 0;

        let level = 0; // 0: empty, 1: low, 2: medium, 3: high, 4: max/overtime
        if (jamVal > 0) {
          if (jamVal >= 8 || omsetVal > 1500) level = 4;
          else if (jamVal >= 6 || omsetVal > 1000) level = 3;
          else if (jamVal >= 3 || omsetVal > 400) level = 2;
          else level = 1;
        }

        matrix.push({
          date: dateStr,
          dayName: dt.toLocaleDateString('id-ID', { weekday: 'short' }),
          jam: floorToTwo(jamVal),
          omset: floorToTwo(omsetVal),
          dutyCount: dayData ? dayData.duty_count : 0,
          level
        });
      }

      setHeatmapMatrix(matrix);
    } catch (err) {
      console.error("Error analyzing pegawai data:", err);
    } finally {
      setIsLoading(false);
    }
  }

  const selectedPegawaiObj = activePegawaiList.find(p => p.nama_ic === selectedPegawai);

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      
      {/* Header & Filter Control */}
      <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Analisis Pegawai</h1>
        </div>

        {/* Pegawai & Period Selectors */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--bg-card)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontWeight: 'bold', fontSize: '0.85rem', margin: 0 }}>Pegawai:</label>
            <select 
              className="form-control" 
              style={{ width: 'auto', padding: '6px 12px', fontWeight: 'bold', minWidth: '160px' }}
              value={selectedPegawai}
              onChange={e => setSelectedPegawai(e.target.value)}
            >
              {activePegawaiList.map(p => (
                <option key={p.nama_ic} value={p.nama_ic}>
                  {p.nama_ic} ({p.jabatan})
                </option>
              ))}
            </select>
            <label style={{ fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', margin: 0, opacity: 0.85, whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={showResign} onChange={e => setShowResign(e.target.checked)} />
              Termasuk Resign
            </label>
          </div>

          <div style={{ background: 'var(--bg-card)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border-color)', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ fontWeight: 'bold', fontSize: '0.85rem', margin: 0 }}>Periode:</label>
            <select 
              className="form-control" 
              style={{ width: 'auto', padding: '6px 12px', fontWeight: 'bold' }}
              value={periodType}
              onChange={e => setPeriodType(e.target.value as any)}
            >
              <option value="bulan">Bulan Ini</option>
              <option value="minggu">Minggu Ini</option>
              <option value="kustom">Kustom Tanggal</option>
            </select>

            {periodType === 'kustom' && (
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                <input type="date" className="form-control" style={{ padding: '4px 6px' }} value={startDate} onChange={e => setStartDate(e.target.value)} />
                <span>s/d</span>
                <input type="date" className="form-control" style={{ padding: '4px 6px' }} value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pegawai Info Card Header */}
      {selectedPegawaiObj && (
        <div className="card mb-20" style={{ padding: '12px 20px', borderRadius: '10px', background: 'var(--bg-card)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid var(--primary-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{selectedPegawaiObj.nama_ic}</h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Jabatan: <strong>{selectedPegawaiObj.jabatan}</strong>
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Status: <span className="badge badge-success">{selectedPegawaiObj.status_kontrak}</span>
            </span>
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Rate Gaji/Jam: <strong>{formatCurrency(selectedPegawaiObj.rate_gaji_per_jam)}</strong> | Tunjangan: <strong>{formatCurrency(selectedPegawaiObj.rate_tunjangan_per_jam)}</strong> | Komisi: <strong>{selectedPegawaiObj.persentase_komisi}%</strong>
          </div>
        </div>
      )}

      {/* 5 Executive Individual KPI Stat Cards */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '25px' }}>
        <StatCard title="Total Omset Penjualan" value={formatCurrency(totalOmset)} colors={['#1e293b', '#334155']} />
        <StatCard title="Total Jam Duty" value={`${floorToTwo(totalJamDuty)} Jam`} colors={['#1e293b', '#334155']} />
        <StatCard title="Estimasi Gaji & Komisi" value={formatCurrency(totalGajiEstimasi)} colors={['#1e293b', '#334155']} />
        <StatCard title="Pembelian Bahan (Restock)" value={formatCurrency(totalPembelianBahan)} colors={['#1e293b', '#334155']} />
        <StatCard 
          title={selectedPegawaiObj?.jabatan === 'Chef' ? "Porsi Diproduksi Dapur" : "Total Porsi Terjual"} 
          value={`${selectedPegawaiObj?.jabatan === 'Chef' ? totalPorsiMasak : totalPorsiTerjual} Porsi`} 
          colors={['#1e293b', '#334155']} 
        />
      </div>

      {/* 🟩 KALENDER KEAKTIFAN DUTY */}
      <div className="card mb-20" style={{ padding: '20px', borderRadius: '10px', background: 'var(--bg-card)', marginBottom: '25px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0 }}>Kalender Keaktifan Duty</h3>
          
          {/* Legend */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <span>Tidak Duty</span>
            <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)' }}></div>
            <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: '#064e3b' }}></div>
            <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: '#047857' }}></div>
            <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: '#10b981' }}></div>
            <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: '#34d399', boxShadow: '0 0 8px #34d399' }}></div>
            <span>Duty Intensif</span>
          </div>
        </div>

        {/* Heatmap Grid */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '15px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', minHeight: '65px', alignItems: 'center' }}>
          {heatmapMatrix.map((item, idx) => {
            let bg = '#1e293b';
            let border = '1px solid rgba(255,255,255,0.05)';
            let shadow = 'none';

            if (item.level === 1) { bg = '#064e3b'; border = '1px solid #047857'; }
            else if (item.level === 2) { bg = '#047857'; border = '1px solid #10b981'; }
            else if (item.level === 3) { bg = '#10b981'; border = '1px solid #34d399'; }
            else if (item.level === 4) { bg = '#34d399'; border = '1px solid #6ee7b7'; shadow = '0 0 8px rgba(52, 211, 153, 0.6)'; }

            return (
              <div 
                key={idx}
                onMouseEnter={() => setHoveredDay(item)}
                onMouseLeave={() => setHoveredDay(null)}
                style={{ 
                  flex: periodType === 'minggu' ? 1 : 'none',
                  minWidth: periodType === 'minggu' ? '60px' : '32px',
                  height: '42px', 
                  borderRadius: '6px', 
                  background: bg, 
                  border: border,
                  boxShadow: shadow,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  color: item.level > 0 ? '#fff' : 'rgba(255,255,255,0.3)',
                  transition: 'all 0.2s ease'
                }}
              >
                <span>{item.dayName}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>{item.date.split('-')[2]}</span>
              </div>
            );
          })}
        </div>

        {/* Hover Information Box */}
        {hoveredDay && (
          <div style={{ marginTop: '12px', background: 'rgba(255,255,255,0.05)', padding: '10px 15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
            <div>
              📅 Tanggal: <strong>{hoveredDay.date} ({hoveredDay.dayName})</strong>
            </div>
            <div>
              {hoveredDay.jam > 0 ? (
                <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                  Duty: {hoveredDay.jam} Jam | Omset: {formatCurrency(hoveredDay.omset)} ({hoveredDay.dutyCount} Shift)
                </span>
              ) : (
                <span style={{ color: 'var(--text-secondary)' }}>Tidak ada catatan Duty</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 🍔 TABEL PENJUALAN MENU OLEH PEGAWAI (TERLETAK DI ATAS PENGGUNAAN BAHAN) */}
      <div className="card mb-20" style={{ padding: '20px', borderRadius: '10px', background: 'var(--bg-card)', marginBottom: '25px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
          Penjualan Menu oleh {selectedPegawai}
        </h3>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Nama Menu / Paket</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Tipe Menu</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Terjual (Qty)</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Harga Satuan ($)</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Total Omset ($)</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Kontribusi</th>
              </tr>
            </thead>
            <tbody>
              {pegawaiMenuList.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>Belum ada rincian penjualan menu oleh pegawai ini.</td></tr>
              ) : (
                pegawaiMenuList.map((m, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{m.nama_menu}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span className="badge badge-secondary">{m.tipe_menu}</span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>
                      {m.qty} Porsi
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{formatCurrency(m.harga)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#3b82f6' }}>
                      {formatCurrency(m.total_omset)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>
                      {m.kontribusi}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🌾 TABEL ANALISIS BAHAN BAKU TERPAKAI OLEH PENJUALAN */}
      <div className="card mb-20" style={{ padding: '20px', borderRadius: '10px', background: 'var(--bg-card)', marginBottom: '25px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
          Penggunaan Bahan dari Penjualan ({selectedPegawai})
        </h3>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Nama Bahan Mentah</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Total Terpakai (Qty)</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Satuan</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Estimasi Nilai HPP Bahan</th>
              </tr>
            </thead>
            <tbody>
              {bahanUsageList.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px' }}>Belum ada konsumsi bahan mentah dari penjualan pegawai ini.</td></tr>
              ) : (
                bahanUsageList.map((b, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{b.nama_bahan}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#3b82f6' }}>{b.qty_used}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span className="badge badge-secondary">{b.satuan}</span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#ef4444' }}>
                      {formatCurrency(b.total_value)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 📋 TABEL DETAIL RIWAYAT DUTY PEGAWAI */}
      <div className="card mb-20" style={{ padding: '20px', borderRadius: '10px', background: 'var(--bg-card)', marginBottom: '25px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
          Riwayat Duty & Penjualan ({selectedPegawai})
        </h3>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Tanggal</th>
                <th style={{ padding: '12px' }}>Shift (Mulai - Selesai)</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Total Jam</th>
                <th style={{ padding: '12px' }}>Item Terjual</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Total Omset ($)</th>
              </tr>
            </thead>
            <tbody>
              {dutyLogs.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Belum ada log duty pada periode ini.</td></tr>
              ) : (
                dutyLogs.map(d => {
                  const detail = d.detail_jual || {};
                  let dutyJam = 0;
                  if (detail.waktu_mulai && detail.waktu_selesai && typeof detail.waktu_mulai === 'string' && typeof detail.waktu_selesai === 'string') {
                    const mParts = detail.waktu_mulai.split(':').map(Number);
                    const sParts = detail.waktu_selesai.split(':').map(Number);
                    if (mParts.length === 2 && sParts.length === 2) {
                      let m = (mParts[0] * 60 + mParts[1]);
                      let s = (sParts[0] * 60 + sParts[1]);
                      if (s < m) s += 24 * 60;
                      dutyJam = (s - m) / 60;
                    }
                  }
                  const itemsSummary = (detail.items || []).map((i: any) => `${i.nama_menu || i.id_menu} x${i.qty}`).join(', ');

                  return (
                    <tr key={d.id_duty} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>{d.tanggal}</td>
                      <td style={{ padding: '12px' }}>{detail.waktu_mulai || '-'} - {detail.waktu_selesai || '-'}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>{floorToTwo(dutyJam)} Jam</td>
                      <td style={{ padding: '12px', fontSize: '0.85rem' }}>{itemsSummary || 'Tidak ada item'}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>{formatCurrency(d.total_omset)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🛒 TABEL RIWAYAT PEMBELIAN BAHAN (RESTOCK) PEGAWAI */}
      <div className="card mb-20" style={{ padding: '20px', borderRadius: '10px', background: 'var(--bg-card)', marginBottom: '25px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
          Riwayat Pembelian Bahan Mentah (Restock) oleh {selectedPegawai}
        </h3>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Tanggal</th>
                <th style={{ padding: '12px' }}>Bahan Mentah</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Jumlah Unit</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Harga / Unit ($)</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Total Biaya ($)</th>
              </tr>
            </thead>
            <tbody>
              {pengeluaranLogs.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Pegawai ini belum pernah melakukan pembelian bahan mentah.</td></tr>
              ) : (
                pengeluaranLogs.map(p => {
                  const bObj = findBahanObj(p.id_bahan || p._nama_bahan);
                  const bName = bObj ? bObj.nama_bahan : (p._nama_bahan || p.id_bahan);
                  const qty = floorToTwo(p.jumlah_unit) || floorToTwo(p.qty) || 0;
                  const hargaUnit = floorToTwo(p.harga_aktual_per_unit) || floorToTwo(p.harga) || 0;
                  const total = floorToTwo(p.total_biaya) || (qty * hargaUnit);

                  return (
                    <tr key={p.id_pengeluaran} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px' }}>{p.tanggal}</td>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>{bName}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{qty}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{formatCurrency(hargaUnit)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#ef4444' }}>{formatCurrency(total)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 🍳 TABEL RIWAYAT PRODUKSI MASAKAN CHEF (JIKA JABATAN CHEF) */}
      {selectedPegawaiObj?.jabatan === 'Chef' && (
        <div className="card mb-20" style={{ padding: '20px', borderRadius: '10px', background: 'var(--bg-card)', marginBottom: '25px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            Riwayat Produksi Masakan Dapur oleh Chef {selectedPegawai}
          </h3>
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                  <th style={{ padding: '12px' }}>Tanggal</th>
                  <th style={{ padding: '12px' }}>Nama Makanan Jadi</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>Jumlah Masak (Porsi)</th>
                </tr>
              </thead>
              <tbody>
                {produksiChefLogs.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', padding: '20px' }}>Belum ada laporan produksi masakan dari chef ini.</td></tr>
                ) : (
                  produksiChefLogs.map(c => {
                    const mObj = findMenuObj(c.id_menu || c.menu);
                    const mName = mObj ? mObj.nama_menu : (c.menu || c.id_menu);
                    return (
                      <tr key={c.id_produksi} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px' }}>{c.tanggal}</td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{mName}</td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>+{c.qty} Porsi</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--accent-color)' }}>
          🔄 Memuat analisis data pegawai...
        </div>
      )}

    </div>
  );
}

function StatCard({ title, value, colors }: { title: string, value: string, colors: [string, string] }) {
  return (
    <div className="card stat-card" style={{ 
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', 
      textAlign: 'center', background: `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%)`, 
      color: 'white', border: 'none', padding: '18px 12px', borderRadius: '10px'
    }}>
      <h4 style={{ margin: '0 0 6px 0', fontSize: '0.85rem', opacity: 0.9, fontWeight: 500 }}>{title}</h4>
      <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 'bold' }}>{value}</h2>
    </div>
  );
}
