/**
 * AutomarcadorCargaBitrix.jsx
 * "Cargar base" del Automarcador igual que en WABOT: etapa + responsable +
 * fechas de creación. Lee la data ya sincronizada de Bitrix (con teléfono),
 * así nadie tiene que descargar nada de Bitrix. El envío al Automarcador lo
 * hace el backend (/api/llamadas/bitrix/enviar).
 */
import { useState, useEffect } from "react";
import MultiSelectBuscable from "../components/MultiSelectBuscable";

const API = `${import.meta.env.VITE_API_URL || "http://localhost:3050"}/api/llamadas/bitrix`;
const authH = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` });
// El envío al Automarcador anterior (ngrok) queda oculto, no borrado.
const MOSTRAR_METODO_ANTERIOR = false;
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });

export default function AutomarcadorCargaBitrix() {
  const [opciones, setOpciones] = useState(null);
  const [form, setForm] = useState({ stage_ids: [], responsible_ids: [], date_from: hoy(), date_to: hoy(), name: "" });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [enviado, setEnviado] = useState(null);
  // Automarcador por Bitrix: asesores que marcan desde su teléfono de Bitrix
  const [asesores, setAsesores] = useState([]);
  const [asesorIds, setAsesorIds] = useState([]);
  const [campanas, setCampanas] = useState([]);
  const [creadaBx, setCreadaBx] = useState(null);
  const [rango, setRango] = useState({ desde: hoy(), hasta: hoy() });

  // Reporte de llamadas: hora, duración, resultado y tipificación (CSV para Excel)
  const descargarReporte = async () => {
    setError("");
    try {
      const qs = new URLSearchParams(rango).toString();
      const r = await fetch(`${API}/reporte?${qs}`, { headers: authH() });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "No se pudo generar el reporte");
      const cols = [["campana", "Campaña"], ["asesor", "Asesor"], ["nombre_cliente", "Cliente"], ["telefono", "Teléfono"],
        ["deal_id", "Negociación"], ["hora_llamada", "Hora llamada"], ["duracion_seg", "Duración (s)"], ["estado", "Resultado"],
        ["tipificacion", "Tipificación"], ["hora_tipificacion", "Hora tipificación"], ["intentos", "Intentos"]];
      const celda = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [cols.map(c => celda(c[1])).join(";"), ...j.data.map(f => cols.map(c => celda(f[c[0]])).join(";"))].join("\r\n");
      const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = `reporte_automarcador_${rango.desde}_${rango.hasta}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  };

  const cargarCampanas = () => fetch(`${API}/campanas`, { headers: authH() })
    .then(r => r.json()).then(j => { if (j.success) setCampanas(j.data); }).catch(() => {});

  useEffect(() => {
    fetch(`${API}/asesores`, { headers: authH() })
      .then(r => r.json()).then(j => { if (j.success) setAsesores(j.data); }).catch(() => {});
    cargarCampanas();
  }, []);

  const crearCampanaBitrix = async () => {
    setBusy(true); setError(""); setCreadaBx(null);
    try {
      const r = await fetch(`${API}/campanas`, { method: "POST", headers: authH(), body: JSON.stringify({ ...form, asesor_ids: asesorIds }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "No se pudo crear la campaña");
      setCreadaBx(j.data); cargarCampanas();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const reintentar = async (id) => {
    setError("");
    try {
      const r = await fetch(`${API}/campanas/${id}/reintentar`, { method: "POST", headers: authH() });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "No se pudo reintentar");
      cargarCampanas();
    } catch (e) { setError(e.message); }
  };

  useEffect(() => {
    setBusy(true);
    fetch(`${API}/opciones`, { headers: authH() })
      .then(r => r.json())
      .then(j => { if (!j.success) throw new Error(j.error || "No se pudieron cargar los filtros"); setOpciones(j.data); })
      .catch(e => setError(e.message))
      .finally(() => setBusy(false));
  }, []);

  const nombreAuto = (f) => {
    const resumen = (ids = [], opts = []) => ids.length === 0 ? "" : ids.length === 1
      ? (opts.find(o => String(o.id) === String(ids[0]))?.name || "") : `${ids.length} seleccionados`;
    const etapa = resumen(f.stage_ids, opciones?.stages);
    const resp = resumen(f.responsible_ids, opciones?.responsibles);
    const fecha = f.date_from === f.date_to ? f.date_from : `${f.date_from} a ${f.date_to}`;
    return [etapa, fecha, resp].filter(Boolean).join(" - ").toUpperCase();
  };

  const cambiar = (campo, valor) => {
    setPreview(null); setEnviado(null); setCreadaBx(null); setError("");
    setForm(prev => {
      const next = { ...prev, [campo]: valor };
      if (campo !== "name") next.name = nombreAuto(next);
      return next;
    });
  };

  const listo = form.date_from && form.date_to;

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
            <label className={lbl}>Etapas</label>
            <MultiSelectBuscable options={opciones?.stages || []} value={form.stage_ids} disabled={!opciones}
              onChange={v => cambiar("stage_ids", v)} placeholder="Buscar etapa…" todosLabel="Todas las etapas" />
          </div>
          <div>
            <label className={lbl}>Responsables</label>
            <MultiSelectBuscable options={opciones?.responsibles || []} value={form.responsible_ids} disabled={!opciones}
              onChange={v => cambiar("responsible_ids", v)} placeholder="Buscar responsable…" todosLabel="Todos los responsables" />
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
          {MOSTRAR_METODO_ANTERIOR && (
          <button onClick={enviar} disabled={busy || !preview?.unique_contacts}
            className="text-[11px] font-black uppercase bg-pink-600 text-white rounded-lg px-4 py-2 disabled:opacity-40">
            {busy && preview ? "Enviando…" : `📲 Crear campaña en Automarcador${preview ? ` (${preview.unique_contacts})` : ""}`}
          </button>
          )}
        </div>
      </div>

      {preview?.unique_contacts > 0 && (
        <div className="bg-white rounded-2xl border border-blue-200 p-4 space-y-2">
          <p className="text-[11px] font-black text-slate-700">☎ Marcar por Bitrix (teléfono de cada asesor)</p>
          <p className="text-[10px] text-slate-500">Los {preview.unique_contacts} números se reparten entre los asesores elegidos. Cada uno los marca desde la app "Automarcador" en su Bitrix.</p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[220px]">
              <label className={lbl}>Asesores</label>
              <MultiSelectBuscable options={asesores} value={asesorIds} onChange={setAsesorIds}
                placeholder="Buscar asesor…" todosLabel="Selecciona asesores" />
            </div>
            <button onClick={crearCampanaBitrix} disabled={busy || !asesorIds.length}
              className="text-[11px] font-black uppercase bg-blue-600 text-white rounded-lg px-4 py-2 disabled:opacity-40">
              ☎ Crear campaña Bitrix ({asesorIds.length} asesor{asesorIds.length === 1 ? "" : "es"})
            </button>
          </div>
          {creadaBx && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[11px] text-emerald-700 font-bold">
              ✅ Campaña #{creadaBx.campana_id} creada con {creadaBx.total} número(s) repartidos entre {Object.keys(creadaBx.por_asesor || {}).length} asesor(es).
            </div>
          )}
        </div>
      )}

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

      {campanas.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex flex-wrap items-end gap-2 px-4 pt-3">
            <p className="text-[11px] font-black text-slate-700 mr-auto">Campañas Bitrix</p>
            <label className="text-[9px] font-black text-slate-400 uppercase">Desde
              <input type="date" className={inp} value={rango.desde} onChange={e => setRango(x => ({ ...x, desde: e.target.value }))} />
            </label>
            <label className="text-[9px] font-black text-slate-400 uppercase">Hasta
              <input type="date" className={inp} value={rango.hasta} onChange={e => setRango(x => ({ ...x, hasta: e.target.value }))} />
            </label>
            <button onClick={descargarReporte}
              className="text-[11px] font-black uppercase bg-emerald-600 text-white rounded-lg px-4 py-2">⬇ Reporte de llamadas</button>
          </div>
          <table className="w-full text-[10px] mt-2">
            <thead className="bg-slate-50 text-slate-400 font-black uppercase">
              <tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Nombre</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Pendientes</th><th className="px-3 py-2">Contestadas</th><th className="px-3 py-2">No contestan</th><th className="px-3 py-2"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campanas.map(c => (
                <tr key={c.id}>
                  <td className="px-3 py-2 font-bold">{c.id}</td>
                  <td className="px-3 py-2">{c.nombre}</td>
                  <td className="px-3 py-2 text-center">{c.total}</td>
                  <td className="px-3 py-2 text-center">{c.pendientes}</td>
                  <td className="px-3 py-2 text-center text-green-700 font-bold">{c.contestadas}</td>
                  <td className="px-3 py-2 text-center text-amber-600 font-bold">{c.no_contesta}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => reintentar(c.id)} disabled={!c.no_contesta}
                      className="text-[9px] font-black px-2 py-1 rounded-lg border border-slate-300 disabled:opacity-40">↻ Reintentar no contestados</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
