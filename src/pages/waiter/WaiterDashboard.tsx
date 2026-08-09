import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

export default function WaiterDashboard() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add('role-waiters');
    return () => {
      document.body.classList.remove('role-waiters');
    };
  }, []);

  const handleLogout = () => {
    navigate('/');
  };

  // If path is exactly /waiter, redirect to first tab
  useEffect(() => {
    if (location.pathname === '/waiter' || location.pathname === '/waiter/') {
      navigate('/waiter/kalkulator');
    }
  }, [location, navigate]);

  const activeTab = location.pathname.split('/')[2] || 'kalkulator';

  return (
    <div className="app-container">
      <div className="mobile-header">
        <h2>RestoManager</h2>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="hamburger-btn">
          <i className="fa-solid fa-bars"></i>
        </button>
      </div>

      <nav className={`sidebar ${isMobileMenuOpen ? 'show-sidebar' : ''}`}>
        <div className="logo-container">
          <h2>RestoManager</h2>
        </div>
        
        <ul className="nav-links">
          <li className={`nav-item ${activeTab === 'kalkulator' ? 'active' : ''}`} onClick={() => { setIsMobileMenuOpen(false); navigate('/waiter/kalkulator'); }}>
            <i className="fas fa-calculator" style={{ width: '25px' }}></i> Kalkulator Duty
          </li>
          <li className={`nav-item ${activeTab === 'menu' ? 'active' : ''}`} onClick={() => { setIsMobileMenuOpen(false); navigate('/waiter/menu'); }}>
            <i className="fas fa-book-open" style={{ width: '25px' }}></i> Daftar Menu
          </li>
          <li className={`nav-item ${activeTab === 'penjualan' ? 'active' : ''}`} onClick={() => { setIsMobileMenuOpen(false); navigate('/waiter/penjualan'); }}>
            <i className="fas fa-file-invoice-dollar" style={{ width: '25px' }}></i> Input Penjualan
          </li>
          <li className={`nav-item ${activeTab === 'setoran' ? 'active' : ''}`} onClick={() => { setIsMobileMenuOpen(false); navigate('/waiter/setoran'); }}>
            <i className="fas fa-hand-holding-usd" style={{ width: '25px' }}></i> Status Setoran
          </li>
          <li className={`nav-item ${activeTab === 'laporan' ? 'active' : ''}`} onClick={() => { setIsMobileMenuOpen(false); navigate('/waiter/laporan'); }}>
            <i className="fas fa-file-alt" style={{ width: '25px' }}></i> Informasi User & Laporan
          </li>
        </ul>

        <div className="sidebar-footer">
          <p>&copy; {new Date().getFullYear()} Yasin</p>
        </div>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
