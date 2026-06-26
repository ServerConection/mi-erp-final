/**
 * Automarcador.jsx
 * Módulo embebido para el sistema de llamadas automáticas.
 * Acceso restringido: ANALISTA, ADMINISTRADOR, COORDINADOR, GERENCIA
 *
 * Incluye una pestaña "Cargar base" que conecta con la data ya
 * sincronizada de Bitrix (negociaciones + etapa + responsable + teléfono)
 * para que el supervisor filtre, asigne quién hace cada llamada, y
 * descargue la base en CSV para subirla al panel del Automarcador
 * (Campañas > Cargar lista de números).
 */
import { useState, useEffect, useCallback, useMemo } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3050";
// URL pública del servicio del Automarcador (mismo dominio que el iframe del panel).
const AUTOMARCADOR_URL = import.meta.env.VITE_AUTOMARCADOR_URL || "https://granddad-important-scoop.ngrok-free.dev";

function authHeaders() {
  const token = localStorage.getItem("token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

// ── Pestaña: Cargar base de llamadas ────────────────────────────────────────
function CargarBase() {
  const [catalogos, setCatalogos]   = useState({ asesores: [], etapas: [] });
  const [filtros, setFiltros]       = useState({ responsable_id: "", desde: "", hasta: "", stage_id: "" });
  const [resultados, setResultados] = useState([]);
  const [seleccion, setSeleccion]   = useState({}); // deal_id -> true
  const [asesorPorItem, setAsesorPorItem] = useState({}); // deal_id -> asesor_id
  const [asesorMasivo, setAsesorMasivo]   = useState("");
  const [loading, setLoading]       = useState(false);
  const [aviso, setAviso]           = useState(null);
  const [error, setError]           = useState(null);
  const [nombreLote, setNombreLote] = useState("");
  const [guardando, setGuardando]   = useState(false);
  const [loteCreado, setLoteCreado] = useState(null);
  const [enviando, setEnviando]         = useState(false);
  const [campaniaCreada, setCampaniaCreada] = useState(null); // { id, total, sinTelefono }

  useEffect(() => {
    fetch(`${API}/api/llamadas/filtros`, { headers: authHeaders() })
      .then(r => r.json())
      .then(j => { if (j.success) setCatalogos({ asesores: j.asesores, etapas: j.etapas }); })
      .catch(() => {});
  }, []);

  const buscar = useCallback(async () => {
    setLoading(true); setError(null); setLoteCreado(null);
    try {
      const qs = new URLSearchParams(
        Object.entries(filtros).filter(([, v]) => v !== "")
      ).toString();
      const r = await fetch(`${API}/api/llamadas/filtrar?${qs}`, { headers: authHeaders() });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Error al filtrar");
      setResultados(j.data);
      setAviso(j.aviso);
      setSeleccion({});
      setAsesorPorItem({});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  const toggleTodos = (val) => {
    const next = {};
    if (val) resultados.forEach(r => { next[r.deal_id] = true; });
    setSeleccion(next);
  };

  const seleccionados = useMemo(
    () => resultados.filter(r => seleccion[r.deal_id]),
    [resultados, seleccion]
  );

  const aplicarAsesorMasivo = () => {
    if (!asesorMasivo) return;
    const next = { ...asesorPorItem };
    seleccionados.forEach(r => { next[r.deal_id] = asesorMasivo; });
    setAsesorPorItem(next);
  };

  const crearLote = async () => {
    if (!nombreLote.trim() || seleccionados.length === 0) return;
    setGuardando(true); setError(null);
    try {
      const items = seleccionados.map(r => ({
        deal_id: r.deal_id,
        contact_id: r.contact_id,
        nombre_cliente: r.nombre_cliente,
        telefono: r.telefono,
        etapa: r.etapa,
        asesor_id: asesorPorItem[r.deal_id] || null,
      }));
      const res = await fetch(`${API}/api/llamadas/lotes`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ nombre: nombreLote.trim(), filtros, items }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "Error al crear el lote");
      setLoteCreado(j.lote_id);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  // Envía la selección actual directo al Automarcador (crea la campaña ya
  // cargada con los números — sin pasar por exportar/descargar/subir CSV).
  const enviarAlAutomarcador = async () => {
    if (seleccionados.length === 0) return;
    setEnviando(true); setError(null); setCampaniaCreada(null);
    try {
      const items = seleccionados.map(r => ({
        telefono: r.telefono,
        nombre_cliente: r.nombre_cliente,
        deal_id: r.deal_id,
      }));
      const res = await fetch(`${AUTOMARCADOR_URL}/api/campaigns/from-erp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({
          name: nombreLote.trim() || `Bitrix ${new Date().toLocaleDateString("es-EC")}`,
          items,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "Error al enviar al Automarcador");
      setCampaniaCreada(j);
    } catch (e) {
      setError(`No se pudo conectar con el Automarcador: ${e.message}`);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-1 space-y-4">

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div>
          <label className="text-[9px] font-black text-slate-400 uppercase">Responsable</label>
          <select className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 mt-1"
            value={filtros.responsable_id}
            onChange={e => setFiltros(f => ({ ...f, responsable_id: e.target.value }))}>
            <option value="">Todos</option>
            {catalogos.asesores.map(a => (
              <option key={a.id} value={a.id}>{a.nombre_completo}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-black text-slate-400 uppercase">Etapa</label>
          <select className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 mt-1"
            value={filtros.stage_id}
            onChange={e => setFiltros(f => ({ ...f, stage_id: e.target.value }))}>
            <option value="">Todas</option>
            {catalogos.etapas.map(e => (
              <option key={e.status_id} value={e.status_id}>{e.categoria} · {e.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-black text-slate-400 uppercase">Desde</label>
          <input type="date" className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 mt-1"
            value={filtros.desde} onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
        </div>
        <div>
          <label className="text-[9px] font-black text-slate-400 uppercase">Hasta</label>
          <input type="date" className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1.5 mt-1"
            value={filtros.hasta} onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
        </div>
        <div className="flex items-end">
          <button onClick={buscar} disabled={loading}
            className="w-full text-[11px] font-black uppercase bg-slate-800 text-white rounded-lg px-3 py-2 hover:bg-slate-700 disabled:opacity-50">
            {loading ? "Buscando…" : "🔍 Filtrar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[11px] text-red-700 font-bold">{error}</div>
      )}
      {aviso && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[10px] text-amber-700 font-bold">⚠ {aviso}</div>
      )}

      {resultados.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">

          {/* Barra de acciones masivas */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
            <span className="text-[10px] font-black text-slate-500">{resultados.length} negociaciones · {seleccionados.length} seleccionadas</span>
            <button onClick={() => toggleTodos(true)}  className="text-[9px] font-black px-2 py-1 rounded-lg border border-slate-300 hover:bg-slate-100">Seleccionar todo</button>
            <button onClick={() => toggleTodos(false)} className="text-[9px] font-black px-2 py-1 rounded-lg border border-slate-300 hover:bg-slate-100">Limpiar</button>

            <div className="ml-auto flex items-center gap-2">
              <select className="text-[10px] border border-slate-200 rounded-lg px-2 py-1.5"
                value={asesorMasivo} onChange={e => setAsesorMasivo(e.target.value)}>
                <option value="">Asignar asesor a seleccionados…</option>
                {catalogos.asesores.map(a => (
                  <option key={a.id} value={a.id}>{a.nombre_completo}</option>
                ))}
              </select>
              <button onClick={aplicarAsesorMasivo} disabled={!asesorMasivo || seleccionados.length === 0}
                className="text-[9px] font-black px-2 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-40">
                Aplicar
              </button>
            </div>
          </div>

          {/* Tabla */}
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-white border-b border-slate-200 text-slate-400 font-black uppercase">
                <tr>
                  <th className="px-3 py-2 text-left w-8"></th>
                  <th className="px-3 py-2 text-left">Negocio</th>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Teléfono</th>
                  <th className="px-3 py-2 text-left">Etapa</th>
                  <th className="px-3 py-2 text-left">Responsable (Bitrix)</th>
                  <th className="px-3 py-2 text-left">Quién llama</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resultados.map(r => (
                  <tr key={r.deal_id} className={seleccion[r.deal_id] ? "bg-blue-50/40" : ""}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={!!seleccion[r.deal_id]}
                        onChange={e => setSeleccion(s => ({ ...s, [r.deal_id]: e.target.checked }))} />
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-700">#{r.deal_id} {r.titulo}</td>
                    <td className="px-3 py-2">{r.nombre_cliente || "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.telefono || "—"}</td>
                    <td className="px-3 py-2">{r.etapa}</td>
                    <td className="px-3 py-2 text-slate-500">{r.asesor_nombre}</td>
                    <td className="px-3 py-2">
                      <select className="text-[10px] border border-slate-200 rounded-lg px-1.5 py-1"
                        value={asesorPorItem[r.deal_id] || ""}
                        onChange={e => setAsesorPorItem(s => ({ ...s, [r.deal_id]: e.target.value }))}>
                        <option value="">Sin asignar</option>
                        {catalogos.asesores.map(a => (
                          <option key={a.id} value={a.id}>{a.nombre_completo}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Crear lote */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-50 border-t border-slate-200">
            <input
              value={nombreLote} onChange={e => setNombreLote(e.target.value)}
              placeholder="Nombre del lote (ej. Seguimiento 25-jun)"
              className="text-[11px] border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-[200px]"
            />
            <button onClick={crearLote} disabled={guardando || !nombreLote.trim() || seleccionados.length === 0}
              className="text-[11px] font-black uppercase bg-emerald-600 text-white rounded-lg px-4 py-2 disabled:opacity-40">
              {guardando ? "Guardando…" : `💾 Crear lote (${seleccionados.length})`}
            </button>
            {loteCreado && (
              <a href={`${API}/api/llamadas/lotes/${loteCreado}/export.csv`} target="_blank" rel="noopener noreferrer"
                className="text-[11px] font-black uppercase bg-blue-600 text-white rounded-lg px-4 py-2">
                ⬇ Descargar CSV para el Automarcador
              </a>
            )}
            <button onClick={enviarAlAutomarcador} disabled={enviando || seleccionados.length === 0}
              className="text-[11px] font-black uppercase bg-pink-600 text-white rounded-lg px-4 py-2 disabled:opacity-40">
              {enviando ? "Enviando…" : `📲 Enviar al Automarcador (${seleccionados.length})`}
            </button>
          </div>

          {campaniaCreada && (
            <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-200 text-[11px] text-emerald-700 font-bold space-y-1">
              <div>
                ✅ Campaña creada en el Automarcador con {campaniaCreada.total} número(s).
                {campaniaCreada.sinTelefono > 0 && ` (${campaniaCreada.sinTelefono} negociaciones sin teléfono disponible se omitieron)`}
              </div>
              <a href={`${AUTOMARCADOR_URL}/admin`} target="_blank" rel="noopener noreferrer" className="underline">
                Abrir panel del Automarcador para asignar asesores y arrancar la campaña →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Automarcador() {
  const [tab, setTab] = useState("panel");

  return (
    <div className="animate-fade-in-up flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
            📞 Automarcador
          </h1>
          <p className="text-slate-500 mt-1">
            Sistema de llamadas automáticas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5">
            <button
              onClick={() => setTab("panel")}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${tab === "panel" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-200"}`}>
              Panel
            </button>
            <button
              onClick={() => setTab("base")}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${tab === "base" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-200"}`}>
              📋 Cargar base
            </button>
          </div>
          {tab === "panel" && (
            <a
              href="https://granddad-important-scoop.ngrok-free.dev/admin"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition"
            >
              ↗ Abrir en nueva pestaña
            </a>
          )}
        </div>
      </div>

      {tab === "panel" ? (
        /* Iframe */
        <div className="flex-1 rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
          <iframe
            src="https://granddad-important-scoop.ngrok-free.dev/admin"
            title="Automarcador"
            className="w-full h-full border-0"
            allow="microphone; camera; autoplay"
          />
        </div>
      ) : (
        <CargarBase />
      )}
    </div>
  );
}
