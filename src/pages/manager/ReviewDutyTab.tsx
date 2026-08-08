import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';

export default function ReviewDutyTab() {
  const store = useAppStore();
  const [drafts, setDrafts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<any>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editWaktuMulai, setEditWaktuMulai] = useState('');
  const [editWaktuSelesai, setEditWaktuSelesai] = useState('');
  const [editTanggal, setEditTanggal] = useState('');
  const [editOmset, setEditOmset] = useState(0);
  const [editItems, setEditItems] = useState<any[]>([]);

  useEffect(() => {
    fetchDrafts();
  }, []);

  const fetchDrafts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('duty_draft')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      if (data) setDrafts(data);
    } catch (err: any) {
      alert('Gagal mengambil data draft: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const openModal = (draft: any) => {
    setSelectedDraft(draft);
    setEditWaktuMulai(draft.waktu_mulai || '');
    setEditWaktuSelesai(draft.waktu_selesai || '');
    setEditTanggal(draft.created_at ? draft.created_at.split('T')[0] : '');
    setEditOmset(Number(draft.total_omset) || 0);
    setEditItems(draft.detail_jual || []);
    setIsModalOpen(true);
  };

  const handleUpdateItemQty = (index: number, newQty: number) => {
    const updated = [...editItems];
    updated[index].qty = Number(newQty);
    setEditItems(updated);
  };

  const handleDeleteItem = (index: number) => {
    const updated = [...editItems];
    updated.splice(index, 1);
    setEditItems(updated);
  };

  const handleUpdateDraft = async () => {
    if (!selectedDraft) return;
    
    try {
      const payload = {
        waktu_mulai: editWaktuMulai,
        waktu_selesai: editWaktuSelesai,
        total_omset: editOmset,
        detail_jual: editItems,
        created_at: editTanggal ? new Date(editTanggal + 'T12:00:00Z').toISOString() : selectedDraft.created_at
      };
      
      const { error } = await supabase
        .from('duty_draft')
        .update(payload)
        .eq('id', selectedDraft.id);
        
      if (error) throw error;
      
      alert('Draft berhasil diupdate!');
      setIsModalOpen(false);
      fetchDrafts();
    } catch (err: any) {
      alert('Gagal update draft: ' + err.message);
    }
  };

  const handleGenerateJSON = (draft: any) => {
    // Generate JSON matching the format expected by AI Bulk input
    // The format in LaporanTeksTab is typically an array of objects
    // Example: [{"tanggal":"...","nama_ic":"...","waktu_mulai":"...","waktu_selesai":"...","total_omset":...,"items":[{"nama_menu":"...","qty":...}]}]
    
    // Use ISO string date prefix for basic format (YYYY-MM-DD)
    const dateStr = draft.created_at ? draft.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
    
    // Map id_menu to nama_menu
    const itemsMapped = (draft.detail_jual || []).map((i: any) => {
      const m = store.menu.find(x => x.id_menu === i.id_menu);
      return {
        nama_menu: m ? m.nama_menu : "Unknown Menu",
        qty: i.qty
      };
    });

    const jsonObj = {
      tanggal: dateStr, // You might want to let Manager input date, or default to today
      nama_ic: draft.nama_pegawai,
      waktu_mulai: draft.waktu_mulai || "",
      waktu_selesai: draft.waktu_selesai || "",
      total_omset: Number(draft.total_omset) || 0,
      items: itemsMapped
    };

    const jsonStr = JSON.stringify([jsonObj], null, 2);
    
    navigator.clipboard.writeText(jsonStr).then(() => {
      // alert removed per user request
    }).catch(err => {
      alert('Gagal menyalin JSON: ' + err);
    });
  };

  const handleMarkAsValidated = async (id: string) => {
    if (!confirm('Tandai sebagai tervalidasi? Draft ini akan disembunyikan dari daftar pending.')) return;
    
    try {
      const { error } = await supabase
        .from('duty_draft')
        .update({ status: 'validated' })
        .eq('id', id);
        
      if (error) throw error;
      fetchDrafts();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDeleteDraft = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus draft laporan ini?')) return;
    
    try {
      const { error } = await supabase
        .from('duty_draft')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      fetchDrafts();
    } catch (err: any) {
      alert('Gagal menghapus draft: ' + err.message);
    }
  };

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action mt-20" style={{ marginTop: '30px' }}>
        <h2>Review Laporan Waiter (Draft)</h2>
        <button className="btn btn-secondary" onClick={fetchDrafts} disabled={isLoading}>
          {isLoading ? 'Memuat...' : <><i className="fa-solid fa-rotate" style={{marginRight: '5px'}}></i> Refresh</>}
        </button>
      </div>

      <div className="card">
        <h3>Daftar Pending Duty</h3>
        <div className="table-responsive">
          <table id="table-draft">
            <thead>
              <tr>
                <th>Tanggal (Submit)</th>
                <th>Nama Waiter</th>
                <th>Waktu Duty</th>
                <th>Omset</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {drafts.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center' }}>Tidak ada laporan pending</td></tr>
              ) : drafts.map(d => {
                const date = new Date(d.created_at).toLocaleString('id-ID');
                return (
                  <tr key={d.id}>
                    <td>{date}</td>
                    <td><strong>{d.nama_pegawai}</strong></td>
                    <td>{d.waktu_mulai} - {d.waktu_selesai}</td>
                    <td className="text-success font-weight-bold">{formatCurrency(d.total_omset)}</td>
                    <td><span style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(252, 211, 77, 0.2)', color: '#fcd34d', fontSize: '0.85rem' }}>{d.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button className="btn btn-sm btn-primary" onClick={() => openModal(d)}>Review & Edit</button>
                        <button className="btn btn-sm btn-secondary" style={{ background: 'var(--accent-color)', color: 'var(--text-primary)', border: 'none' }} onClick={() => handleGenerateJSON(d)}>Salin JSON</button>
                        <button className="btn btn-sm btn-success" onClick={() => handleMarkAsValidated(d.id)}>Tandai Selesai</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDeleteDraft(d.id)}>Hapus</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && selectedDraft && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <span className="close-btn" onClick={() => setIsModalOpen(false)}>&times;</span>
            <h2>Review Laporan: {selectedDraft.nama_pegawai}</h2>
            
            <form onSubmit={e => { e.preventDefault(); handleUpdateDraft(); }}>
              <div className="form-group">
                <label>Tanggal Transaksi</label>
                <input type="date" required className="form-control" value={editTanggal} onChange={e => setEditTanggal(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Nama Waiter</label>
                <input type="text" className="form-control" value={selectedDraft.nama_pegawai} disabled style={{ background: 'var(--bg-dark)', cursor: 'not-allowed' }} />
              </div>

              <div style={{ display: 'flex', gap: '15px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Waktu Mulai Shift</label>
                  <input type="time" className="form-control" required value={editWaktuMulai} onChange={e => setEditWaktuMulai(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Waktu Selesai Shift</label>
                  <input type="time" className="form-control" required value={editWaktuSelesai} onChange={e => setEditWaktuSelesai(e.target.value)} />
                </div>
              </div>

              <h3 style={{ margin: '15px 0', fontSize: '1.1rem' }}>Daftar Pesanan Terjual</h3>
              <div id="duty-items-container" style={{ maxHeight: '250px', overflowY: 'auto', paddingRight: '5px', marginBottom: '15px', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '5px' }}>
                {editItems.map((ti, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                    <select className="form-control" required style={{ flex: 1, minWidth: 0 }} value={ti.id_menu} onChange={e => {
                      const newItems = [...editItems];
                      newItems[idx].id_menu = e.target.value;
                      setEditItems(newItems);
                    }}>
                      <option value="">-- Pilih Menu --</option>
                      {store.menu.map(m => (
                        <option key={m.id_menu} value={m.id_menu}>{m.nama_menu} ({formatCurrency(m.harga_jual)})</option>
                      ))}
                    </select>
                    <input type="number" className="form-control" placeholder="Qty" min="1" required style={{ width: '70px', flexShrink: 0 }} value={ti.qty || ''} onChange={e => handleUpdateItemQty(idx, Number(e.target.value))} />
                    <button type="button" className="btn btn-danger btn-sm" style={{ flexShrink: 0 }} onClick={() => handleDeleteItem(idx)}>X</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-sm btn-primary" style={{ marginBottom: '15px' }} onClick={() => {
                setEditItems([...editItems, { id_menu: '', qty: 0 }]);
              }}>+ Tambah Item Pesanan</button>

              <div className="form-group" style={{ marginTop: '10px' }}>
                <label>Total Omset ($)</label>
                <input type="number" required className="form-control" value={editOmset} onChange={e => setEditOmset(Number(e.target.value))} />
              </div>

              <button type="submit" className="btn btn-primary w-100">Simpan Perubahan</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
