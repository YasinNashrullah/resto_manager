export function formatCurrency(value: number): string {
  const n = Number(value);
  if (isNaN(n) || value == null) return '$0';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function floorToTwo(num: number | string): number {
  const n = Number(num);
  if (isNaN(n)) return 0;
  return Math.floor(n * 100) / 100;
}

export function formatStockQty(qty: number | string, satuan?: string): string {
  const n = Number(qty);
  if (isNaN(n)) return `0 ${satuan || ''}`.trim();
  const formatted = n % 1 === 0 ? n.toString() : (Math.round(n * 100) / 100).toString();
  return `${formatted} ${satuan || ''}`.trim();
}

export function getJakartaDate(): string {
  const options = { timeZone: 'Asia/Jakarta', year: 'numeric' as const, month: '2-digit' as const, day: '2-digit' as const };
  const d = new Date().toLocaleDateString('en-CA', options); // en-CA gives YYYY-MM-DD
  return d;
}

export function getWeekLabel(dateString: string): string {
  if (!dateString) return 'Unknown';
  const parts = dateString.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); 
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

export function getWeekRange(dateString: string): { key: string, startStr: string, endStr: string, label: string } | null {
  if (!dateString) return null;
  const dateOnly = dateString.split('T')[0];
  const parts = dateOnly.split('-');
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); 
  
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  
  const end = new Date(d);
  end.setDate(d.getDate() + (6 - day));
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  const startStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  
  const monthsIndo = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  function formatDateIndo(ds: string) {
      const p = ds.split('-');
      if (p.length !== 3) return ds;
      return `${parseInt(p[2])} ${monthsIndo[parseInt(p[1])-1]} ${p[0]}`;
  }

  return {
      key: `${startStr} to ${endStr}`,
      startStr,
      endStr,
      label: `${formatDateIndo(startStr)} - ${formatDateIndo(endStr)}`
  };
}

export function getDutyHours(d: any): number {
  if (!d) return 0;
  let jam = Number(d.total_jam);
  if (!isNaN(jam) && jam > 0) return jam;

  const detail = d.detail_jual || {};
  const wMulai = detail.waktu_mulai || d.waktu_mulai;
  const wSelesai = detail.waktu_selesai || d.waktu_selesai;

  if (wMulai && wSelesai && typeof wMulai === 'string' && typeof wSelesai === 'string') {
    const mParts = wMulai.split(':').map(Number);
    const sParts = wSelesai.split(':').map(Number);
    if (mParts.length >= 2 && sParts.length >= 2 && !isNaN(mParts[0]) && !isNaN(mParts[1]) && !isNaN(sParts[0]) && !isNaN(sParts[1])) {
      let m = mParts[0] * 60 + mParts[1];
      let s = sParts[0] * 60 + sParts[1];
      if (s < m) s += 24 * 60;
      return (s - m) / 60;
    }
  }
  return 0;
}

export function calculatePayrollForDutyList(dutyList: any[], pegawaiList: any[]) {
  let totalBebanGaji = 0;
  const rekapMap = new Map<string, { 
    nama_ic: string, 
    total_jam: number, 
    total_omset: number, 
    rate: number,
    rate_tunj: number,
    is_tunj_full: boolean,
    rate_bonus: number,
    komisi_persen: number
  }>();

  (dutyList || []).forEach(d => {
    const namaIc = d.nama_ic || 'Unknown';
    const dateStr = d.tanggal || getJakartaDate();
    const weekKey = getWeekLabel(dateStr) + '_' + namaIc;

    const jam = getDutyHours(d);
    const omset = Number(d.total_omset) || 0;

    const snap = d.detail_jual?.gaji_snapshot || {};
    const pegObj = (pegawaiList || []).find(p => p.nama_ic === namaIc);

    const rGaji = Number(snap.rate_gaji_per_jam ?? pegObj?.rate_gaji_per_jam) || 0;
    const rTunj = Number(snap.rate_tunjangan_per_jam ?? pegObj?.rate_tunjangan_per_jam) || 0;
    const isTunjFull = Boolean(snap.is_tunjangan_full ?? pegObj?.is_tunjangan_full);
    const rBonus = Number(snap.rate_gaji_bonus_per_jam ?? pegObj?.rate_gaji_bonus_per_jam) || 0;
    const kPersen = Number(snap.persentase_komisi ?? pegObj?.persentase_komisi) || 0;

    if (!rekapMap.has(weekKey)) {
      rekapMap.set(weekKey, {
        nama_ic: namaIc,
        total_jam: 0,
        total_omset: 0,
        rate: rGaji,
        rate_tunj: rTunj,
        is_tunj_full: isTunjFull,
        rate_bonus: rBonus,
        komisi_persen: kPersen
      });
    }

    const item = rekapMap.get(weekKey)!;
    item.total_jam += jam;
    item.total_omset += omset;
    if (rGaji > item.rate) item.rate = rGaji;
    if (rTunj > item.rate_tunj) item.rate_tunj = rTunj;
    if (isTunjFull) item.is_tunj_full = true;
    if (rBonus > item.rate_bonus) item.rate_bonus = rBonus;
    if (kPersen > item.komisi_persen) item.komisi_persen = kPersen;
  });

  const detailPerPegawai: any[] = [];

  rekapMap.forEach((stats) => {
    const rate = stats.rate;
    const rate_tunj = stats.rate_tunj;
    const is_tunj_full = stats.is_tunj_full;
    const rate_bonus = stats.rate_bonus;
    const komisi_persen = stats.komisi_persen;

    const tJam = stats.total_jam;
    const tOmset = stats.total_omset;

    const jam_pokok = Math.min(tJam, 7);
    const jam_bonus = Math.max(0, tJam - 7);
    const jam_tunj = is_tunj_full ? 7 : Math.min(tJam, 7);

    const gaji_pokok = jam_pokok * rate;
    const tunjangan = is_tunj_full ? rate_tunj : (jam_tunj * (rate_tunj / 7.0));
    const gaji_bonus = jam_bonus * rate_bonus;
    const nilai_komisi = tOmset * (komisi_persen / 100);

    const thp = gaji_pokok + tunjangan + gaji_bonus + nilai_komisi;

    totalBebanGaji += thp;

    detailPerPegawai.push({
      nama_ic: stats.nama_ic,
      total_jam: tJam,
      total_omset: tOmset,
      jam_pokok,
      jam_bonus,
      jam_tunjangan: jam_tunj,
      gaji_pokok,
      tunjangan,
      gaji_bonus,
      nilai_komisi,
      thp
    });
  });

  return {
    totalBebanGaji: Math.round(totalBebanGaji),
    detailPerPegawai
  };
}
