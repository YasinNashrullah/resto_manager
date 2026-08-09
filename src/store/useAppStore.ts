import { create } from 'zustand';

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
  
  // Actions
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
