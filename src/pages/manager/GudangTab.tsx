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
  const [bahanJadiList, setBahanJadiList] = useState<any[]>([]);
  const [globalStok, setGlobalStok] = useState<Record<string, number>>({});
  const [globalStokMakanan, setGlobalStokMakanan] = useState<Record<string, number>>({});
  
  const [restockList, setRestockList] = useState<any[]>([]);
  const [activeWeeks, setActiveWeeks] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>('all');
  const [limit, setLimit] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  
  const [modalBahanOpen, setModalBahanOpen] = useState(false);
  const [modalRestockOpen, setModalRestockOpen] = useState(false);
  
  const [formDataBahan, setFormDataBahan] = useState({ id_bahan: '', nama_bahan: '', harga_per_unit: 0, satuan: 'pcs' });
  
  // Form State Restock Massal
  const [restockTanggal, setRestockTanggal] = useState(getJakartaDate());
  const [restockPembeli, setRestockPembeli] = useState('');
  const [restockItems, setRestockItemsState] = useState<{ id_item: string, tipe_item: 'Bahan' | 'Makanan', qty: number | string, harga: number | string }[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchStok();
  }, [store.pengeluaran, store.transfer_item]);

  useEffect(() => {
    const sorted = [...store.bahan].sort((a, b) => (parseFloat(a.harga_per_unit) || 0) - (parseFloat(b.harga_per_unit) || 0));
    setBahanList(sorted);

    const menuSatuan = store.menu.filter(m => (m.tipe_menu || '').toLowerCase().includes('satuan'));
    setBahanJadiList(menuSatuan);
  }, [store.bahan, store.menu]);

  useEffect(() => {
    fetchWeeks();
  }, [store.pengeluaran]);

  useEffect(() => {
    fetchRestock();
  }, [selectedWeek, limit, currentPage, store.pengeluaran]);

  async function fetchStok() {
    try {
      const { data: dataBahan } = await supabase.rpc('get_stock_bahan_pegawai');
      if (dataBahan) {
        const mapBahan: Record<string, number> = {};
        dataBahan.forEach((s: any) => {
          if (s.nama_ic !== 'Sistem Koreksi') {
            mapBahan[s.id_bahan] = (mapBahan[s.id_bahan] || 0) + parseFloat(s.qty);
          }
        });
        setGlobalStok(mapBahan);
      }

      const { data: dataMakanan } = await supabase.rpc('get_stock_makanan_pegawai');
      if (dataMakanan) {
        const mapMakanan: Record<string, number> = {};
        dataMakanan.forEach((s: any) => {
          if (s.nama_ic !== 'Sistem Koreksi') {
            mapMakanan[s.id_menu] = (mapMakanan[s.id_menu] || 0) + parseFloat(s.qty);
          }
        });
        setGlobalStokMakanan(mapMakanan);
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

  // Muat semua bahan mentah ke form restock
  const handleAutoLoadAllRestockItems = () => {
    const items: { id_item: string, tipe_item: 'Bahan' | 'Makanan', qty: number | string, harga: number | string }[] = store.bahan.map(b => ({
      id_item: b.id_bahan,
      tipe_item: 'Bahan',
      qty: 0,
      harga: b.harga_per_unit || 0
    }));
    setRestockItemsState(items);
  };

  // Simpan transaksi batch restock
  const handleSaveRestockBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockPembeli) {
      alert("Silakan pilih Nama Pembeli IC Pegawai");
      return;
    }
    if (restockItems.length === 0) {
      alert("Silakan tambahkan minimal 1 item untuk direstock");
      return;
    }

    const validItems = restockItems.filter(i => i.id_item && (parseFloat(String(i.qty)) || 0) > 0);

    if (validItems.length === 0) {
      alert("Masukkan jumlah Qty lebih dari 0 pada minimal 1 item");
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
          id_bahan: item.id_item,
          tipe_item: item.tipe_item || 'Bahan',
          jumlah_unit: qtyNum,
          harga_aktual_per_unit: hargaNum,
          total_biaya: qtyNum * hargaNum
        };
      });

      await supabase.from('pengeluaran').insert(payloads);
      await supabase.rpc('recalculate_all_menu_hpp');
      alert(`Berhasil menyimpan ${payloads.length} transaksi pembelian restock`);
      
      setModalRestockOpen(false);
      setRestockItemsState([]);
      await store.fetchData();
      await fetchRestock();
      await fetchStok();
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

  // Fungsi pembantu mengambil nama item bahan atau makanan
  const getItemName = (idItem: string, tipeItem?: string) => {
    if (tipeItem === 'Makanan') {
      const m = store.menu.find(x => x.id_menu === idItem);
      return m ? m.nama_menu : (idItem || 'Bahan Jadi');
    } else {
      const b = store.bahan.find(x => x.id_bahan === idItem);
      return b ? b.nama_bahan : (idItem || 'Bahan Mentah');
    }
  };

  const isChef = document.body.classList.contains('role-chef');

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action">
        <h1>Restock dan Data Gudang Restoran</h1>
        <div>
          {!isChef && (
            <button className="btn btn-primary" onClick={() => {
              setFormDataBahan({ id_bahan: '', nama_bahan: '', harga_per_unit: 0, satuan: 'pcs' });
              setModalBahanOpen(true);
            }}>Tambah Bahan Master</button>
          )}
        </div>
      </div>

      {/* Tabel 1: Master Bahan Mentah */}
      <div className="card mb-20">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0 }}>Daftar Bahan Mentah dan Stok Global</h3>
        </div>
        <div className="table-responsive">
          <table id="table-bahan">
            <thead>
              <tr>
                <th>Nama Bahan</th>
                <th>Harga Patokan Modal per Unit</th>
                <th>Satuan</th>
                <th>Stok Tersedia</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {bahanList.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center' }}>Belum ada bahan mentah</td></tr>
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

      {/* Tabel 2: Master Bahan Jadi Khusus Restock */}
      <div className="card mb-20">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0 }}>Daftar Bahan Jadi</h3>
        </div>
        <div className="table-responsive">
          <table id="table-bahan-jadi">
            <thead>
              <tr>
                <th>Nama Menu Jadi</th>
                <th>Harga Jual</th>
                <th>HPP Modal Terakhir</th>
                <th>Stok Global Tersedia</th>
              </tr>
            </thead>
            <tbody>
              {bahanJadiList.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center' }}>Belum ada bahan jadi</td></tr>
              ) : bahanJadiList.map(m => {
                const stokMkn = globalStokMakanan[m.id_menu] || 0;
                return (
                  <tr key={m.id_menu}>
                    <td className="font-weight-bold">{m.nama_menu}</td>
                    <td>{formatCurrency(m.harga_jual)}</td>
                    <td>{formatCurrency(m.hpp_terakhir || 0)}</td>
                    <td className={stokMkn <= 0 ? "text-danger font-weight-bold" : "text-success font-weight-bold"}>
                      {stokMkn.toFixed(0)} Porsi
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabel 3: Riwayat Restock Pembelian */}
      <div className="header-action mt-20" style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ display: 'inline-block', margin: 0 }}>Log Pembelian Restock Pembelian</h2>
        </div>
        {!isChef && (
          <button className="btn btn-success" style={{ fontWeight: 'bold', padding: '10px 20px' }} onClick={() => {
            setRestockTanggal(getJakartaDate());
            setRestockPembeli('');
            setRestockItemsState([]);
            setModalRestockOpen(true);
          }}>Input Restock Pembelian</button>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ display: 'inline-block', margin: 0 }}>Riwayat Belanja Restock</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label style={{ fontSize: '0.9rem', margin: 0 }}>Filter Minggu:</label>
            <select className="form-control" style={{ width: 'auto' }} value={selectedWeek} onChange={e => { setSelectedWeek(e.target.value); setCurrentPage(1); }}>
              <option value="all">Semua Minggu Semua Data</option>
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
                <th>Tipe Item</th>
                <th>Nama Item</th>
                <th>Jumlah Qty</th>
                <th>Harga Aktual per Unit</th>
                <th>Total Biaya</th>
                <th>Pembeli</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {restockList.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center' }}>Belum ada log pembelian restock</td></tr>
              ) : restockList.map(d => {
                const tipeItem = d.tipe_item === 'Makanan' ? 'Bahan Jadi' : 'Bahan Mentah';
                const namaItem = getItemName(d.id_bahan, d.tipe_item);
                const wr = getWeekRange(d.tanggal);
                const isClosed = wr ? store.periode_ditutup.includes(wr.key) : false;
                
                return (
                  <tr key={d.id_pengeluaran}>
                    <td>{d.tanggal}</td>
                    <td><span className={`badge ${d.tipe_item === 'Makanan' ? 'badge-info' : 'badge-secondary'}`}>{tipeItem}</span></td>
                    <td className="font-weight-bold">{namaItem}</td>
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
                <label>Harga Patokan Modal per Unit</label>
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

      {/* Modal Batch Restock Pembelian */}
      {modalRestockOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content" style={{ maxWidth: '750px', width: '90%' }}>
            <span className="close-btn" onClick={() => setModalRestockOpen(false)}>&times;</span>
            <h2 style={{ marginTop: 0 }}>Input Pembelian Restock Massal</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
              Masukkan daftar pembelian restock bahan mentah atau bahan jadi sekaligus
            </p>

            <form onSubmit={handleSaveRestockBatch}>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontWeight: 'bold' }}>Tanggal Pembelian</label>
                  <input type="date" className="form-control" required value={restockTanggal} onChange={e => setRestockTanggal(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontWeight: 'bold' }}>Nama Pembeli IC Pegawai</label>
                  <select className="form-control" required value={restockPembeli} onChange={e => setRestockPembeli(e.target.value)}>
                    <option value="">Pilih Pembeli</option>
                    {store.pegawai.filter(p => p.status_kontrak === 'Aktif').map(p => (
                      <option key={p.nama_ic} value={p.nama_ic}>{p.nama_ic} - {p.jabatan}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tombol aksi cepat */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px' }}>
                <button type="button" className="btn btn-sm btn-info" onClick={handleAutoLoadAllRestockItems}>
                  Muat Semua Bahan Mentah
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Total item: {restockItems.length}
                </span>
              </div>

              {/* Daftar item restock */}
              <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '15px' }}>
                {restockItems.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                    Belum ada item ditambahkan. Klik Tambah Item Restock di bawah.
                  </div>
                ) : (
                  restockItems.map((item, idx) => {
                    const qtyNum = parseFloat(String(item.qty)) || 0;
                    const hargaNum = parseFloat(String(item.harga)) || 0;
                    const subtotal = qtyNum * hargaNum;

                    return (
                      <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px', background: 'var(--bg-card)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        
                        <select className="form-control" style={{ flex: 3 }} required value={item.id_item ? `${item.tipe_item}_${item.id_item}` : ''} onChange={e => {
                          const val = e.target.value;
                          if (!val) return;
                          const [t, id] = val.split('_');
                          const newItems = [...restockItems];
                          newItems[idx].tipe_item = t as 'Bahan' | 'Makanan';
                          newItems[idx].id_item = id;

                          if (t === 'Makanan') {
                            const mObj = store.menu.find(x => x.id_menu === id);
                            if (mObj) newItems[idx].harga = mObj.hpp_terakhir || mObj.harga_jual || 0;
                          } else {
                            const bObj = store.bahan.find(x => x.id_bahan === id);
                            if (bObj) newItems[idx].harga = bObj.harga_per_unit || 0;
                          }
                          setRestockItemsState(newItems);
                        }}>
                          <option value="">Pilih Item Restock</option>
                          <optgroup label="Bahan Mentah Perlu Dimasak">
                            {store.bahan.map(b => (
                              <option key={`Bahan_${b.id_bahan}`} value={`Bahan_${b.id_bahan}`}>Bahan Mentah: {b.nama_bahan}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Bahan Jadi Langsung Siap Jual">
                            {bahanJadiList.map(m => (
                              <option key={`Makanan_${m.id_menu}`} value={`Makanan_${m.id_menu}`}>Bahan Jadi: {m.nama_menu}</option>
                            ))}
                          </optgroup>
                        </select>

                        <div style={{ flex: 1 }}>
                          <input 
                            type="number" 
                            min="0" 
                            step="0.01" 
                            className="form-control" 
                            placeholder="Jumlah Qty" 
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
                            placeholder="Harga Modal per Unit" 
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
                  setRestockItemsState([...restockItems, { id_item: '', tipe_item: 'Bahan', qty: 0, harga: 0 }]);
                }}>
                  Tambah Item Restock
                </button>
              </div>

              <button type="submit" className="btn btn-success w-100" style={{ padding: '12px', fontWeight: 'bold' }} disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan Restock...' : 'Simpan Semua Pembelian Restock'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
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
