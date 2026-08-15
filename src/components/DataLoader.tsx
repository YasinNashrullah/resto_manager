import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

export default function DataLoader({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const store = useAppStore();

  useEffect(() => {
    async function refreshState() {
      try {
        await store.fetchData();
      } catch (e) {
        console.error("Supabase Fetch Error:", e);
        alert('Gagal mengambil data dari Supabase. Cek koneksi internet Anda.');
      } finally {
        setIsLoading(false);
      }
    }

    refreshState();

    // Setup Realtime
    const channel = supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          console.log('Realtime change received!', payload);
          // Auto refresh on any change for simplicity, like the original
          refreshState();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="global-loading" style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: '#2d3748', zIndex: 9999, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', color: 'white'
      }}>
        <div style={{
          border: '4px solid rgba(255, 255, 255, 0.1)', borderLeftColor: '#4299e1',
          borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite',
          marginBottom: '15px'
        }}></div>
        <p>Memuat data...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return <>{children}</>;
}
