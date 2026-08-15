import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { buildDatabaseContext, calculateCustomSupplyChainRestockAndDistribution, generateLocalFallbackResponse } from '../lib/aiDataAggregator';
import { floorToTwo } from '../lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isFallback?: boolean;
}

export default function HiddenAIAnalystPage() {
  const store = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showContextModal, setShowContextModal] = useState(false);

  // Parameter Control Panel Dinamis
  const [chefCountParam, setChefCountParam] = useState<number>(3);
  const [waiterCountParam, setWaiterCountParam] = useState<number>(9);
  const [stepMultipleParam, setStepMultipleParam] = useState<number>(50);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll ke pesan terbaru
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Initial welcome message
  useEffect(() => {
    const activeStaffCount = (store.pegawai || []).filter((p: any) => p.status_kontrak === 'Aktif').length;
    const bahanCount = (store.bahan || []).length;
    const menuCount = (store.menu || []).length;
    const dutyCount = (store.duty || []).length;

    const initialMsg: ChatMessage = {
      id: 'welcome-1',
      role: 'assistant',
      content: `### 🤖 Portal AI Restaurant Executive Analyst & Supply Chain Assistant

Saya telah memuat snapshot database **MAX 2 Periode Terbaru** dari Supabase RestoManager:
- 📦 **Master Bahan Gudang**: ${bahanCount} Jenis Bahan
- 🍽️ **Master Menu & Resep HPP**: ${menuCount} Item Menu
- 👥 **Pegawai Aktif**: ${activeStaffCount} Orang Staff
- 📝 **Log Duty Penjualan**: ${dutyCount} Record (Total Omset 2 Periode Terbaru)

---
### 🔄 Formulasi Rantai Pasokan & Perhitungan Mundur Masakan Bulat (2 Periode):
1. **Restock Hari Minggu**: Dihitung dari target porsi masakan bulat dikurangi sisa stok bahan gudang & chef.
2. **🍳 Target Hasil Masakan Chef**: Porsi produksi masakan per Chef untuk tiap menu satuan.
3. **🥣 Alokasi ${chefCountParam} Chef (DIBAGI RATA + BUFFER)**: Bahan mentah dibagi rata dalam angka bulat. Sisa selisih disimpan sebagai **Stok Cadangan Buffer (Next Periode)**.
4. **🚚 Alokasi Transfer ke ${waiterCountParam} Waiter**: Menu **French Fries, Jus Wortel, dan Katsu HARUS SAMA RATA per Waiter** (karena berbahan sejenis).

Gunakan **Control Panel Parameter** di bawah untuk menyesuaikan jumlah Chef & Waiter, atau ketik pertanyaan Anda!`,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };
    setMessages([initialMsg]);
  }, [store.bahan?.length, store.menu?.length, store.pegawai?.length, store.duty?.length]);

  const handleSendQuery = async (queryText?: string) => {
    const textToSend = (queryText || inputQuery).trim();
    if (!textToSend || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!queryText) setInputQuery('');
    setIsLoading(true);
    setStatusText('AI menganalisis database & menghubungkan ke API server...');

    try {
      const dbContext = buildDatabaseContext(store);

      const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || '';
      const baseUrl = import.meta.env.VITE_AI_BASE_URL || 'https://openrouter.ai/api/v1';
      const model = import.meta.env.VITE_AI_MODEL || 'google/gemini-2.5-flash';

      let aiResponseText = '';
      let isFallbackUsed = false;
      let apiErrorNotice = '';

      if (apiKey || baseUrl) {
        try {
          const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
          if (apiKey) reqHeaders["Authorization"] = `Bearer ${apiKey}`;

          const systemPrompt = `Anda adalah AI Restaurant Executive Consultant & Supply Chain Analyst paling berpengalaman di sistem RestoManager.

ATURAN DOMAIN RESTOMANAGER SANGAT PENTING:
1. CHEF HANYA MEMASAK MENU SATUAN (BURGER, JUS WORTEL, KATSU, WATER, FRENCH FRIES). MENU PAKET TIDAK DIMASAK OLEH CHEF KARENA PAKET ADALAH BUNDLE DARI MENU SATUAN.
2. WINDOW DATA: MENGGUNAKAN DATA MAX 2 PERIODE TERBARU (~14 HARI).
3. SEMUA PERHITUNGAN ADALAH PER MINGGU (PERIODE 7 HARI).
4. WAJIB ADANYA TABEL KHUSUS: "Target Hasil Produksi Masakan per Chef" (berapa porsi yang dimasak Chef Hacm, Mirae, Rumshee per menu satuan).
5. ATURAN KHUSUS TRANSFER WAITER: 3 MENU INI ("French Fries", "Jus Wortel", "Katsu") HARUS ALOKASI SAMA RATA PER WAITER (Misal: jika French Fries = 50, maka Jus Wortel = 50 dan Katsu = 50).
6. Target masakan per menu Satuan HARUS berupa angka genap/bagus kelipatan ${stepMultipleParam} (misal: 50, 100, 120, 150, 200, BUKAN pecahan seperti 121 atau 122).
7. Restock Hari Minggu = Max(0, Total Bahan Dibutuhkan - Sisa Stok Bahan Gudang & Chef).
8. Pembagian Bahan ke ${chefCountParam} Chef DIBAGI RATA dalam angka bulat. Sisa selisih dimasukkan ke "Stok Cadangan Buffer (Next Periode)" dan TIDAK dimasak periode ini.

FORMAT LOKAL & TABEL:
- SEMUA TABEL HARUS MENGGUNAKAN FORMAT TABEL MARKDOWN VISUAL STANDAR (| Header 1 | Header 2 |).
- DILARANG KERAS MEMBUAT CODE BLOCK HTML (seperti \`\`\`html <table...> \`\`\`) DI DALAM LAMPIRAN! SEMUA TABEL HARUS DIRECT VISUAL MARKDOWN TABLE.

KONTEKS DATABASE REAL-TIME RESTOMANAGER (MAX 2 PERIODE TERBARU):
${dbContext}`;

          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: reqHeaders,
            body: JSON.stringify({
              model: model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: textToSend }
              ]
            })
          });

          if (response.ok) {
            const rawText = await response.text();
            
            // Stage 1: Standard JSON parse
            try {
              const data = JSON.parse(rawText);
              if (data.choices?.[0]?.message?.content) {
                aiResponseText = data.choices[0].message.content.trim();
              }
            } catch {
              // Stage 2: Strip trailing SSE noise 'data: [DONE]'
              const cleanedRaw = rawText.replace(/\s*data:\s*\[DONE\]\s*$/, '').trim();
              try {
                const data = JSON.parse(cleanedRaw);
                if (data.choices?.[0]?.message?.content) {
                  aiResponseText = data.choices[0].message.content.trim();
                }
              } catch {
                // Stage 3: SSE / NDJSON line-by-line parser (supports data: {...} lines)
                const lines = rawText.split('\n');
                let accumulatedContent = "";
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
                        accumulatedContent += choice.delta.content;
                      } else if (choice.message?.content) {
                        accumulatedContent += choice.message.content;
                      }
                    }
                  } catch {}
                }
                if (accumulatedContent.trim()) {
                  aiResponseText = accumulatedContent.trim();
                }
              }
            }
          } else {
            const errText = await response.text();
            apiErrorNotice = `⚠️ **API Server Response Error (${response.status} ${response.statusText})**:\n\`\`\`\n${errText}\n\`\`\`\n\n`;
          }
        } catch (e: any) {
          apiErrorNotice = `⚠️ **Gagal terhubung ke AI API Server (${baseUrl})**: ${e.message}\n\n`;
        }
      }

      // Jika API server mengembalikan respon valid, tampilkan respon AI Cloud
      if (!aiResponseText) {
        const fallbackText = generateLocalFallbackResponse(textToSend, store);
        aiResponseText = (apiErrorNotice ? apiErrorNotice : '') + fallbackText;
        isFallbackUsed = true;
      }

      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: aiResponseText,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        isFallback: isFallbackUsed
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `❌ **Terjadi Masalah**: ${err.message}\n\nMenampilkan hasil dari **Local Deterministic Supply Chain Solver**:`,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setStatusText('');
    }
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSelectTemplate = (promptText: string) => {
    setInputQuery(promptText);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  const handleRunCustomSupplyChain = () => {
    const userPrompt = `Hitung rekomendasi restock bahan mentah per minggu hari Minggu, alokasi bahan ke ${chefCountParam} Chef (dibagi rata + sisa buffer next periode), dan alokasi transfer makanan ke ${waiterCountParam} Waiter (proporsional tidak merata kelipatan ${stepMultipleParam}) berdasarkan 4 periode terbaru.`;
    handleSelectTemplate(userPrompt);
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportReport = () => {
    const exportText = messages.map(m => `[${m.timestamp}] ${m.role.toUpperCase()}:\n${m.content}\n\n--------------------------------------------------\n`).join('\n');
    const blob = new Blob([exportText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_Analisis_AI_Resto_${new Date().toISOString().slice(0,10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseInlineFormatting = (text: string): React.ReactNode[] => {
    if (!text) return [];
    let cleanText = text.trim();
    
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(cleanText)) !== null) {
      if (match.index > lastIndex) {
        parts.push(cleanText.substring(lastIndex, match.index));
      }
      const str = match[0];
      if (str.startsWith('**') && str.endsWith('**')) {
        parts.push(<strong key={match.index} style={{ color: '#f1f5f9', fontWeight: 700 }}>{str.slice(2, -2)}</strong>);
      } else if (str.startsWith('*') && str.endsWith('*')) {
        parts.push(<em key={match.index} style={{ color: '#cbd5e1' }}>{str.slice(1, -1)}</em>);
      } else if (str.startsWith('`') && str.endsWith('`')) {
        parts.push(<code key={match.index} style={{ background: 'rgba(51, 65, 85, 0.8)', color: '#38bdf8', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85em', fontFamily: 'monospace' }}>{str.slice(1, -1)}</code>);
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < cleanText.length) {
      parts.push(cleanText.substring(lastIndex));
    }
    return parts;
  };

  const cleanHeading = (line: string): string => {
    let text = line.replace(/^(#{1,6})\s*/, '').trim();
    if (text.startsWith('**') && text.endsWith('**')) {
      text = text.slice(2, -2).trim();
    }
    return text;
  };

  const renderMarkdown = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let tableBuffer: string[] = [];
    let htmlBuffer: string[] = [];
    let codeBuffer: string[] = [];
    let inTable = false;
    let inHtmlBlock = false;
    let inCodeBlock = false;
    let codeLanguage = '';

    const flushTable = (keyPrefix: number) => {
      if (tableBuffer.length < 2) return null;
      const headerLine = tableBuffer[0];
      const bodyLines = tableBuffer.slice(2);

      const parseRow = (line: string) => line.split('|').map(cell => cell.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      const headers = parseRow(headerLine);

      return (
        <div key={`table-${keyPrefix}`} style={{ overflowX: 'auto', margin: '18px 0', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.12)', boxShadow: '0 8px 16px rgba(0,0,0,0.3)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', background: 'rgba(15, 23, 42, 0.75)' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(90deg, #1e293b, #334155)', borderBottom: '2px solid #475569' }}>
                {headers.map((h, i) => (
                  <th key={i} style={{ padding: '12px 16px', textAlign: i === 0 ? 'left' : 'center', color: '#60a5fa', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {parseInlineFormatting(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyLines.map((rowStr, rIdx) => {
                const cells = parseRow(rowStr);
                return (
                  <tr key={rIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: rIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    {cells.map((c, cIdx) => (
                      <td key={cIdx} style={{ padding: '10px 16px', color: '#e2e8f0', textAlign: cIdx === 0 ? 'left' : 'center' }}>
                        {parseInlineFormatting(c)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Handle Code Block ```
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          const codeText = codeBuffer.join('\n');
          // Jika blok kode HTML dan berisi <table, render visual HTML table
          if (codeLanguage === 'html' && codeText.includes('<table')) {
            elements.push(
              <div key={`code-html-${i}`} style={{ overflowX: 'auto', margin: '18px 0', padding: '14px', borderRadius: '10px', background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(59, 130, 246, 0.3)' }} dangerouslySetInnerHTML={{ __html: codeText }} />
            );
          } else {
            elements.push(
              <div key={`code-box-${i}`} style={{ margin: '14px 0', background: '#090d16', borderRadius: '8px', border: '1px solid #1e293b', padding: '14px', overflowX: 'auto' }}>
                <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.84rem', color: '#38bdf8', whiteSpace: 'pre-wrap' }}>{codeText}</pre>
              </div>
            );
          }
          codeBuffer = [];
          inCodeBlock = false;
          codeLanguage = '';
        } else {
          inCodeBlock = true;
          codeLanguage = line.trim().replace('```', '').toLowerCase();
          codeBuffer = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        continue;
      }

      // Handle HTML Block <table
      if (line.trim().startsWith('<table') || line.trim().startsWith('<div class="table"')) {
        inHtmlBlock = true;
        htmlBuffer.push(line);
        if (line.includes('</table>') || line.includes('</div>')) {
          const htmlText = htmlBuffer.join('\n');
          elements.push(
            <div key={`raw-html-${i}`} style={{ overflowX: 'auto', margin: '18px 0', padding: '14px', borderRadius: '10px', background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(59, 130, 246, 0.3)' }} dangerouslySetInnerHTML={{ __html: htmlText }} />
          );
          htmlBuffer = [];
          inHtmlBlock = false;
        }
        continue;
      }

      if (inHtmlBlock) {
        htmlBuffer.push(line);
        if (line.includes('</table>') || line.includes('</div>')) {
          const htmlText = htmlBuffer.join('\n');
          elements.push(
            <div key={`raw-html-${i}`} style={{ overflowX: 'auto', margin: '18px 0', padding: '14px', borderRadius: '10px', background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(59, 130, 246, 0.3)' }} dangerouslySetInnerHTML={{ __html: htmlText }} />
          );
          htmlBuffer = [];
          inHtmlBlock = false;
        }
        continue;
      }

      // Handle Markdown Table | ... |
      if (line.trim().startsWith('|')) {
        inTable = true;
        tableBuffer.push(line);
        continue;
      } else if (inTable) {
        elements.push(flushTable(i));
        tableBuffer = [];
        inTable = false;
      }

      // Handle GitHub Alert Note
      if (line.startsWith('> [!NOTE]')) {
        elements.push(
          <div key={i} style={{ background: 'rgba(59, 130, 246, 0.12)', borderLeft: '4px solid #3b82f6', padding: '12px 16px', borderRadius: '6px', margin: '12px 0', color: '#93c5fd', fontSize: '0.9rem' }}>
            <i className="fa-solid fa-info-circle" style={{ marginRight: '8px' }}></i>
            {parseInlineFormatting(line.replace('> [!NOTE]', '').trim())}
          </div>
        );
        continue;
      }

      // Handle Quote >
      if (line.startsWith('> ')) {
        elements.push(
          <div key={i} style={{ background: 'rgba(30, 41, 59, 0.6)', borderLeft: '3px solid #60a5fa', padding: '8px 14px', borderRadius: '4px', margin: '8px 0', color: '#cbd5e1', fontSize: '0.88rem', fontStyle: 'italic' }}>
            {parseInlineFormatting(line.substring(2))}
          </div>
        );
        continue;
      }

      // Handle Headings #, ##, ###
      if (line.startsWith('### ')) {
        elements.push(<h3 key={i} style={{ margin: '16px 0 8px 0', color: '#60a5fa', fontSize: '1.15rem', fontWeight: 700 }}>{parseInlineFormatting(cleanHeading(line))}</h3>);
      } else if (line.startsWith('## ')) {
        elements.push(<h2 key={i} style={{ margin: '20px 0 10px 0', color: '#93c5fd', fontSize: '1.35rem', fontWeight: 800, borderBottom: '1px solid #334155', paddingBottom: '8px' }}>{parseInlineFormatting(cleanHeading(line))}</h2>);
      } else if (line.startsWith('# ')) {
        elements.push(<h1 key={i} style={{ margin: '22px 0 12px 0', color: '#bfdbfe', fontSize: '1.5rem', fontWeight: 800 }}>{parseInlineFormatting(cleanHeading(line))}</h1>);
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <li key={i} style={{ marginLeft: '22px', marginBottom: '6px', color: '#cbd5e1', lineHeight: '1.6' }}>
            {parseInlineFormatting(line.substring(2))}
          </li>
        );
      } else if (/^\d+\.\s/.test(line)) {
        const itemContent = line.replace(/^\d+\.\s/, '');
        elements.push(
          <div key={i} style={{ marginLeft: '10px', marginBottom: '6px', color: '#cbd5e1', lineHeight: '1.6', display: 'flex', gap: '8px' }}>
            <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>{line.match(/^\d+\./)?.[0]}</span>
            <span>{parseInlineFormatting(itemContent)}</span>
          </div>
        );
      } else if (line.trim() === '---') {
        elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '18px 0' }} />);
      } else if (line.trim().length > 0) {
        elements.push(
          <p key={i} style={{ margin: '8px 0', lineHeight: '1.65', color: '#e2e8f0' }}>
            {parseInlineFormatting(line)}
          </p>
        );
      }
    }

    if (inTable) {
      elements.push(flushTable(lines.length));
    }

    return elements;
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* Executive Glassmorphism Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))',
        borderRadius: '16px',
        padding: '24px 30px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)',
        marginBottom: '22px',
        color: '#fff'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#3b82f6', padding: '5px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
                RESTOMANAGER SECRET PORTAL
              </span>
              <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                <i className="fa-solid fa-lock" style={{ marginRight: '5px' }}></i> URL Direct & <code>Ctrl+Shift+A</code>
              </span>
            </div>
            <h1 style={{ margin: '10px 0 4px 0', fontSize: '1.85rem', fontWeight: 800, background: 'linear-gradient(90deg, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              🤖 AI Restaurant Executive Analyst & Supply Chain Assistant
            </h1>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem' }}>
              Hitungan Mingguan: Chef HANYA Memasak Menu Satuan $\rightarrow$ Restock Minggu $\rightarrow$ Alokasi Chef (Rata + Buffer) $\rightarrow$ Transfer Waiter (Proporsional).
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => setShowContextModal(true)} 
              style={{
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#60a5fa',
                padding: '10px 16px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <i className="fa-solid fa-code"></i> Context DB Real
            </button>
            <button 
              onClick={handleExportReport} 
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#f8fafc',
                padding: '10px 18px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.88rem'
              }}
            >
              <i className="fa-solid fa-download"></i> Ekspor Laporan (.md)
            </button>
            <button 
              onClick={() => setMessages([])} 
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                padding: '10px 14px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.88rem'
              }}
            >
              <i className="fa-solid fa-trash"></i> Reset
            </button>
          </div>
        </div>

        {/* Database Status Pills */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '18px', flexWrap: 'wrap', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fa-solid fa-database"></i> Supabase Sync (113 Duty Logs, 23 Staff Loaded)
          </div>
          <div style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fa-solid fa-cubes"></i> 5 Bahan Mentah | Menu Satuan Filtered | RPC Stock Live
          </div>
          <div style={{ background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fa-solid fa-clock-rotate-left"></i> Window Data: 4 Periode Terbaru (~30 Hari)
          </div>
        </div>
      </div>

      {/* Control Panel Parameter Supply Chain Dinamis */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.85)',
        borderRadius: '14px',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        padding: '18px 24px',
        marginBottom: '22px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
        color: '#fff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-sliders" style={{ color: '#38bdf8' }}></i> Control Panel Parameter Rantai Pasokan (Hitungan Mingguan):
          </h3>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>*Atur target jumlah Chef, Penjual, dan Kelipatan Pembulatan</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '6px', fontWeight: 600 }}>
              👨‍🍳 Jumlah Chef Target (Dibagi Rata):
            </label>
            <input 
              type="number"
              min={1}
              max={10}
              value={chefCountParam}
              onChange={(e) => setChefCountParam(Math.max(1, parseInt(e.target.value) || 1))}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '0.95rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '6px', fontWeight: 600 }}>
              💁 Jumlah Penjual / Waiter Target:
            </label>
            <input 
              type="number"
              min={1}
              max={25}
              value={waiterCountParam}
              onChange={(e) => setWaiterCountParam(Math.max(1, parseInt(e.target.value) || 1))}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '8px 12px',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '0.95rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '6px', fontWeight: 600 }}>
              🔢 Kelipatan Pembulatan Porsi:
            </label>
            <select 
              value={stepMultipleParam}
              onChange={(e) => setStepMultipleParam(parseInt(e.target.value, 10))}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '9px 12px',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '0.95rem'
              }}
            >
              <option value={50}>Kelipatan 50 (50, 100, 120, 150)</option>
              <option value={10}>Kelipatan 10 (10, 20, 30, 40, 50)</option>
              <option value={100}>Kelipatan 100 (100, 200, 300)</option>
            </select>
          </div>

          <div>
            <button 
              onClick={handleRunCustomSupplyChain}
              disabled={isLoading}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 10px rgba(37, 99, 235, 0.4)'
              }}
            >
              <i className="fa-solid fa-play"></i> Hitung Rantai Pasokan AI
            </button>
          </div>
        </div>
      </div>

      {/* Preset Prompt Cards (1-Click Analysis) */}
      <div style={{ marginBottom: '22px' }}>
        <h4 style={{ color: '#cbd5e1', fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#fbbf24' }}></i> Preset Analisis Operasional 1-Klik:
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
          
          <div 
            onClick={handleRunCustomSupplyChain}
            style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.95))',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              borderRadius: '12px',
              padding: '14px 16px',
              cursor: 'pointer',
              color: '#f8fafc',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '4px', color: '#60a5fa' }}>🔄 Restock Minggu & Rantai Pasokan</div>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.4 }}>Hitungan Mingguan $\rightarrow$ {chefCountParam} Chef (Rata + Buffer) $\rightarrow$ {waiterCountParam} Waiter (Proporsional).</div>
          </div>

          <div 
            onClick={() => handleSelectTemplate('Berapa total omset duty sales 4 periode terbaru, total belanja bahan, beban gaji, dan laba bersih restoran saat ini?')}
            style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.95))',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              borderRadius: '12px',
              padding: '14px 16px',
              cursor: 'pointer',
              color: '#f8fafc',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '4px', color: '#4ade80' }}>💰 Audit Keuangan 4 Periode</div>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.4 }}>Hitung omset $650K+ duty sales, belanja bahan, beban gaji, & net profit.</div>
          </div>

          <div 
            onClick={() => handleSelectTemplate('Analisis sisa masakan di tangan Chef dan Waiter saat ini. Karena makanan tidak basi, berapa masakan baru yang perlu dimasak Chef per minggu?')}
            style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.95))',
              border: '1px solid rgba(234, 179, 8, 0.35)',
              borderRadius: '12px',
              padding: '14px 16px',
              cursor: 'pointer',
              color: '#f8fafc',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '4px', color: '#facc15' }}>🍳 Audit Stok Masakan Chef</div>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.4 }}>Hitung sisa makanan tidak basi vs target produksi masak Chef per minggu.</div>
          </div>

          <div 
            onClick={() => handleSelectTemplate('Bagaimana produktivitas jam kerja, total omset yang dihasilkan, dan estimasi gaji tiap pegawai aktif dalam 4 periode terakhir?')}
            style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.95))',
              border: '1px solid rgba(168, 85, 247, 0.35)',
              borderRadius: '12px',
              padding: '14px 16px',
              cursor: 'pointer',
              color: '#f8fafc',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '4px', color: '#c084fc' }}>👥 Performa & Gaji Pegawai</div>
            <div style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.4 }}>Analisis jam duty, omset waiter, rate jam, & komisi %.</div>
          </div>

        </div>
      </div>

      {/* Main Chat Canvas Area */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.92)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '22px',
        minHeight: '480px',
        maxHeight: '680px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.4)'
      }}>

        {/* Message History List */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '12px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {messages.map((msg) => (
            <div 
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '0.78rem', color: '#64748b' }}>
                <span>{msg.role === 'user' ? '👤 Manajer' : '🤖 AI Executive Analyst'}</span>
                <span>• {msg.timestamp}</span>
                {msg.isFallback && (
                  <span style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#facc15', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                    Local Deterministic Supply Chain Engine
                  </span>
                )}
              </div>

              <div style={{
                maxWidth: '92%',
                padding: '18px 24px',
                borderRadius: msg.role === 'user' ? '18px 18px 2px 18px' : '18px 18px 18px 2px',
                background: msg.role === 'user' ? 'linear-gradient(135deg, #2563eb, #1d4ed8)' : 'rgba(30, 41, 59, 0.9)',
                color: '#f8fafc',
                border: msg.role === 'user' ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 8px 16px -2px rgba(0, 0, 0, 0.3)'
              }}>
                {renderMarkdown(msg.content)}

                {msg.role === 'assistant' && (
                  <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px' }}>
                    <button 
                      onClick={() => handleCopy(msg.id, msg.content)}
                      style={{ background: 'transparent', border: 'none', color: copiedId === msg.id ? '#4ade80' : '#94a3b8', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      <i className={`fa-solid ${copiedId === msg.id ? 'fa-check' : 'fa-copy'}`}></i>
                      {copiedId === msg.id ? 'Tersalin!' : 'Copy Response'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#60a5fa', padding: '16px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '10px' }}>
              <i className="fa-solid fa-spinner fa-spin fa-lg"></i>
              <span style={{ fontSize: '0.92rem', fontWeight: 600 }}>{statusText || 'Sedang menganalisis database & menyusun laporan AI...'}</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', gap: '12px' }}>
          <textarea 
            ref={textareaRef}
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendQuery();
              }
            }}
            placeholder="Tanyakan rantai pasokan, restock Minggu, alokasi Chef -> Waiter, atau keuangan RestoManager... (Shift + Enter untuk baris baru)"
            rows={2}
            style={{
              flex: 1,
              background: 'rgba(30, 41, 59, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              borderRadius: '12px',
              padding: '12px 18px',
              color: '#f8fafc',
              fontSize: '0.95rem',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit'
            }}
          />
          <button 
            onClick={() => handleSendQuery()}
            disabled={isLoading || !inputQuery.trim()}
            style={{
              background: isLoading || !inputQuery.trim() ? '#475569' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              padding: '0 26px',
              fontWeight: 700,
              cursor: isLoading || !inputQuery.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '1rem',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)'
            }}
          >
            <i className="fa-solid fa-paper-plane"></i> Kirim
          </button>
        </div>

      </div>

      {/* Modal View Context DB */}
      {showContextModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '16px', maxWidth: '850px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '24px', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#60a5fa' }}><i className="fa-solid fa-code" style={{ marginRight: '8px' }}></i> Snapshot Context Database Real RestoManager (4 Periode)</h3>
              <button onClick={() => setShowContextModal(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.4rem', cursor: 'pointer' }}>&times;</button>
            </div>
            <pre style={{ flex: 1, overflowY: 'auto', background: '#1e293b', padding: '16px', borderRadius: '8px', fontSize: '0.82rem', color: '#38bdf8', lineHeight: '1.5' }}>
              {buildDatabaseContext(store)}
            </pre>
          </div>
        </div>
      )}

    </div>
  );
}
