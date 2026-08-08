import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';
import { getJakartaDate, getWeekRange } from '../../lib/utils';

export default function LaporanChefTab() {
  const store = useAppStore();
  
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [tanggal, setTanggal] = useState('');
  const [namaChef, setNamaChef] = useState('');
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

  const handleAutoLoadAllMakanan = () => {
    const allSatuan = store.menu.filter(m => m.tipe_menu === 'Satuan').map(m => ({
      id_menu: m.id_menu,
      qty: ''
    }));
    setItems(allSatuan);
  };

  const handleAutoLoadCookableFromBahan = async () => {
    if (!namaChef) {
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
            if (s.nama_ic === namaChef) {
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
        const { data: transfers } = await supabase.from('transfer_item').select('*').eq('tipe_item', 'Bahan').eq('ke_ic', namaChef);
        (transfers || []).forEach((t: any) => {
          const bId = t.id_item;
          const qty = parseFloat(t.qty) || 0;
          chefBahanStok[bId] = (chefBahanStok[bId] || 0) + qty;
        });

        const { data: pengeluaran } = await supabase.from('pengeluaran').select('*').eq('nama_pembeli', namaChef);
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

      setItems(autoItems);

      const totalAutoPorsi = autoItems.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0);
      alert(`Berhasil menghitung stok bahan milik Chef "${namaChef}"!\n` +
            `Total masakan yang otomatis terisi porsinya: ${totalAutoPorsi} porsi.`);
    } catch (err: any) {
      alert("Error menghitung porsi: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaChef) {
      alert("Silakan pilih Dimasak Oleh (Chef).");
      return;
    }

    const validItems = items.filter(i => i.id_menu && (parseFloat(String(i.qty)) || 0) > 0);

    if (validItems.length === 0) {
      alert("Masukkan jumlah porsi (Qty > 0) pada minimal 1 masakan.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payloads = validItems.map(item => ({
        tanggal,
        nama_ic_chef: namaChef,
        id_menu: item.id_menu,
        qty: parseFloat(String(item.qty)) || 0
      }));

      await supabase.from('produksi_chef').insert(payloads);
      alert(`Berhasil menyimpan ${payloads.length} masakan chef!`);
      
      setModalOpen(false);
      setItems([]);
      fetchData();
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Yakin ingin menghapus laporan masakan ini? Stok makanan akan otomatis berkurang.")) {
      await supabase.from('produksi_chef').delete().eq('id_produksi', id);
      fetchData();
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
          setNamaChef('');
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
                <th>Tanggal</th>
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
                
                return (
                  <tr key={d.id_produksi}>
                    <td>{d.tanggal}</td>
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
          <div className="modal-content" style={{ maxWidth: '680px', width: '90%' }}>
            <span className="close-btn" onClick={() => setModalOpen(false)}>&times;</span>
            <h2 style={{ marginTop: 0 }}>Input Laporan Produksi Masakan Chef</h2>
            <form onSubmit={handleSave}>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontWeight: 'bold' }}>Tanggal Masak</label>
                  <input type="date" className="form-control" required value={tanggal} onChange={e => setTanggal(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ fontWeight: 'bold' }}>Dimasak Oleh (Chef)</label>
                  <select className="form-control" required value={namaChef} onChange={e => setNamaChef(e.target.value)}>
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
                    Pilih Chef lalu klik <strong>"🔥 Masak Maksimal dari Stok Bahan Chef"</strong> di atas.
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

              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => {
                  setItems([...items, { id_menu: '', qty: 0 }]);
                }}>
                  + Tambah Item Masakan
                </button>
              </div>

              <button type="submit" className="btn btn-primary w-100" style={{ padding: '12px', fontWeight: 'bold' }} disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan Laporan...' : 'Simpan Laporan Chef'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
