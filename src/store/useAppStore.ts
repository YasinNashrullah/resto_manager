import { create } from 'zustand';
import { supabase } from '../lib/supabase';

// Mendefinisikan tipe state dasar aplikasi
interface AppState {
  pegawai: any[];
  bahan: any[];
  menu: any[];
  duty: any[];
  pengeluaran: any[];
  kas_tambahan: any[];
  setoran: any[];
  distribusi_bahan: any[];
  distribusi_makanan: any[];
  produksi_chef: any[];
  transfer_items: any[];
  transfer_item: any[];
  status_gaji: any[];
  periode_ditutup: any[];
  
  stokBahanPegawai: any[];
  stokMakananPegawai: any[];
  
  // Actions
  fetchData: () => Promise<void>;
  setPegawai: (data: any[]) => void;
  setMenu: (data: any[]) => void;
  setDuty: (data: any[]) => void;
  setBahan: (data: any[]) => void;
  setSetoran: (data: any[]) => void;
  setStatusGaji: (data: any[]) => void;
  setPeriodeDitutup: (data: any[]) => void;
  setProduksiChef: (data: any[]) => void;
  setPengeluaran: (data: any[]) => void;
  setDistribusiBahan: (data: any[]) => void;
  setDistribusiMakanan: (data: any[]) => void;
  setKasTambahan: (data: any[]) => void;
  setTransferItems: (data: any[]) => void;
  setTransferItem: (data: any[]) => void;
  setStokBahanPegawai: (data: any[]) => void;
  setStokMakananPegawai: (data: any[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  pegawai: [],
  bahan: [],
  menu: [],
  duty: [],
  pengeluaran: [],
  kas_tambahan: [],
  setoran: [],
  distribusi_bahan: [],
  distribusi_makanan: [],
  produksi_chef: [],
  transfer_items: [],
  transfer_item: [],
  status_gaji: [],
  periode_ditutup: [],
  stokBahanPegawai: [],
  stokMakananPegawai: [],

  fetchData: async () => {
    try {
      const [
        pegawai, bahan, menu, setoran, status_gaji, periode_ditutup, transfer_items, produksi_chef, duty, pengeluaran, kas_tambahan, distribusi_bahan, stokBahanRpc, stokMakananRpc
      ] = await Promise.all([
        supabase.from('pegawai').select('*'),
        supabase.from('bahan').select('*'),
        supabase.from('menu').select('*'),
        supabase.from('setoran').select('*'),
        supabase.from('status_gaji').select('*'),
        supabase.from('periode_ditutup').select('week_key'),
        supabase.from('transfer_item').select('*'),
        supabase.from('produksi_chef').select('*'),
        supabase.from('duty').select('*'),
        supabase.from('pengeluaran').select('*'),
        supabase.from('kas_tambahan').select('*'),
        supabase.from('distribusi_bahan').select('*'),
        supabase.rpc('get_stock_bahan_pegawai'),
        supabase.rpc('get_stock_makanan_pegawai')
      ]);

      const sortedPegawai = [...(pegawai.data || [])].sort((a, b) => {
        if (a.status_kontrak === 'Aktif' && b.status_kontrak !== 'Aktif') return -1;
        if (a.status_kontrak !== 'Aktif' && b.status_kontrak === 'Aktif') return 1;
        return (Number(b.rate_gaji_per_jam) || 0) - (Number(a.rate_gaji_per_jam) || 0);
      });

      const sortedMenu = [...(menu.data || [])].sort((a, b) => {
        const catA = (a.tipe_menu || '').toLowerCase();
        const catB = (b.tipe_menu || '').toLowerCase();
        const getWeight = (cat: string) => {
          if (cat.includes('satuan')) return 1;
          if (cat.includes('paket')) return 2;
          if (cat.includes('wedding') || cat.includes('birthday')) return 3;
          return 4;
        };
        const wA = getWeight(catA);
        const wB = getWeight(catB);
        if (wA !== wB) return wA - wB;
        return (Number(a.harga_jual) || 0) - (Number(b.harga_jual) || 0);
      });

      set({
        pegawai: sortedPegawai,
        bahan: bahan.data || [],
        menu: sortedMenu,
        setoran: setoran.data || [],
        status_gaji: status_gaji.data || [],
        periode_ditutup: (periode_ditutup.data || []).map((r: any) => r.week_key),
        transfer_items: transfer_items.data || [],
        transfer_item: transfer_items.data || [],
        produksi_chef: produksi_chef.data || [],
        duty: duty.data || [],
        pengeluaran: pengeluaran.data || [],
        kas_tambahan: kas_tambahan.data || [],
        distribusi_bahan: distribusi_bahan.data || [],
        stokBahanPegawai: stokBahanRpc.data || [],
        stokMakananPegawai: stokMakananRpc.data || []
      });
    } catch (e) {
      console.error("fetchData error in useAppStore:", e);
    }
  },

  setStokBahanPegawai: (data) => set({ stokBahanPegawai: data }),
  setStokMakananPegawai: (data) => set({ stokMakananPegawai: data }),

  setPegawai: (data) => {
    const sorted = [...data].sort((a, b) => {
      if (a.status_kontrak === 'Aktif' && b.status_kontrak !== 'Aktif') return -1;
      if (a.status_kontrak !== 'Aktif' && b.status_kontrak === 'Aktif') return 1;
      return (Number(b.rate_gaji_per_jam) || 0) - (Number(a.rate_gaji_per_jam) || 0);
    });
    set({ pegawai: sorted });
  },
  setMenu: (data) => {
    const sorted = [...data].sort((a, b) => {
      const catA = (a.tipe_menu || '').toLowerCase();
      const catB = (b.tipe_menu || '').toLowerCase();
      
      const getWeight = (cat: string) => {
        if (cat.includes('satuan')) return 1;
        if (cat.includes('paket')) return 2;
        if (cat.includes('wedding') || cat.includes('birthday')) return 3;
        return 4;
      };
      
      const wA = getWeight(catA);
      const wB = getWeight(catB);
      
      if (wA !== wB) return wA - wB;
      return (Number(a.harga_jual) || 0) - (Number(b.harga_jual) || 0);
    });
    set({ menu: sorted });
  },
  setDuty: (data) => set({ duty: data }),
  setBahan: (data) => set({ bahan: data }),
  setSetoran: (data) => set({ setoran: data }),
  setStatusGaji: (data) => set({ status_gaji: data }),
  setPeriodeDitutup: (data) => set({ periode_ditutup: data }),
  setProduksiChef: (data) => set({ produksi_chef: data }),
  setPengeluaran: (data) => set({ pengeluaran: data }),
  setDistribusiBahan: (data) => set({ distribusi_bahan: data }),
  setDistribusiMakanan: (data) => set({ distribusi_makanan: data }),
  setKasTambahan: (data) => set({ kas_tambahan: data }),
  setTransferItems: (data) => set({ transfer_items: data, transfer_item: data }),
  setTransferItem: (data) => set({ transfer_items: data, transfer_item: data }),
}));
