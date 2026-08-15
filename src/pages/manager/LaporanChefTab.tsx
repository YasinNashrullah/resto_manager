import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { getJakartaDate, getWeekRange } from '../../lib/utils';
import ConfirmModal from '../../components/ConfirmModal';

export default function LaporanChefTab() {
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

  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [tanggal, setTanggal] = useState('');
  const [chefList, setChefList] = useState<string[]>([]);
  const [items, setItems] = useState<{ id_menu: string, qty: number | string }[]>([]);

  // Filter & Pagination State
  const [activeWeeks, setActiveWeeks] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('all');
  const [limit, setLimit] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [produksiList, setProduksiList] = useState<any[]>([]);

  useEffect(() => {
    fetchWeeks();
  }, [store.produksi_chef]);

  useEffect(() => {
    fetchData();
  }, [selectedWeek, limit, currentPage, store.produksi_chef]);

  async function fetchWeeks() {
    const { data } = await supabase.from('produksi_chef').select('tanggal').order('tanggal', { ascending: false });
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

  async function fetchData() {
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

  const handleAddChef = (name: string) => {
    if (name && !chefList.includes(name)) {
      setChefList([...chefList, name]);
    }
  };

  const handleRemoveChef = (name: string) => {
    setChefList(chefList.filter(n => n !== name));
  };

  const handleSelectAllChefs = () => {
    const chefs = store.pegawai
      .filter(p => p.status_kontrak === 'Aktif' && (p.jabatan?.toLowerCase().includes('chef') || p.jabatan?.toLowerCase().includes('cook') || p.jabatan?.toLowerCase().includes('dapur') || p.jabatan?.toLowerCase().includes('koki')))
      .map(p => p.nama_ic);
    const combined = Array.from(new Set([...chefList, ...chefs]));
    setChefList(combined);
  };

  const handleSelectAllActive = () => {
    const all = store.pegawai
      .filter(p => p.status_kontrak === 'Aktif')
      .map(p => p.nama_ic);
    setChefList(all);
  };

  const handleClearChefs = () => {
    setChefList([]);
  };

  const handleAutoLoadAllMakanan = () => {
    const allSatuan = store.menu.filter(m => m.tipe_menu === 'Satuan').map(m => ({
      id_menu: m.id_menu,
      qty: ''
    }));
    setItems(allSatuan);
  };

  const handleAutoLoadCookableFromBahan = async () => {
    if (chefList.length === 0) {
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
            if (chefList.includes(s.nama_ic)) {
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
        for (const chefName of chefList) {
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

      setItems(autoItems);

      const totalAutoPorsi = autoItems.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0);
      alert(`Berhasil menghitung stok bahan milik ${chefList.length} Chef terpilih (${chefList.join(', ')})!\n` +
            `Total masakan yang otomatis terisi porsinya: ${totalAutoPorsi} porsi.`);
    } catch (err: any) {
      alert("Error menghitung porsi: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (chefList.length === 0) {
      alert("Silakan pilih minimal 1 Chef yang memasak.");
      return;
    }

    const validItems = items.filter(i => i.id_menu && (parseFloat(String(i.qty)) || 0) > 0);

    if (validItems.length === 0) {
      alert("Masukkan jumlah porsi (Qty > 0) pada minimal 1 masakan.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payloads: any[] = [];
      const now = Date.now();
      let idx = 0;
      for (const chef of chefList) {
        for (const item of validItems) {
          payloads.push({
            id_produksi: `P_${now + idx}_${Math.floor(Math.random() * 1000)}`,
            tanggal,
            nama_ic_chef: chef,
            id_menu: item.id_menu,
            qty: parseFloat(String(item.qty)) || 0
          });
          idx++;
        }
      }

      const { error } = await supabase.from('produksi_chef').insert(payloads);
      if (error) throw error;

      alert(`Berhasil menyimpan ${validItems.length} masakan untuk ${chefList.length} chef (${payloads.length} total data produksi)!`);
      
      setModalOpen(false);
      setItems([]);
      setChefList([]);
      fetchData();
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Laporan Masakan',
      message: 'Yakin ingin menghapus laporan masakan ini? Stok makanan akan otomatis berkurang.',
      onConfirm: () => executeDelete(id)
    });
  };

  const executeDelete = async (id: string) => {
    try {
      setIsDeleting(true);
      // Optimistic local update
      setProduksiList(prev => prev.filter(item => item.id_produksi !== id));
      
      const { error } = await supabase.from('produksi_chef').delete().eq('id_produksi', id);
      if (error) {
        console.error("Gagal menghapus laporan masak:", error);
        alert("Gagal menghapus laporan masak: " + error.message);
      }
      
      await store.fetchData();
      await fetchData();
    } catch (err: any) {
      console.error("Error menghapus laporan:", err);
      alert("Error menghapus laporan: " + err.message);
    } finally {
      setIsDeleting(false);
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
    }
  };

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action">
        <div>
          <h1 style={{ display: 'inline-block' }}>Laporan Chef (Produksi Makanan)</h1>
        </div>
        <button className="btn btn-primary" style={{ fontWeight: 'bold' }} onClick={() => {
          setTanggal(getJakartaDate());
          setChefList([]);
          setItems([]);
          setModalOpen(true);
        }}>+ Input Laporan Masakan</button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3>Riwayat Laporan Chef</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label style={{ fontSize: '0.9rem', margin: 0 }}>Filter Minggu:</label>
            <select className="form-control" style={{ width: 'auto' }} value={selectedWeek} onChange={e => { setSelectedWeek(e.target.value); setCurrentPage(1); }}>
              <option value="all">Semua Minggu (Semua Data)</option>
              {activeWeeks.map(w => (
                <option key={w[0]} value={w[0]}>{w[1]}</option>
              ))}
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
                <tr><td colSpan={5} style={{ textAlign: 'center' }}>Belum ada laporan produksi masakan</td></tr>
              ) : produksiList.map(d => {
                const menu = store.menu.find(m => m.id_menu === d.id_menu);
                const namaMenu = menu ? menu.nama_menu : (d.id_menu || "Menu Dihapus");
                const wr = getWeekRange(d.tanggal);
                const isClosed = wr ? store.periode_ditutup.includes(wr.key) : false;
                
                let timeStr = '';
                if (d.timestamp) {
                  timeStr = new Date(d.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                } else if (d.id_produksi && typeof d.id_produksi === 'string' && d.id_produksi.startsWith('P_')) {
                  const parts = d.id_produksi.split('_');
                  const ts = Number(parts[1]);
                  if (!isNaN(ts) && ts > 1000000000000) {
                    timeStr = new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  }
                }

                return (
                  <tr key={d.id_produksi}>
                    <td>
                      <div style={{ fontWeight: '500' }}>{d.tanggal}</div>
                      {timeStr ? (
                        <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block' }}>
                          <i className="fa-regular fa-clock" style={{ marginRight: '4px' }}></i>{timeStr}
                        </small>
                      ) : null}
                    </td>
                    <td className="font-weight-bold">{namaMenu}</td>
                    <td className="text-success font-weight-bold">+{d.qty} Porsi</td>
                    <td>{d.nama_ic_chef}</td>
                    <td>
                      <button className={`btn btn-sm ${isClosed ? 'btn-secondary' : 'btn-danger'}`} disabled={isClosed} onClick={() => handleDelete(d.id_produksi)}>Hapus</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-sm btn-secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(c => c - 1)}>Sebelumnya</button>
            <span style={{ fontSize: '0.9rem' }}>Halaman {currentPage}</span>
            <button className="btn btn-sm btn-secondary" disabled={produksiList.length < limit && limit !== 1000} onClick={() => setCurrentPage(c => c + 1)}>Selanjutnya</button>
          </div>
        </div>
      </div>

      {/* Modal Laporan Masakan */}
      {modalOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content" style={{ maxWidth: '680px', width: '95%' }}>
            <span className="close-btn" onClick={() => setModalOpen(false)}>&times;</span>
            <h2 style={{ marginTop: 0, marginBottom: '15px' }}>Input Laporan Produksi Masakan Chef</h2>
            <form onSubmit={handleSave}>
              
              {/* Row 1: Tanggal Masak */}
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label style={{ fontWeight: 'bold' }}>Tanggal Masak</label>
                <input type="date" className="form-control" required value={tanggal} onChange={e => setTanggal(e.target.value)} />
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
                    background: chefList.length > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    color: chefList.length > 0 ? 'var(--success-color)' : 'var(--text-secondary)',
                    fontWeight: 'bold'
                  }}>
                    {chefList.length} Chef Terpilih
                  </span>
                </div>

                {/* Quick select buttons */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
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
                  {chefList.length > 0 && (
                    <button 
                      type="button" 
                      className="btn btn-sm" 
                      style={{ padding: '3px 10px', fontSize: '0.75rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      onClick={handleClearChefs}
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
                    handleAddChef(e.target.value);
                  }}
                >
                  <option value="">+ Tambah Chef (Klik untuk memilih)...</option>
                  {store.pegawai
                    .filter(p => p.status_kontrak === 'Aktif' && !chefList.includes(p.nama_ic))
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
                  {chefList.length === 0 ? (
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', alignSelf: 'center', fontStyle: 'italic' }}>
                      Belum ada Chef dipilih. Gunakan tombol "+ Semua Chef" atau pilih dari dropdown.
                    </span>
                  ) : (
                    chefList.map(name => {
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
                            onClick={() => handleRemoveChef(name)} 
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
                <button type="button" className="btn btn-sm btn-info" onClick={handleAutoLoadAllMakanan}>
                  ⚡ Muat Semua Makanan
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                  Total menu: {items.length}
                </span>
              </div>

              <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '15px' }}>
                {items.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                    Belum ada item ditambahkan. Klik <strong>"+ Tambah Item Masakan"</strong> atau <strong>"⚡ Muat Semua Makanan"</strong> di atas.
                  </div>
                ) : (
                  items.map((ti, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                      <select className="form-control" style={{ flex: 2 }} required value={ti.id_menu} onChange={e => {
                        const newItems = [...items];
                        newItems[idx].id_menu = e.target.value;
                        setItems(newItems);
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
                        value={ti.qty || ''} 
                        onChange={e => {
                          const newItems = [...items];
                          newItems[idx].qty = e.target.value;
                          setItems(newItems);
                        }} 
                      />
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => {
                        const newItems = [...items];
                        newItems.splice(idx, 1);
                        setItems(newItems);
                      }}>X</button>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => {
                  setItems([...items, { id_menu: '', qty: 0 }]);
                }}>
                  + Tambah Item Masakan
                </button>
              </div>

              {/* Duplicate Summary Card */}
              {chefList.length > 0 && items.filter(i => i.id_menu && (parseFloat(String(i.qty)) || 0) > 0).length > 0 && (
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
                    Laporan masakan sebanyak <strong>{items.filter(i => i.id_menu && (parseFloat(String(i.qty)) || 0) > 0).length} menu</strong> akan dicatat untuk setiap chef (<strong>{chefList.length} orang</strong>: {chefList.join(', ')}).
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '3px' }}>
                    Total data produksi yang akan disimpan: <strong>{items.filter(i => i.id_menu && (parseFloat(String(i.qty)) || 0) > 0).length * chefList.length} baris</strong> data.
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                className="btn btn-primary w-100" 
                style={{ padding: '12px', fontWeight: 'bold' }} 
                disabled={isSubmitting || chefList.length === 0 || items.filter(i => i.id_menu && (parseFloat(String(i.qty)) || 0) > 0).length === 0}
              >
                {isSubmitting ? 'Menyimpan Laporan...' : `Simpan Laporan Chef (${chefList.length} Chef)`}
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
