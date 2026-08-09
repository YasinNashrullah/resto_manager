import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { getJakartaDate, getWeekRange } from '../../lib/utils';

export default function DataChefTab() {
  const store = useAppStore();
  
  // Sub-Tab Navigation
  const [subTab, setSubTab] = useState<'makanan' | 'produksi' | 'bahan'>('makanan');

  // Modal Transfer State
  const [modalTransferOpen, setModalTransferOpen] = useState(false);
  const [modalProduksiOpen, setModalProduksiOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Transfer Form State
  const [transferType, setTransferType] = useState('Makanan');
  const [transferDari, setTransferDari] = useState('');
  const [transferKe, setTransferKe] = useState('');
  const [transferItems, setTransferItemsState] = useState<{ id_item: string, qty: number }[]>([]);

  // Produksi Chef Form State
  const [produksiTanggal, setProduksiTanggal] = useState(getJakartaDate());
  const [produksiChefNama, setProduksiChefNama] = useState('');
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
    const { data } = await supabase.from('transfer_item').select('tanggal').eq('tipe_item', 'Makanan').order('tanggal', { ascending: false });
    if (data) {
      const weeksMap = new Map();
      data.forEach(p => {
        const wr = getWeekRange(p.tanggal);
        if (wr) weeksMap.set(wr.key, wr.label);
      });
      const sorted = Array.from(weeksMap.entries()).sort((a,b) => b[0].localeCompare(a[0]));
      setActiveWeeks(sorted);
    }
  }

  async function fetchDataMakanan() {
    let query = supabase.from('transfer_item')
      .select('*')
      .eq('tipe_item', 'Makanan')
      .order('id_transfer', { ascending: false });

    if (selectedWeek && selectedWeek !== 'all' && selectedWeek.includes(' to ')) {
      const parts = selectedWeek.split(' to ');
      query = query.gte('tanggal', parts[0]).lte('tanggal', parts[1]);
    }

    if (limit !== 1000) {
      query = query.range((currentPage - 1) * limit, currentPage * limit - 1);
    }
    
    const { data } = await query;
    if (data) setTransferList(data);
  }

  async function fetchDataProduksi() {
    let query = supabase.from('produksi_chef')
      .select('*')
      .order('id_produksi', { ascending: false });

    if (selectedWeek && selectedWeek !== 'all' && selectedWeek.includes(' to ')) {
      const parts = selectedWeek.split(' to ');
      query = query.gte('tanggal', parts[0]).lte('tanggal', parts[1]);
    }

    if (limit !== 1000) {
      query = query.range((currentPage - 1) * limit, currentPage * limit - 1);
    }

    const { data } = await query;
    if (data) setProduksiList(data);
  }

  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transferItems.length === 0) {
      alert("Silakan tambahkan minimal 1 item.");
      return;
    }
    if (transferDari === transferKe) {
      alert("Pegawai pengirim dan penerima tidak boleh sama.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payloads = transferItems.map(item => ({
        tanggal: getJakartaDate(),
        dari_ic: transferDari,
        ke_ic: transferKe,
        tipe_item: transferType,
        id_item: item.id_item,
        qty: item.qty,
        timestamp: new Date().toISOString()
      }));

      await supabase.from('transfer_item').insert(payloads);
      
      setModalTransferOpen(false);
      setTransferItemsState([]);
      fetchDataMakanan();
      calculateStokGlobal();
      
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAutoLoadAllProduksi = () => {
    const allSatuan = store.menu.filter(m => m.tipe_menu === 'Satuan').map(m => ({
      id_menu: m.id_menu,
      qty: ''
    }));
    setProduksiItemsState(allSatuan);
  };

  const handleAutoLoadCookableFromBahan = async () => {
    if (!produksiChefNama) {
      alert("Silakan pilih Dimasak Oleh (Chef) terlebih dahulu.");
      return;
    }

    setIsSubmitting(true);
    try {
      let chefBahanStok: Record<string, number> = {};
      
      try {
        const { data } = await supabase.rpc('get_stock_bahan_pegawai');
        if (Array.isArray(data) && data.length > 0) {
          data.forEach((s: any) => {
            if (s.nama_ic === produksiChefNama) {
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
        const { data: transfers } = await supabase.from('transfer_item').select('*').eq('tipe_item', 'Bahan').eq('ke_ic', produksiChefNama);
        (transfers || []).forEach((t: any) => {
          const bId = t.id_item;
          const qty = parseFloat(t.qty) || 0;
          chefBahanStok[bId] = (chefBahanStok[bId] || 0) + qty;
        });

        const { data: pengeluaran } = await supabase.from('pengeluaran').select('*').eq('nama_pembeli', produksiChefNama);
        (pengeluaran || []).forEach((p: any) => {
          const bId = p.id_bahan;
          const qty = parseFloat(p.jumlah_unit || p.qty) || 0;
          chefBahanStok[bId] = (chefBahanStok[bId] || 0) + qty;
        });
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
      alert(`Berhasil menghitung stok bahan milik Chef "${produksiChefNama}"!\n` +
            `Total masakan yang otomatis terisi porsinya: ${totalAutoPorsi} porsi.`);
    } catch (err: any) {
      alert("Error menghitung porsi: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveProduksi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!produksiChefNama) {
      alert("Mohon lengkapi data Chef!");
      return;
    }

    const validItems = produksiItems.filter(i => i.id_menu && (parseFloat(String(i.qty)) || 0) > 0);

    if (validItems.length === 0) {
      alert("Masukkan jumlah porsi masakan (Qty > 0) pada minimal 1 menu.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payloads = validItems.map(item => ({
        tanggal: produksiTanggal,
        id_menu: item.id_menu,
        qty: parseFloat(String(item.qty)) || 0,
        nama_ic_chef: produksiChefNama
      }));

      await supabase.from('produksi_chef').insert(payloads);
      alert(`Berhasil menyimpan ${payloads.length} masakan chef!`);

      setModalProduksiOpen(false);
      setProduksiItemsState([]);
      fetchDataProduksi();
      calculateStokGlobal();
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTransfer = async (id: string) => {
    if (confirm("Yakin ingin menghapus log transfer ini? Item akan dikembalikan.")) {
      await supabase.from('transfer_item').delete().eq('id_transfer', id);
      fetchDataMakanan();
      calculateStokGlobal();
    }
  };

  const handleDeleteProduksi = async (id: string) => {
    if (confirm("Yakin ingin menghapus laporan masak ini? Stok bahan akan dikembalikan.")) {
      await supabase.from('produksi_chef').delete().eq('id_produksi', id);
      fetchDataProduksi();
      calculateStokGlobal();
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
                setTransferKe('');
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
                    <th>Tanggal</th>
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
                        <td>{d.tanggal}</td>
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
              setProduksiChefNama('');
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
                    <th>Tanggal</th>
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

                    return (
                      <tr key={item.id_produksi}>
                        <td>{item.tanggal}</td>
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
          <div className="modal-content">
            <span className="close-btn" onClick={() => setModalTransferOpen(false)}>&times;</span>
            <h2>Transfer Item / Bahan / Makanan</h2>
            <form onSubmit={handleSaveTransfer}>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Pengirim (Dari Pegawai)</label>
                  <select required value={transferDari} onChange={e => setTransferDari(e.target.value)}>
                    <option value="">-- Pilih Pengirim --</option>
                    {store.pegawai.filter(p => p.status_kontrak === 'Aktif').map(p => (
                      <option key={p.nama_ic} value={p.nama_ic}>{p.nama_ic} ({p.jabatan})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Penerima (Ke Pegawai)</label>
                  <select required value={transferKe} onChange={e => setTransferKe(e.target.value)}>
                    <option value="">-- Pilih Penerima --</option>
                    {store.pegawai.filter(p => p.status_kontrak === 'Aktif').map(p => (
                      <option key={p.nama_ic} value={p.nama_ic}>{p.nama_ic} ({p.jabatan})</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="form-group">
                <label>Tipe Item yang Ditransfer</label>
                <select required value={transferType} onChange={e => {
                  setTransferType(e.target.value);
                  setTransferItemsState([]);
                }}>
                  <option value="Bahan">Bahan Mentah (Gudang / Chef)</option>
                  <option value="Makanan">Makanan Jadi (Chef &rarr; Waiters)</option>
                </select>
              </div>

              <h3 style={{ margin: '15px 0', fontSize: '1.1rem' }}>Daftar Item</h3>
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
                    <input type="number" className="form-control" placeholder="Qty" min="0.01" step="0.01" required style={{ width: '100px' }} value={ti.qty || ''} onChange={e => {
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

              <button type="submit" className="btn btn-warning w-100" disabled={isSubmitting}>
                {isSubmitting ? 'Mengirim...' : 'Kirim Transfer'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL INPUT PRODUKSI CHEF */}
      {modalProduksiOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content" style={{ maxWidth: '650px', width: '90%' }}>
            <span className="close-btn" onClick={() => setModalProduksiOpen(false)}>&times;</span>
            <h2 style={{ marginTop: 0 }}>Input Laporan Masakan Chef</h2>
            <form onSubmit={handleSaveProduksi}>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontWeight: 'bold' }}>Tanggal Masak</label>
                  <input type="date" className="form-control" required value={produksiTanggal} onChange={e => setProduksiTanggal(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontWeight: 'bold' }}>Dimasak Oleh (Chef)</label>
                  <select className="form-control" required value={produksiChefNama} onChange={e => setProduksiChefNama(e.target.value)}>
                    <option value="">-- Dimasak Oleh --</option>
                    {store.pegawai.filter(p => p.status_kontrak === 'Aktif').map(p => (
                      <option key={p.nama_ic} value={p.nama_ic}>{p.nama_ic} ({p.jabatan})</option>
                    ))}
                  </select>
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

              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => {
                  setProduksiItemsState([...produksiItems, { id_menu: '', qty: 0 }]);
                }}>
                  + Tambah Masakan
                </button>
              </div>

              <button type="submit" className="btn btn-primary w-100" style={{ padding: '12px', fontWeight: 'bold' }} disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan...' : 'Simpan Laporan Masak'}
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

    </div>
  );
}
