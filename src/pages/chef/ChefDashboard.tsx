import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

export default function ChefDashboard() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    document.body.classList.add('role-chef');
    return () => {
      document.body.classList.remove('role-chef');
    };
  }, []);

  const handleLogout = () => {
    navigate('/');
  };

  const menuItems = [
    { path: '/chef/gudang', label: 'Data Bahan Mentah (Stok)' },
    { path: '/chef/laporan-chef', label: 'Laporan Chef' },
    { path: '/chef/data-chef', label: 'Data Chef & Transfer' },
    { path: '/chef/setoran', label: 'Status Setoran (Read Only)' }
  ];

  // If path is exactly /chef, redirect to first tab
  useEffect(() => {
    if (location.pathname === '/chef' || location.pathname === '/chef/') {
      navigate('/chef/gudang');
    }
  }, [location, navigate]);

  useEffect(() => {
    document.body.classList.add('role-chef');
    return () => {
      document.body.classList.remove('role-chef');
    };
  }, []);

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
          <h2>RestoManager (Chef)</h2>
        </div>
        
        <ul className="nav-links">
          {menuItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <li 
                key={item.path} 
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  navigate(item.path);
                }}
              >
                {item.label}
              </li>
            );
          })}
        </ul>

        <div className="sidebar-footer">
          <p>&copy; {new Date().getFullYear()} Yasin</p>
          <button onClick={handleLogout} className="btn btn-secondary w-100 mt-20" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
            <i className="fa-solid fa-door-open"></i> Ganti Peran
          </button>
        </div>
      </nav>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
