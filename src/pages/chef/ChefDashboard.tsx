import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ChefDashboard() {
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

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      background: 'var(--bg-dark, #0f172a)', 
      color: 'var(--text-primary, #f8fafc)',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{
        maxWidth: '520px',
        width: '100%',
        background: 'var(--bg-card, #1e293b)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        borderRadius: '16px',
        padding: '40px 30px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(245, 158, 11, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px'
      }}>
        {/* Maintenance Icon */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'rgba(245, 158, 11, 0.15)',
          color: '#f59e0b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '36px',
          border: '2px solid rgba(245, 158, 11, 0.4)'
        }}>
          <i className="fa-solid fa-wrench"></i>
        </div>

        <div>
          <span style={{
            background: 'rgba(245, 158, 11, 0.2)',
            color: '#f59e0b',
            padding: '4px 14px',
            borderRadius: '9999px',
            fontSize: '0.8rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            display: 'inline-block',
            marginBottom: '12px'
          }}>
            Halaman Dalam Pemeliharaan
          </span>
          <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#fff' }}>
            Akses Chef Maintenance
          </h2>
        </div>

        <p style={{ margin: 0, color: 'var(--text-secondary, #94a3b8)', fontSize: '0.95rem', lineHeight: 1.6 }}>
          Halaman khusus Chef saat ini sedang dalam tahap pemeliharaan sistem & pembaruan fitur. Silakan gunakan peran <strong>Waiters</strong> atau <strong>Manager</strong> untuk aktivitas penginputan data.
        </p>

        <div style={{ width: '100%', borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))', paddingTop: '20px', marginTop: '10px' }}>
          <button 
            onClick={handleLogout} 
            className="btn btn-warning" 
            style={{ 
              width: '100%', 
              padding: '12px 20px', 
              fontSize: '1rem', 
              fontWeight: 600,
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '8px',
              borderRadius: '10px'
            }}
          >
            Ganti Peran atau Kembali ke Beranda
          </button>
        </div>
      </div>
    </div>
  );
}
