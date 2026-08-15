import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { floorToTwo, formatCurrency, getJakartaDate, getDutyHours, calculatePayrollForDutyList } from '../../lib/utils';

export default function AnalisisPegawaiTab() {
  const store = useAppStore();

  const [showResign, setShowResign] = useState(false);

  const getJabatanRank = (jabatan: string): number => {
    const j = (jabatan || '').toLowerCase().trim();
    if (j.includes('manager') || j.includes('pemilik') || j.includes('owner')) return 1;
    if (j.includes('head chef') || j.includes('head-chef') || j.includes('headchef')) return 2;
    if (j.includes('chef') || j.includes('koki') || j.includes('dapur')) return 3;
    if (j.includes('waiter') || j.includes('pelayan') || j.includes('pramusaji')) return 4;
    if (j.includes('kasir') || j.includes('cashier')) return 5;
    return 6;
  };

  const activePegawaiList = (store.pegawai || [])
    .filter(p => showResign || p.status_kontrak === 'Aktif')
    .sort((a, b) => {
      const rA = getJabatanRank(a.jabatan);
      const rB = getJabatanRank(b.jabatan);
      if (rA !== rB) return rA - rB;
      return a.nama_ic.localeCompare(b.nama_ic, 'id', { sensitivity: 'base' });
    });

  // Selected Employee & Period State
  const [selectedPegawai, setSelectedPegawai] = useState<string>('');
  const [periodType, setPeriodType] = useState<'bulan' | 'bulan_lalu' | 'minggu' | 'minggu_lalu' | 'semua' | 'kustom'>('bulan');
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
  const [pegawaiPaketList, setPegawaiPaketList] = useState<any[]>([]);
  const [pegawaiSatuanLangsungList, setPegawaiSatuanLangsungList] = useState<any[]>([]);
  const [allPegawaiComparisonList, setAllPegawaiComparisonList] = useState<any[]>([]);
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
      } else if (periodType === 'bulan_lalu') {
        const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const pMonth = prevMonth.getMonth();
        const pYear = prevMonth.getFullYear();
        filterStart = `${pYear}-${pad(pMonth + 1)}-01`;
        const lastDay = new Date(pYear, pMonth + 1, 0).getDate();
        filterEnd = `${pYear}-${pad(pMonth + 1)}-${pad(lastDay)}`;
      } else if (periodType === 'minggu') {
        const d = new Date(today);
        const day = d.getDay(); // 0 = Minggu (Sunday)
        const sun = new Date(d);
        sun.setDate(d.getDate() - day); // Minggu (Sunday)
        const sat = new Date(sun);
        sat.setDate(sun.getDate() + 6); // Sabtu (Saturday)
        filterStart = `${sun.getFullYear()}-${pad(sun.getMonth() + 1)}-${pad(sun.getDate())}`;
        filterEnd = `${sat.getFullYear()}-${pad(sat.getMonth() + 1)}-${pad(sat.getDate())}`;
      } else if (periodType === 'minggu_lalu') {
        const d = new Date(today);
        const day = d.getDay(); // 0 = Minggu (Sunday)
        const lastSun = new Date(d);
        lastSun.setDate(d.getDate() - day - 7); // Sunday of previous week
        const lastSat = new Date(lastSun);
        lastSat.setDate(lastSun.getDate() + 6); // Saturday of previous week
        filterStart = `${lastSun.getFullYear()}-${pad(lastSun.getMonth() + 1)}-${pad(lastSun.getDate())}`;
        filterEnd = `${lastSat.getFullYear()}-${pad(lastSat.getMonth() + 1)}-${pad(lastSat.getDate())}`;
      } else if (periodType === 'semua') {
        filterStart = '2000-01-01';
        filterEnd = '2099-12-31';
      }

      // Fetch Duty Data for Selected Pegawai & All Duties for Comparison Grid
      let dutyQ = supabase.from('duty').select('*').eq('nama_ic', selectedPegawai);
      let pengeluaranQ = supabase.from('pengeluaran').select('*').eq('nama_pembeli', selectedPegawai);
      let produksiQ = supabase.from('produksi_chef').select('*').eq('nama_ic_chef', selectedPegawai);
      let allDutyQ = supabase.from('duty').select('*');

      if (periodType !== 'semua') {
        dutyQ = dutyQ.gte('tanggal', filterStart).lte('tanggal', filterEnd);
        pengeluaranQ = pengeluaranQ.gte('tanggal', filterStart).lte('tanggal', filterEnd);
        produksiQ = produksiQ.gte('tanggal', filterStart).lte('tanggal', filterEnd);
        allDutyQ = allDutyQ.gte('tanggal', filterStart).lte('tanggal', filterEnd);
      }

      const [dutyRes, pengeluaranRes, produksiRes, allDutyRes] = await Promise.all([
        dutyQ.order('id_duty', { ascending: false }),
        pengeluaranQ.order('id_pengeluaran', { ascending: false }),
        produksiQ.order('id_produksi', { ascending: false }),
        allDutyQ
      ]);

      const dList = (dutyRes.data || []).sort((a: any, b: any) => {
        if (a.tanggal !== b.tanggal) {
          return b.tanggal.localeCompare(a.tanggal);
        }
        return (Number(b.id_duty) || 0) - (Number(a.id_duty) || 0);
      });
      const pList = pengeluaranRes.data || [];
      const cList = produksiRes.data || [];
      const allDutiesList = allDutyRes.data || [];

      setDutyLogs(dList);
      setPengeluaranLogs(pList);
      setProduksiChefLogs(cList);

      // 1. Calculate Omset & Porsi Terjual
      let calcOmset = 0;
      let calcPorsiTerjual = 0;
      const dateDutyMap = new Map();
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
          if (itemQty <= 0) return;
          calcPorsiTerjual += itemQty;

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

          // Direct Sales by this employee
          menuSalesMap[menuName].qty_langsung += itemQty;
          menuSalesMap[menuName].total_qty += itemQty;
          menuSalesMap[menuName].omset += (itemQty * hargaJual);

          // If item sold is a Paket, accumulate sub-menu component usage for this employee
          if (tipeMenu === 'Paket' && menuInfo && Array.isArray(menuInfo.resep)) {
            menuInfo.resep.forEach((r: any) => {
              const subId = r.id_menu_satuan || r.id_menu || r.id;
              const subObj = findMenuObj(subId);
              const subName = subObj ? subObj.nama_menu : String(subId);
              const subQty = (Number(r.qty) || 1) * itemQty;

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

        const dDate = d.tanggal || getJakartaDate();
        if (!dateDutyMap.has(dDate)) {
          dateDutyMap.set(dDate, { total_jam: 0, omset: 0, duty_count: 0, snapshot: detail.gaji_snapshot });
        }
        const dayStat = dateDutyMap.get(dDate);
        dayStat.total_jam += dutyJam;
        dayStat.omset += omset;
        dayStat.duty_count += 1;
      });

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
          harga: data.harga_jual,
          omset: calculatedOmset,
          total_omset: calculatedOmset,
          resep: data.resep
        };
      });

      // Filter Satuan Only for table Analisis Performa Menu Satuan oleh Pegawai
      const satuanList = allMenuSales
        .filter(m => m.tipe_menu !== 'Paket' && m.total_qty > 0)
        .sort((a, b) => b.total_qty - a.total_qty);

      const sumSatuanOmset = satuanList.reduce((acc, m) => acc + m.total_omset, 0);

      const pegawaiMenuListWithContrib = satuanList.map(m => ({
        ...m,
        kontribusi: sumSatuanOmset > 0 ? floorToTwo((m.total_omset / sumSatuanOmset) * 100) : 0
      }));

      setPegawaiMenuList(pegawaiMenuListWithContrib);

      const paketList = allMenuSales.filter(m => m.tipe_menu === 'Paket' && m.qty_langsung > 0);
      const satuanLangsungList = allMenuSales.filter(m => m.tipe_menu !== 'Paket' && m.qty_langsung > 0);

      setPegawaiPaketList(paketList);
      setPegawaiSatuanLangsungList(satuanLangsungList);

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

      const calcTotalMenuSatuan = satuanList.reduce((acc, m) => acc + m.total_qty, 0);

      setTotalOmset(calcOmset);
      setTotalJamDuty(calcJam);
      setTotalGajiEstimasi(calcGaji);
      setTotalPembelianBahan(calcPembelian);
      setTotalPorsiTerjual(calcTotalMenuSatuan);
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
      let heatStart = filterStart;
      let heatEnd = filterEnd;

      if (periodType === 'semua') {
        // Safe 30-day range for heatmap calendar when period is "semua" to prevent 100-year loop freeze
        const dStart = new Date(today);
        dStart.setDate(dStart.getDate() - 30);
        heatStart = `${dStart.getFullYear()}-${pad(dStart.getMonth() + 1)}-${pad(dStart.getDate())}`;
        heatEnd = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      }

      const startDateObj = new Date(heatStart);
      const endDateObj = new Date(heatEnd);

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

      // 6. Calculate All Staff Comparison Grid (Sorted Alphabetically by Employee Name)
      const pegawaiCompMap: Record<string, Record<string, { total_qty: number, harga_jual: number, total_omset: number }>> = {};
      const pegawaiDutyMap: Record<string, { dutyCount: number, totalJam: number }> = {};

      allDutiesList.forEach((d: any) => {
        const empName = d.nama_ic;
        if (!empName) return;

        if (!pegawaiDutyMap[empName]) {
          pegawaiDutyMap[empName] = { dutyCount: 0, totalJam: 0 };
        }
        pegawaiDutyMap[empName].dutyCount += 1;
        pegawaiDutyMap[empName].totalJam += getDutyHours(d);

        if (!pegawaiCompMap[empName]) {
          pegawaiCompMap[empName] = {};
        }

        const items = d.detail_jual?.items || [];
        items.forEach((item: any) => {
          const itemQty = Number(item.qty) || 0;
          if (itemQty <= 0) return;

          const menuInfo = findMenuObj(item.id_menu || item.nama_menu);
          const menuName = (item.nama_menu && item.nama_menu !== 'Unknown') ? item.nama_menu : (menuInfo ? menuInfo.nama_menu : (item.id_menu || 'Menu'));
          const tipeMenu = menuInfo ? menuInfo.tipe_menu : 'Satuan';
          const hargaJual = menuInfo ? (floorToTwo(menuInfo.harga_jual) || 0) : (floorToTwo(item.harga) || 0);

          if (tipeMenu !== 'Paket') {
            if (!pegawaiCompMap[empName][menuName]) {
              pegawaiCompMap[empName][menuName] = { total_qty: 0, harga_jual: hargaJual, total_omset: 0 };
            }
            pegawaiCompMap[empName][menuName].total_qty += itemQty;
            pegawaiCompMap[empName][menuName].total_omset += (itemQty * hargaJual);
          } else if (menuInfo && Array.isArray(menuInfo.resep)) {
            menuInfo.resep.forEach((r: any) => {
              const subId = r.id_menu_satuan || r.id_menu || r.id;
              const subObj = findMenuObj(subId);
              const subName = subObj ? subObj.nama_menu : String(subId);
              const subQty = (Number(r.qty) || 1) * itemQty;
              const subHarga = subObj ? (floorToTwo(subObj.harga_jual) || 0) : 0;

              if (!pegawaiCompMap[empName][subName]) {
                pegawaiCompMap[empName][subName] = { total_qty: 0, harga_jual: subHarga, total_omset: 0 };
              }
              pegawaiCompMap[empName][subName].total_qty += subQty;
              pegawaiCompMap[empName][subName].total_omset += (subQty * subHarga);
            });
          }
        });
      });

      // Active staff names sorted alphabetically
      const activeStaff = (store.pegawai || []).filter(p => showResign ? true : p.status_kontrak === 'Aktif');
      const allEmpNames = Array.from(new Set([
        ...activeStaff.map(p => p.nama_ic),
        ...Object.keys(pegawaiCompMap)
      ])).sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));

      const comparisonArray = allEmpNames.map(empName => {
        const menuEntriesMap = pegawaiCompMap[empName] || {};
        const items = Object.entries(menuEntriesMap)
          .map(([namaMenu, info]) => ({
            nama_menu: namaMenu,
            total_qty: info.total_qty,
            harga_jual: info.harga_jual,
            total_omset: info.total_omset
          }))
          .sort((a, b) => a.nama_menu.localeCompare(b.nama_menu, 'id', { sensitivity: 'base' }));

        const totalPorsiEmp = items.reduce((acc, it) => acc + it.total_qty, 0);
        const totalOmsetEmp = items.reduce((acc, it) => acc + it.total_omset, 0);
        const dutyStats = pegawaiDutyMap[empName] || { dutyCount: 0, totalJam: 0 };

        const empObj = (store.pegawai || []).find(p => p.nama_ic === empName);

        return {
          nama_ic: empName,
          jabatan: empObj ? empObj.jabatan : 'Pegawai',
          items,
          totalPorsi: totalPorsiEmp,
          totalOmset: totalOmsetEmp,
          totalDutyCount: dutyStats.dutyCount,
          totalDutyJam: floorToTwo(dutyStats.totalJam)
        };
      });

      comparisonArray.sort((a, b) => {
        const rA = getJabatanRank(a.jabatan);
        const rB = getJabatanRank(b.jabatan);
        if (rA !== rB) return rA - rB;
        return a.nama_ic.localeCompare(b.nama_ic, 'id', { sensitivity: 'base' });
      });

      setAllPegawaiComparisonList(comparisonArray);
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
              <option value="bulan_lalu">Bulan Lalu</option>
              <option value="minggu">Minggu Ini</option>
              <option value="minggu_lalu">Minggu Lalu</option>
              <option value="semua">Semua Waktu</option>
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
        <StatCard title="Total Menu Satuan Terjual" value={`${totalPorsiTerjual} Porsi`} colors={['#1e293b', '#334155']} />
        {selectedPegawaiObj?.jabatan === 'Chef' && (
          <StatCard title="Porsi Diproduksi Dapur" value={`${totalPorsiMasak} Porsi`} colors={['#1e293b', '#334155']} />
        )}
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
                  flex: (periodType === 'minggu' || periodType === 'minggu_lalu') ? 1 : 'none',
                  minWidth: (periodType === 'minggu' || periodType === 'minggu_lalu') ? '60px' : '32px',
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

      {/* TABEL TOTAL MENU SATUAN TERJUAL OLEH PEGAWAI */}
      <div className="card mb-20" style={{ padding: '20px', borderRadius: '10px', background: 'var(--bg-card)', marginBottom: '25px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>
          <h3 style={{ margin: 0 }}>
            Total Menu Satuan Terjual oleh {selectedPegawai} (Termasuk Penggunaan Dalam Paket)
          </h3>
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold' }}>
            Total: {totalPorsiTerjual} Porsi
          </div>
        </div>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Nama Menu Satuan</th>
                <th style={{ padding: '12px', textAlign: 'center', background: 'rgba(16, 185, 129, 0.1)' }}>Total Terjual / Terpakai</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Harga Satuan ($)</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Total Estimasi Omset ($)</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Kontribusi</th>
              </tr>
            </thead>
            <tbody>
              {pegawaiMenuList.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Belum ada rincian penjualan menu oleh pegawai ini.</td></tr>
              ) : (
                pegawaiMenuList.map((m, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{m.nama_menu}</td>
                    <td style={{ padding: '12px', textAlign: 'center', background: 'rgba(16, 185, 129, 0.05)', fontWeight: 'bold', fontSize: '1rem', color: '#10b981' }}>
                      {m.total_qty} Porsi
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>{formatCurrency(m.harga_jual)}</td>
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

      {/* TABEL RINCIAN PENJUALAN PAKET & MENU SATUAN TERJUAL OLEH PEGAWAI */}
      {(pegawaiPaketList.length > 0 || pegawaiSatuanLangsungList.length > 0) && (
        <div className="card mb-20" style={{ padding: '20px', borderRadius: '10px', background: 'var(--bg-card)', marginBottom: '25px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            Rincian Penjualan Paket & Menu Satuan Terjual oleh {selectedPegawai}
          </h3>

          {pegawaiPaketList.length > 0 && (
            <div style={{ marginBottom: pegawaiSatuanLangsungList.length > 0 ? '25px' : '0' }}>
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
                    {pegawaiPaketList.map((p, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{p.nama_menu}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}><strong>{p.qty_langsung} Paket</strong></td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {Array.isArray(p.resep) && p.resep.length > 0 ? (
                              p.resep.map((r: any, rIdx: number) => {
                                const subMenuObj = (store.menu || []).find(m => m.id_menu === r.id_menu_satuan || m.id_menu === r.id);
                                const subName = subMenuObj ? subMenuObj.nama_menu : (r.id_menu_satuan || r.id || 'Sub Menu');
                                const totalQtySub = (Number(r.qty) || 1) * p.qty_langsung;
                                return (
                                  <span key={rIdx} style={{ background: 'rgba(236, 72, 153, 0.15)', border: '1px solid #ec4899', padding: '3px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>
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
                          {formatCurrency(p.total_omset)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {pegawaiSatuanLangsungList.length > 0 && (
            <div>
              <h4 style={{ color: '#3b82f6', marginTop: pegawaiPaketList.length > 0 ? '10px' : 0, marginBottom: '12px', fontSize: '1rem' }}>
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
                    {pegawaiSatuanLangsungList.map((m, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{m.nama_menu}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}><strong>{m.qty_langsung} Porsi</strong></td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{formatCurrency(m.harga_jual)}</td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#10b981' }}>
                          {formatCurrency(m.qty_langsung * m.harga_jual)}
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

      {/* 📊 TABEL/CARD PERBANDINGAN PENJUALAN SEMUA PEGAWAI */}
      <div className="card mb-20" style={{ padding: '20px', borderRadius: '10px', background: 'var(--bg-card)', marginBottom: '25px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>
          <h3 style={{ margin: 0 }}>
            Perbandingan Total Penjualan Per Pegawai
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px', marginTop: '15px' }}>
          {(() => {
            const activeCards = allPegawaiComparisonList.filter(emp => emp.items.length > 0 && emp.totalPorsi > 0);
            if (activeCards.length === 0) {
              return (
                <div style={{ color: 'var(--text-secondary)', textAlign: 'center', gridColumn: '1 / -1', padding: '20px' }}>
                  Belum ada data penjualan pegawai pada periode ini.
                </div>
              );
            }
            return activeCards.map((emp) => {
              const inisial = emp.nama_ic.charAt(0).toUpperCase();
              const isSelected = emp.nama_ic === selectedPegawai;

              return (
                <div 
                  key={emp.nama_ic} 
                  style={{ 
                    background: 'var(--bg-card)', 
                    padding: '15px', 
                    borderRadius: '12px', 
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)', 
                    border: `1px solid ${isSelected ? '#3b82f6' : 'var(--border-color)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out'
                  }}
                  onClick={() => setSelectedPegawai(emp.nama_ic)}
                  title={`Klik untuk melihat detail ${emp.nama_ic}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                    <div style={{ background: isSelected ? '#3b82f6' : 'var(--accent-color)', color: 'white', width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '16px', flexShrink: 0 }}>
                      {inisial}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={emp.nama_ic}>
                        {emp.nama_ic}
                      </h4>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {emp.jabatan}
                        </span>
                        <span style={{ fontSize: '0.75rem', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          <i className="fa-regular fa-clock" style={{ marginRight: '4px' }}></i>{emp.totalDutyCount}x Duty ({emp.totalDutyJam}j)
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0, marginLeft: '6px' }}>
                      <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: 'var(--success-color)', padding: '4px 10px', borderRadius: '6px', fontWeight: 600, fontSize: '0.85rem' }}>
                        {emp.totalPorsi} Porsi
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '250px', overflowY: 'auto' }}>
                    {emp.items.map((item: any) => (
                      <div 
                        key={item.nama_menu} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '6px 10px', 
                          background: 'var(--bg-hover)', 
                          borderRadius: '6px', 
                          fontSize: '0.9rem', 
                          marginBottom: '5px' 
                        }}
                      >
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px' }} title={item.nama_menu}>{item.nama_menu}</span>
                        <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: 'var(--success-color)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, fontSize: '0.85rem', flexShrink: 0 }}>
                          {item.total_qty} Porsi
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--accent-color)' }}>
          <i className="fa-solid fa-rotate fa-spin" style={{ marginRight: '8px' }}></i>Memuat analisis data pegawai...
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
