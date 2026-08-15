import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { formatCurrency, getJakartaDate, getWeekRange } from '../../lib/utils';
import ConfirmModal from '../../components/ConfirmModal';

export default function GudangTab() {
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

  const [bahanList, setBahanList] = useState<any[]>([]);
  const [globalStok, setGlobalStok] = useState<Record<string, number>>({});
  
  const [restockList, setRestockList] = useState<any[]>([]);
  const [activeWeeks, setActiveWeeks] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('all');
  const [limit, setLimit] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  
  const [modalBahanOpen, setModalBahanOpen] = useState(false);
  const [modalRestockOpen, setModalRestockOpen] = useState(false);
  
  const [formDataBahan, setFormDataBahan] = useState({ id_bahan: '', nama_bahan: '', harga_per_unit: 0, satuan: 'pcs' });
  
  // Batch Restock Form State
  const [restockTanggal, setRestockTanggal] = useState(getJakartaDate());
  const [restockPembeli, setRestockPembeli] = useState('');
  const [restockItems, setRestockItemsState] = useState<{ id_bahan: string, qty: number | string, harga: number | string }[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchStok();
  }, [store.pengeluaran, store.transfer_item]);

  useEffect(() => {
    const sorted = [...store.bahan].sort((a, b) => (parseFloat(a.harga_per_unit) || 0) - (parseFloat(b.harga_per_unit) || 0));
    setBahanList(sorted);
  }, [store.bahan]);

  useEffect(() => {
    fetchWeeks();
  }, [store.pengeluaran]);

  useEffect(() => {
    fetchRestock();
  }, [selectedWeek, limit, currentPage, store.pengeluaran]);

  async function fetchStok() {
    try {
      const { data } = await supabase.rpc('get_stock_bahan_pegawai');
      if (data) {
        const map: Record<string, number> = {};
        data.forEach((s: any) => {
          if (s.nama_ic !== 'Sistem (Koreksi)') {
            map[s.id_bahan] = (map[s.id_bahan] || 0) + parseFloat(s.qty);
          }
        });
        setGlobalStok(map);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchWeeks() {
    const { data } = await supabase.from('pengeluaran').select('tanggal').order('tanggal', { ascending: false });
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

  async function fetchRestock() {
    let query = supabase.from('pengeluaran')
      .select('*', { count: 'exact' })
      .order('id_pengeluaran', { ascending: false });

    if (selectedWeek && selectedWeek !== 'all' && selectedWeek.includes(' to ')) {
      const parts = selectedWeek.split(' to ');
      query = query.gte('tanggal', parts[0]).lte('tanggal', parts[1]);
    }

    if (limit !== 1000) {
      query = query.range((currentPage - 1) * limit, currentPage * limit - 1);
    }

    const { data } = await query;
    if (data) setRestockList(data);
  }

  const handleSaveBahan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (formDataBahan.harga_per_unit <= 0) {
        alert("Harga tidak valid!");
        setIsSubmitting(false);
        return;
      }

      const payload = {
        nama_bahan: formDataBahan.nama_bahan,
        harga_per_unit: formDataBahan.harga_per_unit,
        satuan: formDataBahan.satuan
      };

      if (formDataBahan.id_bahan) {
        await supabase.from('bahan').update(payload).eq('id_bahan', formDataBahan.id_bahan);
      } else {
        await supabase.from('bahan').insert([payload]);
      }
      setModalBahanOpen(false);
      
      const { data } = await supabase.from('bahan').select('*');
      if (data) store.setBahan(data);
      
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBahan = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Master Bahan',
      message: 'Yakin ingin menghapus bahan ini? Pastikan bahan ini tidak dipakai di menu aktif!',
      onConfirm: () => executeDeleteBahan(id)
    });
  };

  const executeDeleteBahan = async (id: string) => {
    try {
      setIsDeleting(true);
      const { error } = await supabase.from('bahan').delete().eq('id_bahan', id);
      if (error) {
        console.error("Gagal menghapus bahan:", error);
        alert("Gagal menghapus bahan: " + error.message);
      }
      await store.fetchData();
      fetchStok();
    } catch (err: any) {
      console.error("Error menghapus bahan:", err);
      alert("Error menghapus bahan: " + err.message);
    } finally {
      setIsDeleting(false);
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
    }
  };

  // --- Auto Load All Bahan for Restock Batch ---
  const handleAutoLoadAllRestockItems = () => {
    const items = store.bahan.map(b => ({
      id_bahan: b.id_bahan,
      qty: 0,
      harga: b.harga_per_unit || 0
    }));
    setRestockItemsState(items);
  };

  // --- Batch Restock Submit Handler ---
  const handleSaveRestockBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockPembeli) {
      alert("Silakan pilih Nama Pembeli (IC Pegawai).");
      return;
    }
    if (restockItems.length === 0) {
      alert("Silakan tambahkan minimal 1 bahan untuk direstock.");
      return;
    }

    const validItems = restockItems.filter(i => i.id_bahan && (parseFloat(String(i.qty)) || 0) > 0);

    if (validItems.length === 0) {
      alert("Masukkan jumlah (Qty > 0) pada minimal 1 bahan.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payloads = validItems.map(item => {
        const qtyNum = parseFloat(String(item.qty)) || 0;
        const hargaNum = parseFloat(String(item.harga)) || 0;
        return {
          tanggal: restockTanggal,
          nama_pembeli: restockPembeli,
          id_bahan: item.id_bahan,
          jumlah_unit: qtyNum,
          harga_aktual_per_unit: hargaNum,
          total_biaya: qtyNum * hargaNum
        };
      });

      await supabase.from('pengeluaran').insert(payloads);
      alert(`Berhasil menyimpan ${payloads.length} transaksi pembelian/restock bahan!`);
      
      setModalRestockOpen(false);
      setRestockItemsState([]);
      fetchRestock();
      fetchStok();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRestock = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Riwayat Restock',
      message: 'Yakin ingin menghapus riwayat pembelian restock ini? Stok yang sudah bertambah tidak otomatis terhapus.',
      onConfirm: () => executeDeleteRestock(id)
    });
  };

  const executeDeleteRestock = async (id: string) => {
    try {
      setIsDeleting(true);
      // Optimistic local update
      setRestockList(prev => prev.filter(d => d.id_pengeluaran !== id));
      
      const { error } = await supabase.from('pengeluaran').delete().eq('id_pengeluaran', id);
      if (error) {
        console.error("Gagal menghapus riwayat restock:", error);
        alert("Gagal menghapus riwayat restock: " + error.message);
      }
      
      await store.fetchData();
      await fetchRestock();
      await fetchStok();
    } catch (err: any) {
      console.error("Error menghapus riwayat restock:", err);
      alert("Error menghapus riwayat restock: " + err.message);
    } finally {
      setIsDeleting(false);
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
    }
  };

  const isChef = document.body.classList.contains('role-chef');

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action">
        <h1>Restock & Data Bahan Mentah</h1>
        <div>
          {!isChef && (
            <button className="btn btn-primary" onClick={() => {
              setFormDataBahan({ id_bahan: '', nama_bahan: '', harga_per_unit: 0, satuan: 'pcs' });
              setModalBahanOpen(true);
            }}>+ Tambah Bahan Master</button>
          )}
        </div>
      </div>

      {/* Tabel Master Bahan Mentah */}
      <div className="card mb-20">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0 }}>Daftar Bahan Mentah & Stok Global</h3>
        </div>
        <div className="table-responsive">
          <table id="table-bahan">
            <thead>
              <tr>
                <th>Nama Bahan</th>
                <th>Harga Patokan (Modal) / Unit</th>
                <th>Satuan</th>
                <th>Stok Tersedia</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {bahanList.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center' }}>Belum ada bahan</td></tr>
              ) : bahanList.map(b => {
                const stokVal = globalStok[b.id_bahan] || 0;
                return (
                  <tr key={b.id_bahan}>
                    <td className="font-weight-bold">{b.nama_bahan}</td>
                    <td>{formatCurrency(b.harga_per_unit)} / {b.satuan}</td>
                    <td><span className="badge badge-secondary">{b.satuan}</span></td>
                    <td className={stokVal <= 0 ? "text-danger font-weight-bold" : "text-success font-weight-bold"}>
                      {stokVal.toFixed(2)} {b.satuan}
                    </td>
                    <td>
                      <button className="btn btn-sm btn-primary btn-edit-bahan" disabled={isChef} style={isChef ? {opacity: 0.5}: {}} onClick={() => {
                        setFormDataBahan({ id_bahan: b.id_bahan, nama_bahan: b.nama_bahan, harga_per_unit: b.harga_per_unit, satuan: b.satuan });
                        setModalBahanOpen(true);
                      }}>Edit</button>
                      {!isChef && <button className="btn btn-sm btn-danger btn-delete-bahan" style={{ marginLeft: '5px' }} onClick={() => handleDeleteBahan(b.id_bahan)}>Hapus</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Riwayat Restock Pembelian Bahan */}
      <div className="header-action mt-20" style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ display: 'inline-block', margin: 0 }}>Log Pembelian Bahan (Restock)</h2>
        </div>
        {!isChef && (
          <button className="btn btn-success" style={{ fontWeight: 'bold', padding: '10px 20px' }} onClick={() => {
            setRestockTanggal(getJakartaDate());
            setRestockPembeli('');
            setRestockItemsState([]);
            setModalRestockOpen(true);
          }}>+ Input Restock Massal (Batch)</button>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ display: 'inline-block', margin: 0 }}>Riwayat Belanja Bahan</h3>
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
          <table id="table-riwayat-belanja">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Nama Bahan</th>
                <th>Jumlah (Qty)</th>
                <th>Harga Aktual/Unit</th>
                <th>Total Biaya</th>
                <th>Pembeli</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {restockList.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center' }}>Belum ada log pembelian</td></tr>
              ) : restockList.map(d => {
                const bahan = store.bahan.find(b => b.id_bahan === d.id_bahan);
                const namaBahan = bahan ? bahan.nama_bahan : (d.id_bahan || "Bahan Mentah");
                const wr = getWeekRange(d.tanggal);
                const isClosed = wr ? store.periode_ditutup.includes(wr.key) : false;
                
                return (
                  <tr key={d.id_pengeluaran}>
                    <td>{d.tanggal}</td>
                    <td>{namaBahan}</td>
                    <td className="font-weight-bold text-primary">+{d.jumlah_unit}</td>
                    <td>{formatCurrency(d.harga_aktual_per_unit || d.total_biaya / d.jumlah_unit)}</td>
                    <td className="text-danger font-weight-bold">{formatCurrency(d.total_biaya)}</td>
                    <td>{d.nama_pembeli}</td>
                    <td>
                      <button className={`btn btn-sm ${isClosed ? 'btn-secondary' : 'btn-danger'}`} disabled={isClosed} onClick={() => handleDeleteRestock(d.id_pengeluaran)}>Hapus</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-sm btn-secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(c => c - 1)}>Sebelumnya</button>
            <span style={{ fontSize: '0.9rem' }}>Halaman {currentPage}</span>
            <button className="btn btn-sm btn-secondary" disabled={restockList.length < limit && limit !== 1000} onClick={() => setCurrentPage(c => c + 1)}>Selanjutnya</button>
          </div>
        </div>
      </div>

      {/* Modal Master Bahan */}
      {modalBahanOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <span className="close-btn" onClick={() => setModalBahanOpen(false)}>&times;</span>
            <h2>{formDataBahan.id_bahan ? 'Edit Bahan' : 'Tambah Bahan'}</h2>
            <form onSubmit={handleSaveBahan}>
              <div className="form-group">
                <label>Nama Bahan</label>
                <input type="text" required value={formDataBahan.nama_bahan} onChange={e => setFormDataBahan({...formDataBahan, nama_bahan: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Harga Patokan (Modal) / Unit ($)</label>
                <input type="number" step="0.01" required value={formDataBahan.harga_per_unit} onChange={e => setFormDataBahan({...formDataBahan, harga_per_unit: Number(e.target.value)})} />
              </div>
              <div className="form-group">
                <label>Satuan</label>
                <select required value={formDataBahan.satuan} onChange={e => setFormDataBahan({...formDataBahan, satuan: e.target.value})}>
                  <option value="pcs">pcs</option>
                  <option value="kg">kg</option>
                  <option value="gram">gram</option>
                  <option value="liter">liter</option>
                  <option value="pack">pack</option>
                  <option value="botol">botol</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isSubmitting}>Simpan</button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Multi-Item Batch Restock */}
      {modalRestockOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content" style={{ maxWidth: '700px', width: '90%' }}>
            <span className="close-btn" onClick={() => setModalRestockOpen(false)}>&times;</span>
            <h2 style={{ marginTop: 0 }}>Input Pembelian Bahan (Restock Massal)</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
              Masukkan daftar pembelian restock bahan mentah sekaligus.
            </p>

            <form onSubmit={handleSaveRestockBatch}>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontWeight: 'bold' }}>Tanggal Pembelian</label>
                  <input type="date" className="form-control" required value={restockTanggal} onChange={e => setRestockTanggal(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontWeight: 'bold' }}>Nama Pembeli (IC Pegawai)</label>
                  <select className="form-control" required value={restockPembeli} onChange={e => setRestockPembeli(e.target.value)}>
                    <option value="">-- Pilih Pembeli --</option>
                    {store.pegawai.filter(p => p.status_kontrak === 'Aktif').map(p => (
                      <option key={p.nama_ic} value={p.nama_ic}>{p.nama_ic} ({p.jabatan})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action bar for batch restock */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px' }}>
                <button type="button" className="btn btn-sm btn-info" onClick={handleAutoLoadAllRestockItems}>
                  ⚡ Muat Semua Bahan Mentah
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Total item: {restockItems.length}
                </span>
              </div>

              {/* Dynamic list of restock items */}
              <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '15px' }}>
                {restockItems.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                    Belum ada item ditambahkan. Klik <strong>"+ Tambah Item Restock"</strong> atau <strong>"⚡ Muat Semua Bahan"</strong> di atas.
                  </div>
                ) : (
                  restockItems.map((item, idx) => {
                    const b = store.bahan.find(x => x.id_bahan === item.id_bahan);
                    const satuan = b ? b.satuan : 'Unit';
                    const qtyNum = parseFloat(String(item.qty)) || 0;
                    const hargaNum = parseFloat(String(item.harga)) || 0;
                    const subtotal = qtyNum * hargaNum;

                    return (
                      <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px', background: 'var(--bg-card)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <select className="form-control" style={{ flex: 2 }} required value={item.id_bahan} onChange={e => {
                          const val = e.target.value;
                          const bObj = store.bahan.find(x => x.id_bahan === val);
                          const newItems = [...restockItems];
                          newItems[idx].id_bahan = val;
                          if (bObj) newItems[idx].harga = bObj.harga_per_unit || 0;
                          setRestockItemsState(newItems);
                        }}>
                          <option value="">-- Pilih Bahan --</option>
                          {store.bahan.map(b => (
                            <option key={b.id_bahan} value={b.id_bahan}>{b.nama_bahan} ({b.satuan})</option>
                          ))}
                        </select>

                        <div style={{ flex: 1 }}>
                          <input 
                            type="number" 
                            min="0" 
                            step="0.01" 
                            className="form-control" 
                            placeholder={`Qty (${satuan})`} 
                            required 
                            value={item.qty || ''} 
                            onChange={e => {
                              const newItems = [...restockItems];
                              newItems[idx].qty = e.target.value;
                              setRestockItemsState(newItems);
                            }} 
                          />
                        </div>

                        <div style={{ flex: 1 }}>
                          <input 
                            type="number" 
                            min="0" 
                            step="0.01" 
                            className="form-control" 
                            placeholder="Harga/Unit ($)" 
                            required 
                            value={item.harga} 
                            onChange={e => {
                              const newItems = [...restockItems];
                              newItems[idx].harga = e.target.value;
                              setRestockItemsState(newItems);
                            }} 
                          />
                        </div>

                        <div style={{ width: '90px', textAlign: 'right', fontSize: '0.85rem', fontWeight: 'bold', color: '#10b981' }}>
                          {formatCurrency(subtotal)}
                        </div>

                        <button type="button" className="btn btn-danger btn-sm" onClick={() => {
                          const newItems = [...restockItems];
                          newItems.splice(idx, 1);
                          setRestockItemsState(newItems);
                        }}>X</button>
                      </div>
                    );
                  })
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => {
                  setRestockItemsState([...restockItems, { id_bahan: '', qty: 0, harga: 0 }]);
                }}>
                  + Tambah Item Restock
                </button>
              </div>

              <button type="submit" className="btn btn-success w-100" style={{ padding: '12px', fontWeight: 'bold' }} disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan Restock...' : 'Simpan Semua Pembelian Restock'}
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
