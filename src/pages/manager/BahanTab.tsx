import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { getJakartaDate, formatStockQty } from '../../lib/utils';

export default function BahanTab() {
  const store = useAppStore();
  
  const [stockPegawai, setStockPegawai] = useState<Record<string, Record<string, number>>>({});
  
  const [modalTransferOpen, setModalTransferOpen] = useState(false);
  const [modalKoreksiOpen, setModalKoreksiOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Transfer State
  const [transferType, setTransferType] = useState('Bahan'); // Bahan | Makanan
  const [transferDari, setTransferDari] = useState('');
  const [transferKeList, setTransferKeList] = useState<string[]>([]);
  const [transferItems, setTransferItemsState] = useState<{ id_item: string, qty: number }[]>([]);

  // Koreksi Batch State
  const [koreksiPegawai, setKoreksiPegawai] = useState('');
  const [koreksiType, setKoreksiType] = useState('Bahan'); // Bahan | Makanan
  const [koreksiItems, setKoreksiItemsState] = useState<{ id_item: string, qty_fisik: number | string }[]>([]);
  const [stokMakananState, setStokMakananState] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    fetchStok();
  }, []);

  async function fetchStok() {
    try {
      const { data, error } = await supabase.rpc('get_stock_bahan_pegawai');
      if (!error && data) {
        const summary: Record<string, Record<string, number>> = {};
        data.forEach((s: any) => {
          if (!summary[s.nama_ic]) summary[s.nama_ic] = {};
          summary[s.nama_ic][s.id_bahan] = parseFloat(s.qty);
        });
        setStockPegawai(summary);
      }
      
      const stokM = await fetchStokMakanan();
      setStokMakananState(stokM.stokPegawai);
    } catch (err) {
      console.error(err);
    }
  }

  // Helper to get system stock for a specific pegawai & item
  const getSystemStock = (pegawai: string, type: string, itemId: string): number => {
    if (!pegawai || !itemId) return 0;
    if (type === 'Bahan') {
      return stockPegawai[pegawai]?.[itemId] || 0;
    } else {
      return stokMakananState[pegawai]?.[itemId] || 0;
    }
  };

  const getSatuan = (type: string, itemId: string): string => {
    if (type === 'Bahan') {
      const b = store.bahan.find(x => x.id_bahan === itemId);
      return b ? b.satuan : '';
    } else {
      return 'Porsi';
    }
  };

  // --- Multi-Recipient Transfer Helpers & Logic ---
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
      fetchStok();
      
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  async function fetchStokMakanan() {
    const { data: transfers } = await supabase.from('transfer_item').select('*').eq('tipe_item', 'Makanan');
    const { data: produksi } = await supabase.from('produksi_chef').select('*');
    const { data: duties } = await supabase.from('duty').select('*');
    
    let stokGlobal: Record<string, number> = {};
    let stokPegawai: Record<string, Record<string, number>> = {};
    
    (produksi || []).forEach((p: any) => {
       const qty = parseFloat(p.qty) || 0;
       if (!stokPegawai[p.nama_ic_chef]) stokPegawai[p.nama_ic_chef] = {};
       stokPegawai[p.nama_ic_chef][p.id_menu] = (stokPegawai[p.nama_ic_chef][p.id_menu] || 0) + qty;
       stokGlobal[p.id_menu] = (stokGlobal[p.id_menu] || 0) + qty;
    });
    
    (transfers || []).forEach((t: any) => {
       const qty = parseFloat(t.qty) || 0;
       if (t.dari_ic !== "Sistem (Koreksi)") {
         if (!stokPegawai[t.dari_ic]) stokPegawai[t.dari_ic] = {};
         stokPegawai[t.dari_ic][t.id_item] = (stokPegawai[t.dari_ic][t.id_item] || 0) - qty;
       }
       if (t.ke_ic !== "Sistem (Koreksi)") {
         if (!stokPegawai[t.ke_ic]) stokPegawai[t.ke_ic] = {};
         stokPegawai[t.ke_ic][t.id_item] = (stokPegawai[t.ke_ic][t.id_item] || 0) + qty;
       }
    });

    (duties || []).forEach((d: any) => {
       const waiter = d.nama_ic;
       const items = d.detail_jual?.items || [];
       items.forEach((item: any) => {
         const qty = parseFloat(item.qty) || 0;
         const menuMatch = store.menu.find(m => m.id_menu === item.id_menu || m.nama_menu.toLowerCase() === (item.nama_menu || '').toLowerCase());
         const idMenu = menuMatch ? menuMatch.id_menu : item.id_menu;
         if (idMenu && waiter) {
           if (!stokPegawai[waiter]) stokPegawai[waiter] = {};
           stokPegawai[waiter][idMenu] = (stokPegawai[waiter][idMenu] || 0) - qty;
           stokGlobal[idMenu] = (stokGlobal[idMenu] || 0) - qty;
         }
       });
    });

    return { stokGlobal, stokPegawai };
  }

  // --- Auto Load All Items into Koreksi List ---
  const handleAutoLoadAllKoreksiItems = () => {
    if (!koreksiPegawai) {
      alert("Pilih pegawai terlebih dahulu.");
      return;
    }
    if (koreksiType === 'Bahan') {
      const items = store.bahan.map(b => ({
        id_item: b.id_bahan,
        qty_fisik: getSystemStock(koreksiPegawai, 'Bahan', b.id_bahan)
      }));
      setKoreksiItemsState(items);
    } else {
      const items = store.menu.filter(m => m.tipe_menu === 'Satuan').map(m => ({
        id_item: m.id_menu,
        qty_fisik: getSystemStock(koreksiPegawai, 'Makanan', m.id_menu)
      }));
      setKoreksiItemsState(items);
    }
  };

  // --- Batch Koreksi Submit Logic ---
  const handleSaveKoreksi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!koreksiPegawai) {
      alert("Silakan pilih pegawai.");
      return;
    }
    if (koreksiItems.length === 0) {
      alert("Silakan tambahkan minimal 1 item untuk dikoreksi.");
      return;
    }

    const payloads: any[] = [];

    for (const item of koreksiItems) {
      if (!item.id_item) continue;
      const fisik = parseFloat(String(item.qty_fisik)) || 0;
      const sysStok = getSystemStock(koreksiPegawai, koreksiType, item.id_item);
      const diff = fisik - sysStok;

      if (Math.abs(diff) >= 0.01) {
        let dari_ic, ke_ic, qtyToTransfer;
        if (diff > 0) {
          dari_ic = "Sistem (Koreksi)";
          ke_ic = koreksiPegawai;
          qtyToTransfer = diff;
        } else {
          dari_ic = koreksiPegawai;
          ke_ic = "Sistem (Koreksi)";
          qtyToTransfer = Math.abs(diff);
        }

        payloads.push({
          tanggal: getJakartaDate(),
          dari_ic: dari_ic,
          ke_ic: ke_ic,
          tipe_item: koreksiType,
          id_item: item.id_item,
          qty: qtyToTransfer,
          timestamp: new Date().toISOString()
        });
      }
    }

    if (payloads.length === 0) {
      alert("Semua stok fisik yang dimasukkan sudah sesuai dengan stok sistem. Tidak ada perubahan yang disimpan.");
      return;
    }

    setIsSubmitting(true);
    try {
      await supabase.from('transfer_item').insert(payloads);
      alert(`Berhasil menyimpan ${payloads.length} item koreksi stok opname!`);
      setModalKoreksiOpen(false);
      setKoreksiItemsState([]);
      fetchStok();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ display: 'inline-block', margin: 0 }}>Data Bahan Mentah (Stok)</h1>
        </div>
        <div>
          <button className="btn btn-primary btn-koreksi-stok" style={{ marginRight: '10px' }} onClick={() => {
            setKoreksiPegawai('');
            setKoreksiItemsState([]);
            setModalKoreksiOpen(true);
          }}>Opname / Koreksi Stok Batch</button>
          <button className="btn btn-warning btn-add-transfer" onClick={() => {
            setTransferType('Bahan');
            setTransferDari('');
            setTransferKeList([]);
            setTransferItemsState([]);
            setModalTransferOpen(true);
          }}>+ Transfer Item</button>
        </div>
      </div>

      <div className="dashboard-grid mb-20" style={{ marginBottom: '20px' }}>
        <div className="stat-card" style={{ gridColumn: 'span 12' }}>
          <h3>Stok Bahan Mentah yang Dipegang Pegawai</h3>
          <div id="container-stok-pegawai" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px', marginTop: '15px' }}>
            {Object.keys(stockPegawai).length === 0 ? (
              <div style={{ color: '#777', width: '100%', textAlign: 'center', gridColumn: '1 / -1' }}>Belum ada stok bahan yang dipegang pegawai saat ini.</div>
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

                const sortedPegawaiNames = Object.keys(stockPegawai).sort((nA, nB) => {
                  const pA = store.pegawai.find(p => p.nama_ic === nA);
                  const pB = store.pegawai.find(p => p.nama_ic === nB);
                  const rankA = pA ? getJabatanRank(pA.jabatan) : 999;
                  const rankB = pB ? getJabatanRank(pB.jabatan) : 999;
                  if (rankA !== rankB) return rankA - rankB;
                  return nA.localeCompare(nB, 'id', { sensitivity: 'base' });
                });

                return sortedPegawaiNames.map(namaChef => {
                  if (namaChef === "Sistem (Koreksi)") return null;
                  const items = stockPegawai[namaChef];
                  const bahanEntries = Object.entries(items).filter(([_, qty]) => Number(qty) !== 0);
                  if (bahanEntries.length === 0) return null;

                  const pegawaiInfo = store.pegawai.find(p => p.nama_ic === namaChef);
                  const jabatan = pegawaiInfo ? pegawaiInfo.jabatan : "Pegawai";
                  const inisial = namaChef.charAt(0).toUpperCase();

                  return (
                    <div key={namaChef} style={{ background: 'var(--bg-card)', padding: '15px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                        <div style={{ background: 'var(--accent-color)', color: 'white', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '16px', flexShrink: 0 }}>
                          {inisial}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={namaChef}>{namaChef}</h4>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{jabatan}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {bahanEntries.map(([id_bahan, qty]: [string, any]) => {
                          const bahan = store.bahan.find(b => b.id_bahan === id_bahan);
                          const namaBahan = bahan ? bahan.nama_bahan : id_bahan;
                          const satuan = bahan ? bahan.satuan : 'Pcs';
                          const isMinus = Number(qty) < 0;
                          const badgeBg = isMinus ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)";
                          const badgeText = isMinus ? "var(--danger-color)" : "var(--success-color)";
                          return (
                            <div key={id_bahan} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--bg-hover)', borderRadius: '6px', fontSize: '0.9rem', marginBottom: '5px' }}>
                              <span style={{ color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px' }} title={namaBahan}>{namaBahan}</span>
                              <span style={{ background: badgeBg, color: badgeText, padding: '2px 8px', borderRadius: '4px', fontWeight: 600, fontSize: '0.85rem', flexShrink: 0 }}>
                                {formatStockQty(qty, satuan)}
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

      {/* Modal Transfer */}
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
                    <option value="Bahan">Bahan Mentah (Gudang / Chef)</option>
                    <option value="Makanan">Makanan Jadi (Chef &rarr; Waiters)</option>
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

      {/* Modal Koreksi Multi-Item (Batch Opname) */}
      {modalKoreksiOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content" style={{ maxWidth: '650px', width: '90%' }}>
            <span className="close-btn" onClick={() => setModalKoreksiOpen(false)}>&times;</span>
            <h2 style={{ marginTop: 0 }}>Opname / Koreksi Stok (Multi Item Batch)</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
              Masukkan jumlah fisik riil di lapangan. Sistem akan otomatis menghitung selisih dan melakukan penyesuaian stok.
            </p>

            <form onSubmit={handleSaveKoreksi}>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontWeight: 'bold' }}>Pegawai yang Menyimpan Stok</label>
                  <select className="form-control" required value={koreksiPegawai} onChange={e => setKoreksiPegawai(e.target.value)}>
                    <option value="">-- Pilih Pegawai --</option>
                    {store.pegawai.filter(p => p.status_kontrak === 'Aktif').map(p => (
                      <option key={p.nama_ic} value={p.nama_ic}>{p.nama_ic} ({p.jabatan})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontWeight: 'bold' }}>Tipe Item</label>
                  <select className="form-control" required value={koreksiType} onChange={e => {
                    setKoreksiType(e.target.value);
                    setKoreksiItemsState([]);
                  }}>
                    <option value="Bahan">Bahan Mentah</option>
                    <option value="Makanan">Makanan Jadi</option>
                  </select>
                </div>
              </div>

              {/* Action bar for batch opname */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px' }}>
                <button type="button" className="btn btn-sm btn-info" onClick={handleAutoLoadAllKoreksiItems}>
                  ⚡ Muat Semua Item ({koreksiType})
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Total item ditambahkan: {koreksiItems.length}
                </span>
              </div>

              {/* Dynamic list of correction rows */}
              <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '15px' }}>
                {koreksiItems.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                    Belum ada item ditambahkan. Klik <strong>"+ Tambah Item Koreksi"</strong> atau <strong>"⚡ Muat Semua Item"</strong> di atas.
                  </div>
                ) : (
                  koreksiItems.map((item, idx) => {
                    const sysStok = getSystemStock(koreksiPegawai, koreksiType, item.id_item);
                    const satuan = getSatuan(koreksiType, item.id_item);
                    const fisik = parseFloat(String(item.qty_fisik)) || 0;
                    const diff = fisik - sysStok;

                    return (
                      <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px', background: 'var(--bg-card)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <select className="form-control" style={{ flex: 2 }} required value={item.id_item} onChange={e => {
                          const newItems = [...koreksiItems];
                          newItems[idx].id_item = e.target.value;
                          newItems[idx].qty_fisik = getSystemStock(koreksiPegawai, koreksiType, e.target.value);
                          setKoreksiItemsState(newItems);
                        }}>
                          <option value="">-- Pilih Item --</option>
                          {koreksiType === 'Bahan' ? 
                            store.bahan.map(b => <option key={b.id_bahan} value={b.id_bahan}>{b.nama_bahan}</option>) :
                            store.menu.filter(m => m.tipe_menu === 'Satuan').map(m => <option key={m.id_menu} value={m.id_menu}>{m.nama_menu}</option>)
                          }
                        </select>

                        <div style={{ flex: 1, textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          Sistem: <strong>{sysStok.toFixed(2)}</strong> {satuan}
                        </div>

                        <div style={{ flex: 1 }}>
                          <input 
                            type="number" 
                            step="0.01" 
                            className="form-control" 
                            placeholder="Qty Fisik" 
                            required 
                            value={item.qty_fisik} 
                            onChange={e => {
                              const newItems = [...koreksiItems];
                              newItems[idx].qty_fisik = e.target.value;
                              setKoreksiItemsState(newItems);
                            }} 
                          />
                        </div>

                        <div style={{ width: '80px', textAlign: 'center', fontSize: '0.82rem' }}>
                          <span style={{ 
                            color: diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : 'var(--text-secondary)',
                            fontWeight: 'bold'
                          }}>
                            {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
                          </span>
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
                  setKoreksiItemsState([...koreksiItems, { id_item: '', qty_fisik: 0 }]);
                }}>
                  + Tambah Item Koreksi
                </button>
              </div>

              <button type="submit" className="btn btn-primary w-100" style={{ padding: '12px', fontWeight: 'bold' }} disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan Koreksi...' : 'Simpan Semua Koreksi Stok Batch'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
