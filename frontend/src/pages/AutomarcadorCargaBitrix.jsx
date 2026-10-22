/**
 * AutomarcadorCargaBitrix.jsx
 * "Cargar base" del Automarcador igual que en WABOT: etapa + responsable +
 * fechas de creación. Lee la data ya sincronizada de Bitrix (con teléfono),
 * así nadie tiene que descargar nada de Bitrix. El envío al Automarcador lo
 * hace el backend (/api/llamadas/bitrix/enviar).
 */
import { useState, useEffect } from "react";

const API = `${import.meta.env.VITE_API_URL || "http://localhost:3050"}/api/llamadas/bitrix`;
const authH = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` });
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });

export default function AutomarcadorCargaBitrix() {
  const [opciones, setOpciones] = useState(null);
  const [form, setForm] = useState({ stage_id: "", responsible_id: "", date_from: hoy(), date_to: hoy(), name: "" });
  const [busqResp, setBusqResp] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [enviado, setEnviado] = useState(null);

  useEffect(() => {
    setBusy(true);
    fetch(`${API}/opciones`, { headers: authH() })
      .then(r => r.json())
      .then(j => { if (!j.success) throw new Error(j.error || "No se pudieron cargar los filtros"); setOpciones(j.data); })
      .catch(e => setError(e.message))
      .finally(() => setBusy(false));
  }, []);

  const nombreAuto = (f) => {
    const etapa = opciones?.stages?.find(s => s.id === f.stage_id)?.name || "";
    const resp = f.responsible_id || "";
    const fecha = f.date_from === f.date_to ? f.date_from : `${f.date_from} a ${f.date_to}`;
    return [etapa, fecha, resp].filter(Boolean).join(" - ").toUpperCase();
  };

  const cambiar = (campo, valor) => {
    setPreview(null); setEnviado(null); setError("");
    setForm(prev => {
      const next = { ...prev, [campo]: valor };
      if (campo !== "name") next.name = nombreAuto(next);
      return next;
    });
  };

  const responsables = (opciones?.responsibles || []).filter(r =>
    !busqResp || r.name.toLowerCase().includes(busqResp.toLowerCase()));

  const listo = form.stage_id && form.responsible_id && form.date_from && form.date_to;

  const consultar = async () => {
    setBusy(true); setError(""); setPreview(null); setEnviado(null);
    try {
      const r = await fetch(`${API}/consultar`, { method: "POST", headers: authH(), body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "No se pudo consultar");
      setPreview(j.data);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const enviar = async () => {
    setBusy(true); setError("");
    try {
      const r = await fetch(`${API}/enviar`, { method: "POST", headers: authH(), body: JSON.stringify(form) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "No se pudo enviar al Automarcador");
      setEnviado(j.data);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const lbl = "text-[9px] font-black text-slate-400 uppercase";
  const inp = "w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 mt-1 bg-white";

  return (
    <div className="flex-1 overflow-y-auto p-1 space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <p className="text-[10px] text-slate-500">Empresa: <b>{opciones?.empresa || "cargando…"}</b> · Igual que en WABOT, sin descargar nada de Bitrix.</p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className={lbl}>Etapa</label>
            <select className={inp} value={form.stage_id} disabled={!opciones} onChange={e => cambiar("stage_id", e.target.value)}>
              <option value="">Selecciona una etapa</option>
              {(opciones?.stages || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Responsable</label>
            <input className={inp} placeholder="Buscar responsable…" value={busqResp} onChange={e => setBusqResp(e.target.value)} disabled={!opciones} />
            <select className={inp} value={form.responsible_id} disabled={!opciones} onChange={e => cambiar("responsible_id", e.target.value)}>
              <option value="">Selecciona responsable</option>
              {responsables.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Creación desde</label>
            <input type="date" className={inp} value={form.date_from} onChange={e => cambiar("date_from", e.target.value)} />
          </div>
          <div>
            <label className={lbl}>Creación hasta</label>
            <input type="date" className={inp} value={form.date_to} onChange={e => cambiar("date_to", e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[220px]">
            <label className={lbl}>Nombre de la campaña</label>
            <input className={inp} value={form.name} placeholder="Se genera al seleccionar los filtros" onChange={e => cambiar("name", e.target.value)} />
          </div>
          <button onClick={consultar} disabled={busy || !listo}
            className="text-[11px] font-black uppercase bg-slate-800 text-white rounded-lg px-4 py-2 disabled:opacity-40">
            {busy && !preview ? "Consultando…" : "🔍 Consultar"}
          </button>
          <button onClick={enviar} disabled={busy || !preview?.unique_contacts}
            className="text-[11px] font-black uppercase bg-pink-600 text-white rounded-lg px-4 py-2 disabled:opacity-40">
            {busy && preview ? "Enviando…" : `📲 Crear campaña en Automarcador${preview ? ` (${preview.unique_contacts})` : ""}`}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[11px] text-red-700 font-bold">{error}</div>}

      {enviado && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[11px] text-emerald-700 font-bold space-y-1">
          <div>✅ Campaña creada con {enviado.total} número(s){enviado.sin_telefono > 0 ? ` · ${enviado.sin_telefono} negocios sin teléfono omitidos` : ""}.</div>
          <a href={enviado.panel_url} target="_blank" rel="noopener noreferrer" className="underline">Abrir panel para asignar asesores y arrancar →</a>
        </div>
      )}

      {preview && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-3 gap-3 p-4 text-center border-b border-slate-100">
            <div><div className="text-xl font-bold text-slate-800">{preview.total_deals}</div><div className="text-[10px] text-slate-500">Negocios</div></div>
            <div><div className="text-xl font-bold text-green-700">{preview.unique_contacts}</div><div className="text-[10px] text-slate-500">Teléfonos únicos</div></div>
            <div><div className="text-xl font-bold text-amber-600">{preview.deals_without_phone}</div><div className="text-[10px] text-slate-500">Sin teléfono</div></div>
          </div>
          {preview.truncated && <p className="px-4 pt-2 text-[10px] text-amber-700">Se alcanzó el límite de 10.000 negocios. Reduce el rango de fechas.</p>}
          <div className="max-h-[380px] overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-white border-b border-slate-200 text-slate-400 font-black uppercase">
                <tr><th className="px-3 py-2 text-left">Negocio</th><th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-left">Teléfono</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(preview.items || []).map(it => (
                  <tr key={it.wa_number}>
                    <td className="px-3 py-2 font-bold text-slate-700">#{it.variables?.bitrix_id}</td>
                    <td className="px-3 py-2">{it.name || "—"}</td>
                    <td className="px-3 py-2 font-mono">+{it.wa_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!preview.items?.length && <div className="p-4 text-center text-[11px] text-slate-500">No se encontraron teléfonos válidos.</div>}
          </div>
          {preview.unique_contacts > (preview.items?.length || 0) && (
            <p className="px-4 py-2 text-[10px] text-slate-400">Se muestran {preview.items.length}; la campaña incluirá los {preview.unique_contacts} números.</p>
          )}
        </div>
      )}
    </div>
  );
}
