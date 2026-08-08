import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { getWeekLabel, floorToTwo, formatCurrency, calculatePayrollForDutyList } from '../../lib/utils';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function DashboardTab() {
  const state = useAppStore();
  
  // Period Selector State
  const [periodType, setPeriodType] = useState<'bulan' | 'minggu' | 'semua' | 'kustom'>('bulan');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Financial Metrics State
  const [omsetVal, setOmsetVal] = useState(0);
  const [pengeluaranVal, setPengeluaranVal] = useState(0);
  const [bebanGajiVal, setBebanGajiVal] = useState(0);
  const [labaBersihVal, setLabaBersihVal] = useState(0);
  const [totalPorsiTerjual, setTotalPorsiTerjual] = useState(0);

  // Charts & Analytics State
  const [chartOmset, setChartOmset] = useState<{ labels: string[], data: number[] }>({ labels: [], data: [] });
  const [chartMenu, setChartMenu] = useState<{ labels: string[], data: number[] }>({ labels: [], data: [] });
  
  // Data Analyst Tables
  const [menuTerlarisList, setMenuTerlarisList] = useState<any[]>([]);
  const [paketTerjualList, setPaketTerjualList] = useState<any[]>([]);
  const [satuanTerjualLangsungList, setSatuanTerjualLangsungList] = useState<any[]>([]);
  const [bahanTerpakaiList, setBahanTerpakaiList] = useState<any[]>([]);
  const [topWaiters, setTopWaiters] = useState<any[]>([]);
  const [topChefs, setTopChefs] = useState<any[]>([]);
  const [topHours, setTopHours] = useState<any[]>([]);

  useEffect(() => {
    // Set initial date range for 'bulan'
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const startM = `${currentYear}-${pad(currentMonth + 1)}-01`;
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    const endM = `${currentYear}-${pad(currentMonth + 1)}-${pad(lastDay)}`;
    
    setStartDate(startM);
    setEndDate(endM);
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [periodType, startDate, endDate, state.pegawai, state.menu, state.bahan]);

  async function loadDashboardData() {
    let filterStart = startDate;
    let filterEnd = endDate;

    const today = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');

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
    } else if (periodType === 'semua') {
      filterStart = '2000-01-01';
      filterEnd = '2099-12-31';
    }

    if (!filterStart || !filterEnd) return;

    // Fetch transactional data directly from Supabase for the selected period
    let dutyQuery = supabase.from('duty').select('*');
    let pengeluaranQuery = supabase.from('pengeluaran').select('*');
    let produksiChefQuery = supabase.from('produksi_chef').select('*');
    let transferItemQuery = supabase.from('transfer_item').select('*');

    if (periodType !== 'semua') {
      dutyQuery = dutyQuery.gte('tanggal', filterStart).lte('tanggal', filterEnd);
      pengeluaranQuery = pengeluaranQuery.gte('tanggal', filterStart).lte('tanggal', filterEnd);
      produksiChefQuery = produksiChefQuery.gte('tanggal', filterStart).lte('tanggal', filterEnd);
      transferItemQuery = transferItemQuery.gte('tanggal', filterStart).lte('tanggal', filterEnd);
    }

    const [dutyRes, pengeluaranRes, produksiChefRes, transferItemRes] = await Promise.all([
      dutyQuery, pengeluaranQuery, produksiChefQuery, transferItemQuery
    ]);

    const dutyList = dutyRes.data || [];
    const pengeluaranList = pengeluaranRes.data || [];
    const produksiChefList = produksiChefRes.data || [];
    const transferItemList = transferItemRes.data || [];

    // Helper menu & bahan finder
    const findMenuObj = (identifier: string) => {
      if (!identifier) return null;
      const str = String(identifier).toLowerCase().trim()
        .replace(/air\s*mineral/g, 'water')
        .replace(/air\s*putih/g, 'water')
        .replace(/^air$/g, 'water')
        .replace(/carrot/g, 'wortel')
        .replace(/potato/g, 'kentang');

      return (state.menu || []).find(m => 
        String(m.id_menu) === String(identifier) || 
        m.nama_menu.toLowerCase() === str ||
        m.nama_menu.toLowerCase().includes(str) ||
        str.includes(m.nama_menu.toLowerCase())
      );
    };

    const findBahanObj = (identifier: string) => {
      if (!identifier) return null;
      const str = String(identifier).toLowerCase().trim();
      return (state.bahan || []).find(b => 
        String(b.id_bahan) === String(identifier) || 
        b.nama_bahan.toLowerCase() === str ||
        b.nama_bahan.toLowerCase().includes(str) ||
        str.includes(b.nama_bahan.toLowerCase())
      );
    };

    // 1. Calculations: Omset & Porsi Terjual (Langsung & Dari Paket)
    let totalOmset = 0;
    let porsiTerjualCount = 0;
    const menuSalesMap: Record<string, { 
      id_menu: string, 
      nama_menu: string, 
      tipe_menu: string, 
      qty_langsung: number, 
      qty_paket: number, 
      total_qty: number, 
      harga_jual: number, 
      omset: number, 
      resep: any[] 
    }> = {};

    dutyList.forEach(d => {
      totalOmset += floorToTwo(d.total_omset) || 0;
      const items = d.detail_jual?.items || [];
      items.forEach((item: any) => {
        const qty = Number(item.qty) || 0;
        if (qty <= 0) return;
        porsiTerjualCount += qty;

        const menuInfo = findMenuObj(item.id_menu || item.nama_menu);
        const menuName = (item.nama_menu && item.nama_menu !== 'Unknown') ? item.nama_menu : (menuInfo ? menuInfo.nama_menu : (item.id_menu || 'Menu'));
        const menuId = menuInfo ? menuInfo.id_menu : item.id_menu;
        const tipeMenu = menuInfo ? menuInfo.tipe_menu : 'Satuan';
        const hargaJual = menuInfo ? (floorToTwo(menuInfo.harga_jual) || 0) : (floorToTwo(item.harga) || 0);

        if (!menuSalesMap[menuName]) {
          menuSalesMap[menuName] = { 
            id_menu: menuId,
            nama_menu: menuName,
            tipe_menu: tipeMenu,
            qty_langsung: 0, 
            qty_paket: 0, 
            total_qty: 0, 
            harga_jual: hargaJual,
            omset: 0, 
            resep: menuInfo ? (menuInfo.resep || []) : []
          };
        }

        // Direct Sales
        menuSalesMap[menuName].qty_langsung += qty;
        menuSalesMap[menuName].total_qty += qty;
        menuSalesMap[menuName].omset += (qty * hargaJual);

        // If item sold is a Paket, accumulate sub-menu component usage
        if (tipeMenu === 'Paket' && menuInfo && Array.isArray(menuInfo.resep)) {
          menuInfo.resep.forEach((r: any) => {
            const subId = r.id_menu_satuan || r.id_menu || r.id;
            const subObj = findMenuObj(subId);
            const subName = subObj ? subObj.nama_menu : String(subId);
            const subQty = (Number(r.qty) || 1) * qty;

            if (!menuSalesMap[subName]) {
              menuSalesMap[subName] = {
                id_menu: subObj ? subObj.id_menu : subId,
                nama_menu: subName,
                tipe_menu: 'Satuan',
                qty_langsung: 0,
                qty_paket: 0,
                total_qty: 0,
                harga_jual: subObj ? (floorToTwo(subObj.harga_jual) || 0) : 0,
                omset: 0,
                resep: subObj ? (subObj.resep || []) : []
              };
            }
            menuSalesMap[subName].qty_paket += subQty;
            menuSalesMap[subName].total_qty += subQty;
          });
        }
      });
    });

    // 2. Calculations: Produksi Chef
    let porsiDiproduksiCount = 0;
    produksiChefList.forEach(p => {
      porsiDiproduksiCount += (floorToTwo(p.qty) || 0);
    });

    transferItemList.forEach(t => {
      if (t.tipe_item === 'Makanan') {
        porsiDiproduksiCount += (floorToTwo(t.qty) || 0);
      }
    });

    // 3. Calculations: Pembelian Bahan Mentah & Restock
    let totalPengeluaranBahan = 0;
    const bahanPurchaseMap: Record<string, { qty: number, total_biaya: number, nama_bahan: string, satuan: string }> = {};

    pengeluaranList.forEach(p => {
      const qty = floorToTwo(p.jumlah_unit) || floorToTwo(p.qty) || 0;
      const dbHarga = floorToTwo(p.harga_aktual_per_unit) || floorToTwo(p.harga) || 0;
      let total = floorToTwo(p.total_biaya) || 0;
      if (total <= 0) {
        const bahan = findBahanObj(p.id_bahan || p._nama_bahan);
        const hargaToUse = dbHarga > 0 ? dbHarga : (bahan ? floorToTwo(bahan.harga_per_unit) : 0);
        total = hargaToUse * qty;
      }
      totalPengeluaranBahan += total;

      const bahanObj = findBahanObj(p.id_bahan || p._nama_bahan);
      const bahanName = bahanObj ? bahanObj.nama_bahan : (p._nama_bahan || 'Bahan Mentah');
      const satuan = bahanObj ? bahanObj.satuan : 'Unit';

      if (!bahanPurchaseMap[bahanName]) {
        bahanPurchaseMap[bahanName] = { qty: 0, total_biaya: 0, nama_bahan: bahanName, satuan: satuan };
      }
      bahanPurchaseMap[bahanName].qty += qty;
      bahanPurchaseMap[bahanName].total_biaya += total;
    });

    // 4. SMART RECURSIVE INGREDIENT USAGE CALCULATOR
    const bahanUsageMap: Record<string, { qty_used: number, total_value: number, nama_bahan: string, satuan: string }> = {};

    const processRecipeUsage = (menuIdOrName: string, soldQty: number, depth = 0) => {
      if (!menuIdOrName || soldQty <= 0 || depth > 5) return;

      const menuObj = findMenuObj(menuIdOrName);

      if (menuObj && Array.isArray(menuObj.resep) && menuObj.resep.length > 0) {
        if (menuObj.tipe_menu === 'Satuan' || !menuObj.tipe_menu) {
          menuObj.resep.forEach((r: any) => {
            const bId = r.id_bahan || r.id;
            const bQty = Number(r.qty) || 0;
            if (bId && bQty > 0) {
              const bahanObj = findBahanObj(bId);
              const bName = bahanObj ? bahanObj.nama_bahan : String(bId);
              const bSatuan = bahanObj ? bahanObj.satuan : 'Unit';
              const bHarga = bahanObj ? (floorToTwo(bahanObj.harga_per_unit) || 0) : 0;
              const totalNeeded = bQty * soldQty;

              if (!bahanUsageMap[bName]) {
                bahanUsageMap[bName] = { qty_used: 0, total_value: 0, nama_bahan: bName, satuan: bSatuan };
              }
              bahanUsageMap[bName].qty_used += totalNeeded;
              bahanUsageMap[bName].total_value += (totalNeeded * bHarga);
            }
          });
        } else {
          menuObj.resep.forEach((r: any) => {
            const subMenuId = r.id_menu_satuan || r.id_menu || r.id;
            const subQty = Number(r.qty) || 0;
            if (subMenuId && subQty > 0) {
              processRecipeUsage(subMenuId, soldQty * subQty, depth + 1);
            }
          });
        }
      } else {
        const directBahan = findBahanObj(menuIdOrName);
        if (directBahan) {
          const bName = directBahan.nama_bahan;
          const bSatuan = directBahan.satuan;
          const bHarga = floorToTwo(directBahan.harga_per_unit) || 0;
          if (!bahanUsageMap[bName]) {
            bahanUsageMap[bName] = { qty_used: 0, total_value: 0, nama_bahan: bName, satuan: bSatuan };
          }
          bahanUsageMap[bName].qty_used += soldQty;
          bahanUsageMap[bName].total_value += (soldQty * bHarga);
        }
      }
    };

    // Calculate recipe usage strictly from Duty sales (Satuan & Paket sold)
    dutyList.forEach(d => {
      const items = d.detail_jual?.items || [];
      items.forEach((item: any) => {
        const itemQty = Number(item.qty) || 0;
        const itemIdOrName = item.id_menu || item.nama_menu;
        processRecipeUsage(itemIdOrName, itemQty);
      });
    });

    // Also factor recipe usage from Produksi Chef
    produksiChefList.forEach(p => {
      const pQty = Number(p.qty) || 0;
      const pIdOrName = p.id_menu || p.menu;
      processRecipeUsage(pIdOrName, pQty);
    });

    // 5. Calculations: Beban Gaji & Komisi (100% unified with KeuanganTab)
    let totalBebanGaji = calculatePayrollForDutyList(dutyList, state.pegawai || []).totalBebanGaji;

    if (periodType === 'minggu' && filterStart && filterEnd) {
      try {
        const weekKey = `${filterStart} to ${filterEnd}`;
        const { data: rpcData } = await supabase.rpc('get_financial_dashboard', { p_week_key: weekKey });
        if (rpcData && Array.isArray(rpcData.gaji_pegawai) && rpcData.gaji_pegawai.length > 0) {
          const rpcTotal = rpcData.gaji_pegawai.reduce((acc: number, g: any) => acc + (parseFloat(g.thp) || 0), 0);
          if (rpcTotal > 0) {
            totalBebanGaji = Math.round(rpcTotal);
          }
        }
      } catch (err) {
        console.error("Error fetching RPC in DashboardTab:", err);
      }
    }

    const safeOmset = isNaN(totalOmset) ? 0 : totalOmset;
    const safePengeluaran = isNaN(totalPengeluaranBahan) ? 0 : totalPengeluaranBahan;
    const safeBebanGaji = isNaN(totalBebanGaji) ? 0 : totalBebanGaji;
    const netProfit = safeOmset - (safePengeluaran + safeBebanGaji);

    setOmsetVal(safeOmset);
    setPengeluaranVal(safePengeluaran);
    setBebanGajiVal(safeBebanGaji);
    setLabaBersihVal(isNaN(netProfit) ? 0 : netProfit);
    setTotalPorsiTerjual(porsiTerjualCount);

    // 6. Trend Chart (Daily or Weekly depending on period)
    const trendMap = new Map();
    dutyList.forEach(d => {
      const key = periodType === 'minggu' ? d.tanggal : getWeekLabel(d.tanggal);
      if (!trendMap.has(key)) trendMap.set(key, 0);
      trendMap.set(key, trendMap.get(key) + (floorToTwo(d.total_omset) || 0));
    });
    
    const sortedTrends = Array.from(trendMap.entries()).sort((a,b) => a[0].localeCompare(b[0]));
    setChartOmset({
      labels: sortedTrends.map(w => w[0]),
      data: sortedTrends.map(w => w[1])
    });

    // 7. Menu Terlaris & Paket Ranking List
    const allMenuSales = Object.entries(menuSalesMap).map(([name, data]) => {
      const isPaket = data.tipe_menu === 'Paket';
      const totalQty = data.total_qty;
      const calculatedOmset = isPaket 
        ? data.omset 
        : (data.harga_jual > 0 ? totalQty * data.harga_jual : data.omset);

      return {
        nama_menu: name,
        id_menu: data.id_menu,
        tipe_menu: data.tipe_menu,
        qty_langsung: data.qty_langsung,
        qty_paket: data.qty_paket,
        total_qty: totalQty,
        qty: totalQty,
        harga_jual: data.harga_jual,
        omset: calculatedOmset,
        total_omset: calculatedOmset,
        resep: data.resep
      };
    });

    // Satuan Only List (for Tabel Peringkat Menu Terlaris & Doughnut Chart)
    const satuanList = allMenuSales
      .filter(m => m.tipe_menu !== 'Paket' && m.total_qty > 0)
      .sort((a, b) => b.total_qty - a.total_qty);

    const sumSatuanOmset = satuanList.reduce((acc, m) => acc + m.total_omset, 0);

    const menuTerlarisListWithContrib = satuanList.map(m => ({
      ...m,
      kontribusi: sumSatuanOmset > 0 ? floorToTwo((m.total_omset / sumSatuanOmset) * 100) : 0
    }));

    setMenuTerlarisList(menuTerlarisListWithContrib);

    // Paket List & Satuan Langsung List (for Breakdown Section)
    const paketList = allMenuSales.filter(m => m.tipe_menu === 'Paket' && m.qty_langsung > 0);
    const satuanLangsungList = allMenuSales.filter(m => m.tipe_menu !== 'Paket' && m.qty_langsung > 0);

    setPaketTerjualList(paketList);
    setSatuanTerjualLangsungList(satuanLangsungList);

    setChartMenu({
      labels: menuTerlarisListWithContrib.slice(0, 5).map(m => m.nama_menu),
      data: menuTerlarisListWithContrib.slice(0, 5).map(m => m.total_qty)
    });

    // 8. Comprehensive Ingredient Usage Analyst List
    const allBahanNames = new Set([
      ...(state.bahan || []).map(b => b.nama_bahan),
      ...Object.keys(bahanUsageMap),
      ...Object.keys(bahanPurchaseMap)
    ]);

    const mergedBahanList = Array.from(allBahanNames).map(bName => {
      const bObj = findBahanObj(bName);
      const u = bahanUsageMap[bName] || { qty_used: 0, total_value: 0, nama_bahan: bName, satuan: 'Unit' };
      const p = bahanPurchaseMap[bName] || { qty: 0, total_biaya: 0, nama_bahan: bName, satuan: 'Unit' };
      const satuan = bObj ? bObj.satuan : (u.satuan || p.satuan || 'Unit');
      const hargaUnit = bObj ? (floorToTwo(bObj.harga_per_unit) || 0) : 0;

      return {
        id_bahan: bObj ? bObj.id_bahan : bName,
        nama_bahan: bName,
        satuan: satuan,
        harga_per_unit: hargaUnit,
        qty_terpakai: floorToTwo(u.qty_used),
        total_nilai_terpakai: floorToTwo(u.total_value),
        qty_dibeli: floorToTwo(p.qty),
        total_biaya_dibeli: floorToTwo(p.total_biaya)
      };
    }).sort((a, b) => b.qty_terpakai - a.qty_terpakai);

    setBahanTerpakaiList(mergedBahanList);

    // 9. Leaderboards
    const wMap = new Map();
    const hMap = new Map();
    dutyList.forEach(d => {
      if (!wMap.has(d.nama_ic)) wMap.set(d.nama_ic, 0);
      wMap.set(d.nama_ic, wMap.get(d.nama_ic) + (floorToTwo(d.total_omset) || 0));

      let dutyJam = 0;
      const detail = d.detail_jual || {};
      if (detail.waktu_mulai && detail.waktu_selesai) {
        const [mH, mM] = detail.waktu_mulai.split(':').map(Number);
        const [sH, sM] = detail.waktu_selesai.split(':').map(Number);
        let m = (mH * 60 + mM);
        let s = (sH * 60 + sM);
        if (s < m) s += 24 * 60;
        dutyJam = (s - m) / 60;
      }
      if (!hMap.has(d.nama_ic)) hMap.set(d.nama_ic, 0);
      hMap.set(d.nama_ic, hMap.get(d.nama_ic) + dutyJam);
    });

    setTopWaiters(Array.from(wMap.entries()).sort((a,b) => b[1] - a[1]).slice(0, 3));
    setTopHours(Array.from(hMap.entries()).sort((a,b) => b[1] - a[1]).slice(0, 3));

    const cMap = new Map();
    produksiChefList.forEach(p => {
      if (!cMap.has(p.nama_ic_chef)) cMap.set(p.nama_ic_chef, 0);
      cMap.set(p.nama_ic_chef, cMap.get(p.nama_ic_chef) + (floorToTwo(p.qty) || 0));
    });
    setTopChefs(Array.from(cMap.entries()).sort((a,b) => b[1] - a[1]).slice(0, 3));
  }

  const formatMoney = (val: number) => formatCurrency(Math.round(val));

  const activePegawai = (state.pegawai || []).filter(p => p.status_kontrak === 'Aktif');
  const totalPegawaiCount = activePegawai.length;

  const jabatanCounts: Record<string, number> = {};
  activePegawai.forEach(p => {
    const j = p.jabatan || 'Lainnya';
    jabatanCounts[j] = (jabatanCounts[j] || 0) + 1;
  });

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      
      {/* Header & Period Selector Bar */}
      <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>
            Dashboard Data Analyst & Eksekutif
          </h1>
        </div>

        {/* Filter Periode Control */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'var(--bg-card)', padding: '10px 15px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <label style={{ fontWeight: 'bold', fontSize: '0.9rem', margin: 0 }}>
            Periode:
          </label>
          <select 
            className="form-control" 
            style={{ width: 'auto', padding: '6px 12px', fontWeight: 'bold' }}
            value={periodType}
            onChange={(e) => setPeriodType(e.target.value as any)}
          >
            <option value="bulan">Bulan Ini</option>
            <option value="minggu">Minggu Ini</option>
            <option value="kustom">Kustom Tanggal</option>
          </select>

          {periodType === 'kustom' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="date" className="form-control" style={{ padding: '4px 8px' }} value={startDate} onChange={e => setStartDate(e.target.value)} />
              <span>s/d</span>
              <input type="date" className="form-control" style={{ padding: '4px 8px' }} value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          )}
        </div>
      </div>
      
      {/* 5 Executive KPI Stat Cards */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '20px' }}>
        <StatCard title="Total Omset Penjualan" value={formatMoney(omsetVal)} colors={['#1e293b', '#334155']} />
        <StatCard title="Biaya Pembelian Bahan" value={formatMoney(pengeluaranVal)} colors={['#1e293b', '#334155']} />
        <StatCard title="Beban Gaji & Komisi" value={formatMoney(bebanGajiVal)} colors={['#1e293b', '#334155']} />
        <StatCard title="Estimasi Laba Bersih" value={formatMoney(labaBersihVal)} colors={['#1e293b', '#334155']} />
        <StatCard title="Total Porsi Terjual" value={`${totalPorsiTerjual} Porsi`} colors={['#1e293b', '#334155']} />
      </div>

      {/* RINGKASAN PEGAWAI */}
      <div className="card mb-20" style={{ 
        padding: '16px 24px', 
        borderRadius: '12px', 
        background: 'var(--bg-card)', 
        marginBottom: '25px', 
        borderLeft: '4px solid #3b82f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        {/* Total Active Staff Count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', fontWeight: 500 }}>
              Total Pegawai Aktif
            </span>
            <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-color)' }}>
              {totalPegawaiCount} <span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>Orang</span>
            </span>
          </div>
        </div>

        {/* Jabatan Breakdown Pills */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginRight: '5px' }}>
            Rincian Jabatan:
          </span>
          {Object.entries(jabatanCounts).length === 0 ? (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Belum ada data pegawai</span>
          ) : (
            Object.entries(jabatanCounts).map(([jabatan, count]) => {
              let badgeBg = 'rgba(255, 255, 255, 0.08)';
              let badgeColor = '#e2e8f0';
              let badgeBorder = '1px solid rgba(255, 255, 255, 0.15)';

              if (jabatan === 'Waiter') {
                badgeBg = 'rgba(16, 185, 129, 0.15)';
                badgeColor = '#10b981';
                badgeBorder = '1px solid rgba(16, 185, 129, 0.3)';
              } else if (jabatan === 'Chef') {
                badgeBg = 'rgba(245, 158, 11, 0.15)';
                badgeColor = '#f59e0b';
                badgeBorder = '1px solid rgba(245, 158, 11, 0.3)';
              } else if (jabatan === 'Manager') {
                badgeBg = 'rgba(139, 92, 246, 0.15)';
                badgeColor = '#8b5cf6';
                badgeBorder = '1px solid rgba(139, 92, 246, 0.3)';
              }

              return (
                <div key={jabatan} style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  background: badgeBg,
                  color: badgeColor,
                  border: badgeBorder,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold'
                }}>
                  <span>{jabatan}: {count}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Analyst Section: Tren Penjualan & Top Menu Doughnut Chart */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '25px' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '20px', borderRadius: '10px' }}>
          <h3 style={{ marginTop: 0 }}>
            Tren Penjualan Omset ({periodType === 'minggu' ? 'Harian' : 'Mingguan'})
          </h3>
          <div style={{ flex: 1, minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Line 
              data={{
                labels: chartOmset.labels,
                datasets: [{
                  label: 'Total Omset ($)',
                  data: chartOmset.data,
                  borderColor: '#3b82f6',
                  backgroundColor: 'rgba(59, 130, 246, 0.2)',
                  borderWidth: 3,
                  tension: 0.3,
                  fill: true
                }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                  x: { grid: { display: false } }
                }
              }}
            />
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '20px', borderRadius: '10px' }}>
          <h3 style={{ marginTop: 0 }}>
            Top 5 Menu Terlaris
          </h3>
          <div style={{ flex: 1, minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Doughnut 
              data={{
                labels: chartMenu.labels,
                datasets: [{
                  data: chartMenu.data,
                  backgroundColor: ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'],
                  borderWidth: 0
                }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#ccc', boxWidth: 12 } } }
              }}
            />
          </div>
        </div>
      </div>

      {/* ANALYST SECTION 1: TABEL MENU TERLARIS (HANYA MENU SATUAN) */}
      <div className="card" style={{ padding: '25px', borderRadius: '10px', marginBottom: '25px', background: 'var(--bg-card)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
          Analisis Performa Menu Terlaris
        </h3>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Nama Menu</th>
                <th style={{ padding: '12px', textAlign: 'center', background: 'rgba(16, 185, 129, 0.1)' }}>Total Terjual / Terpakai</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Total Estimasi Omset</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Kontribusi Penjualan</th>
              </tr>
            </thead>
            <tbody>
              {menuTerlarisList.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px' }}>Belum ada data penjualan menu pada periode ini.</td></tr>
              ) : (
                menuTerlarisList.map((m) => (
                  <tr key={m.nama_menu} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{m.nama_menu}</td>
                    <td style={{ padding: '12px', textAlign: 'center', background: 'rgba(16, 185, 129, 0.05)', color: '#10b981' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                        {m.total_qty} Porsi
                      </div>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: 'var(--text-color)' }}>
                      {formatMoney(m.total_omset)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                        <div style={{ width: '80px', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, m.kontribusi)}%`, height: '100%', background: '#6366f1' }}></div>
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{m.kontribusi}%</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ANALYST SECTION 2: RINCIAN PENJUALAN PAKET & MENU SATUAN TERJUAL */}
      {(paketTerjualList.length > 0 || satuanTerjualLangsungList.length > 0) && (
        <div className="card" style={{ padding: '25px', borderRadius: '10px', marginBottom: '25px', background: 'var(--bg-card)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            Rincian Penjualan Paket & Menu Satuan Terjual
          </h3>

          {/* TABEL PENJUALAN PAKET & BREAKDOWN KOMPOSISI */}
          {paketTerjualList.length > 0 && (
            <div style={{ marginBottom: satuanTerjualLangsungList.length > 0 ? '25px' : '0' }}>
              <h4 style={{ color: '#f59e0b', marginTop: 0, marginBottom: '12px', fontSize: '1rem' }}>
                Penjualan Paket Combo & Komposisi Menu Satuan
              </h4>
              <div className="table-responsive">
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                      <th style={{ padding: '12px' }}>Nama Paket</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>Qty Terjual</th>
                      <th style={{ padding: '12px' }}>Komposisi Menu Satuan</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Total Omset Paket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paketTerjualList.map((p) => (
                      <tr key={p.nama_menu} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{p.nama_menu}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}><strong>{p.qty_langsung} Paket</strong></td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {Array.isArray(p.resep) && p.resep.length > 0 ? (
                              p.resep.map((r: any, idx: number) => {
                                const subMenuObj = (state.menu || []).find(m => m.id_menu === r.id_menu_satuan || m.id_menu === r.id);
                                const subName = subMenuObj ? subMenuObj.nama_menu : (r.id_menu_satuan || r.id || 'Sub Menu');
                                const totalQtySub = (Number(r.qty) || 1) * p.qty_langsung;
                                return (
                                  <span key={idx} style={{ background: 'rgba(236, 72, 153, 0.15)', border: '1px solid #ec4899', padding: '3px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>
                                    {subName} (x{r.qty} = {totalQtySub})
                                  </span>
                                );
                              })
                            ) : (
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Menu Satuan Kombinasi</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>
                          {formatMoney(p.total_omset)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TABEL PENJUALAN MENU SATUAN LANGSUNG */}
          {satuanTerjualLangsungList.length > 0 && (
            <div>
              <h4 style={{ color: '#3b82f6', marginTop: paketTerjualList.length > 0 ? '10px' : 0, marginBottom: '12px', fontSize: '1rem' }}>
                Penjualan Menu Satuan Terjual (Ala Carte)
              </h4>
              <div className="table-responsive">
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                      <th style={{ padding: '12px' }}>Nama Menu Satuan</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>Qty Terjual</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Harga Satuan</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Total Omset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {satuanTerjualLangsungList.map((m) => (
                      <tr key={m.nama_menu} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{m.nama_menu}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}><strong>{m.qty_langsung} Porsi</strong></td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{formatMoney(m.harga_jual)}</td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>
                          {formatMoney(m.qty_langsung * m.harga_jual)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ANALYST SECTION 3: TOTAL BAHAN MENTAH TERPAKAI & DIBELI (FROM PAKET & MENU SALES) */}
      <div className="card" style={{ padding: '25px', borderRadius: '10px', marginBottom: '25px', background: 'var(--bg-card)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
          Analisis Penggunaan Bahan Mentah
        </h3>

        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Nama Bahan Mentah</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Satuan</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Total Qty Terpakai (Menu & Paket)</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Estimasi Nilai Bahan Terpakai</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Total Qty Restock/Dibeli</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Total Biaya Restock</th>
              </tr>
            </thead>
            <tbody>
              {bahanTerpakaiList.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>Belum ada data konsumsi bahan mentah pada periode ini.</td></tr>
              ) : (
                bahanTerpakaiList.map((b) => (
                  <tr key={b.id_bahan} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{b.nama_bahan}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}><span className="badge badge-secondary">{b.satuan}</span></td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: b.qty_terpakai > 0 ? '#3b82f6' : 'var(--text-secondary)' }}>
                      {b.qty_terpakai} {b.satuan}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#6366f1', fontWeight: 'bold' }}>
                      {formatMoney(b.total_nilai_terpakai)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: b.qty_dibeli > 0 ? '#f59e0b' : 'var(--text-secondary)' }}>
                      {b.qty_dibeli} {b.satuan}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: b.total_biaya_dibeli > 0 ? '#ef4444' : 'var(--text-secondary)' }}>
                      {formatMoney(b.total_biaya_dibeli)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leaderboard Tim (Top Waiters, Top Chef, Hardworkers) */}
      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
        <LeaderboardCard 
          title="Top Waiters" 
          subtitle="Berdasarkan total omset penjualan" 
          colors={['#f59e0b', '#d97706', '#94a3b8']}
          items={topWaiters} 
          formatFn={(v: any) => formatMoney(v)}
        />
        <LeaderboardCard 
          title="Top Chef" 
          subtitle="Berdasarkan porsi masakan diproduksi" 
          colors={['#ef4444', '#dc2626', '#b91c1c']}
          items={topChefs} 
          formatFn={(v: any) => `${floorToTwo(v)} Porsi`}
        />
        <LeaderboardCard 
          title="Jam Kerja Tertinggi" 
          subtitle="Berdasarkan jam duty terdaftar" 
          colors={['#3b82f6', '#2563eb', '#1d4ed8']}
          items={topHours} 
          formatFn={(v: any) => `${floorToTwo(v)} Jam`}
        />
      </div>
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

function LeaderboardCard({ title, subtitle, items, colors, formatFn }: any) {
  return (
    <div className="card" style={{ padding: '20px', borderRadius: '10px' }}>
      <h3 style={{ marginTop: 0, textAlign: 'center', color: colors[0] }}>{title}</h3>
      <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>{subtitle}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Belum ada data</div>
        )}
        {items.map((item: any, i: number) => {
          const itemColor = colors[i] || '#555';
          return (
            <div key={item[0]} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 15px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', borderLeft: `4px solid ${itemColor}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>#{i+1}</span>
                <span style={{ fontWeight: 600, color: '#fff' }}>{item[0]}</span>
              </div>
              <div style={{ fontWeight: 'bold', color: itemColor }}>
                {formatFn(item[1])}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
