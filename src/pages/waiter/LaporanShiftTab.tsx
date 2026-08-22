import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';

export default function LaporanShiftTab() {
  const store = useAppStore();

  const [namaPegawai, setNamaPegawai] = useState(() => {
    return sessionStorage.getItem('active_waiter_name') || localStorage.getItem('active_waiter_name') || '';
  });
  const [usnRoblox, setUsnRoblox] = useState(() => {
    return localStorage.getItem('active_roblox_username') || '';
  });
  const [posisi, setPosisi] = useState('Waiters');

  // Search dropdown state for pegawai
  const [searchPegawai, setSearchPegawai] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Duty State
  const [dutyStartTime, setDutyStartTime] = useState<string | null>(null);
  const [isOnDuty, setIsOnDuty] = useState(false);

  // Format teks laporan dan status penyalinan
  const [laporanPenjualanText, setLaporanPenjualanText] = useState('');
  const [laporanDutyText, setLaporanDutyText] = useState('');
  const [copyPenjualanSuccess, setCopyPenjualanSuccess] = useState(false);
  const [copyDutySuccess, setCopyDutySuccess] = useState(false);

  const [salesRevenue, setSalesRevenue] = useState(0);

  const checkAutoReset = () => {
    const offDutyTime = localStorage.getItem('kalku_offDutyTimestamp');
    const isCurrentlyOnDuty = !!localStorage.getItem('kalku_dutyStart');

    // Only auto-reset if user is NOT currently On Duty AND 1 hour (3600000 ms) has passed since Off Duty
    if (offDutyTime && !isCurrentlyOnDuty) {
      const elapsed = Date.now() - Number(offDutyTime);
      const ONE_HOUR_MS = 60 * 60 * 1000;
      if (elapsed >= ONE_HOUR_MS) {
        localStorage.removeItem('kalku_salesData');
        localStorage.removeItem('kalku_uangAwal');
        localStorage.removeItem('kalku_lastDuty');
        localStorage.removeItem('kalku_savedLaporanPenjualan');
        localStorage.removeItem('kalku_savedLaporanDuty');
        localStorage.removeItem('kalku_offDutyTimestamp');

        setSalesRevenue(0);
        setLaporanPenjualanText('');
        setLaporanDutyText('');
        return true;
      }
    }
    return false;
  };

  useEffect(() => {
    // Perform auto reset check first
    const wasReset = checkAutoReset();

    if (!wasReset) {
      // Restore duty state
      const savedDuty = localStorage.getItem('kalku_dutyStart');
      if (savedDuty) {
        setIsOnDuty(true);
        setDutyStartTime(savedDuty);
      }

      // Restore sales data stats
      const savedSales = localStorage.getItem('kalku_salesData');
      if (savedSales) {
        try {
          const parsed = JSON.parse(savedSales);
          setSalesRevenue(parsed.revenue || 0);
        } catch (e) {}
      }

      // Restore saved report texts if previously generated
      const savedLapPenjualan = localStorage.getItem('kalku_savedLaporanPenjualan');
      if (savedLapPenjualan) setLaporanPenjualanText(savedLapPenjualan);

      const savedLapDuty = localStorage.getItem('kalku_savedLaporanDuty');
      if (savedLapDuty) setLaporanDutyText(savedLapDuty);
    }

    // Restore user details
    const savedRoblox = localStorage.getItem('active_roblox_username');
    if (savedRoblox) setUsnRoblox(savedRoblox);

    const savedWaiter = sessionStorage.getItem('active_waiter_name') || localStorage.getItem('active_waiter_name');
    if (savedWaiter) setNamaPegawai(savedWaiter);

    // Periodic check every 30 seconds for 1-hour expiration while tab is open
    const timer = setInterval(() => {
      checkAutoReset();
    }, 30000);

    const handleClickOutside = () => setIsDropdownOpen(false);
    window.addEventListener('click', handleClickOutside);
    return () => {
      clearInterval(timer);
      window.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Update position automatically based on selected pegawai
  useEffect(() => {
    if (namaPegawai && store.pegawai.length > 0) {
      const p = store.pegawai.find((x: any) => x.nama_ic === namaPegawai);
      if (p && p.jabatan) {
        setPosisi(p.jabatan);
      }
    }
  }, [namaPegawai, store.pegawai]);

  const handleSelectPegawai = (nama: string, jbt: string) => {
    setNamaPegawai(nama);
    sessionStorage.setItem('active_waiter_name', nama);
    localStorage.setItem('active_waiter_name', nama);
    if (jbt) setPosisi(jbt);
    setIsDropdownOpen(false);
    setSearchPegawai('');
  };

  const handleRobloxChange = (val: string) => {
    setUsnRoblox(val);
    localStorage.setItem('active_roblox_username', val);
  };

  const handleOnDuty = () => {
    if (!namaPegawai.trim() || !usnRoblox.trim()) {
      alert('Harap pilih Nama Pegawai dan isi Username Roblox terlebih dahulu sebelum On Duty!');
      return;
    }
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}.${now.getMinutes().toString().padStart(2, '0')}`;
    setDutyStartTime(timeStr);
    setIsOnDuty(true);
    localStorage.setItem('kalku_dutyStart', timeStr);
    localStorage.setItem('active_waiter_name', namaPegawai.trim());
    sessionStorage.setItem('active_waiter_name', namaPegawai.trim());
    // Cancel any pending off-duty auto-reset timer
    localStorage.removeItem('kalku_offDutyTimestamp');
  };

  const handleOffDuty = async () => {
    const effectiveStartTime = dutyStartTime || localStorage.getItem('kalku_dutyStart') || '';
    if (!effectiveStartTime) return;
    const now = new Date();
    const endTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    generateLaporanDuty(effectiveStartTime, endTimeStr);
    generateLaporanPenjualan();

    localStorage.setItem('kalku_lastDuty', JSON.stringify({ start: effectiveStartTime, end: endTimeStr }));
    localStorage.setItem('kalku_offDutyTimestamp', Date.now().toString());

    // Resolusi nama waiter yang valid
    const resolvedWaiterName = (
      namaPegawai || 
      sessionStorage.getItem('active_waiter_name') || 
      localStorage.getItem('active_waiter_name') || 
      ''
    ).trim();

    // Kirim draft otomatis ke Supabase duty_draft agar muncul di Review Duty Draft Manager
    try {
      const savedSales = localStorage.getItem('kalku_salesData');
      let itemsPayload: any[] = [];
      let revenuePayload = 0;

      if (savedSales) {
        try {
          const parsed = JSON.parse(savedSales);
          revenuePayload = parsed.revenue || 0;
          const itemsObj = parsed.items || {};
          itemsPayload = Object.values(itemsObj).map((item: any) => ({
            id_menu: item.id_menu,
            qty: Number(item.qty) || 0
          }));
        } catch (e) {}
      }

      const formatTime = (t: string) => {
        if (!t) return '';
        const clean = t.trim().replace('.', ':');
        const parts = clean.split(':');
        return parts.length >= 2 ? `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}` : clean;
      };

      const draftPayload = {
        nama_pegawai: resolvedWaiterName || 'Waiters',
        waktu_mulai: formatTime(effectiveStartTime),
        waktu_selesai: endTimeStr,
        total_omset: revenuePayload,
        detail_jual: itemsPayload,
        status: 'pending'
      };

      const { error } = await supabase.from('duty_draft').insert([draftPayload]);
      if (error) {
        console.error('Gagal membuat duty_draft:', error);
      }
    } catch (err) {
      console.error('Error saat menyimpan duty_draft:', err);
    }

    setDutyStartTime(null);
    setIsOnDuty(false);
    localStorage.removeItem('kalku_dutyStart');
  };

  const handleBuatLaporanDutyClick = () => {
    const savedDutyStart = localStorage.getItem('kalku_dutyStart') || dutyStartTime;
    if (savedDutyStart) {
      const now = new Date();
      const endTimeStr = `${now.getHours().toString().padStart(2, '0')}.${now.getMinutes().toString().padStart(2, '0')}`;
      generateLaporanDuty(savedDutyStart, endTimeStr);
      return;
    }

    const savedLastDuty = localStorage.getItem('kalku_lastDuty');
    if (savedLastDuty) {
      try {
        const parsed = JSON.parse(savedLastDuty);
        if (parsed.start && parsed.end) {
          generateLaporanDuty(parsed.start, parsed.end);
          return;
        }
      } catch (e) {}
    }

    alert('Anda belum pernah On Duty! Silakan klik tombol On Duty terlebih dahulu saat memulai shift.');
  };

  const generateLaporanPenjualan = () => {
    const savedSales = localStorage.getItem('kalku_salesData');
    let itemsStr = 'Belum ada penjualan';
    let revenue = 0;

    if (savedSales) {
      try {
        const parsed = JSON.parse(savedSales);
        revenue = parsed.revenue || 0;
        const itemsObj = parsed.items || {};
        const entries = Object.entries(itemsObj);
        if (entries.length > 0) {
          itemsStr = entries.map(([name, item]: [string, any]) => `${name.toLowerCase()} (${item.qty})`).join(', ');
        }
      } catch (e) {}
    }

    const today = new Date();
    const dateStr = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
    const robloxText = usnRoblox.trim() || 'Unknown';

    const text = `\`\`\`
JENIS & JUMLAH PAKET YANG TERJUAL: ${itemsStr}
TOTAL PENDAPATAN: $${revenue}
TANGGAL: ${dateStr}
USN ROBLOX: ${robloxText}
\`\`\``;

    setLaporanPenjualanText(text);
    localStorage.setItem('kalku_savedLaporanPenjualan', text);
  };

  const generateLaporanDuty = (start: string, end: string) => {
    const today = new Date();
    const dateStr = `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
    const namaText = namaPegawai.trim() || 'Unknown';
    const posisiText = posisi.trim() || 'Waiters';
    const robloxText = usnRoblox.trim() || 'Unknown';

    const text = `\`\`\`
NAMA: ${namaText}
POSISI: ${posisiText}
TANGGAL: ${dateStr}
JAM DUTY: ${start} - ${end}
USN ROBLOX: ${robloxText}
BUKTI FOTO DUTY:
\`\`\``;

    setLaporanDutyText(text);
    localStorage.setItem('kalku_savedLaporanDuty', text);
  };

  const handleCopyPenjualan = () => {
    if (!laporanPenjualanText) return;
    navigator.clipboard.writeText(laporanPenjualanText);
    setCopyPenjualanSuccess(true);
    setTimeout(() => setCopyPenjualanSuccess(false), 2000);
  };

  const handleCopyDuty = () => {
    if (!laporanDutyText) return;
    navigator.clipboard.writeText(laporanDutyText);
    setCopyDutySuccess(true);
    setTimeout(() => setCopyDutySuccess(false), 2000);
  };

  const handleResetHarian = () => {
    if (confirm('Apakah Anda yakin ingin mereset data penjualan harian?')) {
      localStorage.removeItem('kalku_salesData');
      localStorage.removeItem('kalku_uangAwal');
      localStorage.removeItem('kalku_lastDuty');
      localStorage.removeItem('kalku_savedLaporanPenjualan');
      localStorage.removeItem('kalku_savedLaporanDuty');
      setSalesRevenue(0);
      setLaporanPenjualanText('');
      setLaporanDutyText('');
      alert('Data harian berhasil direset.');
    }
  };

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action">
        <h1>Laporan Shift & Informasi User</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '20px' }}>
        
        {/* Panel Kiri: Informasi User & Status Duty */}
        <div className="card" style={{ padding: '25px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
          <h2 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', fontSize: '1.25rem' }}>
            Informasi User
          </h2>

          {/* Nama Pegawai (Searchable Dropdown) */}
          <div className="form-group" onClick={(e) => e.stopPropagation()} style={{ marginBottom: '18px', position: 'relative' }}>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px', color: 'var(--text-primary)' }}>
              Nama Pegawai
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Ketik nama untuk mencari pegawai..."
                value={isDropdownOpen ? searchPegawai : (namaPegawai || '')}
                onFocus={() => {
                  setIsDropdownOpen(true);
                  setSearchPegawai('');
                }}
                onChange={(e) => {
                  setSearchPegawai(e.target.value);
                  setIsDropdownOpen(true);
                }}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-dark)',
                  color: '#fff',
                  fontSize: '0.95rem',
                  fontWeight: namaPegawai && !isDropdownOpen ? 'bold' : 'normal',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {isDropdownOpen && (
              <div 
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 100,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  marginTop: '4px'
                }}
              >
                {(() => {
                  const getJabatanRank = (jbt: string): number => {
                    const j = (jbt || '').toLowerCase().trim();
                    if (j.includes('manager') || j.includes('pemilik') || j.includes('owner')) return 1;
                    if (j.includes('head chef') || j.includes('head-chef') || j.includes('headchef')) return 2;
                    if (j.includes('chef') || j.includes('koki') || j.includes('dapur')) return 3;
                    if (j.includes('waiter') || j.includes('pelayan') || j.includes('pramusaji')) return 4;
                    if (j.includes('kasir') || j.includes('cashier')) return 5;
                    return 6;
                  };

                  const allActive = (store.pegawai || [])
                    .filter((p: any) => p.status_kontrak === 'Aktif')
                    .sort((a: any, b: any) => {
                      const rA = getJabatanRank(a.jabatan);
                      const rB = getJabatanRank(b.jabatan);
                      if (rA !== rB) return rA - rB;
                      return (a.nama_ic || '').localeCompare(b.nama_ic || '', 'id', { sensitivity: 'base' });
                    });

                  const filtered = allActive.filter((p: any) => {
                    const q = searchPegawai.toLowerCase().trim();
                    if (!q) return true;
                    return (p.nama_ic || '').toLowerCase().includes(q) || (p.jabatan || '').toLowerCase().includes(q);
                  });

                  if (filtered.length === 0) {
                    return (
                      <div style={{ padding: '12px', textAlign: 'center', color: '#aaa', fontSize: '0.85rem' }}>
                        Tidak ada pegawai ditemukan.
                      </div>
                    );
                  }

                  return filtered.map((p: any) => (
                    <div
                      key={p.id_pegawai}
                      onClick={() => handleSelectPegawai(p.nama_ic, p.jabatan)}
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: namaPegawai === p.nama_ic ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        color: namaPegawai === p.nama_ic ? '#3b82f6' : 'var(--text-primary)'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseOut={(e) => e.currentTarget.style.background = namaPegawai === p.nama_ic ? 'rgba(59, 130, 246, 0.2)' : 'transparent'}
                    >
                      <span style={{ fontWeight: 'bold' }}>{p.nama_ic}</span>
                      <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{p.jabatan || 'Pegawai'}</span>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* Posisi Jabatan (Otomatis dari Database) */}
          <div className="form-group" style={{ marginBottom: '18px' }}>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px', color: 'var(--text-primary)' }}>
              Posisi Jabatan
            </label>
            <input
              type="text"
              readOnly
              value={posisi}
              className="form-control"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'var(--bg-dark)', color: '#a78bfa', border: '1px solid var(--border-color)', fontWeight: 'bold', boxSizing: 'border-box' }}
            />
          </div>

          {/* Username Roblox (Input Manual) */}
          <div className="form-group" style={{ marginBottom: '25px' }}>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px', color: 'var(--text-primary)' }}>
              Username Roblox
            </label>
            <input
              type="text"
              placeholder="Masukkan Username Roblox..."
              value={usnRoblox}
              onChange={(e) => handleRobloxChange(e.target.value)}
              className="form-control"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', background: 'var(--bg-dark)', color: '#fff', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}
            />
          </div>

          {/* Status Duty Controls */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1.05rem', color: 'var(--text-primary)' }}>Status Duty Shift</h3>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <button
                onClick={handleOnDuty}
                disabled={isOnDuty}
                className="btn btn-success"
                style={{ flex: 1, padding: '12px', fontWeight: 'bold', borderRadius: '8px' }}
              >
                On Duty
              </button>
              <button
                onClick={handleOffDuty}
                disabled={!isOnDuty}
                className="btn btn-danger"
                style={{ flex: 1, padding: '12px', fontWeight: 'bold', borderRadius: '8px' }}
              >
                Off Duty
              </button>
            </div>
            {dutyStartTime ? (
              <div style={{ color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>
                Sedang On Duty (Mulai: {dutyStartTime})
              </div>
            ) : (
              <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>
                Belum On Duty. Silakan klik On Duty saat mulai shift.
              </div>
            )}
          </div>

          {/* Tombol Action Laporan & Reset */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '25px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
            <button
              onClick={generateLaporanPenjualan}
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontWeight: 'bold', borderRadius: '8px' }}
            >
              Buat Laporan Penjualan
            </button>
            <button
              onClick={handleBuatLaporanDutyClick}
              className="btn btn-secondary"
              style={{ width: '100%', padding: '12px', fontWeight: 'bold', borderRadius: '8px', color: '#a78bfa', borderColor: 'rgba(167, 139, 250, 0.4)' }}
            >
              Buat Laporan Duty
            </button>
            <button
              onClick={handleResetHarian}
              className="btn btn-secondary"
              style={{ width: '100%', padding: '10px', fontSize: '0.85rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', borderRadius: '8px' }}
            >
              Reset Data Harian
            </button>
          </div>
        </div>

        {/* Panel Kanan: 2 Format Hasil Laporan & Copas Teks */}
        <div className="card" style={{ padding: '25px', borderRadius: '12px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h2 style={{ marginTop: 0, marginBottom: '0', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', fontSize: '1.25rem' }}>
            Hasil Laporan & Copas Teks
          </h2>

          <div className="stat-card" style={{ padding: '15px', background: 'var(--bg-dark)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Penjualan Sesi Ini</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>${salesRevenue}</div>
          </div>

          {/* Format 1: Laporan Penjualan */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
              1. Laporan Penjualan Teks:
            </label>
            <textarea
              readOnly
              value={laporanPenjualanText}
              placeholder="Klik 'Buat Laporan Penjualan' untuk membuat format teks penjualan di sini..."
              style={{
                width: '100%',
                height: '140px',
                padding: '12px',
                background: 'var(--bg-dark)',
                color: '#38bdf8',
                fontFamily: 'Consolas, Monaco, monospace',
                fontSize: '0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                resize: 'vertical',
                boxSizing: 'border-box',
                lineHeight: 1.5
              }}
            />
            <button
              onClick={handleCopyPenjualan}
              disabled={!laporanPenjualanText}
              className="btn btn-success"
              style={{
                width: '100%',
                padding: '10px',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                borderRadius: '8px',
                opacity: !laporanPenjualanText ? 0.5 : 1,
                cursor: !laporanPenjualanText ? 'not-allowed' : 'pointer'
              }}
            >
              {copyPenjualanSuccess ? 'Copied!' : 'Copy Teks Laporan Penjualan'}
            </button>
          </div>

          {/* Format 2: Laporan Duty */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
              2. Laporan Duty Teks:
            </label>
            <textarea
              readOnly
              value={laporanDutyText}
              placeholder="Klik 'Buat Laporan Duty' atau 'Off Duty' untuk membuat format teks duty di sini..."
              style={{
                width: '100%',
                height: '150px',
                padding: '12px',
                background: 'var(--bg-dark)',
                color: '#a78bfa',
                fontFamily: 'Consolas, Monaco, monospace',
                fontSize: '0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                resize: 'vertical',
                boxSizing: 'border-box',
                lineHeight: 1.5
              }}
            />
            <button
              onClick={handleCopyDuty}
              disabled={!laporanDutyText}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '10px',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                borderRadius: '8px',
                background: '#8b5cf6',
                borderColor: '#7c3aed',
                opacity: !laporanDutyText ? 0.5 : 1,
                cursor: !laporanDutyText ? 'not-allowed' : 'pointer'
              }}
            >
              {copyDutySuccess ? 'Copied!' : 'Copy Teks Laporan Duty'}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
