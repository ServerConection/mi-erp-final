// Selector de plantillas predeterminadas dentro del Inbox.
// "Enviar" manda la plantilla tal cual (texto + imagen); "Usar texto" la pasa
// al cuadro de mensaje para editarla antes de enviar.
import { useEffect, useState } from "react";

const ORIGIN = import.meta.env.VITE_API_URL;
const API = `${ORIGIN}/api/wa`;
const mediaSrc = (url) => (!url ? url : /^https?:\/\//.test(url) ? url : `${ORIGIN}${url}`);

export const rellenarPlantilla = (texto, contacto) =>
  String(texto || "").replace(/\{\{\s*nombre\s*\}\}/gi, (contacto || "").trim() || "");

export default function InboxPlantillasPicker({ contacto, onEnviar, onUsarTexto, onClose, enviando }) {
  const [plantillas, setPlantillas] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/inbox-plantillas`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (!d.success) throw new Error(d.error || "No se pudieron cargar"); setPlantillas(d.data || []); })
      .catch(e => { setError(e.message); setPlantillas([]); });
  }, []);

  const filtradas = (plantillas || []).filter(p =>
    `${p.titulo} ${p.texto || ""}`.toLowerCase().includes(buscar.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          <h3 className="font-bold text-slate-800">🗂️ Plantillas</h3>
          <input autoFocus value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar plantilla…"
            className="flex-1 bg-[#f0f2f5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#00a884]" />
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <div className="p-4 overflow-y-auto grid sm:grid-cols-2 gap-3">
          {plantillas === null && <div className="col-span-full text-center py-10 text-slate-400 text-sm">Cargando…</div>}
          {error && <div className="col-span-full bg-red-50 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
          {plantillas && !filtradas.length && !error && (
            <div className="col-span-full text-center py-10 text-slate-400 text-sm">
              {plantillas.length ? "Ninguna plantilla coincide." : "Tu supervisor aún no ha cargado plantillas."}
            </div>
          )}
          {filtradas.map(p => (
            <div key={p.id} className="border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              {p.media_url && <img src={mediaSrc(p.media_url)} alt="" className="w-full h-32 object-cover bg-slate-100" />}
              <div className="p-3 flex-1 flex flex-col gap-2">
                <div className="font-semibold text-sm text-slate-800">{p.titulo}</div>
                {p.texto && <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-4">{rellenarPlantilla(p.texto, contacto)}</p>}
                <div className="mt-auto flex gap-2 pt-1">
                  <button disabled={enviando} onClick={() => onEnviar(p)}
                    className="flex-1 bg-[#00a884] hover:bg-[#008f6f] disabled:bg-slate-300 text-white text-xs font-medium px-3 py-1.5 rounded-full">
                    {enviando ? "Enviando…" : "Enviar"}
                  </button>
                  {p.texto && !p.media_url && (
                    <button onClick={() => onUsarTexto(p)}
                      className="text-xs border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-full">Editar antes</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
