import { floorToTwo } from './utils';

export interface SupplyChainOptions {
  chefCount?: number;
  waiterCount?: number;
  restockDay?: string;
  periodDays?: number;
  stepMultiple?: number; // e.g. 50, 10, 100
  minWaiterPortion?: number; // e.g. 50
}

export interface ChefIngredientAllocation {
  nama_chef: string;
  role: string;
  allocated_ingredients: {
    nama_bahan: string;
    satuan: string;
    qty_alokasi_memasak: number;
    buffer_sisa_dikembalikan: number;
  }[];
}

export interface ChefDishProduction {
  nama_chef: string;
  role: string;
  dishes_to_cook: {
    nama_menu: string;
    target_porsi_dimasak: number;
  }[];
}

export interface WaiterDishAllocation {
  nama_waiter: string;
  role: string;
  sales_share_pct: string;
  allocated_dishes: {
    nama_menu: string;
    qty_alokasi_bulat: number;
  }[];
}

export interface WeeklySupplyChainReport {
  restockDay: string;
  periodDays: number;
  totalChefCount: number;
  totalWaiterCount: number;
  stepMultiple: number;
  roundedDishTargets: {
    nama_menu: string;
    proyeksi_penjualan_mingguan: number;
    target_masakan_bulat: number;
    sisa_stok_makanan_saat_ini: number;
    kebutuhan_masakan_baru: number;
  }[];
  chefDishProductions: ChefDishProduction[];
  ingredientsToRestock: {
    nama_bahan: string;
    satuan: string;
    total_bahan_dibutuhkan: number;
    stok_saat_ini_total: number; // gudang + chef
    rekomendasi_restock_minggu: number;
    stok_cadangan_buffer_next_periode: number;
  }[];
  chefAllocations: ChefIngredientAllocation[];
  waiterAllocations: WaiterDishAllocation[];
  summaryMarkdown: string;
}

/**
 * Pembulatan ke kelipatan angka bulat terdekat (misal kelipatan 50: 50, 100, 120, 150, 200)
 */
export function roundToNiceMultiple(val: number, step = 50, minVal = 50): number {
  if (val <= 0) return 0;
  if (val < minVal) return minVal;

  const rounded = Math.ceil(val / step) * step;
  return Math.max(minVal, rounded);
}

/**
 * Membangun Konteks Snapshot Database 2 Periode Terbaru untuk AI System Prompt
 */
export function buildDatabaseContext(store: any): string {
  const d = new Date();
  d.setDate(d.getDate() - 14); // MAX 2 Periode Terbaru (~14 hari)
  const twoPeriodsAgo = d.toISOString().split('T')[0];

  // 1. Log Duty Penjualan 2 Periode Terbaru
  const dutyLogs2Periods = (store.duty || []).filter((d: any) => !d.tanggal || d.tanggal >= twoPeriodsAgo);

  // 2. Master Bahan Mentah & Live Stock (Gudang + Chef)
  const bahanList = (store.bahan || []).map((b: any) => {
    const stokPegawaiList = (store.stokBahanPegawai || []).filter((x: any) => x.id_bahan === b.id_bahan);
    const totalStokChef = stokPegawaiList.reduce((acc: number, cur: any) => acc + (Number(cur.qty) || 0), 0);
    const totalStokGudang = Number(b.stok) || 0;
    const totalStokTersedia = totalStokGudang + Math.max(0, totalStokChef);

    return {
      id_bahan: b.id_bahan,
      nama_bahan: b.nama_bahan,
      stok_gudang_utama: totalStokGudang,
      stok_di_tangan_chef: totalStokChef,
      total_stok_tersedia: totalStokTersedia,
      satuan: b.satuan || 'unit',
      harga_per_unit: Number(b.harga_per_unit) || 0
    };
  });

  // 3. Master Menu Satuan ONLY (Menu Paket Diuraikan ke Menu Satuan)
  const menuSatuanList = (store.menu || [])
    .filter((m: any) => m.tipe_menu === 'Satuan')
    .map((m: any) => {
      const hargaJual = Number(m.harga_jual) || 0;
      const hpp = Number(m.hpp_terakhir) || 0;

      const stokMakananList = (store.stokMakananPegawai || []).filter((x: any) => x.id_menu === m.id_menu);
      const totalSisaMasakan = stokMakananList.reduce((acc: number, cur: any) => acc + (Number(cur.qty) || 0), 0);

      return {
        id_menu: m.id_menu,
        nama_menu: m.nama_menu,
        tipe_menu: 'Satuan',
        harga_jual: hargaJual,
        hpp_terakhir: hpp,
        sisa_stok_masakan_saat_ini: Math.max(0, totalSisaMasakan), // Makanan tidak basi
        resep_bahan_mentah: m.resep || []
      };
    });

  // 4. Performa Penjualan Waiter (2 Periode Terbaru)
  const waiterSalesPerformance: Record<string, number> = {};
  let totalOmset2Periods = 0;

  dutyLogs2Periods.forEach((d: any) => {
    const waiterName = d.nama_ic;
    const omset = Number(d.total_omset) || 0;
    if (waiterName) {
      waiterSalesPerformance[waiterName] = (waiterSalesPerformance[waiterName] || 0) + omset;
      totalOmset2Periods += omset;
    }
  });

  const pegawaiAktif = (store.pegawai || [])
    .filter((p: any) => p.status_kontrak === 'Aktif')
    .map((p: any) => {
      const omsetHistoris = waiterSalesPerformance[p.nama_ic] || 0;
      const salesRatioPct = totalOmset2Periods > 0 ? floorToTwo((omsetHistoris / totalOmset2Periods) * 100) : 0;

      return {
        nama_ic: p.nama_ic,
        role: p.jabatan || p.role || 'Staff',
        rate_gaji_per_jam: Number(p.rate_gaji_per_jam) || 0,
        omset_2_periode_terakhir: omsetHistoris,
        rasio_kontribusi_penjualan_pct: `${salesRatioPct}%`
      };
    });

  // 5. Total Belanja & Kas
  const pengeluaranList = store.pengeluaran || [];
  const totalBelanjaBahan = pengeluaranList.reduce((acc: number, cur: any) => acc + (Number(cur.total_pengeluaran) || 0), 0);

  return `
=== KONTEKS BESAR RANTAI PASOKAN RESTOMANAGER (MAX 2 PERIODE TERBARU) ===
ATURAN DOMAIN RESTOMANAGER SANGAT PENTING:
1. CHEF HANYA MEMASAK MENU SATUAN (BURGER, JUS WORTEL, KATSU, WATER, FRENCH FRIES). MENU PAKET TIDAK DIMASAK OLEH CHEF KARENA PAKET ADALAH BUNDLE DARI MENU SATUAN.
2. WINDOW DATA: MENGGUNAKAN DATA MAX 2 PERIODE TERBARU (~14 HARI).
3. SEMUA PERHITUNGAN ADALAH PER MINGGU (PERIODE 7 HARI).
4. ATURAN PENTING TRANSFER WAITER: TIGA MENU INI ("French Fries", "Jus Wortel", "Katsu") ADALAH HASIL OLAHAN BAHAN BERSAMA (KENTANG & WORTEL), SEHINGGA PORSI MEREKA WAJIB SAMA RATA PER WAITER (Misal: jika French Fries = 50, maka Jus Wortel = 50 dan Katsu = 50).
5. HARUS MEMILIKI TABEL KHUSUS "TARGET HASIL MASAKAN PER CHEF" (Tabel Target Produksi Masakan per Chef).
6. Target Masakan per Menu Satuan DITETAPKAN DALAM ANGKA BAGUS / GENAP (kelipatan 50, 100, 120, 150, 200, BUKAN PECAHAN seperti 121 atau 122).
7. Restock Bahan Mentah Hari Minggu: Dihitung dari target masakan bulat per minggu dikurangi sisa stok bahan mentah yang ada saat ini (Gudang + Chef). Sisa bahan mentah TIDAK dibuang.
8. Pembagian Bahan ke N Chef DIBAGI RATA dalam angka bulat. Sisa selisih dimasukkan ke "Stok Cadangan Buffer (Next Periode)" dan TIDAK dimasak periode ini.

=== SNAPSHOT DATABASE 2 PERIODE TERBARU (EXACT DATA) ===
📊 REKAPITULASI OMSET & PENJUALAN (2 PERIODE TERBARU):
- Total Omset Duty Sales (2 Periode): $${floorToTwo(totalOmset2Periods)} (${dutyLogs2Periods.length} duty logs)
- Total Pengeluaran Belanja Bahan: $${floorToTwo(totalBelanjaBahan)} (${pengeluaranList.length} transaksi)
- Total Pegawai Aktif: ${pegawaiAktif.length} orang

📦 MASTER BAHAN MENTAH & STOK (GUDANG + CHEF):
${JSON.stringify(bahanList, null, 2)}

🍽️ MASTER MENU SATUAN YANG DIMASAK CHEF (${menuSatuanList.length} Item Satuan):
${JSON.stringify(menuSatuanList, null, 2)}

👥 PEGAWAI AKTIF & RASIO PERFORMA SALES (2 PERIODE TERBARU):
${JSON.stringify(pegawaiAktif, null, 2)}
====================================================================
`;
}

/**
 * Solver Supply Chain Lanjutan: Perhitungan Mundur Masakan Bulat (2 Periode) -> Hasil Masakan Chef -> Bahan Mentah -> Restock Minggu -> Alokasi Chef (Rata + Buffer) -> Transfer Waiter (Proporsional + FF/JW/Katsu Equal)
 */
export function calculateCustomSupplyChainRestockAndDistribution(
  store: any,
  options: SupplyChainOptions = {}
): WeeklySupplyChainReport {
  const restockDay = options.restockDay || 'Minggu';
  const periodDays = options.periodDays || 7;
  const targetChefCount = options.chefCount || 3;
  const targetWaiterCount = options.waiterCount || 9;
  const stepMultiple = options.stepMultiple || 50;
  const minWaiterPortion = options.minWaiterPortion || 50;

  // Window Data MAX 2 PERIODE (14 Hari)
  const d = new Date();
  d.setDate(d.getDate() - 14);
  const twoPeriodsAgo = d.toISOString().split('T')[0];

  const dutyLogs2Periods = (store.duty || []).filter((d: any) => !d.tanggal || d.tanggal >= twoPeriodsAgo);
  const pegawaiAktif = (store.pegawai || []).filter((p: any) => p.status_kontrak === 'Aktif');

  // Filter Chef & Waiter
  const chefsAll = pegawaiAktif.filter((p: any) => {
    const r = (p.jabatan || p.role || '').toLowerCase();
    return r.includes('chef') || r.includes('koki') || r.includes('dapur');
  });

  const selectedChefs = (chefsAll.length >= targetChefCount ? chefsAll : pegawaiAktif).slice(0, targetChefCount);

  // Performa Omset Waiter (2 Periode)
  const waiterOmsetMap: Record<string, number> = {};
  let totalOmsetAllWaiters = 0;

  dutyLogs2Periods.forEach((d: any) => {
    const wName = d.nama_ic;
    const omset = Number(d.total_omset) || 0;
    if (wName) {
      waiterOmsetMap[wName] = (waiterOmsetMap[wName] || 0) + omset;
      totalOmsetAllWaiters += omset;
    }
  });

  const sortedWaiters = [...pegawaiAktif].sort((a, b) => {
    return (waiterOmsetMap[b.nama_ic] || 0) - (waiterOmsetMap[a.nama_ic] || 0);
  });

  const selectedWaiters = sortedWaiters.slice(0, targetWaiterCount);
  const totalOmsetSelectedWaiters = selectedWaiters.reduce((acc, w) => acc + (waiterOmsetMap[w.nama_ic] || 0), 0) || 1;

  // 1. Uraikan Penjualan Duty 2 Periode ke Menu Satuan
  const menuList = store.menu || [];
  const bahanList = store.bahan || [];
  const menuSatuanSalesMap: Record<string, number> = {};

  dutyLogs2Periods.forEach((d: any) => {
    const items = d.detail_jual?.items || [];
    items.forEach((item: any) => {
      const m = menuList.find((x: any) => String(x.id_menu) === String(item.id_menu));
      const qty = Number(item.qty) || 0;
      if (m) {
        if (m.tipe_menu === 'Satuan') {
          menuSatuanSalesMap[m.id_menu] = (menuSatuanSalesMap[m.id_menu] || 0) + qty;
        } else if (Array.isArray(m.resep)) {
          // Menu Paket: Uraikan ke Menu Satuan penyusunnya
          m.resep.forEach((r: any) => {
            if (r.id_menu_satuan) {
              const subQty = (Number(r.qty) || 0) * qty;
              menuSatuanSalesMap[r.id_menu_satuan] = (menuSatuanSalesMap[r.id_menu_satuan] || 0) + subQty;
            }
          });
        }
      }
    });
  });

  const totalDaysIn2Periods = new Set(dutyLogs2Periods.map((d: any) => d.tanggal)).size || 1;
  const menuSatuanOnly = menuList.filter((m: any) => m.tipe_menu === 'Satuan');

  // 2. Proyeksi Penjualan Mingguan & Target Masakan Bulat per Menu Satuan
  const roundedDishTargets: WeeklySupplyChainReport['roundedDishTargets'] = [];
  const targetCookedDishMap: Record<string, number> = {};

  menuSatuanOnly.forEach((m: any) => {
    const salesTotal = menuSatuanSalesMap[m.id_menu] || 0;
    const avgWeeklySales = (salesTotal / totalDaysIn2Periods) * periodDays;
    
    // Target Masakan Bulat (Genap: 50, 100, 120, 150)
    const targetMasakanBulat = roundToNiceMultiple(avgWeeklySales, stepMultiple, minWaiterPortion);

    // Sisa makanan saat ini di tangan waiter/chef
    const stokMakananList = (store.stokMakananPegawai || []).filter((x: any) => x.id_menu === m.id_menu);
    const sisaMasakan = Math.max(0, stokMakananList.reduce((acc: number, cur: any) => acc + (Number(cur.qty) || 0), 0));
    
    // Sisa makanan tidak pernah basi, dikurangi dari target masakan baru
    const masakanBaruDibutuhkan = Math.max(0, targetMasakanBulat - sisaMasakan);
    targetCookedDishMap[m.id_menu] = masakanBaruDibutuhkan;

    roundedDishTargets.push({
      nama_menu: m.nama_menu,
      proyeksi_penjualan_mingguan: floorToTwo(avgWeeklySales),
      target_masakan_bulat: targetMasakanBulat,
      sisa_stok_makanan_saat_ini: sisaMasakan,
      kebutuhan_masakan_baru: masakanBaruDibutuhkan
    });
  });

  // 3. NEW: TABEL TARGET HASIL PRODUKSI MASAKAN PER CHEF
  const chefDishProductions: ChefDishProduction[] = selectedChefs.map((c: any) => {
    const dishesToCook = roundedDishTargets.map(dt => {
      const sharePerChef = Math.floor(dt.kebutuhan_masakan_baru / selectedChefs.length);
      return {
        nama_menu: dt.nama_menu,
        target_porsi_dimasak: sharePerChef
      };
    });

    return {
      nama_chef: c.nama_ic,
      role: c.jabatan || c.role || 'Chef',
      dishes_to_cook: dishesToCook
    };
  });

  // 4. Perhitungan Mundur Kebutuhan Bahan Mentah Dari Masakan Bulat Target
  const ingredientDemandMap: Record<string, number> = {};

  menuSatuanOnly.forEach((m: any) => {
    const masakanBaruToCook = targetCookedDishMap[m.id_menu] || 0;
    if (Array.isArray(m.resep)) {
      m.resep.forEach((r: any) => {
        const idBahan = r.id_bahan;
        const qtyPerPortion = Number(r.qty) || 0;
        ingredientDemandMap[idBahan] = (ingredientDemandMap[idBahan] || 0) + (masakanBaruToCook * qtyPerPortion);
      });
    }
  });

  // Rekomendasi Restock Hari Minggu
  const ingredientsToRestock: WeeklySupplyChainReport['ingredientsToRestock'] = [];
  const totalRawIngredientAllocable: Record<string, number> = {};

  bahanList.forEach((b: any) => {
    const demandBahan = Math.ceil(ingredientDemandMap[b.id_bahan] || 0);

    const stokPegawaiList = (store.stokBahanPegawai || []).filter((x: any) => x.id_bahan === b.id_bahan);
    const stokChef = stokPegawaiList.reduce((acc: number, cur: any) => acc + (Number(cur.qty) || 0), 0);
    const stokGudang = Number(b.stok) || 0;
    const stokSaatIniTotal = Math.max(0, stokGudang + stokChef);

    const butuhRestockMinggu = Math.max(0, demandBahan - stokSaatIniTotal);
    const totalBahanTersediaRestock = stokSaatIniTotal + butuhRestockMinggu;
    totalRawIngredientAllocable[b.id_bahan] = totalBahanTersediaRestock;

    const sharePerChefClean = Math.floor(totalBahanTersediaRestock / selectedChefs.length);
    const bufferNextPeriode = totalBahanTersediaRestock - (sharePerChefClean * selectedChefs.length);

    ingredientsToRestock.push({
      nama_bahan: b.nama_bahan,
      satuan: b.satuan || 'unit',
      total_bahan_dibutuhkan: demandBahan,
      stok_saat_ini_total: stokSaatIniTotal,
      rekomendasi_restock_minggu: butuhRestockMinggu,
      stok_cadangan_buffer_next_periode: bufferNextPeriode
    });
  });

  // 5. Pembagian Bahan Mentah ke N Chef (DIBAGI RATA + REMAINDER BUFFER)
  const chefAllocations: ChefIngredientAllocation[] = selectedChefs.map((c: any) => {
    const allocated: any[] = [];

    bahanList.forEach((b: any) => {
      const totalAvailable = totalRawIngredientAllocable[b.id_bahan] || 0;
      const sharePerChefClean = Math.floor(totalAvailable / selectedChefs.length);
      const remainderBuffer = totalAvailable % selectedChefs.length;

      allocated.push({
        nama_bahan: b.nama_bahan,
        satuan: b.satuan || 'unit',
        qty_alokasi_memasak: sharePerChefClean,
        buffer_sisa_dikembalikan: remainderBuffer
      });
    });

    return {
      nama_chef: c.nama_ic,
      role: c.jabatan || c.role || 'Chef',
      allocated_ingredients: allocated
    };
  });

  // 6. Pembagian Transfer Makanan ke M Waiter/Manager
  // ATURAN KHUSUS USER: 3 Menu (French Fries, Jus Wortel, Katsu) HARUS SAMA RATA PER WAITER!
  const waiterAllocations: WaiterDishAllocation[] = selectedWaiters.map((w: any) => {
    const waiterOmset = waiterOmsetMap[w.nama_ic] || 0;
    const salesRatio = totalOmsetSelectedWaiters > 0 ? (waiterOmset / totalOmsetSelectedWaiters) : (1 / selectedWaiters.length);
    const salesRatioPct = floorToTwo(salesRatio * 100);

    const allocatedDishes: any[] = [];

    // Tentukan porsi sama rata untuk kelompok (French Fries, Jus Wortel, Katsu)
    const ffItem = roundedDishTargets.find(t => t.nama_menu.toLowerCase().includes('french fries'));
    const jwItem = roundedDishTargets.find(t => t.nama_menu.toLowerCase().includes('jus wortel'));
    const ktItem = roundedDishTargets.find(t => t.nama_menu.toLowerCase().includes('katsu'));

    const avgTargetTriple = ((ffItem?.target_masakan_bulat || 50) + (jwItem?.target_masakan_bulat || 50) + (ktItem?.target_masakan_bulat || 50)) / 3;
    const sharedTripleShareRaw = avgTargetTriple * salesRatio;
    const equalTripleShare = Math.max(minWaiterPortion, roundToNiceMultiple(sharedTripleShareRaw, 10, minWaiterPortion));

    roundedDishTargets.forEach((targetItem) => {
      const menuNameLower = targetItem.nama_menu.toLowerCase();
      let cleanShare = 0;

      // Jika menu French Fries, Jus Wortel, atau Katsu -> Gunakan angka SAMA RATA (equalTripleShare)
      if (menuNameLower.includes('french fries') || menuNameLower.includes('jus wortel') || menuNameLower.includes('katsu')) {
        cleanShare = equalTripleShare;
      } else {
        const totalDishTarget = targetItem.target_masakan_bulat;
        const rawShare = totalDishTarget * salesRatio;
        cleanShare = Math.max(minWaiterPortion, roundToNiceMultiple(rawShare, 10, minWaiterPortion));
      }

      allocatedDishes.push({
        nama_menu: targetItem.nama_menu,
        qty_alokasi_bulat: cleanShare
      });
    });

    return {
      nama_waiter: w.nama_ic,
      role: w.jabatan || w.role || 'Waiter',
      sales_share_pct: `${salesRatioPct}%`,
      allocated_dishes: allocatedDishes
    };
  });

  // 7. Susun Markdown Report Rapi (2 Periode Data Window)
  let md = `## 🔄 Laporan Rantai Pasokan & Restock Hari ${restockDay} (Window Data 2 Periode Terbaru)\n\n`;

  md += `> [!NOTE]\n`;
  md += `> Aturan Spesifik: Data dihitung berdasarkan **Max 2 Periode Terbaru** (~14 Hari). Menu **French Fries, Jus Wortel, dan Katsu HARUS SAMA RATA per Waiter** karena berbahan dasar sejenis (Kentang & Wortel).\n\n`;

  md += `### 🍽️ 1. Target Masakan Bulat per Menu Satuan (Hitungan 2 Periode Terbaru)\n`;
  md += `| Nama Menu Satuan | Est. Penjualan Mingguan (2 Periode) | Target Masakan Bulat | Sisa Masakan (Tidak Basi) | Masakan Baru Dibutuhkan |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: |\n`;

  roundedDishTargets.forEach((dt) => {
    md += `| **${dt.nama_menu}** | ${dt.proyeksi_penjualan_mingguan} porsi | **${dt.target_masakan_bulat} porsi** | ${dt.sisa_stok_makanan_saat_ini} porsi | **${dt.kebutuhan_masakan_baru} porsi** |\n`;
  });

  md += `\n### 🍳 2. Target Hasil Produksi Masakan per Chef (Target Masak per Chef)\n`;
  md += `| Nama Chef | Role | Target Hasil Memasak per Menu (Angka Bulat Clean) |\n`;
  md += `| :--- | :---: | :--- |\n`;

  chefDishProductions.forEach((cp) => {
    const dishStr = cp.dishes_to_cook.map(d => `${d.nama_menu}: **${d.target_porsi_dimasak} porsi**`).join(', ');
    md += `| **${cp.nama_chef}** | ${cp.role} | ${dishStr} |\n`;
  });

  md += `\n### 📦 3. Rekomendasi Pengadaan / Restock Bahan Mentah Hari ${restockDay} (2 Periode)\n`;
  md += `| Nama Bahan Mentah | Total Kebutuhan Dari Target Masakan | Sisa Stok Saat Ini (Gudang+Chef) | Rekomendasi Beli (Restock ${restockDay}) | Buffer Sisa (Next Periode) |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: |\n`;

  ingredientsToRestock.forEach((b) => {
    const statusBeli = b.rekomendasi_restock_minggu > 0 ? `**+${b.rekomendasi_restock_minggu} ${b.satuan}**` : '✅ Stok Cukup';
    md += `| **${b.nama_bahan}** | ${b.total_bahan_dibutuhkan} ${b.satuan} | ${b.stok_saat_ini_total} ${b.satuan} | ${statusBeli} | ${b.stok_cadangan_buffer_next_periode} ${b.satuan} |\n`;
  });

  md += `\n### 🥣 4. Pembagian Alokasi Bahan Mentah ke ${selectedChefs.length} Chef (DIBAGI RATA + BUFFER)\n`;
  md += `| Nama Chef | Role | Alokasi Bahan Mentah per Chef (Bulat Clean) |\n`;
  md += `| :--- | :---: | :--- |\n`;

  chefAllocations.forEach((c) => {
    const bahanStr = c.allocated_ingredients.map(bi => `${bi.nama_bahan}: **${bi.qty_alokasi_memasak} ${bi.satuan}**`).join(', ');
    md += `| **${c.nama_chef}** | ${c.role} | ${bahanStr} |\n`;
  });

  md += `\n### 🚚 5. Transfer Makanan ke ${selectedWaiters.length} Waiter (Proporsional - FF, Jus Wortel, & Katsu SAMA RATA)\n`;
  md += `| Nama Staff Penjual | Role | Kontribusi Omset (2 Periode) | Alokasi Porsi Transfer Makanan (FF/JW/Katsu Equal) |\n`;
  md += `| :--- | :---: | :---: | :--- |\n`;

  waiterAllocations.forEach((w) => {
    const dishStr = w.allocated_dishes.map(di => `${di.nama_menu}: **${di.qty_alokasi_bulat} porsi**`).join(', ');
    md += `| **${w.nama_waiter}** | ${w.role} | **${w.sales_share_pct}** | ${dishStr} |\n`;
  });

  return {
    restockDay,
    periodDays,
    totalChefCount: selectedChefs.length,
    totalWaiterCount: selectedWaiters.length,
    stepMultiple,
    roundedDishTargets,
    chefDishProductions,
    ingredientsToRestock,
    chefAllocations,
    waiterAllocations,
    summaryMarkdown: md
  };
}

/**
 * Local Deterministic Analytics Engine (Fallback Cerdas yang Ramah Sesuai Intent User)
 */
export function generateLocalFallbackResponse(userPrompt: string, store: any): string {
  const promptLower = userPrompt.trim().toLowerCase();

  // Jika user hanya menyapa / greeting sederhana
  if (['halo', 'hi', 'hai', 'hello', 'ping', 'tes', 'test', 'siapa anda', 'bisa apa'].some(g => promptLower === g || promptLower.startsWith(g))) {
    return `### 🖐️ Halo! Saya adalah AI Restaurant Executive Analyst & Supply Chain Assistant

Saya siap membantu Anda menganalisis operasional restoran **RestoManager**:
- 📦 **Perhitungan Restock Hari Minggu (2 Periode Terbaru)**: Pengadaan bahan mentah 7-hari ke depan.
- 🍳 **Target Hasil Masakan Chef**: Porsi produksi yang wajib dimasak tiap Chef per menu satuan.
- 🥣 **Alokasi Bahan ke Chef**: Pembagian bahan mentah rata ke tim Chef + sisa buffer untuk next periode.
- 🍽️ **Transfer Makanan ke Waiter**: French Fries, Jus Wortel, dan Katsu SAMA RATA per waiter.
- 💰 **Audit Keuangan**: Perhitungan omset sales 2 minggu terbaru, pengeluaran belanja bahan, beban gaji, & net profit.

Ada yang bisa saya bantu analisa hari ini? Silakan ketik pertanyaan Anda atau jalankan **Control Panel Parameter** di atas!`;
  }

  // Jika intent pengguna berkaitan dengan stok / restock / supply chain / chef / waiter
  const chefMatch = userPrompt.match(/(\d+)\s*chef/i);
  const waiterMatch = userPrompt.match(/(\d+)\s*(waiter|penjual|orang)/i);

  const chefCount = chefMatch ? parseInt(chefMatch[1], 10) : 3;
  const waiterCount = waiterMatch ? parseInt(waiterMatch[1], 10) : 9;

  const sc = calculateCustomSupplyChainRestockAndDistribution(store, {
    chefCount: chefCount,
    waiterCount: waiterCount,
    restockDay: 'Minggu',
    periodDays: 7,
    stepMultiple: 50,
    minWaiterPortion: 50
  });

  return sc.summaryMarkdown;
}
