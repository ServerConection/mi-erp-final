/**
 * WaRespaldos.jsx — Buscar y exportar respaldos de conversaciones por número.
 * El PDF se genera con la impresión del navegador (Guardar como PDF), sin
 * dependencias extra: HTML tipo chat, legible y con continuidad cronológica.
 */
import { useState, useCallback } from "react";

const ORIGIN = import.meta.env.VITE_API_URL;
const API = `${ORIGIN}/api/wa`;
const mediaSrc = (url) => (!url ? url : /^https?:\/\//.test(url) ? url : `${ORIGIN}${url}`);
const authH = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

const fmtFull = (ts) =>
  new Date(ts).toLocaleString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDay = (ts) =>
  new Date(ts).toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });

// Genera el HTML del respaldo y lo manda a imprimir (Guardar como PDF)
export function exportChatPDF({ wa_number, contact_name, line_name, messages }) {
  const esc = (s) => (s || "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  let lastDay = "";
  const rows = (messages || []).map(m => {
    const day = fmtDay(m.timestamp);
    let sep = "";
    if (day !== lastDay) { lastDay = day; sep = `<div class="day">${day}</div>`; }
    const side = m.direction === "out" ? "out" : "in";
    const who = m.direction === "out" ? (m.campaign_id ? "Campaña" : "Nosotros") : "Cliente";
    let body = "";
    if (m.media_url && (m.type === "image" || /\.(jpe?g|png|gif|webp)$/i.test(m.media_url))) {
      body += `<img src="${mediaSrc(m.media_url)}" class="media"/>`;
    } else if (m.media_url) {
      body += `<div class="file">📎 Archivo adjunto: ${esc(m.media_url.split("/").pop())}</div>`;
    }
    if (m.content) body += `<div>${esc(m.content)}</div>`;
    if (!body) body = "<div class='muted'>(sin contenido)</div>";
    return `${sep}<div class="row ${side}"><div class="bubble ${side}">
      <div class="who">${who}</div>${body}
      <div class="time">${fmtTime(m.timestamp)}</div></div></div>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Respaldo ${esc(wa_number)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; background:#fff; color:#222; margin:0; padding:24px; }
    .head { border-bottom:2px solid #16a34a; padding-bottom:12px; margin-bottom:20px; }
    .head h1 { margin:0 0 4px; font-size:18px; }
    .head .meta { font-size:12px; color:#555; }
    .day { text-align:center; font-size:11px; color:#666; background:#f1f5f9; border-radius:10px;
           padding:3px 10px; margin:16px auto; width:fit-content; text-transform:capitalize; }
    .row { display:flex; margin:6px 0; }
    .row.out { justify-content:flex-end; }
    .bubble { max-width:70%; padding:8px 12px; border-radius:12px; font-size:13px; line-height:1.4; }
    .bubble.in  { background:#f1f5f9; border:1px solid #e2e8f0; }
    .bubble.out { background:#dcfce7; border:1px solid #bbf7d0; }
    .who  { font-size:10px; font-weight:bold; color:#16a34a; margin-bottom:2px; }
    .time { font-size:10px; color:#888; margin-top:3px; text-align:right; }
    .media { max-width:220px; border-radius:8px; margin:4px 0; display:block; }
    .file { font-size:12px; color:#2563eb; }
    .muted { color:#999; font-style:italic; }
    .foot { margin-top:24px; padding-top:10px; border-top:1px solid #e2e8f0; font-size:10px; color:#999; text-align:center; }
    @media print { body { padding:0 12px; } }
  </style></head><body>
    <div class="head">
      <h1>Respaldo de conversación WhatsApp</h1>
      <div class="meta">
        <b>Contacto:</b> ${esc(contact_name || "Sin nombre")} &nbsp;·&nbsp;
        <b>Número:</b> +${esc(wa_number)} &nbsp;·&nbsp;
        <b>Línea:</b> ${esc(line_name || "—")}<br/>
        <b>Total de mensajes:</b> ${messages.length} &nbsp;·&nbsp;
        <b>Generado:</b> ${fmtFull(Date.now())}
      </div>
    </div>
    ${rows}
    <div class="foot">Respaldo generado desde el ERP · ${fmtFull(Date.now())}</div>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("Permite las ventanas emergentes para exportar el PDF."); return; }
  w.document.write(html);
  w.document.close();
  // Esperar a que carguen las imágenes antes de imprimir
  setTimeout(() => { w.focus(); w.print(); }, 600);
}

export default function WaRespaldos() {
  const [phone, setPhone]     = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [searched, setSearched]   = useState(false);

  const search = useCallback(async () => {
    setLoading(true); setSearched(true);
    try {
      const r = await fetch(`${API}/backup/search?phone=${encodeURIComponent(phone)}`, { headers: authH() });
      const d = await r.json();
      setResults(Array.isArray(d?.data) ? d.data : []);
    } catch (e) {
      console.error("[WaRespaldos] Error:", e);
      setResults([]);
    } finally { setLoading(false); }
  }, [phone]);

  const doExport = async (wa_number) => {
    setExporting(wa_number);
    try {
      const r = await fetch(`${API}/backup/${encodeURIComponent(wa_number)}`, { headers: authH() });
      const d = await r.json();
      if (d.success && d.data) exportChatPDF(d.data);
      else alert(d.error || "No se pudo generar el respaldo");
    } catch (e) {
      alert("Error generando el respaldo");
    } finally { setExporting(null); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">🗂️ Respaldo de conversaciones</h1>
        <p className="text-sm text-slate-500 mt-1">
          Busca por número de teléfono y descarga la conversación completa en PDF.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 flex gap-3">
        <input
          type="text"
          placeholder="Escribe el número (ej. 593987654321)"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
        />
        <button onClick={search} disabled={loading}
          className="bg-green-600 hover:bg-green-500 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
          {loading ? "Buscando…" : "🔍 Buscar"}
        </button>
      </div>

      {searched && !loading && results.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <div className="text-5xl mb-3">🗂️</div>
          <div className="font-medium text-slate-500">Sin resultados</div>
          <div className="text-sm mt-1">Prueba con otro número (o deja vacío para ver los más recientes)</div>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map(r => (
            <div key={r.wa_number} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold flex-shrink-0">
                {(r.contact_name || r.wa_number || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 truncate">
                  {r.contact_name || "Sin nombre"} <span className="text-slate-400 font-normal">+{r.wa_number}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  📱 {r.line_name || "—"} · {r.total_mensajes} mensajes ·
                  {" "}{new Date(r.primer_mensaje).toLocaleDateString("es-EC")} → {new Date(r.ultimo_mensaje).toLocaleDateString("es-EC")}
                </div>
              </div>
              <button onClick={() => doExport(r.wa_number)} disabled={exporting === r.wa_number}
                className="text-xs bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
                {exporting === r.wa_number ? "Generando…" : "📄 Exportar PDF"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
