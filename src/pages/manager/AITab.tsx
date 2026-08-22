import { useState } from 'react';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import 'dayjs/locale/id';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { floorToTwo, getWeekRange } from '../../lib/utils';

dayjs.extend(customParseFormat);
dayjs.locale('id');

export default function AITab() {
  const store = useAppStore();

  // AI Extraction State
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [summaryHtml, setSummaryHtml] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [finalPayloads, setFinalPayloads] = useState<any | null>(null);
  const [previewJsonText, setPreviewJsonText] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyJson = () => {
    if (!previewJsonText) return;
    navigator.clipboard.writeText(previewJsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Manual JSON State
  const [jsonInput, setJsonInput] = useState('');
  const [isProcessingJson, setIsProcessingJson] = useState(false);

  // Helper matching functions
  const findMasterItem = (masterArray: any[], nameString: string, nameKey: string) => {
    if (!nameString || !masterArray) return null;
    let search = nameString.toLowerCase().trim();
    
    search = search.replace(/air\s*mineral/g, 'water')
                   .replace(/air\s*putih/g, 'water')
                   .replace(/^air$/g, 'water')
                   .replace(/carrot/g, 'wortel')
                   .replace(/potato/g, 'kentang')
                   .replace(/chicken/g, 'ayam')
                   .replace(/beef/g, 'daging');

    return masterArray.find(item => {
      const itemName = (item[nameKey] || "").toLowerCase();
      return itemName === search || itemName.includes(search) || search.includes(itemName);
    });
  };

  const findMasterId = (masterArray: any[], nameString: string, idKey: string, nameKey: string) => {
    const item = findMasterItem(masterArray, nameString, nameKey);
    return item ? item[idKey] : null;
  };

  const getMenuHpp = (idMenu: any): number => {
    const m = store.menu.find(x => String(x.id_menu) === String(idMenu));
    if (!m) return 0;
    if (m.hpp_terakhir && Number(m.hpp_terakhir) > 0) return Number(m.hpp_terakhir);

    let hpp = 0;
    if (Array.isArray(m.resep)) {
      m.resep.forEach((r: any) => {
        if (m.tipe_menu === 'Satuan') {
          const b = store.bahan.find(x => String(x.id_bahan) === String(r.id_bahan));
          if (b) hpp += Number(b.harga_per_unit || 0) * Number(r.qty || 0);
        } else {
          const ms = store.menu.find(x => String(x.id_menu) === String(r.id_menu_satuan));
          if (ms && Array.isArray(ms.resep)) {
            ms.resep.forEach((r2: any) => {
              const b = store.bahan.find(x => String(x.id_bahan) === String(r2.id_bahan));
              if (b) hpp += Number(b.harga_per_unit || 0) * Number(r2.qty || 0) * Number(r.qty || 0);
            });
          }
        }
      });
    }
    return floorToTwo(hpp);
  };

  const preprocessInput = (text: string) => {
    const pegawaiArray = store.pegawai || [];
    const menuArray = (store.menu || []).map(m => m.nama_menu);
    const bahanArray = (store.bahan || []).map(b => b.nama_bahan);

    if (pegawaiArray.length === 0) return text;
    const lines = text.split('\n');
    let currentSender = "";
    const names = pegawaiArray.map(p => p.nama_ic).sort((a, b) => b.length - a.length);

    const keywordPattern = new RegExp("(BELI|HASIL MASAK|JAM DUTY|JENIS|TOTAL|Paket|" + 
                                     menuArray.join("|") + "|" + bahanArray.join("|") + ")", "i");

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const foundName = names.find(n => line.toLowerCase().includes(n.toLowerCase()));
      const isReceiverLine = line.toLowerCase().includes("penerima") || line.toLowerCase().includes("transfer") || line.toLowerCase().includes("ke:");

      if (foundName && line.length < 150 && !isReceiverLine) {
        currentSender = foundName;
      }

      if (currentSender && (line.match(keywordPattern) || line.match(/\d/))) {
        if (!line.includes('[Pengirim:') && !isReceiverLine) {
          lines[i] = `[Pengirim: ${currentSender}] ` + line;
        }
      }
    }
    return lines.join('\n');
  };

  const parseToYYYYMMDD = (rawStr: string) => {
    if (!rawStr) return new Date().toISOString().split('T')[0];

    const formats = [
      'DD/MM/YYYY', 'DD-MM-YYYY', 'D/M/YYYY', 'D-M-YYYY',
      'DD/MM/YY', 'DD-MM-YY', 'D/M/YY', 'D-M-YY',
      'DD MMMM YYYY', 'D MMMM YYYY', 'DD MMM YYYY', 'D MMM YYYY',
      'DD MMMM YY', 'D MMMM YY', 'DD MMM YY', 'D MMM YY',
      'YYYY-MM-DD'
    ];

    const cleanStr = rawStr.trim().replace(/[^a-zA-Z0-9\/\- ]/g, '');
    let d = dayjs(cleanStr, formats, 'id', true);
    if (!d.isValid()) {
      d = dayjs(cleanStr, formats, 'id');
    }

    if (d.isValid()) {
      let y = d.year();
      if (y < 2000 && cleanStr.length <= 6) {
        y = new Date().getFullYear();
        d = d.year(y);
      }
      return d.format('YYYY-MM-DD');
    }

    const isoMatch = rawStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return isoMatch[0];

    return rawStr;
  };

  const processTextWithAI = async (text: string) => {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || '';
    const baseUrl = import.meta.env.VITE_AI_BASE_URL || 'https://openrouter.ai/api/v1';
    const modelTarget = import.meta.env.VITE_AI_MODEL || 'openai/gpt-oss-120b:free';

    let targetEndpoint = baseUrl;
    if (baseUrl.includes('localhost:20128')) {
      targetEndpoint = '/ai-proxy/v1';
    }

    const masterPegawai = store.pegawai ? store.pegawai.map(p => p.nama_ic).join(", ") : "Belum ada data";
    const masterMenuStr = store.menu ? store.menu.map(m => m.nama_menu).join(", ") : "";
    const masterBahanStr = store.bahan ? store.bahan.map(b => b.nama_bahan).join(", ") : "";

    const systemPrompt = `Kamu adalah asisten AI Pengekstrak JSON untuk Restoran.
Tugasmu: Mengekstrak laporan chat (Discord/WhatsApp) menjadi format JSON murni.

ATURAN MUTLAK (JIKA DILANGGAR SISTEM AKAN ERROR):
1. NAMA PEGAWAI: TIDAK BOLEH KOSONG (""). Cari dari header pesan jika tidak ada. Daftar Pegawai Sah: [${masterPegawai}].
2. MASTER DATA (PENTING UNTUK TYPO):
   - Daftar Menu Sah: [${masterMenuStr}]
   - Daftar Bahan Sah: [${masterBahanStr}]
   - Jika teks laporan sedikit typo, koreksi nama menu/bahan agar persis sama dengan daftar di atas!
   - PENTING KOREKSI NAMA: 'air', 'air putih', 'air mineral' = 'Water' (atau nama menu air di master data). 'carrot' = 'Jus Wortel'.
3. DUTY - JAM & OMSET:
   - 'waktu_mulai' dan 'waktu_selesai': Format HH:MM (Misal "19.17-22.05" -> mulai: "19:17", selesai: "22:05").
   - PENTING: JANGAN MENCAMPURKAN JAM DUTY MILIK PEGAWAI LAIN!
   - PENTING: Jika pesan HANYA berisi laporan "TOTAL PENDAPATAN" dan tidak ada tulisan jam duty-nya, isi 'waktu_mulai'="" dan 'waktu_selesai'="".
   - 'total_omset': Angka murni (Misal "$7.840" = 7840).
   - 'detail_jual': Ekstrak SEMUA item/paket yang terjual!
4. MASAKAN & DISTRIBUSI (KEDUANYA BISA MUNCUL BERSAMAAN):
   - Kategori 'produksi_chef': Gunakan HANYA untuk item yang berada di bawah/dalam kelompok teks "HASIL MASAK".
   - Kategori 'distribusi_makanan': Gunakan HANYA untuk item yang berada di bawah/dalam kelompok teks "Nama Penerima Masakan" atau "Penerima Masakan" (nama_ic_chef = pengirim laporan, nama_ic_waiter = penerima).
   - PENTING: Jika pengirim laporan adalah Chef/Head Chef (misal "Head Chef - Hacm"), dan terdapat baris "Nama Penerima Masakan (penerima/waiters): [nama_penerima]" diikuti daftar masakan/minuman (misal "- Jus Wortel : 50"), KAMU WAJIB MENGEKSTRAKNYA KE DALAM ARRAY 'distribusi_makanan'!
   - Set 'nama_ic_chef' = nama pengirim laporan, 'nama_ic_waiter' = nama penerima di baris tersebut, 'menu' = nama menu, 'qty' = angka jumlah.
   - Jika ada beberapa penerima berturut-turut dalam satu laporan, buat objek terpisah di 'distribusi_makanan' untuk setiap penerima dan setiap menu!
   - Ekstrak SEMUA menu/item masakan tanpa terkecuali!
5. PENGELUARAN (PEMBELIAN):
   - Jika teks "JENIS BAHAN YANG DIBELI", ekstrak 'total_pengeluaran' SEKALI SAJA untuk setiap grup/struk.
   - Masukkan SEMUA item yang dibeli ke dalam array 'detail_beli'.
6. TRANSFER ITEM (HANYA MAKANAN/MENU):
   - Jika teks secara eksplisit menyatakan seseorang memberikan/transfer stok kepada orang lain (misalnya "Loka memberikan Burger 5 ke Selwyn"), masukkan ke kategori 'transfer_item'. 'tipe_item' harus selalu diisi "Makanan".
7. TANGGAL: Ekstrak tanggal dari header pesan Discord (contoh: "— 22/07/2026 20:32" berarti "22/07/2026"). JANGAN membuang laporan!
8. SETORAN: Jika ada sebutan setoran (misal "Setoran bank", "Sudah setor omset"), masukkan ke array 'setoran' dengan "status": true.

PENTING SEKALI: JANGAN PERNAH MENGHILANGKAN ATAU MEMBUANG PESAN/LAPORAN APAPUN! KETELITIANMU SANGAT DIUJI.

ATURAN FORMAT OUTPUT:
- HARUS JSON MURNI TANPA TEKS PENJELASAN LAIN!
- JAWABANMU HARUS DIMULAI DENGAN "{" DAN DIAKHIRI DENGAN "}".

CONTOH OUTPUT JSON:
{
  "pengeluaran": [],
  "transfer_item": [],
  "duty": [],
  "produksi_chef": [],
  "distribusi_makanan": [
    {"tanggal": "22/07/2026", "nama_ic_chef": "Hacm", "nama_ic_waiter": "ama", "menu": "Jus Wortel", "qty": 50},
    {"tanggal": "22/07/2026", "nama_ic_chef": "Hacm", "nama_ic_waiter": "ama", "menu": "Katsu", "qty": 50},
    {"tanggal": "22/07/2026", "nama_ic_chef": "Hacm", "nama_ic_waiter": "ama", "menu": "French Fries", "qty": 50},
    {"tanggal": "22/07/2026", "nama_ic_chef": "Hacm", "nama_ic_waiter": "ama", "menu": "Water", "qty": 50},
    {"tanggal": "22/07/2026", "nama_ic_chef": "Hacm", "nama_ic_waiter": "ama", "menu": "Burger", "qty": 50}
  ],
  "kas_tambahan": [], "distribusi_bahan": [], "setoran": []
}

Format Template JSON:
{
  "duty": [{"tanggal": "", "nama_ic": "", "waktu_mulai": "", "waktu_selesai": "", "total_jam": 0, "total_omset": 0, "detail_jual": [{"menu": "", "qty": 0}]}],
  "pengeluaran": [{"tanggal": "", "nama_pembeli": "", "total_pengeluaran": 0, "detail_beli": [{"bahan": "", "qty": 0}]}],
  "kas_tambahan": [{"tanggal": "", "keterangan": "", "nominal": 0}],
  "distribusi_bahan": [{"tanggal": "", "nama_ic_chef": "", "bahan": "", "qty": 0}],
  "distribusi_makanan": [{"tanggal": "", "nama_ic_chef": "", "nama_ic_waiter": "", "menu": "", "qty": 0}],
  "produksi_chef": [{"tanggal": "", "nama_ic_chef": "", "menu": "", "qty": 0}],
  "transfer_item": [{"tanggal": "", "tipe_item": "", "item": "", "qty": 0, "dari_ic": "", "ke_ic": ""}],
  "setoran": [{"tanggal": "", "nama_ic": "", "status": true}]
}`;

    const inputStr = preprocessInput(text);
    const messages = inputStr.split(/--------------------------------------------------/);
    const chunks: string[] = [];
    let currentChunk = '';
    for (const msg of messages) {
      if ((currentChunk + msg).split('\n').length > 150 && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = msg;
      } else {
        currentChunk += (currentChunk.length > 0 ? '\n--------------------------------------------------\n' : '') + msg;
      }
    }
    if (currentChunk.trim().length > 0) chunks.push(currentChunk);

    const finalResult: any = {
      duty: [], pengeluaran: [], kas_tambahan: [],
      distribusi_bahan: [], distribusi_makanan: [],
      produksi_chef: [], transfer_item: [], setoran: []
    };

    let processedChunks = 0;
    const totalChunks = chunks.length;

    for (const chunk of chunks) {
      processedChunks++;
      setStatusText(`AI Memproses bagian ${processedChunks} dari ${totalChunks}...`);

      const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) reqHeaders["Authorization"] = `Bearer ${apiKey}`;

      let response: Response;
      try {
        response = await fetch(`${targetEndpoint}/chat/completions`, {
          method: "POST",
          headers: reqHeaders,
          body: JSON.stringify({
            model: modelTarget,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: chunk }
            ]
          })
        });
      } catch (err: any) {
        throw new Error(`Gagal terhubung ke AI server (${targetEndpoint}): ${err.message}`);
      }

      if (!response.ok) {
        const errText = await response.text();
        let msg = `AI API Error (${response.status}): ${errText}`;
        if (errText.includes('No active credentials')) {
          msg = `Gagal memproses AI: Model "${modelTarget}" di 9router lokal belum memiliki kredensial aktif/Provider offline. Silakan cek pengesetan provider model "${modelTarget}" di 9router atau gunakan Mode JSON Manual.`;
        } else if (response.status === 429 || errText.includes('Too Many Requests')) {
          msg = `Gagal memproses AI: Model "${modelTarget}" mencapai batas Limit Request (HTTP 429). Mohon tunggu sejenak atau gunakan Mode JSON Manual.`;
        }
        throw new Error(msg);
      }
      
      const rawText = await response.text();
      let content = "";

      // Stage 1: Attempt standard JSON parse
      try {
        const data = JSON.parse(rawText);
        if (data.choices?.[0]?.message?.content) {
          content = data.choices[0].message.content.trim();
        }
      } catch {
        // Stage 2: Attempt parsing after stripping trailing SSE noise 'data: [DONE]'
        const cleanedRaw = rawText.replace(/\s*data:\s*\[DONE\]\s*$/, '').trim();
        try {
          const data = JSON.parse(cleanedRaw);
          if (data.choices?.[0]?.message?.content) {
            content = data.choices[0].message.content.trim();
          }
        } catch {
          // Stage 3: Parse line by line (supports SSE stream data: {...} lines and raw text)
          const lines = rawText.split('\n');
          for (let line of lines) {
            line = line.trim();
            if (!line || line === "data: [DONE]") continue;

            let lineJsonStr = line;
            if (line.startsWith("data: ")) {
              lineJsonStr = line.substring(6).trim();
            }

            try {
              const parsed = JSON.parse(lineJsonStr);
              if (parsed.choices && parsed.choices.length > 0) {
                const choice = parsed.choices[0];
                if (choice.delta?.content) {
                  content += choice.delta.content;
                } else if (choice.message?.content) {
                  content += choice.message.content;
                }
              }
            } catch {}
          }
          content = content.trim();
        }
      }

      // Stage 4: Extract JSON substring from markdown blocks or braces
      const jsonBlocks = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/gi);
      if (jsonBlocks && jsonBlocks.length > 0) {
        const lastBlock = jsonBlocks[jsonBlocks.length - 1];
        content = lastBlock.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      } else {
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          content = content.substring(firstBrace, lastBrace + 1).trim();
        } else {
          console.error("AI Response Raw Content:", rawText);
          throw new Error("AI tidak mengembalikan format JSON yang valid pada bagian " + processedChunks);
        }
      }

      // Stage 5: Sanitize trailing commas and invalid control characters before JSON.parse
      const sanitizedContent = content
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/[\x00-\x1F\x7F-\x9F]/g, (c) => c === '\n' || c === '\r' || c === '\t' ? c : '');

      try {
        const parsed = JSON.parse(sanitizedContent);
        if (parsed.duty) finalResult.duty.push(...parsed.duty);
        if (parsed.pengeluaran) finalResult.pengeluaran.push(...parsed.pengeluaran);
        if (parsed.kas_tambahan) finalResult.kas_tambahan.push(...parsed.kas_tambahan);
        if (parsed.distribusi_bahan) finalResult.distribusi_bahan.push(...parsed.distribusi_bahan);
        if (parsed.distribusi_makanan) finalResult.distribusi_makanan.push(...parsed.distribusi_makanan);
        if (parsed.produksi_chef) finalResult.produksi_chef.push(...parsed.produksi_chef);
        if (parsed.transfer_item) finalResult.transfer_item.push(...parsed.transfer_item);
        if (parsed.setoran) finalResult.setoran.push(...parsed.setoran);
      } catch (err: any) {
        console.error("Gagal parse JSON chunk " + processedChunks, err, content);
        throw new Error(`Gagal memparsing JSON dari AI pada bagian ${processedChunks}: ${err.message}`);
      }
    }

    return finalResult;
  };

  const handleProcess = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    setStatusText('AI sedang membaca dan memilah data... mohon tunggu.');
    setSummaryHtml(null);
    setValidationErrors([]);
    setFinalPayloads(null);
    setPreviewJsonText('');

    try {
      const result = await processTextWithAI(inputText);
      
      const masterBahan = store.bahan || [];
      const masterMenu = store.menu || [];
      const masterPegawai = store.pegawai || [];

      const errs: string[] = [];
      const payloads: any = {
        duty: [], pengeluaran: [], kas_tambahan: [],
        distribusi_bahan: [], distribusi_makanan: [],
        produksi_chef: [], transfer_items: [], setoran: []
      };

      const categories = ["duty", "pengeluaran", "kas_tambahan", "distribusi_bahan", "distribusi_makanan", "produksi_chef", "transfer_item", "setoran"];
      categories.forEach(cat => {
        if (result[cat] && Array.isArray(result[cat])) {
          result[cat].forEach((item: any) => {
            item.tanggal = parseToYYYYMMDD(item.tanggal);
          });
        }
      });

      // Validasi & Processing Duty
      if (result.duty) {
        for (const d of result.duty) {
          if (d.waktu_mulai && d.waktu_selesai) {
            try {
              const [startH, startM] = d.waktu_mulai.replace('.', ':').split(':').map(Number);
              const [endH, endM] = d.waktu_selesai.replace('.', ':').split(':').map(Number);
              if (!isNaN(startH) && !isNaN(startM) && !isNaN(endH) && !isNaN(endM)) {
                let startMin = startH * 60 + startM;
                let endMin = endH * 60 + endM;
                if (endMin < startMin) endMin += 24 * 60;
                d.total_jam_calculated = (endMin - startMin) / 60;
              } else {
                d.total_jam_calculated = 0;
              }
            } catch {
              d.total_jam_calculated = 0;
            }
          } else {
            d.total_jam_calculated = 0;
          }
        }

        const mergedDutyMap: Record<string, any> = {};
        for (const d of result.duty) {
          const w_mulai = (d.waktu_mulai || "").trim();
          const w_selesai = (d.waktu_selesai || "").trim();
          const key = d.tanggal + '_' + d.nama_ic + '_' + w_mulai + '_' + w_selesai;
          const safeOmset = parseFloat(String(d.total_omset || "0").replace(/[^0-9]/g, '')) || 0;

          if (!mergedDutyMap[key]) {
            mergedDutyMap[key] = { ...d, detail_jual: d.detail_jual ? [...d.detail_jual] : [] };
            mergedDutyMap[key].total_jam = d.total_jam_calculated;
            mergedDutyMap[key].total_omset = safeOmset;
          } else {
            if (!mergedDutyMap[key].waktu_mulai && d.waktu_mulai) mergedDutyMap[key].waktu_mulai = d.waktu_mulai;
            if (!mergedDutyMap[key].waktu_selesai && d.waktu_selesai) mergedDutyMap[key].waktu_selesai = d.waktu_selesai;
            mergedDutyMap[key].total_jam += d.total_jam_calculated;
            mergedDutyMap[key].total_omset += safeOmset;
            if (d.detail_jual) {
              mergedDutyMap[key].detail_jual.push(...d.detail_jual);
            }
          }
        }

        let mergedDutyArray = Object.values(mergedDutyMap);
        const finalDutyArray: any[] = [];
        const orphanOmsets: any[] = [];

        for (const d of mergedDutyArray) {
          if (d.total_jam === 0 && d.total_omset > 0 && (!d.waktu_mulai || d.waktu_mulai.trim() === "")) {
            orphanOmsets.push(d);
          } else {
            finalDutyArray.push(d);
          }
        }

        for (const orphan of orphanOmsets) {
          const candidates = finalDutyArray.filter(d => d.nama_ic === orphan.nama_ic);
          if (candidates.length > 0) {
            const orphanDate = new Date(orphan.tanggal).getTime();
            candidates.sort((a, b) => {
              const diffA = Math.abs(new Date(a.tanggal).getTime() - orphanDate);
              const diffB = Math.abs(new Date(b.tanggal).getTime() - orphanDate);
              return diffA - diffB;
            });
            const target = candidates[0];
            target.total_omset += orphan.total_omset;
            if (orphan.detail_jual) {
              target.detail_jual.push(...orphan.detail_jual);
            }
          } else {
            finalDutyArray.push(orphan);
          }
        }

        mergedDutyArray = finalDutyArray;
        let lastValidName = "";

        for (const d of mergedDutyArray) {
          d.total_jam = floorToTwo(d.total_jam || 0);
          const items: any[] = [];
          let total_hpp = 0;
          let calculated_omset = 0;

          if (d.nama_ic && d.nama_ic.trim() !== "") lastValidName = d.nama_ic;
          else if (lastValidName !== "") d.nama_ic = lastValidName;

          const masterPegawaiMatch = findMasterItem(masterPegawai, d.nama_ic, 'nama_ic');
          if (masterPegawaiMatch) d.nama_ic = masterPegawaiMatch.nama_ic;

          if (Array.isArray(d.detail_jual)) {
            for (const item of d.detail_jual) {
              const itemMenuName = item.menu || item.nama_menu;
              const masterMenuMatch = findMasterItem(masterMenu, itemMenuName, 'nama_menu');

              if (!masterMenuMatch) {
                errs.push(`[Duty] Menu "${itemMenuName}" tidak ditemukan.`);
              } else {
                item.menu = masterMenuMatch.nama_menu;
                const hppPerPorsi = floorToTwo(getMenuHpp(masterMenuMatch.id_menu));
                const qty = Math.abs(floorToTwo(item.qty)) || 0;
                items.push({
                  id_menu: masterMenuMatch.id_menu,
                  qty: qty,
                  subtotal_hpp: hppPerPorsi * qty,
                  nama_menu: masterMenuMatch.nama_menu
                });
                total_hpp += (hppPerPorsi * qty);
                calculated_omset += (floorToTwo(masterMenuMatch.harga_jual) * qty);
              }
            }
          }

          if (items.length > 0) {
            d.total_omset = calculated_omset;
          }

          const idPegawai = findMasterId(masterPegawai, d.nama_ic, 'nama_ic', 'nama_ic');
          if (!idPegawai) {
            errs.push(`[Duty] Pegawai "${d.nama_ic}" tidak ditemukan.`);
          } else {
            const pegawaiAktif = masterPegawai.find(x => x.nama_ic === idPegawai);
            payloads.duty.push({
              tanggal: d.tanggal,
              nama_ic: idPegawai,
              total_jam: floorToTwo(d.total_jam),
              total_omset: floorToTwo(d.total_omset),
              detail_jual: {
                items: items,
                gaji_snapshot: pegawaiAktif ? {
                  rate_gaji_per_jam: pegawaiAktif.rate_gaji_per_jam,
                  rate_gaji_bonus_per_jam: pegawaiAktif.rate_gaji_bonus_per_jam,
                  persentase_komisi: pegawaiAktif.persentase_komisi
                } : null,
                nama_ic_waiter: idPegawai,
                total_hpp: total_hpp,
                waktu_mulai: d.waktu_mulai || "",
                waktu_selesai: d.waktu_selesai || ""
              }
            });
          }
        }
        result.duty = mergedDutyArray;
      }

      // Validasi Pengeluaran
      if (result.pengeluaran) {
        let lastValidName = "";
        const filteredPengeluaran: any[] = [];

        for (const struk of result.pengeluaran) {
          if (struk.nama_pembeli && struk.nama_pembeli.trim() !== "") lastValidName = struk.nama_pembeli;
          else if (lastValidName !== "") struk.nama_pembeli = lastValidName;
          filteredPengeluaran.push(struk);
        }
        result.pengeluaran = filteredPengeluaran;

        for (const struk of result.pengeluaran) {
          const masterPegawaiMatch = findMasterItem(masterPegawai, struk.nama_pembeli, 'nama_ic');
          if (masterPegawaiMatch) struk.nama_pembeli = masterPegawaiMatch.nama_ic;

          if (!masterPegawaiMatch) {
            errs.push(`[Pengeluaran] Pegawai "${struk.nama_pembeli}" tidak ditemukan.`);
            continue;
          }

          if (!Array.isArray(struk.detail_beli) || struk.detail_beli.length === 0) continue;

          const totalBiayaStruk = floorToTwo(struk.total_pengeluaran) || 0;
          let totalFixedBiaya = 0;
          const dynamicItems: any[] = [];
          const processedItems: any[] = [];

          for (const item of struk.detail_beli) {
            const masterBahanMatch = findMasterItem(masterBahan, item.bahan, 'nama_bahan');
            const masterMenuMatch = findMasterItem(masterMenu, item.bahan, 'nama_menu');

            let hargaMaster = 0;
            let validIdBahan = null;
            let validName = '';

            if (masterBahanMatch) {
              hargaMaster = floorToTwo(masterBahanMatch.harga_per_unit) || 0;
              validIdBahan = masterBahanMatch.id_bahan;
              validName = masterBahanMatch.nama_bahan;
            } else if (masterMenuMatch) {
              hargaMaster = floorToTwo(getMenuHpp(masterMenuMatch.id_menu));
              validIdBahan = masterMenuMatch.id_menu;
              validName = masterMenuMatch.nama_menu;
            }

            if (!validIdBahan) {
              errs.push(`[Pengeluaran] Bahan/Menu "${item.bahan}" tidak ditemukan.`);
            } else {
              item.bahan = validName;
              const qty = Math.abs(floorToTwo(item.qty)) || 0;
              const proc = {
                originalItem: item,
                id_bahan: validIdBahan,
                nama_bahan: validName,
                qty: qty,
                hargaMaster: hargaMaster,
                is_bahan: !!masterBahanMatch,
                totalBiayaItem: 0,
                hargaPerUnit: 0,
                weight: 0
              };

              const namaLower = validName.toLowerCase();
              const isDynamic = namaLower.includes('water') || namaLower.includes('burger');
              if (isDynamic && totalBiayaStruk > 0) {
                dynamicItems.push(proc);
              } else {
                proc.hargaPerUnit = hargaMaster;
                proc.totalBiayaItem = floorToTwo(hargaMaster * qty);
                totalFixedBiaya += proc.totalBiayaItem;
              }
              processedItems.push(proc);
            }
          }

          let sisaBudget = 0;
          if (totalBiayaStruk > 0) {
            sisaBudget = totalBiayaStruk - totalFixedBiaya;
            if (sisaBudget < 0) sisaBudget = 0;
          }

          let totalDynamicWeight = 0;
          for (const dyn of dynamicItems) {
            dyn.weight = dyn.qty * dyn.hargaMaster;
            totalDynamicWeight += dyn.weight;
          }

          for (const dyn of dynamicItems) {
            let allocated = 0;
            if (totalDynamicWeight > 0) {
              allocated = floorToTwo((dyn.weight / totalDynamicWeight) * sisaBudget);
            } else if (dynamicItems.length > 0) {
              const totalDynQty = dynamicItems.reduce((sum, item) => sum + item.qty, 0);
              allocated = totalDynQty > 0 ? floorToTwo((dyn.qty / totalDynQty) * sisaBudget) : 0;
            }
            dyn.totalBiayaItem = allocated;
            dyn.hargaPerUnit = dyn.qty > 0 ? floorToTwo(allocated / dyn.qty) : 0;
          }

          for (const proc of processedItems) {
            proc.originalItem.total_biaya = proc.totalBiayaItem;
            proc.originalItem.harga_per_unit = proc.hargaPerUnit;

            payloads.pengeluaran.push({
              tanggal: struk.tanggal,
              id_bahan: proc.id_bahan,
              tipe_item: proc.is_bahan ? 'Bahan' : 'Makanan',
              nama_pembeli: masterPegawaiMatch.nama_ic,
              jumlah_unit: floorToTwo(proc.qty),
              harga_aktual_per_unit: proc.hargaPerUnit,
              total_biaya: proc.totalBiayaItem,
              _nama_bahan: proc.nama_bahan,
              _is_bahan: proc.is_bahan
            });
          }
        }
      }

      // Validasi Kas Tambahan
      if (result.kas_tambahan) {
        for (const k of result.kas_tambahan) {
          payloads.kas_tambahan.push({
            tanggal: k.tanggal,
            keterangan: k.keterangan,
            nominal: floorToTwo(k.nominal) || 0
          });
        }
      }

      // Validasi Distribusi Bahan
      if (result.distribusi_bahan) {
        let lastValidName = "";
        for (const d of result.distribusi_bahan) {
          if (d.nama_ic_chef && d.nama_ic_chef.trim() !== "") lastValidName = d.nama_ic_chef;
          else if (lastValidName !== "") d.nama_ic_chef = lastValidName;

          const masterBahanMatch = findMasterItem(masterBahan, d.bahan, 'nama_bahan');
          const masterChefMatch = findMasterItem(masterPegawai, d.nama_ic_chef, 'nama_ic');

          if (masterBahanMatch) d.bahan = masterBahanMatch.nama_bahan;
          if (masterChefMatch) d.nama_ic_chef = masterChefMatch.nama_ic;

          const idBahan = masterBahanMatch ? masterBahanMatch.id_bahan : null;
          const idChef = masterChefMatch ? masterChefMatch.nama_ic : null;

          if (!idBahan) errs.push(`[Distribusi Bahan] Bahan "${d.bahan}" tidak ditemukan.`);
          else if (!idChef) errs.push(`[Distribusi Bahan] Chef "${d.nama_ic_chef}" tidak ditemukan.`);
          else {
            payloads.distribusi_bahan.push({
              tanggal: d.tanggal,
              id_bahan: idBahan,
              qty: Math.abs(floorToTwo(d.qty)) || 0,
              nama_ic_chef: idChef
            });
          }
        }
      }

      // Validasi Distribusi Makanan
      if (result.distribusi_makanan) {
        for (const d of result.distribusi_makanan) {
          const masterMenuMatch = findMasterItem(masterMenu, d.menu, 'nama_menu');
          const masterChefMatch = findMasterItem(masterPegawai, d.nama_ic_chef, 'nama_ic');
          const masterWaiterMatch = findMasterItem(masterPegawai, d.nama_ic_waiter, 'nama_ic');

          if (masterMenuMatch) d.menu = masterMenuMatch.nama_menu;
          if (masterChefMatch) d.nama_ic_chef = masterChefMatch.nama_ic;
          if (masterWaiterMatch) d.nama_ic_waiter = masterWaiterMatch.nama_ic;

          if (!masterMenuMatch) errs.push(`[Distribusi Makanan] Menu "${d.menu}" tidak ditemukan.`);
          else if (!masterChefMatch) errs.push(`[Distribusi Makanan] Pengirim "${d.nama_ic_chef}" tidak ditemukan.`);
          else if (!masterWaiterMatch) errs.push(`[Distribusi Makanan] Penerima "${d.nama_ic_waiter}" tidak ditemukan.`);
          else {
            payloads.transfer_items.push({
              tanggal: d.tanggal,
              tipe_item: 'Makanan',
              id_item: masterMenuMatch.id_menu,
              qty: Math.abs(floorToTwo(d.qty)) || 0,
              dari_ic: masterChefMatch.nama_ic,
              ke_ic: masterWaiterMatch.nama_ic,
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      // Validasi Produksi Chef
      if (result.produksi_chef) {
        let lastValidName = "";
        for (const p of result.produksi_chef) {
          if (p.nama_ic_chef && p.nama_ic_chef.trim() !== "") lastValidName = p.nama_ic_chef;
          else if (lastValidName !== "") p.nama_ic_chef = lastValidName;

          const masterMenuMatch = findMasterItem(masterMenu, p.menu, 'nama_menu');
          const masterChefMatch = findMasterItem(masterPegawai, p.nama_ic_chef, 'nama_ic');

          if (masterMenuMatch) p.menu = masterMenuMatch.nama_menu;
          if (masterChefMatch) p.nama_ic_chef = masterChefMatch.nama_ic;

          if (!masterMenuMatch) errs.push(`[Produksi Chef] Menu "${p.menu}" tidak ditemukan.`);
          else if (!masterChefMatch) errs.push(`[Produksi Chef] Chef "${p.nama_ic_chef}" tidak ditemukan.`);
          else {
            payloads.produksi_chef.push({
              id_produksi: `P_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
              tanggal: p.tanggal,
              id_menu: masterMenuMatch.id_menu,
              qty: Math.abs(floorToTwo(p.qty)) || 0,
              nama_ic_chef: masterChefMatch.nama_ic
            });
          }
        }
      }

      // Validasi Transfer Item
      if (result.transfer_item) {
        for (const t of result.transfer_item) {
          const masterMenuMatch = findMasterItem(masterMenu, t.item, 'nama_menu');
          let idItem = null;

          if (masterMenuMatch) {
            idItem = masterMenuMatch.id_menu;
            t.item = masterMenuMatch.nama_menu;
          }

          const masterDariMatch = findMasterItem(masterPegawai, t.dari_ic, 'nama_ic');
          const masterKeMatch = findMasterItem(masterPegawai, t.ke_ic, 'nama_ic');

          if (masterDariMatch) t.dari_ic = masterDariMatch.nama_ic;
          if (masterKeMatch) t.ke_ic = masterKeMatch.nama_ic;

          if (!idItem) errs.push(`[Transfer Item] Item "${t.item}" tidak ditemukan.`);
          else if (!masterDariMatch) errs.push(`[Transfer Item] Pengirim "${t.dari_ic}" tidak ditemukan.`);
          else if (!masterKeMatch) errs.push(`[Transfer Item] Penerima "${t.ke_ic}" tidak ditemukan.`);
          else {
            payloads.transfer_items.push({
              tanggal: t.tanggal,
              tipe_item: 'Makanan',
              id_item: idItem,
              qty: Math.abs(floorToTwo(t.qty)) || 0,
              dari_ic: masterDariMatch.nama_ic,
              ke_ic: masterKeMatch.nama_ic,
              timestamp: new Date().toISOString()
            });
          }
        }
      }

      // Validasi Setoran
      if (result.setoran) {
        for (const s of result.setoran) {
          const masterPegawaiMatch = findMasterItem(masterPegawai, s.nama_ic, 'nama_ic');
          if (masterPegawaiMatch) {
            payloads.setoran.push({
              tanggal: s.tanggal,
              nama_ic: masterPegawaiMatch.nama_ic,
              status: s.status === true || s.status === 'true'
            });
          } else {
            errs.push(`[Setoran] Pegawai "${s.nama_ic}" tidak ditemukan.`);
          }
        }
      }

      setValidationErrors(errs);
      setPreviewJsonText(JSON.stringify(result, null, 2));

      if (errs.length > 0) {
        setSummaryHtml("⚠️ Gagal! Terdapat kesalahan matching data.");
      } else {
        let totalCount = 0;
        for (const k in payloads) {
          totalCount += payloads[k].length;
        }
        if (totalCount === 0) {
          setSummaryHtml("AI tidak menemukan data yang valid dari teks Anda.");
        } else {
          setSummaryHtml("✅ Sukses! Data tervalidasi dan siap disimpan ke database.");
          setFinalPayloads(payloads);
        }
      }

    } catch (err: any) {
      console.error('AI Processing Error:', err);
      alert('Gagal memproses data dengan AI: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToDb = async () => {
    if (!finalPayloads) return;
    setIsSaving(true);

    try {
      let insertCount = 0;
      let perluUpdateHPP = false;

      const executionOrder = [
        'pengeluaran',
        'distribusi_bahan',
        'produksi_chef',
        'transfer_items',
        'kas_tambahan',
        'setoran',
        'duty'
      ];

      for (const key of executionOrder) {
        const arr = finalPayloads[key];
        if (arr && arr.length > 0) {
          if (key === 'duty' && perluUpdateHPP) {
            const { error: rpcError } = await supabase.rpc('recalculate_all_menu_hpp');
            if (rpcError) console.error("Gagal menjalankan recalculate_all_menu_hpp:", rpcError);
            perluUpdateHPP = false;
          }

          for (const payload of arr) {
            if (key === 'pengeluaran') {
              const pClean = { ...payload };
              delete pClean._nama_bahan;
              delete pClean._is_bahan;
              const { error: insertErr } = await supabase.from(key).insert([pClean]);
              if (insertErr) {
                console.error(`Gagal insert ke ${key}:`, insertErr);
                alert(`Gagal menyimpan data ke ${key}: ${insertErr.message}`);
              } else {
                insertCount++;
                perluUpdateHPP = true;
              }
            } else if (key === 'setoran') {
              const weekInfo = getWeekRange(payload.tanggal);
              if (weekInfo) {
                const { error: upsertErr } = await supabase.from('setoran').upsert([{
                  week_key: weekInfo.key,
                  nama_ic: payload.nama_ic,
                  status: payload.status,
                  tanggal_update: new Date().toISOString()
                }]);
                if (!upsertErr) insertCount++;
              }
            } else {
              const targetTable = key === 'transfer_items' ? 'transfer_item' : key;
              const { error: insertErr } = await supabase.from(targetTable).insert([payload]);
              if (insertErr) {
                console.error(`Gagal insert ke ${targetTable}:`, insertErr);
                alert(`Gagal menyimpan data ke ${targetTable}: ${insertErr.message}`);
              } else {
                insertCount++;
              }
            }
          }
        }
      }

      alert(`Berhasil menyimpan ${insertCount} baris data ke database Supabase!`);
      setInputText('');
      setPreviewJsonText('');
      setFinalPayloads(null);
      setSummaryHtml(null);

    } catch (err: any) {
      console.error('Save DB Error:', err);
      alert('Gagal menyimpan ke database: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleProcessJson = async () => {
    if (!jsonInput.trim()) return;
    setIsProcessingJson(true);
    try {
      const data = JSON.parse(jsonInput);
      let successCount = 0;

      // Mendukung array of duty maupun objek full AI extraction payload
      if (Array.isArray(data)) {
        for (const row of data) {
          if (!row.nama_ic || !row.tanggal) continue;

          let totalJam = 0;
          if (row.waktu_mulai && row.waktu_selesai) {
            const t1 = new Date(`1970-01-01T${row.waktu_mulai}:00`);
            const t2 = new Date(`1970-01-01T${row.waktu_selesai}:00`);
            let diff = (t2.getTime() - t1.getTime()) / (1000 * 60 * 60);
            if (diff < 0) diff += 24;
            totalJam = Math.round(diff * 10) / 10;
          }

          let totalHpp = 0;
          const parsedItems = (row.items || []).map((item: any) => {
            const m = store.menu.find(x => x.nama_menu.toLowerCase() === item.nama_menu.toLowerCase());
            let hpp = 0;
            if (m) hpp = getMenuHpp(m.id_menu);
            totalHpp += hpp * Number(item.qty);
            return {
              id_menu: m ? m.id_menu : null,
              nama_menu: item.nama_menu,
              qty: Number(item.qty)
            };
          });

          const payload = {
            tanggal: row.tanggal,
            nama_ic: row.nama_ic,
            total_jam: totalJam,
            total_omset: Number(row.total_omset) || 0,
            detail_jual: {
              waktu_mulai: row.waktu_mulai || '',
              waktu_selesai: row.waktu_selesai || '',
              items: parsedItems,
              total_hpp: totalHpp
            }
          };

          const { error } = await supabase.from('duty').insert([payload]);
          if (!error) successCount++;
        }
      } else if (typeof data === 'object' && data !== null) {
        const objData = data as Record<string, any[]>;

        // Handle distribusi_makanan -> Supabase table transfer_item
        if (Array.isArray(objData.distribusi_makanan) && objData.distribusi_makanan.length > 0) {
          const mappedRows = objData.distribusi_makanan.map((d: any) => {
            const masterMenuMatch = findMasterItem(store.menu, d.menu, 'nama_menu');
            const masterChefMatch = findMasterItem(store.pegawai, d.nama_ic_chef, 'nama_ic');
            const masterWaiterMatch = findMasterItem(store.pegawai, d.nama_ic_waiter, 'nama_ic');
            return {
              tanggal: d.tanggal,
              tipe_item: 'Makanan',
              id_item: masterMenuMatch ? masterMenuMatch.id_menu : d.menu,
              qty: Math.abs(Number(d.qty)) || 0,
              dari_ic: masterChefMatch ? masterChefMatch.nama_ic : d.nama_ic_chef,
              ke_ic: masterWaiterMatch ? masterWaiterMatch.nama_ic : d.nama_ic_waiter,
              timestamp: new Date().toISOString()
            };
          });
          const { error } = await supabase.from('transfer_item').insert(mappedRows);
          if (!error) successCount += mappedRows.length;
        }

        // Handle transfer_item / transfer_items -> Supabase table transfer_item
        const transferItems = objData.transfer_item || objData.transfer_items;
        if (Array.isArray(transferItems) && transferItems.length > 0) {
          const { error } = await supabase.from('transfer_item').insert(transferItems);
          if (!error) successCount += transferItems.length;
        }

        // Handle standard categories
        const categories = ['duty', 'pengeluaran', 'kas_tambahan', 'distribusi_bahan', 'produksi_chef', 'setoran'];
        for (const cat of categories) {
          if (Array.isArray(objData[cat]) && objData[cat].length > 0) {
            const { error } = await supabase.from(cat).insert(objData[cat]);
            if (!error) successCount += objData[cat].length;
          }
        }
      } else {
        throw new Error('Format JSON harus berupa Array of Object atau Object Payload valid.');
      }

      alert(`Berhasil memproses dan menyimpan ${successCount} data ke database.`);
      setJsonInput('');
    } catch (e: any) {
      alert('Error memproses JSON: ' + e.message);
    } finally {
      setIsProcessingJson(false);
    }
  };

  return (
    <div className="tab-pane active" style={{ display: 'block' }}>
      <div className="header-action mt-20" style={{ marginTop: '30px' }}>
        <h2><i className="fa-solid fa-robot" style={{marginRight: '8px'}}></i> AI Bulk Input (Smart Extractor)</h2>
      </div>

      <div className="card">
        <p style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>
          Paste laporan campuran (duty, pembelian, chef, setoran, dll) ke dalam kotak di bawah ini. AI akan otomatis memisahkannya ke tabel database yang sesuai.
        </p>
        <textarea 
          className="form-control" 
          style={{ width: '100%', height: '230px', resize: 'vertical', padding: '15px', fontFamily: 'monospace', border: '2px solid var(--border-color)', borderRadius: '8px', marginBottom: '15px' }} 
          placeholder="Contoh laporan chat Discord/WhatsApp:&#10;WAITRESS- Selwyn &#10;— 16/03/2026 16:30&#10;TANGGAL: 16/03/2026&#10;JAM DUTY: 19.17-22.05&#10;JENIS & JUMLAH PAKET YANG TERJUAL:&#10;Paket komplit 28&#10;Jus wortel 5&#10;TOTAL PENDAPATAN: $7.840..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        ></textarea>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="btn btn-primary w-100" 
            style={{ padding: '15px', fontSize: '1.1rem', fontWeight: 'bold' }}
            onClick={handleProcess}
            disabled={isLoading || !inputText.trim()}
          >
            {isLoading ? (
              <><i className="fa-solid fa-spinner fa-spin" style={{marginRight: '8px'}}></i> {statusText}</>
            ) : (
              <><i className="fa-solid fa-wand-magic-sparkles" style={{marginRight: '8px'}}></i> Proses Teks Laporan dengan AI</>
            )}
          </button>
        </div>

        {summaryHtml && (
          <div style={{ marginTop: '20px', padding: '15px', borderRadius: '8px', background: validationErrors.length > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)', border: validationErrors.length > 0 ? '1px solid #ef4444' : '1px solid #22c55e' }}>
            <h4 style={{ margin: '0 0 10px 0', color: validationErrors.length > 0 ? '#ef4444' : '#22c55e' }}>{summaryHtml}</h4>
            
            {validationErrors.length > 0 && (
              <ul style={{ color: '#ef4444', margin: 0, paddingLeft: '20px' }}>
                {validationErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            )}

            {finalPayloads && validationErrors.length === 0 && (
              <button 
                className="btn btn-success w-100" 
                style={{ marginTop: '15px', padding: '12px', fontWeight: 'bold' }}
                onClick={handleSaveToDb}
                disabled={isSaving}
              >
                {isSaving ? 'Menyimpan ke Supabase...' : '✅ Simpan Semua Hasil Ekstraksi ke Database'}
              </button>
            )}
          </div>
        )}

        {previewJsonText && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontWeight: 'bold', margin: 0, color: 'var(--text-primary)' }}>
                <i className="fa-solid fa-code" style={{ marginRight: '6px' }}></i> Preview Hasil Ekstraksi (JSON Output):
              </label>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '6px 14px', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                onClick={handleCopyJson}
              >
                {copied ? (
                  <><i className="fa-solid fa-check" style={{ color: '#22c55e' }}></i> Tersalin!</>
                ) : (
                  <><i className="fa-solid fa-copy"></i> Copy JSON</>
                )}
              </button>
            </div>
            <pre style={{ background: 'var(--bg-dark)', padding: '15px', borderRadius: '8px', maxHeight: '250px', overflow: 'auto', fontSize: '0.85rem', color: '#6366f1' }}>
              {previewJsonText}
            </pre>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '30px', border: '2px solid var(--accent-color)', background: 'var(--bg-card)', padding: '25px' }}>
        <h3 style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>
          <i className="fa-solid fa-code" style={{marginRight: '8px'}}></i> Mode JSON Manual
        </h3>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
          Paste Array JSON atau Object JSON hasil ekstraksi ke kotak di bawah untuk langsung dimasukkan ke database Supabase.
        </p>
        <textarea 
          className="form-control" 
          rows={7} 
          style={{ 
            fontFamily: 'monospace', 
            fontSize: '0.9rem', 
            marginBottom: '15px', 
            width: '100%', 
            resize: 'vertical', 
            background: 'var(--bg-dark)', 
            color: 'var(--text-primary)', 
            border: '1px solid var(--border-color)', 
            padding: '15px',
            borderRadius: '8px'
          }} 
          placeholder='[\n  {\n    "tanggal": "2026-08-02",\n    "nama_ic": "Nama Waiter",\n    "waktu_mulai": "12:00",\n    "waktu_selesai": "14:00",\n    "total_omset": 500,\n    "items": [...]\n  }\n]'
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
        ></textarea>
        <button 
          className="btn w-100" 
          style={{ 
            background: 'var(--accent-color)', 
            color: 'var(--text-primary)', 
            fontWeight: 'bold', 
            padding: '15px', 
            fontSize: '1.1rem',
            border: 'none',
            borderRadius: '8px'
          }} 
          onClick={handleProcessJson}
          disabled={isProcessingJson || !jsonInput.trim()}
        >
          {isProcessingJson ? 'Sedang Memproses JSON...' : '✅ Proses JSON & Simpan ke Database'}
        </button>
      </div>
    </div>
  );
}
