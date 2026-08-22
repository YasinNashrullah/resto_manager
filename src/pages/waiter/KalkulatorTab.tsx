import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import './KalkulatorTab.css';

interface CartItem {
  id_menu: string;
  name: string;
  price: number;
  qty: number;
}

export default function KalkulatorTab() {
  const store = useAppStore();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [uangAwal, setUangAwal] = useState<string>('');
  const [uangAkhir, setUangAkhir] = useState<string>('');
  
  // Laporan (Sales Data)
  const [salesItems, setSalesItems] = useState<Record<string, { qty: number, id_menu: string }>>({});
  const [totalRevenue, setTotalRevenue] = useState(0);

  const activeMenu = store.menu.filter(m => m.tampil_di_kalkulator !== false);
  const menuSatuan = activeMenu.filter(m => m.tipe_menu === 'Satuan' || m.tipe_menu === 'Satuan (Ala Carte)');
  const menuPaket = activeMenu.filter(m => m.tipe_menu === 'Paket');

  const checkAutoReset = () => {
    const offDutyTime = localStorage.getItem('kalku_offDutyTimestamp');
    const isCurrentlyOnDuty = !!localStorage.getItem('kalku_dutyStart');
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

        setSalesItems({});
        setTotalRevenue(0);
        setUangAwal('');
        setUangAkhir('');
        setCart([]);
        return true;
      }
    }
    return false;
  };

  useEffect(() => {
    const wasReset = checkAutoReset();
    if (!wasReset) {
      const savedSales = localStorage.getItem('kalku_salesData');
      if (savedSales) {
        try {
          const parsed = JSON.parse(savedSales);
          setSalesItems(parsed.items || {});
          setTotalRevenue(parsed.revenue || 0);
        } catch (e) {}
      }
      const savedUangAwal = localStorage.getItem('kalku_uangAwal');
      if (savedUangAwal) {
        setUangAwal(savedUangAwal);
      }
    }
  }, []);

  const saveSalesState = (items: any, rev: number) => {
    localStorage.setItem('kalku_salesData', JSON.stringify({ items, revenue: rev }));
  };

  const addToCart = (menu: any) => {
    const isDutyActive = !!localStorage.getItem('kalku_dutyStart');
    if (!isDutyActive) {
      alert('Anda belum On Duty! Silakan klik On Duty di menu Informasi User & Laporan terlebih dahulu.');
      return;
    }
    setCart(prev => {
      const existing = prev.find(item => item.id_menu === menu.id_menu);
      if (existing) {
        return prev.map(item => item.id_menu === menu.id_menu ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { id_menu: menu.id_menu, name: menu.nama_menu, price: Number(menu.harga_jual), qty: 1 }];
    });
  };

  const updateQty = (id_menu: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id_menu === id_menu) {
        return { ...item, qty: Math.max(0, item.qty + delta) };
      }
      return item;
    }).filter(item => item.qty > 0));
  };

  const setQty = (id_menu: string, val: string) => {
    const qty = parseInt(val) || 0;
    setCart(prev => prev.map(item => {
      if (item.id_menu === id_menu) return { ...item, qty };
      return item;
    }).filter(item => item.qty > 0));
  };

  const currentTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  
  // Sync uang akhir when uang awal or total changes
  useEffect(() => {
    const awal = parseFloat(uangAwal) || 0;
    if (currentTotal > 0 || awal > 0) {
      setUangAkhir((awal + currentTotal).toString());
    } else {
      setUangAkhir('');
    }
  }, [uangAwal, currentTotal]);

  const handleSelesaikanPesanan = () => {
    if (currentTotal === 0) return;

    // Update Sales Data
    const newSalesItems = { ...salesItems };
    cart.forEach(item => {
        if (newSalesItems[item.name]) {
            newSalesItems[item.name].qty += item.qty;
        } else {
            newSalesItems[item.name] = { qty: item.qty, id_menu: item.id_menu };
        }
    });

    const newRev = totalRevenue + currentTotal;
    setSalesItems(newSalesItems);
    setTotalRevenue(newRev);
    saveSalesState(newSalesItems, newRev);

    // Update Uang Awal to Uang Akhir for next transaction
    const akhir = parseFloat(uangAkhir) || 0;
    setUangAwal(akhir.toString());
    localStorage.setItem('kalku_uangAwal', akhir.toString());
    
    // Clear cart
    setCart([]);
  };

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action mt-20" style={{ marginTop: '30px' }}>
        <h2>Kalkulator Penjualan</h2>
      </div>

      <div className="kalkulator-container">
        <div className="kalkulator-grid">
          
          {/* Menu Pilihan */}
          <div className="panel">
            <h2>Menu Pilihan</h2>
            
            <div className="menu-category">
              <h3>Satuan (Ala Carte)</h3>
              <div className="menu-items">
                {menuSatuan.map(m => (
                  <div key={m.id_menu} className="menu-item-calc" onClick={() => addToCart(m)}>
                    <div>
                      <div className="name">{m.nama_menu}</div>
                    </div>
                    <div className="price">${m.harga_jual}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="menu-category">
              <h3>Paket</h3>
              <div className="menu-items">
                {menuPaket.map(m => (
                  <div key={m.id_menu} className="menu-item-calc" onClick={() => addToCart(m)}>
                    <div>
                      <div className="name">{m.nama_menu}</div>
                      <div className="desc">
                          {m.resep ? m.resep.map((r:any) => {
                              const sMenu = store.menu.find(x => x.id_menu === r.id_menu_satuan);
                              return sMenu ? `${r.qty}x ${sMenu.nama_menu}` : '';
                          }).filter(Boolean).join(', ') : ''}
                      </div>
                    </div>
                    <div className="price">${m.harga_jual}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Keranjang & Pembayaran */}
          <div className="panel">
            <h2>Pesanan Saat Ini</h2>
            
            <div className="cart-items">
              {cart.length === 0 ? (
                <div className="empty-cart">Keranjang kosong. Pilih menu di samping.</div>
              ) : (
                cart.map(item => (
                  <div key={item.id_menu} className="cart-item">
                    <div className="cart-item-info">
                      <span className="cart-item-name">{item.name}</span>
                      <span className="cart-item-price">${item.price} x {item.qty}</span>
                    </div>
                    <div className="cart-item-actions">
                      <button className="qty-btn" onClick={() => updateQty(item.id_menu, -1)}>-</button>
                      <input 
                        type="number" 
                        className="qty-input" 
                        value={item.qty} 
                        onChange={e => setQty(item.id_menu, e.target.value)} 
                      />
                      <button className="qty-btn" onClick={() => updateQty(item.id_menu, 1)}>+</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="summary-row total-row">
              <span>Total Tagihan:</span>
              <span className="total-price">${currentTotal}</span>
            </div>

            <div className="payment-calculator">
              <h3>Pembayaran</h3>
              <div className="form-group">
                <label>Uang Awal (Sebelum transfer)</label>
                <div className="input-wrapper">
                  <span className="currency-symbol">$</span>
                  <input 
                    type="number" 
                    placeholder="0" 
                    value={uangAwal} 
                    onChange={(e) => setUangAwal(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label>Uang Akhir (Setelah transfer)</label>
                <div className="input-wrapper">
                  <span className="currency-symbol">$</span>
                  <input type="number" readOnly value={uangAkhir} placeholder="0" />
                </div>
              </div>

              <div className="payment-result">
                <div className="result-row">
                  <span>Uang Diterima:</span>
                  <span className="bold">${currentTotal}</span>
                </div>
                <div className={`result-status ${currentTotal > 0 ? '' : 'empty'}`}>
                  {currentTotal > 0 ? 'Uang Pas (Otomatis)' : '-'}
                </div>
              </div>

              <button 
                className="btn btn-primary-calc" 
                onClick={handleSelesaikanPesanan}
                disabled={currentTotal === 0 || !localStorage.getItem('kalku_dutyStart')}
              >
                Selesaikan Pesanan
              </button>
            </div>
            
            {/* Laporan Penjualan Harian */}
            <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <h3>Statistik Shift (Sementara)</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '0.5rem' }}>
                    <span style={{ color: '#94a3b8' }}>Total Omset:</span>
                    <span style={{ fontWeight: 'bold', color: '#10b981', fontSize: '1.2rem' }}>${totalRevenue}</span>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Menu terjual:</div>
                <ul style={{ paddingLeft: '1.2rem', color: '#f8fafc', fontSize: '0.9rem', margin: 0 }}>
                    {Object.keys(salesItems).length === 0 ? <li>Belum ada menu terjual</li> : null}
                    {Object.keys(salesItems).map(name => (
                        <li key={name}>{name} ({salesItems[name].qty})</li>
                    ))}
                </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
