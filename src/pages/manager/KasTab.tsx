import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, getJakartaDate, getWeekRange } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import ConfirmModal from '../../components/ConfirmModal';

export default function KasTab() {
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
  const [keterangan, setKeterangan] = useState('');
  const [nominal, setNominal] = useState<number | ''>('');

  // Pagination & Filter
  const [limit, setLimit] = useState<number>(5);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [kasList, setKasList] = useState<any[]>([]);

  // Global Stats
  const [globalKas, setGlobalKas] = useState<number | null>(null);
  const [globalJual, setGlobalJual] = useState<number>(0);
  const [globalPiutang, setGlobalPiutang] = useState<number>(0);
  const [globalBeli, setGlobalBeli] = useState<number>(0);
  const [globalGaji, setGlobalGaji] = useState<number>(0);
  const [globalKasTambahan, setGlobalKasTambahan] = useState<number>(0);

  useEffect(() => {
    calculateGlobalCashflow();
  }, []);

  useEffect(() => {
    fetchData();
  }, [limit, currentPage]);

  async function calculateGlobalCashflow() {
    try {
        const { data, error } = await supabase.rpc('get_global_financial_raw');
        if (!error && data) {
            const totalPendapatan = parseFloat(data.total_pendapatan) || 0;
            const totalPiutang = parseFloat(data.total_piutang) || 0;
            const totalPengeluaran = parseFloat(data.total_pengeluaran) || 0;
            const totalKasTambahan = parseFloat(data.total_kas_tambahan) || 0;
            const totalGaji = parseFloat(data.total_gaji) || 0;

            const gKas = totalKasTambahan + totalPendapatan - totalPengeluaran - totalGaji;
            setGlobalKas(gKas);
            setGlobalJual(totalPendapatan + totalPiutang);
            setGlobalPiutang(totalPiutang);
            setGlobalBeli(totalPengeluaran);
            setGlobalGaji(totalGaji);
            setGlobalKasTambahan(totalKasTambahan);
        }
    } catch(e) {
        console.error('calculateGlobalCashflow error:', e);
    }
  }

  async function fetchData() {
    let query = supabase.from('kas_tambahan').select('*').order('tanggal', { ascending: false });

    if (limit !== 1000) {
      query = query.range((currentPage - 1) * limit, currentPage * limit - 1);
    }
    
    const { data } = await query;
    if (data) setKasList(data);
  }

  const handleOpenModal = () => {
    setTanggal(getJakartaDate());
    setKeterangan('');
    setNominal('');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nominal) return;
    setIsSubmitting(true);
    try {
      const payload = {
        tanggal: tanggal,
        keterangan: keterangan,
        nominal: Number(nominal)
      };

      await supabase.from('kas_tambahan').insert([payload]);
      
      setModalOpen(false);
      fetchData();
      calculateGlobalCashflow();
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Hapus Kas Tambahan',
      message: 'Yakin ingin menghapus catatan kas tambahan ini?',
      onConfirm: () => executeDelete(id)
    });
  };

  const executeDelete = async (id: string) => {
    try {
      setIsDeleting(true);
      // Optimistic local update
      setKasList(prev => prev.filter(d => d.id_kas !== id));
      
      const { error } = await supabase.from('kas_tambahan').delete().eq('id_kas', id);
      if (error) {
        console.error("Gagal menghapus kas tambahan:", error);
        alert("Gagal menghapus kas tambahan: " + error.message);
      }
      
      await store.fetchData();
      await fetchData();
      calculateGlobalCashflow();
    } catch (err: any) {
      console.error("Error menghapus kas tambahan:", err);
      alert("Error menghapus kas tambahan: " + err.message);
    } finally {
      setIsDeleting(false);
      setConfirmModal(prev => ({ ...prev, isOpen: false }));
    }
  };

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action">
        <h1>Informasi Uang Kas Restoran</h1>
      </div>

      <div className="card"
          style={{ background: 'linear-gradient(135deg, #2d3748, #4a5568)', color: 'white', marginBottom: '20px', padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.2em', color: '#cbd5e0' }}>Saldo Kas Resto Saat Ini</h2>
          <div style={{ fontSize: '2.5em', fontWeight: 'bold', margin: '10px 0', color: globalKas && globalKas < 0 ? '#fc8181' : '#48bb78' }}>
            {globalKas === null ? 'Memuat...' : formatCurrency(globalKas)}
          </div>
          <p style={{ margin: 0, fontSize: '0.9em', color: '#a0aec0' }}>Akumulasi bersih dari seluruh aktivitas operasional.</p>
      </div>

      <div className="stats-grid">
          <div className="stat-card">
              <h3>Total Penjualan (Kotor)</h3>
              <div className="stat-value text-primary">{formatCurrency(globalJual)}</div>
              <p style={{ fontSize: '0.8em', color: '#718096', marginTop: '5px' }}>Semua pendapatan dari duty.</p>
          </div>
          <div className="stat-card" style={{ border: '1px solid var(--warning-color)' }}>
              <h3>Piutang Penjualan (Belum Setor)</h3>
              <div className="stat-value text-warning">{formatCurrency(globalPiutang)}</div>
              <p style={{ fontSize: '0.8em', color: '#718096', marginTop: '5px' }}>Omset duty yang belum disetor oleh Waiter.</p>
          </div>
          <div className="stat-card">
              <h3>Total Pembelian Bahan</h3>
              <div className="stat-value text-danger">{formatCurrency(globalBeli)}</div>
              <p style={{ fontSize: '0.8em', color: '#718096', marginTop: '5px' }}>Total biaya restock bahan mentah.</p>
          </div>
          <div className="stat-card">
              <h3>Total Gaji & Komisi</h3>
              <div className="stat-value text-danger">{formatCurrency(globalGaji)}</div>
              <p style={{ fontSize: '0.8em', color: '#718096', marginTop: '5px' }}>Total gaji dibayarkan.</p>
          </div>
          <div className="stat-card">
              <h3>Total Kas Tambahan</h3>
              <div className="stat-value text-success">{formatCurrency(globalKasTambahan)}</div>
              <p style={{ fontSize: '0.8em', color: '#718096', marginTop: '5px' }}>Penyesuaian Kas.</p>
          </div>
      </div>

      <div className="header-action" style={{ marginTop: '30px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
          <h2>Riwayat Kas Tambahan / Penyesuaian</h2>
          <button className="btn btn-primary" onClick={handleOpenModal}>+ Tambah Kas Masuk</button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3>Riwayat Penyesuaian Kas</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label style={{ fontSize: '0.9rem', margin: 0 }}>Tampilkan:</label>
            <select className="form-control" style={{ width: 'auto', padding: '5px' }} value={limit} onChange={e => { setLimit(Number(e.target.value)); setCurrentPage(1); }}>
              <option value="5">5 baris</option>
              <option value="10">10 baris</option>
              <option value="1000">Semuanya</option>
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table id="table-kas-tambahan">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Keterangan</th>
                <th>Nominal ($)</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {kasList.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center' }}>Belum ada riwayat kas tambahan</td></tr>
              ) : kasList.map((k) => {
                const wr = getWeekRange(k.tanggal);
                const isClosed = wr ? store.periode_ditutup.includes(wr.key) : false;
                return (
                  <tr key={k.id_kas}>
                    <td>{k.tanggal}</td>
                    <td>{k.keterangan}</td>
                    <td className={`${k.nominal < 0 ? 'text-danger' : 'text-success'} font-weight-bold`}>
                      {k.nominal < 0 ? '-' : '+'} {formatCurrency(Math.abs(k.nominal))}
                    </td>
                    <td>
                      <button className={`btn btn-sm ${isClosed ? 'btn-secondary' : 'btn-danger'}`} disabled={isClosed} onClick={() => handleDelete(k.id_kas)}>Hapus</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-sm btn-secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(c => c - 1)}>Prev</button>
            <span>Halaman {currentPage}</span>
            <button className="btn btn-sm btn-secondary" disabled={kasList.length < limit && limit !== 1000} onClick={() => setCurrentPage(c => c + 1)}>Next</button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <span className="close-btn" onClick={() => setModalOpen(false)}>&times;</span>
            <h2>Input Kas Tambahan (Masuk/Keluar)</h2>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Tanggal Transaksi</label>
                <input type="date" required value={tanggal} onChange={e => setTanggal(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Keterangan Transaksi</label>
                <input type="text" placeholder="Contoh: Modal Awal dari Bos" required value={keterangan} onChange={e => setKeterangan(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Nominal (Gunakan minus '-' untuk pengeluaran)</label>
                <input type="number" step="0.01" required placeholder="Contoh: 100.00 (masuk) atau -50.00 (keluar)" value={nominal} onChange={e => setNominal(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <button type="submit" className="btn btn-warning w-100" disabled={isSubmitting}>Simpan Kas Transaksi</button>
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
