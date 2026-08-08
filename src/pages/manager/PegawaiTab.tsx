import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { formatCurrency, floorToTwo, getJakartaDate } from '../../lib/utils';
import { supabase } from '../../lib/supabase';

export default function PegawaiTab() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { pegawai, setPegawai } = useAppStore();

  const [formData, setFormData] = useState({
    id_pegawai: '',
    nama_ic: '',
    jabatan: 'Manager',
    rate_gaji_per_jam: 0,
    rate_gaji_bonus_per_jam: 0,
    rate_tunjangan_per_jam: 0,
    is_tunjangan_full: false,
    persentase_komisi: 0,
    tanggal_masuk: '',
    status_kontrak: 'Aktif'
  });

  const openModalAdd = () => {
    setFormData({
      id_pegawai: '',
      nama_ic: '',
      jabatan: 'Manager',
      rate_gaji_per_jam: 0,
      rate_gaji_bonus_per_jam: 0,
      rate_tunjangan_per_jam: 0,
      is_tunjangan_full: false,
      persentase_komisi: 0,
      tanggal_masuk: getJakartaDate(),
      status_kontrak: 'Aktif'
    });
    setIsModalOpen(true);
  };

  const openModalEdit = (p: any) => {
    setFormData({
      id_pegawai: p.id_pegawai,
      nama_ic: p.nama_ic,
      jabatan: p.jabatan,
      rate_gaji_per_jam: p.rate_gaji_per_jam,
      rate_gaji_bonus_per_jam: p.rate_bonus_per_jam || p.rate_gaji_bonus_per_jam || 0,
      rate_tunjangan_per_jam: p.rate_tunjangan_per_jam || 0,
      is_tunjangan_full: p.is_tunjangan_full || false,
      persentase_komisi: p.persentase_komisi,
      tanggal_masuk: p.tanggal_masuk || '',
      status_kontrak: p.status_kontrak
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        nama_ic: formData.nama_ic,
        jabatan: formData.jabatan,
        rate_gaji_per_jam: floorToTwo(formData.rate_gaji_per_jam),
        rate_gaji_bonus_per_jam: floorToTwo(formData.rate_gaji_bonus_per_jam),
        rate_tunjangan_per_jam: floorToTwo(formData.rate_tunjangan_per_jam),
        is_tunjangan_full: formData.is_tunjangan_full,
        persentase_komisi: floorToTwo(formData.persentase_komisi),
        tanggal_masuk: formData.tanggal_masuk,
        status_kontrak: formData.status_kontrak
      };

      if (formData.id_pegawai) {
        const { error } = await supabase.from('pegawai').update(payload).eq('id_pegawai', formData.id_pegawai);
        if (error) throw error;
      } else {
        const existing = pegawai.find(p => p.nama_ic.toLowerCase() === payload.nama_ic.toLowerCase());
        if (existing) {
          alert('Nama IC sudah terdaftar!');
          setIsSubmitting(false);
          return;
        }
        const { error } = await supabase.from('pegawai').insert([payload]);
        if (error) throw error;
      }

      // Fetch updated data
      const { data } = await supabase.from('pegawai').select('*');
      if (data) setPegawai(data);

      setIsModalOpen(false);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sorting
  const sortedPegawai = [...pegawai].sort((a, b) => {
    if (a.status_kontrak === 'Aktif' && b.status_kontrak !== 'Aktif') return -1;
    if (a.status_kontrak !== 'Aktif' && b.status_kontrak === 'Aktif') return 1;
    return floorToTwo(b.rate_gaji_per_jam || 0) - floorToTwo(a.rate_gaji_per_jam || 0);
  });

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action">
        <h1>Data Pegawai</h1>
        <button className="btn btn-primary" onClick={openModalAdd}>+ Tambah Pegawai</button>
      </div>
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3>Daftar Pegawai</h3>
        </div>
        <div className="table-responsive">
          <table id="table-pegawai">
            <thead>
              <tr>
                <th>IC Pegawai</th>
                <th>Jabatan</th>
                <th>Gaji/Jam</th>
                <th>Bonus/Jam</th>
                <th>Tunjangan</th>
                <th>Komisi (%)</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sortedPegawai.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center' }}>Belum ada pegawai</td></tr>
              ) : (
                sortedPegawai.map(p => (
                  <tr key={p.id_pegawai}>
                    <td><strong>{p.nama_ic}</strong></td>
                    <td>{p.jabatan}</td>
                    <td>{formatCurrency(p.rate_gaji_per_jam)}</td>
                    <td>{formatCurrency(p.rate_bonus_per_jam || p.rate_gaji_bonus_per_jam || 0)}</td>
                    <td>
                      {formatCurrency(p.rate_tunjangan_per_jam || 0)} <br />
                      <small className={p.is_tunjangan_full ? 'text-success' : 'text-secondary'}>
                        {p.is_tunjangan_full ? '(Full Max)' : '(Sesuai Jam)'}
                      </small>
                    </td>
                    <td>{p.persentase_komisi}%</td>
                    <td className={`${p.status_kontrak === 'Aktif' ? 'text-success' : 'text-danger'} font-weight-bold`}>
                      {p.status_kontrak}
                    </td>
                    <td>
                      <button className="btn btn-sm btn-primary btn-edit" onClick={() => openModalEdit(p)}>Edit</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <span className="close-btn" onClick={() => setIsModalOpen(false)}>&times;</span>
            <h2>{formData.id_pegawai ? 'Edit Pegawai' : 'Tambah Pegawai'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nama IC (Unik)</label>
                <input 
                  type="text" 
                  required 
                  value={formData.nama_ic} 
                  onChange={e => setFormData({...formData, nama_ic: e.target.value})}
                  readOnly={!!formData.id_pegawai}
                  style={formData.id_pegawai ? { backgroundColor: 'var(--bg-dark)', opacity: 0.7 } : {}}
                />
              </div>
              <div className="form-group">
                <label>Jabatan</label>
                <select 
                  required 
                  value={formData.jabatan}
                  onChange={e => setFormData({...formData, jabatan: e.target.value})}
                >
                  <option value="Manager">Manager</option>
                  <option value="Head Chef">Head Chef</option>
                  <option value="Chef">Chef</option>
                  <option value="Waiters">Waiters</option>
                </select>
              </div>
              <div className="form-group">
                <label>Rate Gaji Pokok / Jam ($)</label>
                <input type="number" step="0.01" required value={formData.rate_gaji_per_jam} onChange={e => setFormData({...formData, rate_gaji_per_jam: Number(e.target.value)})} />
              </div>
              <div className="form-group">
                <label>Rate Gaji Bonus / Jam ($)</label>
                <input type="number" step="0.01" required value={formData.rate_gaji_bonus_per_jam} onChange={e => setFormData({...formData, rate_gaji_bonus_per_jam: Number(e.target.value)})} />
              </div>
              <div className="form-group">
                <label>Rate Tunjangan / Jam ($)</label>
                <input type="number" step="0.01" required value={formData.rate_tunjangan_per_jam} onChange={e => setFormData({...formData, rate_tunjangan_per_jam: Number(e.target.value)})} />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input 
                  type="checkbox" 
                  id="pegawai-is-tunjangan-full" 
                  style={{ width: '20px', height: '20px' }}
                  checked={formData.is_tunjangan_full}
                  onChange={e => setFormData({...formData, is_tunjangan_full: e.target.checked})}
                />
                <label style={{ margin: 0, cursor: 'pointer' }} htmlFor="pegawai-is-tunjangan-full">Dapat Full Tunjangan (Otomatis Max Jam)</label>
              </div>
              <div className="form-group">
                <label>Persentase Komisi (%)</label>
                <input type="number" step="0.1" required value={formData.persentase_komisi} onChange={e => setFormData({...formData, persentase_komisi: Number(e.target.value)})} />
              </div>
              <div className="form-group">
                <label>Tanggal Masuk</label>
                <input type="date" required value={formData.tanggal_masuk} onChange={e => setFormData({...formData, tanggal_masuk: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={formData.status_kontrak} onChange={e => setFormData({...formData, status_kontrak: e.target.value})}>
                  <option value="Aktif">Aktif</option>
                  <option value="Resign">Resign</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary w-100" disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan...' : 'Simpan Data'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
