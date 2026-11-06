/**
 * WaPlantillasInbox.jsx — Plantillas predeterminadas para el Inbox.
 * Las crean administración, gerencia y supervisores; los asesores las usan
 * desde el botón "Plantillas" del Inbox. El backend valida los permisos.
 */
import { useCallback, useEffect, useState } from "react";

const ORIGIN = import.meta.env.VITE_API_URL;
const API = `${ORIGIN}/api/wa`;
const mediaSrc = (url) => (!url ? url : /^https?:\/\//.test(url) ? url : `${ORIGIN}${url}`);
const authH = (json = true) => {
  const h = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
};
const NOMBRE_EMPRESA = { TODAS: "Todas las empresas", VENTAENLINEA: "VENTA EN LÍNEA" };
const vacia = { id: null, titulo: "", texto: "", media_url: null, media_type: null, media_filename: null, empresa: "TODAS", orden: 0 };

export default function WaPlantillasInbox() {
  const [plantillas, setPlantillas] = useState([]);
  const [meta, setMeta] = useState({ es_admin: false, empresas: [] });
  const [form, setForm] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    try {
      const r = await fetch(`${API}/inbox-plantillas/gestion`, { headers: authH(false), cache: "no-store" });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || "No se pudieron cargar las plantillas");
      setPlantillas(d.data || []); setMeta(d.meta || {});
    } catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const subirImagen = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith("image/")) { alert("Solo se permiten imágenes."); return; }
    setSubiendo(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch(`${API}/upload`, { method: "POST", headers: authH(false), body: fd });
      const d = await r.json();
      if (!d.success || !d.data) throw new Error(d.error || "No se pudo subir la imagen");
      setForm(f => ({ ...f, media_url: d.data.url, media_type: "image", media_filename: d.data.originalname }));
    } catch (e) { alert(e.message); }
    finally { setSubiendo(false); }
  };

  const guardar = async () => {
    if (!form.titulo.trim() || (!form.texto.trim() && !form.media_url)) return;
    setGuardando(true);
    try {
      const r = await fetch(`${API}/inbox-plantillas${form.id ? `/${form.id}` : ""}`, {
        method: form.id ? "PUT" : "POST", headers: authH(), body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "No se pudo guardar");
      setForm(null); cargar();
    } catch (e) { alert(e.message); }
    finally { setGuardando(false); }
  };

  const cambiarActivo = async (p) => {
    const r = await fetch(`${API}/inbox-plantillas/${p.id}`, { method: "PUT", headers: authH(), body: JSON.stringify({ activo: !p.activo }) });
    const d = await r.json();
    if (!d.success) alert(d.error || "No se pudo actualizar");
    cargar();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">🗂️ Plantillas del Inbox</h1>
          <p className="text-sm text-slate-500 mt-0.5">Mensajes listos (texto e imagen) que los asesores envían con un clic desde el Inbox.</p>
        </div>
        <button onClick={() => setForm({ ...vacia, empresa: meta.es_admin ? "TODAS" : "" })}
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Nueva plantilla</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mb-4">{error}</div>}
      {cargando ? <div className="text-center py-16 text-slate-400">Cargando…</div> : plantillas.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <div className="text-5xl mb-3">🗂️</div>
          <div className="font-medium text-slate-500">Aún no hay plantillas</div>
          <div className="text-sm mt-1">Crea la primera para que tu equipo la use en el Inbox.</div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plantillas.map(p => (
            <div key={p.id} className={`bg-white border rounded-xl overflow-hidden flex flex-col ${p.activo ? "border-slate-200" : "border-dashed border-slate-300 opacity-60"}`}>
              {p.media_url && <img src={mediaSrc(p.media_url)} alt="" className="w-full h-36 object-cover bg-slate-100" />}
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800">{p.titulo}</span>
                  <span className="text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{NOMBRE_EMPRESA[p.empresa] || p.empresa}</span>
                  {!p.activo && <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Inactiva</span>}
                </div>
                {p.texto && <p className="text-sm text-slate-600 whitespace-pre-wrap line-clamp-4">{p.texto}</p>}
                <div className="mt-auto pt-2 flex gap-2">
                  <button onClick={() => setForm({ ...vacia, ...p, texto: p.texto || "" })}
                    className="text-xs border border-slate-200 hover:border-blue-300 hover:text-blue-600 px-3 py-1.5 rounded-lg">Editar</button>
                  <button onClick={() => cambiarActivo(p)}
                    className="text-xs border border-slate-200 hover:border-slate-400 px-3 py-1.5 rounded-lg">{p.activo ? "Desactivar" : "Activar"}</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex justify-between">
              <h3 className="font-bold text-slate-800">{form.id ? "Editar plantilla" : "Nueva plantilla"}</h3>
              <button onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Título
                <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej. Promo plan 500 megas"
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm normal-case font-normal" />
              </label>
              {meta.es_admin && (
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Empresa
                  <select value={form.empresa} onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white normal-case font-normal">
                    {(meta.empresas || []).map(e => <option key={e} value={e}>{NOMBRE_EMPRESA[e] || e}</option>)}
                  </select>
                </label>
              )}
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Texto
                <textarea rows={5} value={form.texto} onChange={e => setForm(f => ({ ...f, texto: e.target.value }))}
                  placeholder="Hola {{nombre}}, te comparto nuestra promoción…"
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm normal-case font-normal" />
                <span className="block mt-1 normal-case font-normal text-slate-400">Usa {"{{nombre}}"} y se reemplaza por el nombre del cliente.</span>
              </label>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Imagen (opcional)</div>
                {form.media_url ? (
                  <div className="mt-1 flex items-center gap-3">
                    <img src={mediaSrc(form.media_url)} alt="" className="h-20 w-20 object-cover rounded-lg border border-slate-200" />
                    <button onClick={() => setForm(f => ({ ...f, media_url: null, media_type: null, media_filename: null }))}
                      className="text-xs text-red-600 hover:underline">Quitar imagen</button>
                  </div>
                ) : (
                  <label className={`mt-1 inline-flex items-center gap-2 border border-dashed border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-500 cursor-pointer hover:border-green-400 ${subiendo ? "opacity-50 pointer-events-none" : ""}`}>
                    {subiendo ? "Subiendo…" : "🖼️ Seleccionar imagen"}
                    <input type="file" accept="image/*" className="hidden" onChange={e => { subirImagen(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setForm(null)} className="text-sm text-slate-500 px-4 py-2">Cancelar</button>
              <button onClick={guardar} disabled={guardando || subiendo || !form.titulo.trim() || (!form.texto.trim() && !form.media_url)}
                className="bg-green-600 hover:bg-green-500 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg text-sm font-medium">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
