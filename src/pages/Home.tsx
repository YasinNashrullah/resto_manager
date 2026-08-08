import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

export default function Home() {
  const navigate = useNavigate();
  const [modalPinOpen, setModalPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Waiter modal states
  const [modalWaiterOpen, setModalWaiterOpen] = useState(false);
  const { pegawai } = useAppStore();

  useEffect(() => {
    document.body.classList.remove('role-waiters', 'role-chef');
  }, []);

  const handleManagerLogin = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('verify_manager_pin', { input_pin: pin });
      if (error) throw error;
      
      if (data === true) {
        navigate('/manager');
      } else {
        alert('PIN Salah! Akses ditolak.');
        setPin('');
      }
    } catch (err: any) {
      console.error(err);
      alert('Terjadi kesalahan saat memverifikasi PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleWaiterLogin = (nama: string) => {
    sessionStorage.setItem('active_waiter_name', nama);
    navigate('/waiter');
  };

  return (
    <>
      <style>{`
        body {
            margin: 0;
            padding: 0;
            font-family: 'Inter', sans-serif;
            background: var(--bg-dark);
        }
        .home-container {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
        }
        .login-box {
            background: var(--bg-card);
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 400px;
            width: 90%;
        }
        .login-box h1 {
            color: var(--text-primary);
            margin-top: 0;
            margin-bottom: 10px;
            font-size: 1.8rem;
        }
        .login-box p {
            color: var(--text-secondary);
            margin-bottom: 30px;
        }
        .btn-role {
            display: block;
            width: 100%;
            padding: 15px;
            margin-bottom: 15px;
            font-size: 1.1rem;
            font-weight: 600;
            color: white;
            background: #4299e1;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.2s ease;
            box-sizing: border-box;
        }
        .btn-role:hover {
            background: #3182ce;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(66, 153, 225, 0.3);
        }
        .btn-chef {
            background: #ed8936;
        }
        .btn-chef:hover {
            background: #dd6b20;
            box-shadow: 0 4px 12px rgba(237, 137, 54, 0.3);
        }
        .btn-manager {
            background: #48bb78;
        }
        .btn-manager:hover {
            background: #38a169;
            box-shadow: 0 4px 12px rgba(72, 187, 120, 0.3);
        }
        .footer {
            margin-top: 30px;
            font-size: 0.8rem;
            color: #cbd5e0;
        }
      `}</style>
    <div className="home-container">
      <div className="login-box">
        <h1>Resto HPPNS</h1>
        <p>Silakan pilih peran Anda untuk masuk ke dashboard.</p>
        
        <button onClick={() => setModalWaiterOpen(true)} className="btn-role">
          Masuk sebagai Waiter
        </button>

        <button onClick={() => navigate('/chef')} className="btn-role btn-chef">
          Masuk sebagai Chef
        </button>

        <button onClick={() => setModalPinOpen(true)} className="btn-role btn-manager">
          Masuk sebagai Manager
        </button>
        
        <div className="footer">
          &copy; 2026 by Yasin
        </div>
      </div>

      {modalPinOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={(e) => {
          if (e.target === e.currentTarget) setModalPinOpen(false);
        }}>
          <div style={{
            background: 'var(--bg-card)', padding: '30px', borderRadius: '10px', width: '90%', maxWidth: '350px',
            textAlign: 'left', position: 'relative', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', animation: 'fadeIn 0.2s ease-in-out'
          }}>
            <span 
              onClick={() => setModalPinOpen(false)} 
              style={{ position: 'absolute', top: '15px', right: '20px', fontSize: '1.5rem', cursor: 'pointer', color: '#a0aec0' }}
              onMouseOver={(e) => e.currentTarget.style.color = '#4a5568'}
              onMouseOut={(e) => e.currentTarget.style.color = '#a0aec0'}
            >
              &times;
            </span>
            <h2 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Masukan PIN</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.9rem' }}>Masukkan PIN untuk mengakses halaman ini.</p>
            <input 
              type="password" 
              placeholder="Masukkan PIN..." 
              style={{ width: '100%', padding: '12px', marginBottom: '20px', border: '1px solid var(--border-color)', borderRadius: '6px', boxSizing: 'border-box', fontSize: '1rem', background: 'var(--bg-dark)', color: 'var(--text-primary)' }}
              value={pin}
              onChange={e => setPin(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleManagerLogin()}
              autoFocus
            />
            <button 
              onClick={handleManagerLogin}
              disabled={isLoading}
              style={{ width: '100%', padding: '12px', background: '#48bb78', color: 'white', border: 'none', borderRadius: '6px', fontSize: '1rem', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {isLoading ? 'Memeriksa...' : 'Masuk'}
            </button>
          </div>
        </div>
      )}

      {/* Waiter Name Selection Modal */}
      {modalWaiterOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={(e) => {
          if (e.target === e.currentTarget) setModalWaiterOpen(false);
        }}>
          <div style={{
            background: 'var(--bg-card)', padding: '30px', borderRadius: '10px', width: '90%', maxWidth: '350px',
            textAlign: 'left', position: 'relative', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', animation: 'fadeIn 0.2s ease-in-out'
          }}>
            <span 
              onClick={() => setModalWaiterOpen(false)} 
              style={{ position: 'absolute', top: '15px', right: '20px', fontSize: '1.5rem', cursor: 'pointer', color: '#a0aec0' }}
              onMouseOver={(e) => e.currentTarget.style.color = '#4a5568'}
              onMouseOut={(e) => e.currentTarget.style.color = '#a0aec0'}
            >
              &times;
            </span>
            <h2 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Pilih Nama Pegawai</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.9rem' }}>Silakan pilih nama Anda (Waiter) untuk melanjutkan.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
              {pegawai && pegawai.length > 0 ? (
                pegawai.filter(p => (p.jabatan === 'Waiter' || p.jabatan === 'Waiters') && p.status_kontrak === 'Aktif').length > 0 ? (
                  pegawai.filter(p => (p.jabatan === 'Waiter' || p.jabatan === 'Waiters') && p.status_kontrak === 'Aktif').map(p => (
                    <button 
                      key={p.id_pegawai}
                      onClick={() => handleWaiterLogin(p.nama_ic)}
                      style={{ padding: '12px', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '6px', textAlign: 'left', cursor: 'pointer', fontSize: '1rem', color: 'var(--text-primary)' }}
                      onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--accent-color)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-dark)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                    >
                      {p.nama_ic}
                    </button>
                  ))
                ) : (
                  // Fallback: Tampilkan semua pegawai aktif jika belum ada role yang spesifik diset sbg Waiters
                  pegawai.filter(p => p.status_kontrak === 'Aktif').map(p => (
                    <button 
                      key={p.id_pegawai}
                      onClick={() => handleWaiterLogin(p.nama_ic)}
                      style={{ padding: '12px', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '6px', textAlign: 'left', cursor: 'pointer', fontSize: '1rem', color: 'var(--text-primary)' }}
                      onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--accent-color)'; }}
                      onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-dark)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                    >
                      {p.nama_ic} {p.jabatan ? `(${p.jabatan})` : ''}
                    </button>
                  ))
                )
              ) : (
                <div style={{ textAlign: 'center', color: '#a0aec0', padding: '20px' }}>Memuat data pegawai...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
