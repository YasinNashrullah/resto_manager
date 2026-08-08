import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getWeekRange } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';

export default function ManagerLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.remove('role-waiters', 'role-chef');
  }, []);

  const handleLogout = () => {
    // sessionStorage.removeItem('auth_manager');
    navigate('/');
  };

  const store = useAppStore();
  const [modalTutupBukuOpen, setModalTutupBukuOpen] = useState(false);
  const [isSubmittingTutupBuku, setIsSubmittingTutupBuku] = useState(false);
  const [periodeOptions, setPeriodeOptions] = useState<string[]>([]);
  const [selectedPeriodeTutupBuku, setSelectedPeriodeTutupBuku] = useState('');

  const openTutupBuku = async () => {
    setModalTutupBukuOpen(true);
    setPeriodeOptions([]);
    setSelectedPeriodeTutupBuku('');
    try {
        const { data: activeDates, error: errDates } = await supabase.rpc('get_active_dates');
        if (!errDates && activeDates && activeDates.length > 0) {
            const weeks = new Set<string>();
            activeDates.forEach((r: any) => {
                if (r.tanggal) {
                    const wr = getWeekRange(r.tanggal);
                    if (wr) weeks.add(wr.key);
                }
            });
            const explicitlyClosedWeeks = new Set(store.periode_ditutup);
            const options: string[] = [];
            Array.from(weeks).sort().reverse().forEach(weekKey => {
                if (!explicitlyClosedWeeks.has(weekKey)) {
                    options.push(weekKey);
                }
            });
            setPeriodeOptions(options);
        }
    } catch (e) {
        console.error(e);
    }
  };

  const handleTutupBuku = async () => {
    if (!selectedPeriodeTutupBuku) return;
    setIsSubmittingTutupBuku(true);
    try {
        const { data, error } = await supabase.rpc('tutup_buku_mingguan', { p_week_key: selectedPeriodeTutupBuku });
        if (error) throw error;
        alert(`Tutup buku berhasil! Periode: ${data.periode_ditutup}`);
        setModalTutupBukuOpen(false);
        // refresh
        const pd = await supabase.from('periode_ditutup').select('week_key');
        if (pd.data) store.setPeriodeDitutup(pd.data.map(r => r.week_key));
    } catch (e: any) {
        alert('Gagal tutup buku: ' + e.message);
    } finally {
        setIsSubmittingTutupBuku(false);
    }
  };

  const menuItems = [
    { path: '/manager/dashboard', label: 'Dashboard Utama' },
    { path: '/manager/analisis-pegawai', label: 'Analisis Pegawai' },
    { path: '/manager/review-duty', label: 'Review Duty (Draft)' },
    { path: '/manager/pegawai', label: 'Data Pegawai' },
    { path: '/manager/gudang', label: 'Restock Bahan' },
    { path: '/manager/menu', label: 'Menu & Resep' },
    { path: '/manager/penjualan', label: 'Laporan Penjualan' },
    { path: '/manager/setoran', label: 'Status Setoran' },
    { path: '/manager/bahan', label: 'Data Bahan' },
    { path: '/manager/laporan-chef', label: 'Laporan Chef' },
    { path: '/manager/data-chef', label: 'Data Chef' },
    { path: '/manager/keuangan', label: 'Laporan Mingguan (Gaji)' },
    { path: '/manager/staff-meal', label: 'Konsumsi Pegawai' },
    { path: '/manager/kas', label: 'Kas Restoran' },
    { path: '/manager/laporan-teks', label: 'Laporan Teks' },
    { path: '/manager/ai', label: 'AI Bulk Input', icon: 'fa-solid fa-robot', highlight: true },
  ];

  return (
    <div className="app-container">
      {/* Mobile Header */}
      <div className="mobile-header">
        <h2>RestoManager</h2>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="hamburger-btn">
          <i className="fa-solid fa-bars"></i>
        </button>
      </div>

      {/* Sidebar */}
      <nav className={`sidebar ${isMobileMenuOpen ? 'show-sidebar' : ''}`}>
        <div className="logo-container">
          <h2>RestoManager</h2>
        </div>
        
        <ul className="nav-links">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/manager' && location.pathname.startsWith(item.path));
            return (
              <li 
                key={item.path} 
                className={`nav-item ${isActive ? 'active' : ''} ${item.highlight ? 'highlight' : ''}`}
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  navigate(item.path);
                }}
                style={item.highlight ? { backgroundColor: 'rgba(66, 153, 225, 0.2)', borderLeft: '3px solid #4299e1', color: '#2d3748', fontWeight: 600 } : undefined}
              >
                {item.icon && <i className={item.icon} style={{ marginRight: '8px' }}></i>}
                {item.label}
              </li>
            );
          })}
        </ul>

        <div className="sidebar-footer">
          <p>&copy; {new Date().getFullYear()} Yasin</p>
          <button onClick={openTutupBuku} className="btn btn-warning w-100">
            <i className="fa-solid fa-box-archive" style={{ marginRight: '8px' }}></i> Tutup Buku Minggu Ini
          </button>
          <button onClick={handleLogout} className="btn btn-secondary w-100 mt-2">
            <i className="fa-solid fa-door-open" style={{ marginRight: '8px' }}></i> Keluar (Logout)
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main-content">
        <Outlet />
      </main>

      {/* Modal Tutup Buku */}
      {modalTutupBukuOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <span className="close-btn" onClick={() => setModalTutupBukuOpen(false)}>&times;</span>
            <h2>Tutup Buku Mingguan</h2>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '15px' }}>
              Fitur ini akan mengunci/membekukan (freeze) semua data yang berkaitan dengan 
              periode tersebut, sehingga TIDAK BISA lagi diedit atau dihapus.
            </p>
            <div className="form-group">
              <label>Pilih Periode yang akan Ditutup</label>
              <select className="form-control" value={selectedPeriodeTutupBuku} onChange={e => setSelectedPeriodeTutupBuku(e.target.value)}>
                <option value="">-- Pilih Periode --</option>
                {periodeOptions.map(p => (
                    <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            {periodeOptions.length === 0 && <p style={{ color: 'red', fontSize: '0.85rem' }}>Tidak ada periode yang belum ditutup buku.</p>}
            <button className="btn btn-warning w-100" style={{ marginTop: '15px' }} onClick={handleTutupBuku} disabled={!selectedPeriodeTutupBuku || isSubmittingTutupBuku}>
                {isSubmittingTutupBuku ? 'Memproses...' : 'Tutup Buku Periode Ini'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
