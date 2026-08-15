import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { getJakartaDate, getWeekRange } from '../../lib/utils';
import ConfirmModal from '../../components/ConfirmModal';

export default function DataChefTab() {
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

  // Sub-Tab Navigation
  const [subTab, setSubTab] = useState<'makanan' | 'produksi' | 'bahan'>('makanan');

  // Modal Transfer State
  const [modalTransferOpen, setModalTransferOpen] = useState(false);
  const [modalProduksiOpen, setModalProduksiOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Transfer Form State
  const [transferType, setTransferType] = useState('Makanan');
  const [transferDari, setTransferDari] = useState('');
  const [transferKeList, setTransferKeList] = useState<string[]>([]);
  const [transferItems, setTransferItemsState] = useState<{ id_item: string, qty: number }[]>([]);

  // Produksi Chef Form State
  const [produksiTanggal, setProduksiTanggal] = useState(getJakartaDate());
  const [produksiChefList, setProduksiChefList] = useState<string[]>([]);
  const [produksiItems, setProduksiItemsState] = useState<{ id_menu: string, qty: number | string }[]>([]);

  // Koreksi Stok Makanan Form State
  const [modalKoreksiOpen, setModalKoreksiOpen] = useState(false);
  const [koreksiTanggal, setKoreksiTanggal] = useState(getJakartaDate());
  const [koreksiPegawai, setKoreksiPegawai] = useState('');
  const [koreksiItems, setKoreksiItemsState] = useState<{ id_menu: string, stok_sistem: number, stok_riil: number | string }[]>([]);

  // Filter & Pagination State
  const [activeWeeks, setActiveWeeks] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('all');
  const [limit, setLimit] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [transferList, setTransferList] = useState<any[]>([]);
  const [produksiList, setProduksiList] = useState<any[]>([]);

  const [stokGlobal, setStokGlobal] = useState<Record<string, number>>({});
  const [stokPegawai, setStokPegawai] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    fetchWeeks();
    calculateStokGlobal();
  }, [store.transfer_item, store.produksi_chef, store.duty, store.menu]);

  useEffect(() => {
    if (subTab === 'makanan') {
      fetchDataMakanan();
    } else if (subTab === 'produksi') {
      fetchDataProduksi();
    }
  }, [subTab, selectedWeek, limit, currentPage, store.transfer_item, store.produksi_chef]);

  const findMenu = (itemIdentifier: string) => {
    if (!itemIdentifier) return null;
    const str = String(itemIdentifier).toLowerCase().trim()
      .replace(/air\s*mineral/g, 'water')
      .replace(/air\s*putih/g, 'water')
      .replace(/^air$/g, 'water')
      .replace(/carrot/g, 'wortel')
      .replace(/potato/g, 'kentang');

    return store.menu.find(m => 
      String(m.id_menu) === String(itemIdentifier) || 
      m.nama_menu.toLowerCase() === str ||
      m.nama_menu.toLowerCase().includes(str) ||
      str.includes(m.nama_menu.toLowerCase())
    );
  };

  async function calculateStokGlobal() {
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_stock_makanan_pegawai');
      if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
        let sg: Record<string, number> = {};
        let sp: Record<string, Record<string, number>> = {};
        rpcData.forEach((s: any) => {
          const qty = parseFloat(s.qty) || 0;
          const menuMatch = findMenu(s.id_menu || s.menu || s.nama_menu);
          const menuId = menuMatch ? menuMatch.id_menu : (s.id_menu || s.menu);

          if (s.nama_ic && s.nama_ic !== 'Sistem (Koreksi)') {
            if (!sp[s.nama_ic]) sp[s.nama_ic] = {};
            sp[s.nama_ic][menuId] = (sp[s.nama_ic][menuId] || 0) + qty;
          }
          sg[menuId] = (sg[menuId] || 0) + qty;
        });
        setStokGlobal(sg);
        setStokPegawai(sp);
        return;
      }
    } catch (e) {
      console.warn('RPC get_stock_makanan_pegawai unavailable, using fallback calculation', e);
    }

    // Fallback Calculation
    const { data: produksi } = await supabase.from('produksi_chef').select('*');
    const { data: transfers } = await supabase.from('transfer_item').select('*').eq('tipe_item', 'Makanan');
    const { data: duties } = await supabase.from('duty').select('*');

    let sg: Record<string, number> = {};
    let sp: Record<string, Record<string, number>> = {};

    (produksi || []).forEach((p: any) => {
      const qty = parseFloat(p.qty) || 0;
      const menuMatch = findMenu(p.id_menu || p.menu);
      const menuId = menuMatch ? menuMatch.id_menu : (p.id_menu || p.menu);
      if (menuId) {
        sg[menuId] = (sg[menuId] || 0) + qty;
        if (p.nama_ic_chef) {
          if (!sp[p.nama_ic_chef]) sp[p.nama_ic_chef] = {};
          sp[p.nama_ic_chef][menuId] = (sp[p.nama_ic_chef][menuId] || 0) + qty;
        }
      }
    });

    (transfers || []).forEach((t: any) => {
      const qty = parseFloat(t.qty) || 0;
      const menuMatch = findMenu(t.id_item || t.menu);
      const menuId = menuMatch ? menuMatch.id_menu : t.id_item;
      if (menuId) {
        if (!sg[menuId]) {
          sg[menuId] = qty;
        }
        if (t.dari_ic) {
          if (!sp[t.dari_ic]) sp[t.dari_ic] = {};
          sp[t.dari_ic][menuId] = (sp[t.dari_ic][menuId] || 0) - qty;
        }
        if (t.ke_ic) {
          if (!sp[t.ke_ic]) sp[t.ke_ic] = {};
          sp[t.ke_ic][menuId] = (sp[t.ke_ic][menuId] || 0) + qty;
        }
      }
    });

    (duties || []).forEach((d: any) => {
      const waiter = d.nama_ic;
      const items = d.detail_jual?.items || [];
      items.forEach((item: any) => {
        const qty = parseFloat(item.qty) || 0;
        const menuMatch = findMenu(item.id_menu || item.nama_menu);
        const menuId = menuMatch ? menuMatch.id_menu : item.id_menu;
        if (menuId) {
          sg[menuId] = (sg[menuId] || 0) - qty;
          if (waiter) {
            if (!sp[waiter]) sp[waiter] = {};
            sp[waiter][menuId] = (sp[waiter][menuId] || 0) - qty;
          }
        }
      });
    });

    setStokGlobal(sg);
    setStokPegawai(sp);
  }

  async function fetchWeeks() {
    const [ { data: tData }, { data: pData } ] = await Promise.all([
      supabase.from('transfer_item').select('tanggal').eq('tipe_item', 'Makanan').order('tanggal', { ascending: false }),
      supabase.from('produksi_chef').select('tanggal').order('tanggal', { ascending: false })
    ]);
    
    const weeksMap = new Map();
    (tData || []).forEach(p => {
      const wr = getWeekRange(p.tanggal);
      if (wr) weeksMap.set(wr.key, wr.label);
    });
    (pData || []).forEach(p => {
      const wr = getWeekRange(p.tanggal);
      if (wr) weeksMap.set(wr.key, wr.label);
    });
    const sorted = Array.from(weeksMap.entries()).sort((a,b) => b[0].localeCompare(a[0]));
    setActiveWeeks(sorted);
  }

  async function fetchDataMakanan() {
    let query = supabase.from('transfer_item')
      .select('*')
      .eq('tipe_item', 'Makanan')
      .order('tanggal', { ascending: false })
      .order('timestamp', { ascending: false });

    if (selectedWeek && selectedWeek !== 'all' && selectedWeek.includes(' to ')) {
      const parts = selectedWeek.split(' to ');
      query = query.gte('tanggal', parts[0]).lte('tanggal', parts[1]);
    }

    if (limit !== 1000) {
      query = query.range((currentPage - 1) * limit, currentPage * limit - 1);
    }
    
    const { data } = await query;
    if (data) {
      // Sort client-side to guarantee newest first by timestamp / tanggal
      const sorted = [...data].sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : (a.tanggal ? new Date(a.tanggal).getTime() : 0);
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : (b.tanggal ? new Date(b.tanggal).getTime() : 0);
        return timeB - timeA;
      });
      setTransferList(sorted);
    }
  }

  async function fetchDataProduksi() {
    let query = supabase.from('produksi_chef')
      .select('*')
      .order('tanggal', { ascending: false });

    if (selectedWeek && selectedWeek !== 'all' && selectedWeek.includes(' to ')) {
      const parts = selectedWeek.split(' to ');
      query = query.gte('tanggal', parts[0]).lte('tanggal', parts[1]);
    }

    if (limit !== 1000) {
      query = query.range((currentPage - 1) * limit, currentPage * limit - 1);
    }

    const { data } = await query;
    if (data) {
      const sorted = [...data].sort((a, b) => {
        const dateA = a.tanggal || '';
        const dateB = b.tanggal || '';
        if (dateA !== dateB) {
          return dateB.localeCompare(dateA);
        }
        const getTime = (item: any) => {
          if (item.timestamp) return new Date(item.timestamp).getTime();
          if (item.id_produksi && item.id_produksi.startsWith('P_')) {
            const ts = Number(item.id_produksi.split('_')[1]);
            if (!isNaN(ts)) return ts;
          }
          return 0;
        };
        const timeA = getTime(a);
        const timeB = getTime(b);
        if (timeA && timeB) {
          return timeB - timeA;
        }
        return (b.id_produksi || '').localeCompare(a.id_produksi || '');
      });
      setProduksiList(sorted);
    }
  }

  const handleAddRecipient = (name: string) => {
    if (name && !transferKeList.includes(name)) {
      setTransferKeList([...transferKeList, name]);
    }
  };

  const handleRemoveRecipient = (name: string) => {
    setTransferKeList(transferKeList.filter(n => n !== name));
  };

  const handleSelectAllWaiters = () => {
    const waiters = store.pegawai
      .filter(p => p.status_kontrak === 'Aktif' && p.jabatan?.toLowerCase().includes('waiter') && p.nama_ic !== transferDari)
      .map(p => p.nama_ic);
    const combined = Array.from(new Set([...transferKeList, ...waiters]));
    setTransferKeList(combined);
  };

  const handleSelectAllChefs = () => {
    const chefs = store.pegawai
      .filter(p => p.status_kontrak === 'Aktif' && p.jabatan?.toLowerCase().includes('chef') && p.nama_ic !== transferDari)
      .map(p => p.nama_ic);
    const combined = Array.from(new Set([...transferKeList, ...chefs]));
    setTransferKeList(combined);
  };

  const handleSelectAllActive = () => {
    const all = store.pegawai
      .filter(p => p.status_kontrak === 'Aktif' && p.nama_ic !== transferDari)
      .map(p => p.nama_ic);
    setTransferKeList(all);
  };

  const handleClearRecipients = () => {
    setTransferKeList([]);
  };

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferDari) {
      alert("Silakan pilih pegawai pengirim.");
      return;
    }
    if (transferKeList.length === 0) {
      alert("Silakan pilih minimal 1 pegawai penerima.");
      return;
    }
    if (transferItems.length === 0) {
      alert("Silakan tambahkan minimal 1 item.");
      return;
    }

    const invalidItem = transferItems.find(item => !item.id_item || !item.qty || Number(item.qty) <= 0);
    if (invalidItem) {
      alert("Pastikan semua item sudah dipilih dan jumlah Qty lebih dari 0.");
      return;
    }

    // Ensure sender is not among recipients
    if (transferKeList.includes(transferDari)) {
      alert("Pegawai pengirim tidak boleh menjadi penerima.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payloads: any[] = [];
      const tanggal = getJakartaDate();
      const timestamp = new Date().toISOString();

      // Duplicate item list for each selected recipient
      for (const ke of transferKeList) {
        for (const item of transferItems) {
          payloads.push({
            tanggal: tanggal,
            dari_ic: transferDari,
            ke_ic: ke,
            tipe_item: transferType,
            id_item: item.id_item,
            qty: Number(item.qty),
            timestamp: timestamp
          });
        }
      }

      const { error } = await supabase.from('transfer_item').insert(payloads);
      if (error) throw error;
      
      alert(`Berhasil mengirim transfer ${transferItems.length} item ke ${transferKeList.length} penerima (${payloads.length} total data transfer)!`);

      setModalTransferOpen(false);
      setTransferItemsState([]);
      setTransferKeList([]);
      fetchDataMakanan();
      calculateStokGlobal();
      
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddProduksiChef = (name: string) => {
    if (name && !produksiChefList.includes(name)) {
      setProduksiChefList([...produksiChefList, name]);
    }
  };

  const handleRemoveProduksiChef = (name: string) => {
    setProduksiChefList(produksiChefList.filter(n => n !== name));
  };

  const handleSelectAllProduksiChefs = () => {
    const chefs = store.pegawai
      .filter(p => p.status_kontrak === 'Aktif' && (p.jabatan?.toLowerCase().includes('chef') || p.jabatan?.toLowerCase().includes('cook') || p.jabatan?.toLowerCase().includes('dapur') || p.jabatan?.toLowerCase().includes('koki')))
      .map(p => p.nama_ic);
    const combined = Array.from(new Set([...produksiChefList, ...chefs]));
    setProduksiChefList(combined);
  };

  const handleSelectAllProduksiActive = () => {
    const all = store.pegawai
      .filter(p => p.status_kontrak === 'Aktif')
      .map(p => p.nama_ic);
    setProduksiChefList(all);
  };

  const handleClearProduksiChefs = () => {
    setProduksiChefList([]);
  };

  const handleAutoLoadAllProduksi = () => {
    const allSatuan = store.menu.filter(m => m.tipe_menu === 'Satuan').map(m => ({
      id_menu: m.id_menu,
      qty: ''
    }));
    setProduksiItemsState(allSatuan);
  };

  const handleAutoLoadCookableFromBahan = async () => {
    if (produksiChefList.length === 0) {
      alert("Silakan pilih minimal 1 Chef terlebih dahulu.");
      return;
    }

    setIsSubmitting(true);
    try {
      let chefBahanStok: Record<string, number> = {};
      
      try {
        const { data } = await supabase.rpc('get_stock_bahan_pegawai');
        if (Array.isArray(data) && data.length > 0) {
          data.forEach((s: any) => {
            if (produksiChefList.includes(s.nama_ic)) {
              const bId = s.id_bahan;
              const qty = parseFloat(s.qty) || 0;
              chefBahanStok[bId] = (chefBahanStok[bId] || 0) + qty;
            }
          });
        }
      } catch (err) {
        console.warn("RPC get_stock_bahan_pegawai error", err);
      }

      if (Object.keys(chefBahanStok).length === 0) {
        for (const chefName of produksiChefList) {
          const { data: transfers } = await supabase.from('transfer_item').select('*').eq('tipe_item', 'Bahan').eq('ke_ic', chefName);
          (transfers || []).forEach((t: any) => {
            const bId = t.id_item;
            const qty = parseFloat(t.qty) || 0;
            chefBahanStok[bId] = (chefBahanStok[bId] || 0) + qty;
          });

          const { data: pengeluaran } = await supabase.from('pengeluaran').select('*').eq('nama_pembeli', chefName);
          (pengeluaran || []).forEach((p: any) => {
            const bId = p.id_bahan;
            const qty = parseFloat(p.jumlah_unit || p.qty) || 0;
            chefBahanStok[bId] = (chefBahanStok[bId] || 0) + qty;
          });
        }
      }

      const getBahanQty = (bIdOrName: string) => {
        if (!bIdOrName) return 0;
        const str = String(bIdOrName).toLowerCase().trim()
          .replace(/carrot/g, 'wortel')
          .replace(/potato/g, 'kentang');

        const bObj = store.bahan.find(b => 
          b.id_bahan === bIdOrName || 
          b.nama_bahan.toLowerCase() === str ||
          b.nama_bahan.toLowerCase().includes(str) ||
          str.includes(b.nama_bahan.toLowerCase())
        );
        if (bObj && chefBahanStok[bObj.id_bahan] !== undefined) {
          return chefBahanStok[bObj.id_bahan];
        }
        return chefBahanStok[bIdOrName] || 0;
      };

      const autoItems: { id_menu: string, qty: number }[] = [];

      store.menu.filter(m => m.tipe_menu === 'Satuan').forEach(m => {
        let maxCookable = Infinity;
        const resep = m.resep || [];

        if (resep.length === 0) {
          const availableQty = getBahanQty(m.id_menu) || getBahanQty(m.nama_menu);
          maxCookable = Math.floor(availableQty);
        } else {
          resep.forEach((r: any) => {
            const bId = r.id_bahan || r.id;
            const reqQty = parseFloat(r.qty) || 1;
            const availableBahan = getBahanQty(bId);
            const possiblePortions = Math.floor(availableBahan / reqQty);
            if (possiblePortions < maxCookable) {
              maxCookable = possiblePortions;
            }
          });
        }

        if (maxCookable === Infinity || isNaN(maxCookable) || maxCookable < 0) {
          maxCookable = 0;
        }

        autoItems.push({
          id_menu: m.id_menu,
          qty: maxCookable
        });
      });

      setProduksiItemsState(autoItems);

      const totalAutoPorsi = autoItems.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0);
      alert(`Berhasil menghitung stok bahan milik ${produksiChefList.length} Chef terpilih (${produksiChefList.join(', ')})!\n` +
            `Total masakan yang otomatis terisi porsinya: ${totalAutoPorsi} porsi.`);
    } catch (err: any) {
      alert("Error menghitung porsi: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveProduksi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (produksiChefList.length === 0) {
      alert("Silakan pilih minimal 1 Chef yang memasak!");
      return;
    }

    const validItems = produksiItems.filter(i => i.id_menu && (parseFloat(String(i.qty)) || 0) > 0);

    if (validItems.length === 0) {
      alert("Masukkan jumlah porsi masakan (Qty > 0) pada minimal 1 menu.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payloads: any[] = [];
      const now = Date.now();
      let idx = 0;
      for (const chef of produksiChefList) {
        for (const item of validItems) {
          payloads.push({
            id_produksi: `P_${now + idx}_${Math.floor(Math.random() * 1000)}`,
            tanggal: produksiTanggal,
            id_menu: item.id_menu,
            qty: parseFloat(String(item.qty)) || 0,
            nama_ic_chef: chef
          });
          idx++;
        }
      }

      const { error } = await supabase.from('produksi_chef').insert(payloads);
      if (error) throw error;

      alert(`Berhasil menyimpan ${validItems.length} menu masakan untuk ${produksiChefList.length} chef (${payloads.length} total data produksi)!`);

      setModalProduksiOpen(false);
      setProduksiItemsState([]);
      setProduksiChefList([]);
      fetchDataProduksi();
      calculateStokGlobal();
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTransfer = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Log Transfer',
      message: 'Yakin ingin menghapus log transfer ini? Stok item akan dikembalikan ke posisi semula.',
      onConfirm: () => executeDeleteTransfer(id)
    });
  };

  const executeDeleteTransfer = async (id: string) => {
    try {
      setIsDeleting(true);
      // Optimistic update
      setTransferList(prev => prev.filter(d => d.id_transfer !== id));
      
      const { error } = await supabase.from('transfer_item').delete().eq('id_transfer', id);
      if (error) {
        console.error("Gagal menghapus transfer:", error);
        alert("Gagal menghapus log transfer: " + error.message);
      }
      
      await store.fetchData();
      await fetchDataMakanan();
      await calculateStokGlobal();
    } catch (err: any) {
      console.error("Error menghapus transfer:", err);
      alert("Error menghapus transfer: " + err.message);
    } finally {
      setIsDeleting(false);
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
    }
  };

  const handleDeleteProduksi = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Laporan Masakan',
      message: 'Yakin ingin menghapus laporan masakan ini? Stok bahan akan dikembalikan dan stok masakan akan berkurang.',
      onConfirm: () => executeDeleteProduksi(id)
    });
  };

  const executeDeleteProduksi = async (id: string) => {
    try {
      setIsDeleting(true);
      // Optimistic update
      setProduksiList(prev => prev.filter(d => d.id_produksi !== id));
      
      const { error } = await supabase.from('produksi_chef').delete().eq('id_produksi', id);
      if (error) {
        console.error("Gagal menghapus laporan masak:", error);
        alert("Gagal menghapus laporan masak: " + error.message);
      }
      
      await store.fetchData();
      await fetchDataProduksi();
      await calculateStokGlobal();
    } catch (err: any) {
      console.error("Error menghapus laporan masak:", err);
      alert("Error menghapus laporan masak: " + err.message);
    } finally {
      setIsDeleting(false);
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
    }
  };

  // --- Auto Load All Makanan for Koreksi Form ---
  const handleAutoLoadKoreksi = (targetPegawaiName: string) => {
    const chefStok = targetPegawaiName ? (stokPegawai[targetPegawaiName] || {}) : stokGlobal;
    const items = store.menu.filter(m => m.tipe_menu === 'Satuan').map(m => {
      const currentStok = chefStok[m.id_menu] || 0;
      return {
        id_menu: m.id_menu,
        stok_sistem: currentStok,
        stok_riil: currentStok
      };
    });
    setKoreksiItemsState(items);
  };

  // --- Save Koreksi Stok Handler ---
  const handleSaveKoreksi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!koreksiPegawai) {
      alert("Silakan pilih Target Pegawai / IC terlebih dahulu.");
      return;
    }

    const validItems = koreksiItems.filter(i => i.id_menu && i.stok_riil !== '' && !isNaN(Number(i.stok_riil)));

    if (validItems.length === 0) {
      alert("Silakan muat menu dan isi stok riil hasil koreksi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payloads: any[] = [];

      validItems.forEach(item => {
        const sSistem = Number(item.stok_sistem) || 0;
        const sRiil = Number(item.stok_riil) || 0;
        const selisih = sRiil - sSistem;

        if (selisih !== 0) {
          if (selisih > 0) {
            payloads.push({
              tanggal: koreksiTanggal,
              dari_ic: 'Sistem (Koreksi)',
              ke_ic: koreksiPegawai,
              tipe_item: 'Makanan',
              id_item: item.id_menu,
              qty: Math.abs(selisih),
              timestamp: new Date().toISOString()
            });
          } else {
            payloads.push({
              tanggal: koreksiTanggal,
              dari_ic: koreksiPegawai,
              ke_ic: 'Sistem (Koreksi)',
              tipe_item: 'Makanan',
              id_item: item.id_menu,
              qty: Math.abs(selisih),
              timestamp: new Date().toISOString()
            });
          }
        }
      });

      if (payloads.length === 0) {
        alert("Tidak ada perbedaan antara stok riil dan stok sistem (Semua stok sesuai).");
        setModalKoreksiOpen(false);
        return;
      }

      await supabase.from('transfer_item').insert(payloads);
      alert(`Berhasil menyimpan koreksi stok ${payloads.length} item makanan!`);

      setModalKoreksiOpen(false);
      setKoreksiItemsState([]);
      fetchDataMakanan();
      calculateStokGlobal();
    } catch (err: any) {
      alert("Error menyimpan koreksi: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      
      {/* Sub-Tab Navigation Bar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid var(--border-color)', paddingBottom: '10px' }}>
        <button 
          className={`btn ${subTab === 'makanan' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setSubTab('makanan'); setCurrentPage(1); }}
          style={{ fontWeight: 'bold' }}
        >
          <i className="fa-solid fa-truck-ramp-box" style={{ marginRight: '8px' }}></i> Log Distribusi Makanan
        </button>
        <button 
          className={`btn ${subTab === 'produksi' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setSubTab('produksi'); setCurrentPage(1); }}
          style={{ fontWeight: 'bold' }}
        >
          <i className="fa-solid fa-utensils" style={{ marginRight: '8px' }}></i> Laporan Chef (Produksi Makanan)
        </button>
        <button 
          className={`btn ${subTab === 'bahan' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setSubTab('bahan'); setCurrentPage(1); }}
          style={{ fontWeight: 'bold' }}
        >
          <i className="fa-solid fa-boxes-stacked" style={{ marginRight: '8px' }}></i> Stok Makanan yang Dibawa Pegawai
        </button>
      </div>

      {/* SUB-TAB 1: LOG DISTRIBUSI MAKANAN */}
      {subTab === 'makanan' && (
        <>
          <div className="header-action">
            <div>
              <h1 style={{ display: 'inline-block' }}>Log Distribusi Makanan (Chef &rarr; Waiters)</h1>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-warning btn-add-transfer" onClick={() => {
                setTransferType('Makanan');
                setTransferDari('');
                setTransferKeList([]);
                setTransferItemsState([]);
                setModalTransferOpen(true);
              }}>+ Transfer Item</button>

              <button className="btn btn-danger" style={{ fontWeight: 'bold' }} onClick={() => {
                setKoreksiTanggal(getJakartaDate());
                setKoreksiPegawai('');
                setKoreksiItemsState([]);
                setModalKoreksiOpen(true);
              }}>🔧 Koreksi Stok</button>
            </div>
          </div>

          {/* Stok Keseluruhan Makanan Tersedia */}
          <div className="dashboard-grid mb-20" style={{ marginBottom: '20px' }}>
            <div className="stat-card" style={{ gridColumn: 'span 12' }}>
              <h3>Stok Keseluruhan Makanan Tersedia</h3>
              <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '10px' }}>Total Makanan yang diproduksi Chef dikurangi seluruh penjualan Restoran.</p>
              <div className="table-responsive">
                <table className="table-mini" id="table-stok-global">
                  <thead><tr><th>Menu (Satuan)</th><th>Stok Tersedia</th></tr></thead>
                  <tbody>
                    {Object.keys(stokGlobal).length === 0 ? (
                      <tr><td colSpan={2} style={{ textAlign: 'center' }}>Belum ada data stok makanan</td></tr>
                    ) : (
                      Object.entries(stokGlobal).map(([id_menu, qty]) => {
                        const menu = findMenu(id_menu);
                        const namaMenu = menu ? menu.nama_menu : id_menu;
                        return (
                          <tr key={id_menu}>
                            <td>{namaMenu}</td>
                            <td><strong>{qty} Porsi</strong></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Stok Makanan Per Pegawai (Grid Card Format Persis HTML Asli) */}
          <div className="dashboard-grid mb-20" style={{ marginBottom: '20px' }}>
            <div className="stat-card" style={{ gridColumn: 'span 12' }}>
              <h3>Stok Makanan</h3>
              <div id="container-stok-pegawai" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
                {Object.keys(stokPegawai).length === 0 ? (
                  <div style={{ color: '#777', width: '100%', textAlign: 'center' }}>Tidak ada stok pada pegawai untuk minggu ini.</div>
                ) : (
                  Object.entries(stokPegawai).map(([namaPegawai, stokMenu]) => {
                    if (namaPegawai === "Sistem (Koreksi)") return null;
                    const menuEntries = Object.entries(stokMenu).filter(([_, qty]) => qty !== 0);
                    if (menuEntries.length === 0) return null;

                    return (
                      <div key={namaPegawai} className="stat-card" style={{ margin: 0, padding: '15px', borderLeft: '4px solid var(--accent-color)' }}>
                        <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '1rem', color: 'var(--accent-color)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '5px' }}>
                          {namaPegawai}
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {menuEntries.map(([id_menu, qty]) => {
                            const menu = findMenu(id_menu);
                            const namaMenu = menu ? menu.nama_menu : id_menu;
                            const isMinus = qty < 0;
                            const badgeBg = isMinus ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)";
                            const badgeText = isMinus ? "var(--danger-color)" : "var(--success-color)";
                            return (
                              <div key={id_menu} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: '6px', fontSize: '0.95rem' }}>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{namaMenu}</span>
                                <span style={{ background: badgeBg, color: badgeText, padding: '4px 10px', borderRadius: '9999px', fontWeight: 700, fontSize: '0.85rem' }}>
                                  {qty} Porsi
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Tabel Riwayat Distribusi */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3>Riwayat Distribusi (Transfer) Makanan</h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <select id="filter-minggu-transfer" className="form-control" style={{ width: 'auto', padding: '5px' }} value={selectedWeek} onChange={e => { setSelectedWeek(e.target.value); setCurrentPage(1); }}>
                  <option value="all">Semua Minggu (Semua Data)</option>
                  {activeWeeks.map(w => (
                    <option key={w[0]} value={w[0]}>{w[1]}</option>
                  ))}
                </select>
                <label style={{ fontSize: '0.9rem', margin: 0 }}>Tampilkan:</label>
                <select id="limit-transfer" className="form-control" style={{ width: 'auto', padding: '5px' }} value={limit} onChange={e => { setLimit(Number(e.target.value)); setCurrentPage(1); }}>
                  <option value="5">5 baris</option>
                  <option value="10">10 baris</option>
                  <option value="1000">Semuanya</option>
                </select>
              </div>
            </div>

            <div className="table-responsive">
              <table id="table-transfer">
                <thead>
                  <tr>
                    <th>Tanggal & Waktu</th>
                    <th>Dari Pegawai</th>
                    <th>Ke Pegawai</th>
                    <th>Tipe Item</th>
                    <th>Nama Item</th>
                    <th>Jumlah (Qty)</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {transferList.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center' }}>Belum ada catatan transfer item minggu ini</td></tr>
                  ) : transferList.map(d => {
                    const menu = findMenu(d.id_item);
                    const namaItem = menu ? `${menu.nama_menu} (Porsi)` : d.id_item;
                    const wr = getWeekRange(d.tanggal);
                    const isClosed = wr ? store.periode_ditutup.includes(wr.key) : false;
                    
                    return (
                      <tr key={d.id_transfer}>
                        <td>
                          <div style={{ fontWeight: '500' }}>{d.tanggal}</div>
                          {d.timestamp ? (
                            <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>
                              <i className="fa-regular fa-clock" style={{ marginRight: '4px' }}></i>{new Date(d.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </small>
                          ) : null}
                        </td>
                        <td>{d.dari_ic}</td>
                        <td>{d.ke_ic}</td>
                        <td>{d.tipe_item}</td>
                        <td>{namaItem}</td>
                        <td className="text-primary font-weight-bold">{d.qty}</td>
                        <td>
                          <button className={`btn btn-sm ${isClosed ? 'btn-secondary' : 'btn-danger'}`} disabled={isClosed} onClick={() => handleDeleteTransfer(d.id_transfer)}>Hapus</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div id="pagination-transfer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px' }}>
              <span id="info-page-transfer" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Halaman {currentPage}</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button id="btn-prev-transfer" className="btn btn-secondary btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(c => c - 1)}>Sebelumnya</button>
                <button id="btn-next-transfer" className="btn btn-secondary btn-sm" disabled={transferList.length < limit && limit !== 1000} onClick={() => setCurrentPage(c => c + 1)}>Selanjutnya</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* SUB-TAB 2: LAPORAN CHEF (PRODUKSI MAKANAN) */}
      {subTab === 'produksi' && (
        <>
          <div className="header-action">
            <div>
              <h1 style={{ display: 'inline-block' }}>Laporan Chef (Produksi Makanan)</h1>
            </div>
            <button className="btn btn-primary" id="btn-add-produksi-chef" onClick={() => {
              setProduksiTanggal(getJakartaDate());
              setProduksiChefList([]);
              setProduksiItemsState([]);
              setModalProduksiOpen(true);
            }}>+ Input Laporan Masakan</button>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3>Riwayat Laporan Chef</h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <select id="filter-minggu-produksi-chef" className="form-control" style={{ width: 'auto', padding: '5px' }} value={selectedWeek} onChange={e => { setSelectedWeek(e.target.value); setCurrentPage(1); }}>
                  <option value="all">Semua Minggu (Semua Data)</option>
                  {activeWeeks.map(w => (
                    <option key={w[0]} value={w[0]}>{w[1]}</option>
                  ))}
                </select>
                <label style={{ fontSize: '0.9rem', margin: 0 }}>Tampilkan:</label>
                <select id="limit-produksi" className="form-control" style={{ width: 'auto', padding: '5px' }} value={limit} onChange={e => { setLimit(Number(e.target.value)); setCurrentPage(1); }}>
                  <option value="5">5 baris</option>
                  <option value="10">10 baris</option>
                  <option value="1000">Semuanya</option>
                </select>
              </div>
            </div>

            <div className="table-responsive">
              <table id="table-produksi-chef">
                <thead>
                  <tr>
                    <th>Tanggal & Waktu</th>
                    <th>Menu (Satuan)</th>
                    <th>Jumlah (Porsi)</th>
                    <th>Chef</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {produksiList.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center' }}>Belum ada catatan laporan masak pada minggu ini</td></tr>
                  ) : produksiList.map(item => {
                    const menu = findMenu(item.id_menu || item.menu);
                    const namaMenu = menu ? menu.nama_menu : (item.menu || item.id_menu);
                    const wr = getWeekRange(item.tanggal);
                    const isClosed = wr ? store.periode_ditutup.includes(wr.key) : false;

                    let timeStr = '';
                    if (item.timestamp) {
                      timeStr = new Date(item.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    } else if (item.id_produksi && typeof item.id_produksi === 'string' && item.id_produksi.startsWith('P_')) {
                      const parts = item.id_produksi.split('_');
                      const ts = Number(parts[1]);
                      if (!isNaN(ts) && ts > 1000000000000) {
                        timeStr = new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                      }
                    }

                    return (
                      <tr key={item.id_produksi}>
                        <td>
                          <div style={{ fontWeight: '500' }}>{item.tanggal}</div>
                          {timeStr ? (
                            <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>
                              <i className="fa-regular fa-clock" style={{ marginRight: '4px' }}></i>{timeStr}
                            </small>
                          ) : null}
                        </td>
                        <td>{namaMenu}</td>
                        <td className="text-success font-weight-bold">+{item.qty} Porsi</td>
                        <td>{item.nama_ic_chef}</td>
                        <td>
                          <button className={`btn btn-sm ${isClosed ? 'btn-secondary' : 'btn-danger'}`} disabled={isClosed} onClick={() => handleDeleteProduksi(item.id_produksi)}>Hapus</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div id="pagination-produksi" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px' }}>
              <span id="info-page-produksi" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Halaman {currentPage}</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button id="btn-prev-produksi" className="btn btn-secondary btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(c => c - 1)}>Sebelumnya</button>
                <button id="btn-next-produksi" className="btn btn-secondary btn-sm" disabled={produksiList.length < limit && limit !== 1000} onClick={() => setCurrentPage(c => c + 1)}>Selanjutnya</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* SUB-TAB 3: STOK MAKANAN YANG DIBAWA PEGAWAI */}
      {subTab === 'bahan' && (
        <>
          <div className="header-action">
            <div>
              <h1 style={{ display: 'inline-block' }}>Stok Makanan yang Dibawa Pegawai</h1>
            </div>
          </div>

          <div className="dashboard-grid mb-20" style={{ marginBottom: '20px' }}>
            <div className="stat-card" style={{ gridColumn: 'span 12' }}>
              <h3>Stok Makanan Porsi Per Pegawai (Chef & Waiters)</h3>
              <div id="container-stok-pegawai" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px', marginTop: '15px' }}>
                {Object.keys(stokPegawai).length === 0 ? (
                  <div style={{ color: '#777', width: '100%', textAlign: 'center' }}>Tidak ada stok makanan pada pegawai saat ini.</div>
                ) : (
                  (() => {
                    const getJabatanRank = (jabatan: string): number => {
                      const j = (jabatan || '').toLowerCase().trim();
                      if (j.includes('manager') || j.includes('pemilik') || j.includes('owner')) return 1;
                      if (j.includes('head chef') || j.includes('head-chef') || j.includes('headchef')) return 2;
                      if (j.includes('chef') || j.includes('koki') || j.includes('dapur')) return 3;
                      if (j.includes('waiter') || j.includes('pelayan') || j.includes('pramusaji')) return 4;
                      if (j.includes('kasir') || j.includes('cashier')) return 5;
                      return 6;
                    };

                    const sortedEntries = Object.entries(stokPegawai).sort(([nA], [nB]) => {
                      const pA = store.pegawai.find(p => p.nama_ic === nA);
                      const pB = store.pegawai.find(p => p.nama_ic === nB);
                      const rA = getJabatanRank(pA ? pA.jabatan : '');
                      const rB = getJabatanRank(pB ? pB.jabatan : '');
                      if (rA !== rB) return rA - rB;
                      return nA.localeCompare(nB, 'id', { sensitivity: 'base' });
                    });

                    return sortedEntries.map(([namaPegawai, stokMenu]) => {
                      if (namaPegawai === "Sistem (Koreksi)") return null;
                      const menuEntries = Object.entries(stokMenu).filter(([_, qty]) => qty !== 0);
                      if (menuEntries.length === 0) return null;

                      const pegawaiInfo = store.pegawai.find(p => p.nama_ic === namaPegawai);
                      const jabatan = pegawaiInfo ? pegawaiInfo.jabatan : "Pegawai";
                      const inisial = namaPegawai.charAt(0).toUpperCase();

                      return (
                        <div key={namaPegawai} style={{ background: 'var(--bg-card)', padding: '15px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                            <div style={{ background: 'var(--accent-color)', color: 'white', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '16px', flexShrink: 0 }}>
                              {inisial}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <h4 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={namaPegawai}>{namaPegawai}</h4>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{jabatan}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {menuEntries.map(([id_menu, qty]) => {
                              const menu = findMenu(id_menu);
                              const namaMenu = menu ? menu.nama_menu : id_menu;
                              const isMinus = qty < 0;
                              const badgeBg = isMinus ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)";
                              const badgeText = isMinus ? "var(--danger-color)" : "var(--success-color)";
                              return (
                                <div key={id_menu} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--bg-hover)', borderRadius: '6px', fontSize: '0.9rem', marginBottom: '5px' }}>
                                  <span style={{ color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px' }} title={namaMenu}>{namaMenu}</span>
                                  <span style={{ background: badgeBg, color: badgeText, padding: '2px 8px', borderRadius: '4px', fontWeight: 600, fontSize: '0.85rem', flexShrink: 0 }}>
                                    {qty} Porsi
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* MODAL TRANSFER ITEM */}
      {modalTransferOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content" style={{ maxWidth: '680px', width: '95%' }}>
            <span className="close-btn" onClick={() => setModalTransferOpen(false)}>&times;</span>
            <h2 style={{ marginTop: 0, marginBottom: '15px' }}>Transfer Item / Bahan / Makanan</h2>
            <form onSubmit={handleSaveTransfer}>
              
              {/* Row 1: Pengirim & Tipe Item */}
              <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label style={{ fontWeight: 'bold' }}>Pengirim (Dari Pegawai)</label>
                  <select 
                    required 
                    className="form-control" 
                    value={transferDari} 
                    onChange={e => {
                      const newDari = e.target.value;
                      setTransferDari(newDari);
                      if (transferKeList.includes(newDari)) {
                        setTransferKeList(transferKeList.filter(k => k !== newDari));
                      }
                    }}
                  >
                    <option value="">-- Pilih Pengirim --</option>
                    {store.pegawai.filter(p => p.status_kontrak === 'Aktif').map(p => (
                      <option key={p.nama_ic} value={p.nama_ic}>{p.nama_ic} ({p.jabatan})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label style={{ fontWeight: 'bold' }}>Tipe Item yang Ditransfer</label>
                  <select 
                    required 
                    className="form-control" 
                    value={transferType} 
                    onChange={e => {
                      setTransferType(e.target.value);
                      setTransferItemsState([]);
                    }}
                  >
                    <option value="Makanan">Makanan Jadi (Chef &rarr; Waiters)</option>
                    <option value="Bahan">Bahan Mentah (Gudang / Chef)</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Penerima (Multi-Penerima) */}
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontWeight: 'bold', margin: 0 }}>
                    Penerima (Ke Pegawai) <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>(Bisa pilih 2 atau lebih)</span>
                  </label>
                  <span style={{ 
                    fontSize: '0.8rem', 
                    padding: '2px 8px', 
                    borderRadius: '10px', 
                    background: transferKeList.length > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    color: transferKeList.length > 0 ? 'var(--success-color)' : 'var(--text-secondary)',
                    fontWeight: 'bold'
                  }}>
                    {transferKeList.length} Penerima Terpilih
                  </span>
                </div>

                {/* Quick select buttons */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <button 
                    type="button" 
                    className="btn btn-sm" 
                    style={{ padding: '3px 10px', fontSize: '0.75rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    onClick={handleSelectAllWaiters}
                  >
                    + Semua Waiter
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-sm" 
                    style={{ padding: '3px 10px', fontSize: '0.75rem', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    onClick={handleSelectAllChefs}
                  >
                    + Semua Chef
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-sm" 
                    style={{ padding: '3px 10px', fontSize: '0.75rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    onClick={handleSelectAllActive}
                  >
                    + Pilih Semua
                  </button>
                  {transferKeList.length > 0 && (
                    <button 
                      type="button" 
                      className="btn btn-sm" 
                      style={{ padding: '3px 10px', fontSize: '0.75rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      onClick={handleClearRecipients}
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Dropdown to add single recipient */}
                <select 
                  className="form-control" 
                  style={{ width: '100%', marginBottom: '8px' }} 
                  value="" 
                  onChange={e => {
                    handleAddRecipient(e.target.value);
                  }}
                >
                  <option value="">+ Tambah Penerima (Klik untuk memilih)...</option>
                  {store.pegawai
                    .filter(p => p.status_kontrak === 'Aktif' && p.nama_ic !== transferDari && !transferKeList.includes(p.nama_ic))
                    .map(p => (
                      <option key={p.nama_ic} value={p.nama_ic}>{p.nama_ic} ({p.jabatan})</option>
                    ))
                  }
                </select>

                {/* Selected Recipients Badges Container */}
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '6px', 
                  minHeight: '40px', 
                  padding: '8px', 
                  background: 'var(--bg-dark)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '6px' 
                }}>
                  {transferKeList.length === 0 ? (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', alignSelf: 'center', fontStyle: 'italic' }}>
                      Belum ada penerima dipilih. Gunakan tombol cepat di atas atau pilih dari dropdown.
                    </span>
                  ) : (
                    transferKeList.map(name => {
                      const emp = store.pegawai.find(p => p.nama_ic === name);
                      return (
                        <span 
                          key={name} 
                          style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            background: '#2d3748', 
                            color: '#edf2f7', 
                            border: '1px solid #4a5568', 
                            borderRadius: '16px', 
                            padding: '3px 10px', 
                            fontSize: '0.82rem' 
                          }}
                        >
                          <span>👤 {name} {emp ? <small style={{ opacity: 0.75 }}>({emp.jabatan})</small> : ''}</span>
                          <button 
                            type="button" 
                            onClick={() => handleRemoveRecipient(name)} 
                            style={{ 
                              background: 'transparent', 
                              border: 'none', 
                              color: '#fc8181', 
                              cursor: 'pointer', 
                              fontWeight: 'bold', 
                              fontSize: '1rem', 
                              lineHeight: 1, 
                              padding: 0,
                              marginLeft: '2px'
                            }}
                            title="Hapus penerima ini"
                          >
                            &times;
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Daftar Item */}
              <h3 style={{ margin: '15px 0 10px', fontSize: '1.1rem' }}>Daftar Item yang Ditransfer</h3>
              <div id="transfer-items-container">
                {transferItems.map((ti, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <select className="form-control" required value={ti.id_item} onChange={e => {
                      const newItems = [...transferItems];
                      newItems[idx].id_item = e.target.value;
                      setTransferItemsState(newItems);
                    }}>
                      <option value="">-- Pilih Item --</option>
                      {transferType === 'Bahan' ? 
                        store.bahan.map(b => <option key={b.id_bahan} value={b.id_bahan}>{b.nama_bahan}</option>) :
                        store.menu.filter(m => m.tipe_menu === 'Satuan').map(m => <option key={m.id_menu} value={m.id_menu}>{m.nama_menu}</option>)
                      }
                    </select>
                    <input type="number" className="form-control" placeholder="Qty" min="0.01" step="0.01" required style={{ width: '110px' }} value={ti.qty || ''} onChange={e => {
                      const newItems = [...transferItems];
                      newItems[idx].qty = Number(e.target.value);
                      setTransferItemsState(newItems);
                    }} />
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => {
                      const newItems = [...transferItems];
                      newItems.splice(idx, 1);
                      setTransferItemsState(newItems);
                    }}>X</button>
                  </div>
                ))}
              </div>
              
              <button type="button" className="btn btn-sm btn-primary" style={{ marginBottom: '15px' }} onClick={() => {
                setTransferItemsState([...transferItems, { id_item: '', qty: 0 }]);
              }}>+ Tambah Item Transfer</button>

              {/* Duplicate Summary Card */}
              {transferKeList.length > 0 && transferItems.length > 0 && (
                <div style={{ 
                  padding: '12px 15px', 
                  background: 'rgba(99, 102, 241, 0.1)', 
                  border: '1px solid rgba(99, 102, 241, 0.3)', 
                  borderRadius: '8px', 
                  marginBottom: '15px', 
                  fontSize: '0.85rem',
                  lineHeight: '1.5'
                }}>
                  <div style={{ fontWeight: 'bold', color: '#818cf8', marginBottom: '4px' }}>
                    📋 Ringkasan Duplikasi Transfer:
                  </div>
                  <div>
                    Setiap penerima (<strong>{transferKeList.length} orang</strong>) akan menerima <strong>{transferItems.filter(i => i.id_item).length} item</strong> yang terdaftar di atas secara identik.
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '3px' }}>
                    Total transaksi transfer yang akan dibuat: <strong>{transferItems.filter(i => i.id_item).length * transferKeList.length} baris</strong> data.
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                className="btn btn-warning w-100" 
                disabled={isSubmitting || transferKeList.length === 0 || transferItems.length === 0 || !transferDari}
                style={{ fontWeight: 'bold', padding: '12px' }}
              >
                {isSubmitting ? 'Mengirim Transfer...' : `Kirim Transfer (${transferKeList.length} Penerima)`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL INPUT PRODUKSI CHEF */}
      {modalProduksiOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content" style={{ maxWidth: '680px', width: '95%' }}>
            <span className="close-btn" onClick={() => setModalProduksiOpen(false)}>&times;</span>
            <h2 style={{ marginTop: 0, marginBottom: '15px' }}>Input Laporan Masakan Chef</h2>
            <form onSubmit={handleSaveProduksi}>
              
              {/* Row 1: Tanggal Masak */}
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label style={{ fontWeight: 'bold' }}>Tanggal Masak</label>
                <input type="date" className="form-control" required value={produksiTanggal} onChange={e => setProduksiTanggal(e.target.value)} />
              </div>

              {/* Row 2: Dimasak Oleh (Multi-Chef) */}
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontWeight: 'bold', margin: 0 }}>
                    Dimasak Oleh (Chef) <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>(Bisa pilih 2 atau lebih chef)</span>
                  </label>
                  <span style={{ 
                    fontSize: '0.8rem', 
                    padding: '2px 8px', 
                    borderRadius: '10px', 
                    background: produksiChefList.length > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    color: produksiChefList.length > 0 ? 'var(--success-color)' : 'var(--text-secondary)',
                    fontWeight: 'bold'
                  }}>
                    {produksiChefList.length} Chef Terpilih
                  </span>
                </div>

                {/* Quick select buttons */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <button 
                    type="button" 
                    className="btn btn-sm" 
                    style={{ padding: '3px 10px', fontSize: '0.75rem', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    onClick={handleSelectAllProduksiChefs}
                  >
                    + Semua Chef
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-sm" 
                    style={{ padding: '3px 10px', fontSize: '0.75rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    onClick={handleSelectAllProduksiActive}
                  >
                    + Pilih Semua
                  </button>
                  {produksiChefList.length > 0 && (
                    <button 
                      type="button" 
                      className="btn btn-sm" 
                      style={{ padding: '3px 10px', fontSize: '0.75rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      onClick={handleClearProduksiChefs}
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Dropdown to add single chef */}
                <select 
                  className="form-control" 
                  style={{ width: '100%', marginBottom: '8px' }} 
                  value="" 
                  onChange={e => {
                    handleAddProduksiChef(e.target.value);
                  }}
                >
                  <option value="">+ Tambah Chef (Klik untuk memilih)...</option>
                  {store.pegawai
                    .filter(p => p.status_kontrak === 'Aktif' && !produksiChefList.includes(p.nama_ic))
                    .map(p => (
                      <option key={p.nama_ic} value={p.nama_ic}>{p.nama_ic} ({p.jabatan})</option>
                    ))
                  }
                </select>

                {/* Selected Chefs Badges Container */}
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '6px', 
                  minHeight: '40px', 
                  padding: '8px', 
                  background: 'var(--bg-dark)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '6px' 
                }}>
                  {produksiChefList.length === 0 ? (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', alignSelf: 'center', fontStyle: 'italic' }}>
                      Belum ada Chef dipilih. Gunakan tombol "+ Semua Chef" atau pilih dari dropdown.
                    </span>
                  ) : (
                    produksiChefList.map(name => {
                      const emp = store.pegawai.find(p => p.nama_ic === name);
                      return (
                        <span 
                          key={name} 
                          style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            background: '#2d3748', 
                            color: '#edf2f7', 
                            border: '1px solid #4a5568', 
                            borderRadius: '16px', 
                            padding: '3px 10px', 
                            fontSize: '0.82rem' 
                          }}
                        >
                          <span>👨‍🍳 {name} {emp ? <small style={{ opacity: 0.75 }}>({emp.jabatan})</small> : ''}</span>
                          <button 
                            type="button" 
                            onClick={() => handleRemoveProduksiChef(name)} 
                            style={{ 
                              background: 'transparent', 
                              border: 'none', 
                              color: '#fc8181', 
                              cursor: 'pointer', 
                              fontWeight: 'bold', 
                              fontSize: '1rem', 
                              lineHeight: 1, 
                              padding: 0,
                              marginLeft: '2px'
                            }}
                            title="Hapus chef ini"
                          >
                            &times;
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Action bar with SMART auto load buttons */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '15px', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-sm btn-success" style={{ fontWeight: 'bold' }} onClick={handleAutoLoadCookableFromBahan}>
                  🔥 Masak Maksimal dari Stok Bahan Chef
                </button>
                <button type="button" className="btn btn-sm btn-info" onClick={handleAutoLoadAllProduksi}>
                  ⚡ Muat Semua Makanan
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                  Total menu: {produksiItems.length}
                </span>
              </div>

              <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '15px' }}>
                {produksiItems.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                    Belum ada item ditambahkan. Klik <strong>"+ Tambah Masakan"</strong> atau <strong>"⚡ Muat Semua Makanan"</strong> di atas.
                  </div>
                ) : (
                  produksiItems.map((pi, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                      <select className="form-control" style={{ flex: 2 }} required value={pi.id_menu} onChange={e => {
                        const newItems = [...produksiItems];
                        newItems[idx].id_menu = e.target.value;
                        setProduksiItemsState(newItems);
                      }}>
                        <option value="">-- Pilih Makanan Jadi --</option>
                        {store.menu.filter(m => m.tipe_menu === 'Satuan').map(m => (
                          <option key={m.id_menu} value={m.id_menu}>{m.nama_menu}</option>
                        ))}
                      </select>
                      <input 
                        type="number" 
                        className="form-control" 
                        placeholder="Porsi" 
                        min="0" 
                        step="0.01" 
                        style={{ flex: 1 }} 
                        value={pi.qty || ''} 
                        onChange={e => {
                          const newItems = [...produksiItems];
                          newItems[idx].qty = e.target.value;
                          setProduksiItemsState(newItems);
                        }} 
                      />
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => {
                        const newItems = [...produksiItems];
                        newItems.splice(idx, 1);
                        setProduksiItemsState(newItems);
                      }}>X</button>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => {
                  setProduksiItemsState([...produksiItems, { id_menu: '', qty: 0 }]);
                }}>
                  + Tambah Masakan
                </button>
              </div>

              {/* Duplicate Summary Card */}
              {produksiChefList.length > 0 && produksiItems.filter(i => i.id_menu && (parseFloat(String(i.qty)) || 0) > 0).length > 0 && (
                <div style={{ 
                  padding: '12px 15px', 
                  background: 'rgba(99, 102, 241, 0.1)', 
                  border: '1px solid rgba(99, 102, 241, 0.3)', 
                  borderRadius: '8px', 
                  marginBottom: '15px', 
                  fontSize: '0.85rem',
                  lineHeight: '1.5'
                }}>
                  <div style={{ fontWeight: 'bold', color: '#818cf8', marginBottom: '4px' }}>
                    📋 Ringkasan Produksi Multi-Chef:
                  </div>
                  <div>
                    Laporan masakan sebanyak <strong>{produksiItems.filter(i => i.id_menu && (parseFloat(String(i.qty)) || 0) > 0).length} menu</strong> akan dicatat untuk setiap chef (<strong>{produksiChefList.length} orang</strong>: {produksiChefList.join(', ')}).
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '3px' }}>
                    Total data produksi yang akan disimpan: <strong>{produksiItems.filter(i => i.id_menu && (parseFloat(String(i.qty)) || 0) > 0).length * produksiChefList.length} baris</strong> data.
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                className="btn btn-primary w-100" 
                style={{ padding: '12px', fontWeight: 'bold' }} 
                disabled={isSubmitting || produksiChefList.length === 0 || produksiItems.filter(i => i.id_menu && (parseFloat(String(i.qty)) || 0) > 0).length === 0}
              >
                {isSubmitting ? 'Menyimpan...' : `Simpan Laporan Masak (${produksiChefList.length} Chef)`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KOREKSI STOK MAKANAN */}
      {modalKoreksiOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content" style={{ maxWidth: '700px', width: '90%' }}>
            <span className="close-btn" onClick={() => setModalKoreksiOpen(false)}>&times;</span>
            <h2 style={{ marginTop: 0 }}>Koreksi Stok Makanan (Opname)</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
              Sesuaikan stok riil makanan milik pegawai atau stok global restoran.
            </p>

            <form onSubmit={handleSaveKoreksi}>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontWeight: 'bold' }}>Tanggal Koreksi</label>
                  <input type="date" className="form-control" required value={koreksiTanggal} onChange={e => setKoreksiTanggal(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontWeight: 'bold' }}>Target Pegawai (IC)</label>
                  <select className="form-control" required value={koreksiPegawai} onChange={e => {
                    const target = e.target.value;
                    setKoreksiPegawai(target);
                    handleAutoLoadKoreksi(target);
                  }}>
                    <option value="">-- Pilih Pegawai Target --</option>
                    {store.pegawai.filter(p => p.status_kontrak === 'Aktif').map(p => (
                      <option key={p.nama_ic} value={p.nama_ic}>{p.nama_ic} ({p.jabatan})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px' }}>
                <button type="button" className="btn btn-sm btn-info" onClick={() => handleAutoLoadKoreksi(koreksiPegawai)}>
                  ⚡ Muat Semua Makanan (Menu Satuan)
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Total item: {koreksiItems.length}
                </span>
              </div>

              <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '15px' }}>
                {koreksiItems.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                    Pilih Target Pegawai di atas atau klik <strong>"⚡ Muat Semua Makanan"</strong>.
                  </div>
                ) : (
                  koreksiItems.map((item, idx) => {
                    const sSistem = Number(item.stok_sistem) || 0;
                    const sRiil = item.stok_riil !== '' ? (Number(item.stok_riil) || 0) : sSistem;
                    const selisih = sRiil - sSistem;

                    return (
                      <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center', background: 'var(--bg-card)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <select className="form-control" style={{ flex: 2 }} required value={item.id_menu} onChange={e => {
                          const val = e.target.value;
                          const chefStok = koreksiPegawai ? (stokPegawai[koreksiPegawai] || {}) : stokGlobal;
                          const cStok = chefStok[val] || 0;
                          const newItems = [...koreksiItems];
                          newItems[idx].id_menu = val;
                          newItems[idx].stok_sistem = cStok;
                          newItems[idx].stok_riil = cStok;
                          setKoreksiItemsState(newItems);
                        }}>
                          <option value="">-- Pilih Menu --</option>
                          {store.menu.filter(m => m.tipe_menu === 'Satuan').map(m => (
                            <option key={m.id_menu} value={m.id_menu}>{m.nama_menu}</option>
                          ))}
                        </select>

                        <div style={{ flex: 1, textAlign: 'center', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Sistem:</span> <br/>
                          <strong>{sSistem} Porsi</strong>
                        </div>

                        <div style={{ flex: 1 }}>
                          <input 
                            type="number" 
                            className="form-control" 
                            placeholder="Stok Riil" 
                            required 
                            value={item.stok_riil} 
                            onChange={e => {
                              const newItems = [...koreksiItems];
                              newItems[idx].stok_riil = e.target.value;
                              setKoreksiItemsState(newItems);
                            }} 
                          />
                        </div>

                        <div style={{ width: '90px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 'bold' }}>
                          {selisih > 0 ? (
                            <span style={{ color: '#10b981' }}>+{selisih} Porsi</span>
                          ) : selisih < 0 ? (
                            <span style={{ color: '#ef4444' }}>{selisih} Porsi</span>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>0 (Pas)</span>
                          )}
                        </div>

                        <button type="button" className="btn btn-danger btn-sm" onClick={() => {
                          const newItems = [...koreksiItems];
                          newItems.splice(idx, 1);
                          setKoreksiItemsState(newItems);
                        }}>X</button>
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => {
                  setKoreksiItemsState([...koreksiItems, { id_menu: '', stok_sistem: 0, stok_riil: 0 }]);
                }}>
                  + Tambah Item Koreksi
                </button>
              </div>

              <button type="submit" className="btn btn-danger w-100" style={{ padding: '12px', fontWeight: 'bold' }} disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan Koreksi...' : 'Simpan Hasil Koreksi Stok'}
              </button>
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
