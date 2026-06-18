// src/pages/CumplimientoLeads.jsx
// Cumplimiento de Leads — NOVONET
// Reporte en vivo (mestra_bitrix) por asesor: leads gestionables, ventas,
// estados Netlife y % de cumplimiento vs. meta editable. Auto-refresh 15 min.
// Disponible para todos los perfiles excepto ASESOR / CONSULTOR.

import { useState, useEffect, useCallback, useRef } from "react";

const API = import.meta.env.VITE_API_URL;
const REFRESH_MS = 15 * 60 * 1000; // 15 minutos

const hoyEcuador = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });

const C = {
  page: { display:"flex", flexDirection:"column", height:"100%", fontFamily:"'Inter','Segoe UI',sans-serif", color:"#f1f5f9", background:"#0f172a", minHeight:0, borderRadius:16, padding:20, gap:16, overflowY:"auto" },
  topBar: { display:"flex", alignItems:"center", gap:14, flexShrink:0 },
  iconBox:{ width:46, height:46, borderRadius:13, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0, boxShadow:"0 4px 16px rgba(99,102,241,.35)" },
  title:  { fontSize:22, fontWeight:800, color:"#f1f5f9", margin:0 },
  sub:    { fontSize:12, color:"#64748b", marginTop:2 },
  liveBadge: { display:"inline-flex", alignItems:"center", gap:6, marginLeft:"auto", background:"rgba(16,185,129,.12)", border:"1px solid rgba(16,185,129,.3)", color:"#34d399", borderRadius:20, padding:"6px 12px", fontSize:11, fontWeight:700 },
  dot: { width:7, height:7, borderRadius:"50%", background:"#34d399", boxShadow:"0 0 0 0 rgba(52,211,153,.6)", animation:"pulse 2s infinite" },

  filtros: { display:"flex", gap:10, flexWrap:"wrap", alignItems:"center", background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:14, padding:14, flexShrink:0 },
  field:  { display:"flex", flexDirection:"column", gap:4 },
  label:  { fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".1em" },
  input:  { background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:9, padding:"8px 12px", fontSize:13, color:"#f1f5f9", outline:"none" },
  select: { background:"rgba(20,30,50,.9)", border:"1px solid rgba(255,255,255,.12)", borderRadius:9, padding:"8px 12px", fontSize:13, color:"#f1f5f9", outline:"none", cursor:"pointer" },
  btn:    { background:"rgba(99,102,241,.15)", border:"1px solid rgba(99,102,241,.3)", borderRadius:9, padding:"9px 16px", fontSize:13, fontWeight:700, color:"#a5b4fc", cursor:"pointer" },
  btnExport: { background:"linear-gradient(135deg,#10b981,#059669)", border:"none", borderRadius:9, padding:"9px 16px", fontSize:13, fontWeight:700, color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:6 },
  btnMetas: { background:"rgba(139,92,246,.15)", border:"1px solid rgba(139,92,246,.3)", borderRadius:9, padding:"9px 16px", fontSize:13, fontWeight:700, color:"#c4b5fd", cursor:"pointer" },

  kpiRow: { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, flexShrink:0 },
  kpiCard:{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:14, padding:"14px 16px" },
  kpiLabel:{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".08em", marginBottom:6 },
  kpiVal: { fontSize:24, fontWeight:800, color:"#f1f5f9", lineHeight:1.1 },
  kpiSub: { fontSize:11, color:"#64748b", marginTop:4 },

  tableWrap:{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:16, overflow:"hidden", flexShrink:0 },
  tableScroll:{ overflowX:"auto" },
  table:  { width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:1100 },
  th:     { textAlign:"left", padding:"10px 12px", background:"rgba(255,255,255,.04)", borderBottom:"1px solid rgba(255,255,255,.08)", color:"#64748b", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:".1em", whiteSpace:"nowrap" },
  td:     { padding:"10px 12px", borderBottom:"1px solid rgba(255,255,255,.04)", color:"#cbd5e1", whiteSpace:"nowrap" },

  progressTrack: { width:90, height:7, borderRadius:4, background:"rgba(255,255,255,.08)", overflow:"hidden" },
  progressFill: (pct, color) => ({ height:"100%", width:`${Math.min(100, pct)}%`, background:color, borderRadius:4, transition:"width .4s" }),

  metaInput: { background:"rgba(255,255,255,.06)", border:"1px solid rgba(99,102,241,.25)", borderRadius:7, padding:"4px 8px", fontSize:12, color:"#f1f5f9", outline:"none", width:64 },
  smallBtn: (bg, color) => ({ background:bg, border:"none", borderRadius:7, padding:"5px 9px", fontSize:11, fontWeight:700, color, cursor:"pointer" }),

  modalOverlay: { position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 },
  modal: { background:"#0f172a", border:"1px solid rgba(255,255,255,.1)", borderRadius:16, padding:22, width:"100%", maxWidth:780, maxHeight:"82vh", overflowY:"auto" },
};

function Kpi({ label, value, color, sub }) {
  return (
    <div style={C.kpiCard}>
      <div style={C.kpiLabel}>{label}</div>
      <div style={{ ...C.kpiVal, color: color || "#f1f5f9" }}>{value ?? "—"}</div>
      {sub && <div style={C.kpiSub}>{sub}</div>}
    </div>
  );
}

function cumplimientoColor(pct) {
  if (pct === null || pct === undefined) return "#64748b";
  if (pct >= 100) return "#34d399";
  if (pct >= 70) return "#fbbf24";
  return "#f87171";
}

function timeAgo(iso) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "hace instantes";
  if (min === 1) return "hace 1 min";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return `hace ${h} h`;
}

export default function CumplimientoLeads() {
  const token = localStorage.getItem("token");

  const perfil = (() => {
    try { return (JSON.parse(localStorage.getItem("userProfile") || "{}").perfil || "").toUpperCase(); }
    catch (_) { return ""; }
  })();
  const sinAcceso = perfil === "ASESOR" || perfil === "CONSULTOR";

  const [fechaDesde, setFechaDesde] = useState(hoyEcuador());
  const [fechaHasta, setFechaHasta] = useState(hoyEcuador());
  const [asesorFiltro, setAsesorFiltro] = useState("");
  const [supervisorFiltro, setSupervisorFiltro] = useState("");

  const [porAsesor, setPorAsesor] = useState([]);
  const [totales, setTotales] = useState(null);
  const [actualizadoEn, setActualizadoEn] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [metasOpen, setMetasOpen] = useState(false);
  const [metas, setMetas] = useState([]);
  const [metasLoading, setMetasLoading] = useState(false);
  const [editMetaId, setEditMetaId] = useState(null);
  const [editMetaVal, setEditMetaVal] = useState("");
  const [nuevaMeta, setNuevaMeta] = useState({ codigo_ejecutivo: "", asesor: "", supervisor: "", meta_gestionables: "" });

  const intervalRef = useRef(null);

  const qs = useCallback(() => {
    const p = new URLSearchParams({
      fechaDesde, fechaHasta,
      ...(asesorFiltro ? { asesor: asesorFiltro } : {}),
      ...(supervisorFiltro ? { supervisor: supervisorFiltro } : {}),
    });
    return p.toString();
  }, [fechaDesde, fechaHasta, asesorFiltro, supervisorFiltro]);

  const cargarReporte = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const r = await fetch(`${API}/api/cumplimiento-leads/reporte?${qs()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.success) {
        setPorAsesor(d.por_asesor);
        setTotales(d.totales);
        setActualizadoEn(d.actualizado_en);
      } else {
        setErrorMsg(d.error || "Error al cargar el reporte");
      }
    } catch (err) {
      console.error("[CumplimientoLeads] error cargando reporte:", err);
      setErrorMsg("No se pudo conectar con el servidor");
    } finally { setLoading(false); }
  }, [qs, token]);

  useEffect(() => { if (!sinAcceso) cargarReporte(); }, [sinAcceso, cargarReporte]);

  // Auto-refresh cada 15 minutos
  useEffect(() => {
    if (sinAcceso) return;
    intervalRef.current = setInterval(cargarReporte, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [sinAcceso, cargarReporte]);

  const exportar = async () => {
    setExporting(true);
    try {
      const r = await fetch(`${API}/api/cumplimiento-leads/export?${qs()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Error al exportar");
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `cumplimiento_leads_novonet_${fechaDesde}_${fechaHasta}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[CumplimientoLeads] error exportando:", err);
    } finally { setExporting(false); }
  };

  const abrirMetas = async () => {
    setMetasOpen(true);
    setMetasLoading(true);
    try {
      const r = await fetch(`${API}/api/cumplimiento-leads/metas`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) setMetas(d.data);
    } catch (err) {
      console.error("[CumplimientoLeads] error cargando metas:", err);
    } finally { setMetasLoading(false); }
  };

  const guardarMeta = async (id) => {
    const valor = Number(editMetaVal);
    if (!Number.isFinite(valor) || valor < 0) return;
    try {
      const r = await fetch(`${API}/api/cumplimiento-leads/metas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meta_gestionables: valor }),
      });
      const d = await r.json();
      if (d.success) {
        setMetas(m => m.map(row => row.id === id ? { ...row, meta_gestionables: valor } : row));
        setEditMetaId(null);
        setEditMetaVal("");
        cargarReporte();
      }
    } catch (err) { console.error("[CumplimientoLeads] error guardando meta:", err); }
  };

  const crearMeta = async () => {
    if (!nuevaMeta.codigo_ejecutivo || !nuevaMeta.asesor) return;
    try {
      const r = await fetch(`${API}/api/cumplimiento-leads/metas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...nuevaMeta,
          meta_gestionables: Number(nuevaMeta.meta_gestionables) || 0,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setMetas(m => [...m, d.data].sort((a, b) => a.asesor.localeCompare(b.asesor)));
        setNuevaMeta({ codigo_ejecutivo: "", asesor: "", supervisor: "", meta_gestionables: "" });
        cargarReporte();
      }
    } catch (err) { console.error("[CumplimientoLeads] error creando meta:", err); }
  };

  if (sinAcceso) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"60vh", background:"#0f172a", borderRadius:16, padding:20 }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🔒</div>
        <p style={{ fontSize:18, fontWeight:700, color:"#fca5a5" }}>Acceso restringido</p>
        <p style={{ color:"#64748b" }}>Los asesores/consultores no tienen acceso a esta sección.</p>
      </div>
    </div>
  );

  return (
    <div style={C.page}>
      <style>{`@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(52,211,153,.6); } 70% { box-shadow: 0 0 0 6px rgba(52,211,153,0); } 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); } }`}</style>

      {/* Top bar */}
      <div style={C.topBar}>
        <div style={C.iconBox}>📊</div>
        <div>
          <h1 style={C.title}>Cumplimiento de Leads</h1>
          <p style={C.sub}>Leads gestionables, ventas y % de cumplimiento por asesor · NOVONET</p>
        </div>
        <div style={C.liveBadge}>
          <span style={C.dot} />
          Actualizado {timeAgo(actualizadoEn)} · auto cada 15 min
        </div>
      </div>

      {/* Filtros */}
      <div style={C.filtros}>
        <div style={C.field}>
          <span style={C.label}>Desde</span>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={C.input} />
        </div>
        <div style={C.field}>
          <span style={C.label}>Hasta</span>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={C.input} />
        </div>
        <div style={C.field}>
          <span style={C.label}>Asesor</span>
          <input value={asesorFiltro} onChange={e => setAsesorFiltro(e.target.value)} placeholder="Filtrar por asesor…" style={C.input} />
        </div>
        <div style={C.field}>
          <span style={C.label}>Supervisor</span>
          <input value={supervisorFiltro} onChange={e => setSupervisorFiltro(e.target.value)} placeholder="Filtrar por supervisor…" style={C.input} />
        </div>
        <button onClick={cargarReporte} style={C.btn}>↻ {loading ? "Cargando…" : "Aplicar filtros"}</button>
        <button onClick={abrirMetas} style={C.btnMetas}>🎯 Metas por asesor</button>
        <button onClick={exportar} style={{ ...C.btnExport, opacity: exporting ? .7 : 1, marginLeft:"auto" }} disabled={exporting}>
          📤 {exporting ? "Exportando…" : "Exportar Excel"}
        </button>
      </div>

      {errorMsg && (
        <div style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.3)", color:"#fca5a5", borderRadius:10, padding:"10px 14px", fontSize:13 }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* KPIs totales */}
      <div style={C.kpiRow}>
        <Kpi label="Leads gestionables" value={totales?.leads_gestionables} color="#a5b4fc" />
        <Kpi label="Venta del día" value={totales?.venta_del_dia} color="#34d399" />
        <Kpi label="Venta en Jotform" value={totales?.venta_jotform} color="#34d399" />
        <Kpi label="Preservicios / sin estatus" value={totales?.preservicios_sin_estatus} color="#fbbf24" />
        <Kpi label="Factibles" value={totales?.factibles} color="#60a5fa" />
        <Kpi label="Asignadas" value={totales?.asignadas} color="#60a5fa" />
        <Kpi label="Preplanificadas" value={totales?.preplanificadas} color="#60a5fa" />
        <Kpi label="Cumplimiento global"
          value={totales?.cumplimiento_pct !== null && totales?.cumplimiento_pct !== undefined ? `${totales.cumplimiento_pct}%` : "—"}
          color={cumplimientoColor(totales?.cumplimiento_pct)}
          sub={totales?.objetivo_gestionables ? `Objetivo: ${totales.objetivo_gestionables}` : null} />
      </div>

      {/* Tabla por asesor */}
      <div style={C.tableWrap}>
        <div style={C.tableScroll}>
          <table style={C.table}>
            <thead>
              <tr>
                {["Código","Asesor","Supervisor","Gestionables","Venta del día","Venta en Jotform","Preserv./sin estatus","Factibles","Asignadas","Preplanif.","Objetivo","Cumplimiento"].map(h => (
                  <th key={h} style={C.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ ...C.td, textAlign: "center", padding: 24 }}>Cargando…</td></tr>
              ) : porAsesor.length === 0 ? (
                <tr><td colSpan={12} style={{ ...C.td, textAlign: "center", padding: 24 }}>Sin registros en el rango seleccionado.</td></tr>
              ) : porAsesor.map(row => (
                <tr key={`${row.codigo}-${row.asesor}`}>
                  <td style={{ ...C.td, color: "#6366f1", fontWeight: 700 }}>{row.codigo}</td>
                  <td style={C.td}>{row.asesor}</td>
                  <td style={C.td}>{row.supervisor || "—"}</td>
                  <td style={C.td}>{row.leads_gestionables}</td>
                  <td style={{ ...C.td, color: "#34d399", fontWeight: 700 }}>{row.venta_del_dia}</td>
                  <td style={C.td}>{row.venta_jotform}</td>
                  <td style={C.td}>{row.preservicios_sin_estatus}</td>
                  <td style={C.td}>{row.factibles}</td>
                  <td style={C.td}>{row.asignadas}</td>
                  <td style={C.td}>{row.preplanificadas}</td>
                  <td style={C.td}>{row.objetivo_gestionables}</td>
                  <td style={C.td}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={C.progressTrack}>
                        <div style={C.progressFill(row.cumplimiento_pct || 0, cumplimientoColor(row.cumplimiento_pct))} />
                      </div>
                      <span style={{ fontWeight:700, color: cumplimientoColor(row.cumplimiento_pct), minWidth:42 }}>
                        {row.cumplimiento_pct !== null ? `${row.cumplimiento_pct}%` : "—"}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de metas por asesor */}
      {metasOpen && (
        <div style={C.modalOverlay} onClick={() => setMetasOpen(false)}>
          <div style={C.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <h2 style={{ fontSize:17, fontWeight:800, margin:0 }}>🎯 Metas de gestionables por asesor</h2>
              <button onClick={() => setMetasOpen(false)} style={C.smallBtn("rgba(255,255,255,.08)", "#94a3b8")}>✕ Cerrar</button>
            </div>

            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16, background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:12, padding:12 }}>
              <input placeholder="Código" value={nuevaMeta.codigo_ejecutivo} onChange={e => setNuevaMeta(v => ({ ...v, codigo_ejecutivo: e.target.value }))} style={{ ...C.input, width:80 }} />
              <input placeholder="Asesor" value={nuevaMeta.asesor} onChange={e => setNuevaMeta(v => ({ ...v, asesor: e.target.value }))} style={{ ...C.input, width:200 }} />
              <input placeholder="Supervisor" value={nuevaMeta.supervisor} onChange={e => setNuevaMeta(v => ({ ...v, supervisor: e.target.value }))} style={{ ...C.input, width:200 }} />
              <input placeholder="Meta" type="number" value={nuevaMeta.meta_gestionables} onChange={e => setNuevaMeta(v => ({ ...v, meta_gestionables: e.target.value }))} style={{ ...C.input, width:80 }} />
              <button onClick={crearMeta} style={C.btn}>+ Agregar</button>
            </div>

            <div style={{ overflowX:"auto" }}>
              <table style={{ ...C.table, minWidth:0 }}>
                <thead>
                  <tr>
                    {["Código","Asesor","Supervisor","Meta gestionables","Acciones"].map(h => (
                      <th key={h} style={C.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metasLoading ? (
                    <tr><td colSpan={5} style={{ ...C.td, textAlign:"center", padding:20 }}>Cargando…</td></tr>
                  ) : metas.length === 0 ? (
                    <tr><td colSpan={5} style={{ ...C.td, textAlign:"center", padding:20 }}>Sin metas registradas.</td></tr>
                  ) : metas.map(m => (
                    <tr key={m.id}>
                      <td style={C.td}>{m.codigo_ejecutivo}</td>
                      <td style={C.td}>{m.asesor}</td>
                      <td style={C.td}>{m.supervisor || "—"}</td>
                      <td style={C.td}>
                        {editMetaId === m.id ? (
                          <input type="number" value={editMetaVal} onChange={e => setEditMetaVal(e.target.value)} style={C.metaInput} autoFocus />
                        ) : m.meta_gestionables}
                      </td>
                      <td style={C.td}>
                        {editMetaId === m.id ? (
                          <div style={{ display:"flex", gap:6 }}>
                            <button style={C.smallBtn("rgba(16,185,129,.18)", "#34d399")} onClick={() => guardarMeta(m.id)}>✓ Guardar</button>
                            <button style={C.smallBtn("rgba(255,255,255,.08)", "#94a3b8")} onClick={() => { setEditMetaId(null); setEditMetaVal(""); }}>Cancelar</button>
                          </div>
                        ) : (
                          <button style={C.smallBtn("rgba(99,102,241,.15)", "#a5b4fc")} onClick={() => { setEditMetaId(m.id); setEditMetaVal(String(m.meta_gestionables)); }}>✏️ Editar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
