// src/pages/BackofficeJotform.jsx
// Backoffice Jotform — Revisión, embudo (cuello de botella) y heatmap asesor x hora
// para NOVONET y VELSA (cuentas Jotform separadas, mismo backoffice).
// Disponible para todos los perfiles excepto ASESOR / CONSULTOR.

import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer, FunnelChart, Funnel, LabelList, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
} from "recharts";

const API = import.meta.env.VITE_API_URL;

const hoyEcuador = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
const inicioMes  = () => hoyEcuador().slice(0, 7) + "-01";

const C = {
  page: { display:"flex", flexDirection:"column", height:"100%", fontFamily:"'Inter','Segoe UI',sans-serif", color:"#f1f5f9", background:"#0f172a", minHeight:0, borderRadius:16, padding:20, gap:16, overflowY:"auto" },
  topBar: { display:"flex", alignItems:"center", gap:14, flexShrink:0 },
  iconBox:{ width:46, height:46, borderRadius:13, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0, boxShadow:"0 4px 16px rgba(99,102,241,.35)" },
  title:  { fontSize:22, fontWeight:800, color:"#f1f5f9", margin:0 },
  sub:    { fontSize:12, color:"#64748b", marginTop:2 },

  filtros: { display:"flex", gap:10, flexWrap:"wrap", alignItems:"center", background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:14, padding:14, flexShrink:0 },
  field:  { display:"flex", flexDirection:"column", gap:4 },
  label:  { fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:".1em" },
  input:  { background:"rgba(255,255,255,.06)", border:"1px solid rgba(255,255,255,.12)", borderRadius:9, padding:"8px 12px", fontSize:13, color:"#f1f5f9", outline:"none" },
  select: { background:"rgba(20,30,50,.9)", border:"1px solid rgba(255,255,255,.12)", borderRadius:9, padding:"8px 12px", fontSize:13, color:"#f1f5f9", outline:"none", cursor:"pointer" },
  btn:    { background:"rgba(99,102,241,.15)", border:"1px solid rgba(99,102,241,.3)", borderRadius:9, padding:"9px 16px", fontSize:13, fontWeight:700, color:"#a5b4fc", cursor:"pointer" },
  btnExport: { background:"linear-gradient(135deg,#10b981,#059669)", border:"none", borderRadius:9, padding:"9px 16px", fontSize:13, fontWeight:700, color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:6 },

  kpiRow: { display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, flexShrink:0 },
  kpiCard:{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:14, padding:"14px 16px" },
  kpiLabel:{ fontSize:10, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".08em", marginBottom:6 },
  kpiVal: { fontSize:24, fontWeight:800, color:"#f1f5f9", lineHeight:1.1 },
  kpiSub: { fontSize:11, color:"#64748b", marginTop:4 },

  panelsRow: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, flexShrink:0 },
  panel:  { background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:16, padding:18 },
  panelTitle: { fontSize:13, fontWeight:800, color:"#f1f5f9", marginBottom:14, display:"flex", alignItems:"center", gap:8 },

  bottleneckBadge:{ display:"inline-flex", alignItems:"center", gap:6, background:"rgba(239,68,68,.13)", border:"1px solid rgba(239,68,68,.3)", color:"#fca5a5", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700, marginTop:10 },

  tableWrap:{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.08)", borderRadius:16, overflow:"hidden", flexShrink:0 },
  tableScroll:{ overflowX:"auto" },
  table:  { width:"100%", borderCollapse:"collapse", fontSize:12, minWidth:900 },
  th:     { textAlign:"left", padding:"10px 12px", background:"rgba(255,255,255,.04)", borderBottom:"1px solid rgba(255,255,255,.08)", color:"#64748b", fontSize:10, fontWeight:800, textTransform:"uppercase", letterSpacing:".1em", whiteSpace:"nowrap" },
  td:     { padding:"10px 12px", borderBottom:"1px solid rgba(255,255,255,.04)", color:"#cbd5e1", whiteSpace:"nowrap" },
  pagBar: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", borderTop:"1px solid rgba(255,255,255,.06)" },

  badge: (color) => ({ background:`${color}22`, border:`1px solid ${color}55`, color, borderRadius:6, padding:"3px 9px", fontSize:11, fontWeight:700 }),
  textarea: { background:"rgba(255,255,255,.06)", border:"1px solid rgba(99,102,241,.25)", borderRadius:8, padding:"6px 9px", fontSize:12, color:"#f1f5f9", outline:"none", width:160, resize:"vertical", minHeight:32, fontFamily:"inherit" },
  smallBtn: (bg, color) => ({ background:bg, border:"none", borderRadius:7, padding:"6px 10px", fontSize:11, fontWeight:700, color, cursor:"pointer" }),
};

const REV_COLOR = { PENDIENTE:"#fbbf24", APROBADO:"#34d399", RECHAZADO:"#f87171" };
const HORAS = Array.from({ length: 24 }, (_, i) => i);

function Kpi({ label, value, color, sub }) {
  return (
    <div style={C.kpiCard}>
      <div style={C.kpiLabel}>{label}</div>
      <div style={{ ...C.kpiVal, color: color || "#f1f5f9" }}>{value ?? "—"}</div>
      {sub && <div style={C.kpiSub}>{sub}</div>}
    </div>
  );
}

export default function BackofficeJotform() {
  const token = localStorage.getItem("token");

  const perfil = (() => {
    try { return (JSON.parse(localStorage.getItem("userProfile") || "{}").perfil || "").toUpperCase(); }
    catch (_) { return ""; }
  })();
  const sinAcceso = perfil === "ASESOR" || perfil === "CONSULTOR";

  const [empresa, setEmpresa]       = useState("novonet");
  const [fechaDesde, setFechaDesde] = useState(inicioMes());
  const [fechaHasta, setFechaHasta] = useState(hoyEcuador());
  const [asesorFiltro, setAsesorFiltro] = useState("");

  const [kpis, setKpis]       = useState(null);
  const [embudo, setEmbudo]   = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [listado, setListado] = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editRow, setEditRow] = useState(null); // id_externo siendo editado
  const [obsTexto, setObsTexto] = useState("");

  const qs = useCallback((extra = {}) => {
    const p = new URLSearchParams({
      empresa, fechaDesde, fechaHasta,
      ...(asesorFiltro ? { asesor: asesorFiltro } : {}),
      ...extra,
    });
    return p.toString();
  }, [empresa, fechaDesde, fechaHasta, asesorFiltro]);

  const cargarTodo = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [rKpi, rEmb, rHeat, rList] = await Promise.all([
        fetch(`${API}/api/backoffice-jotform/kpis?${qs()}`, { headers }),
        fetch(`${API}/api/backoffice-jotform/embudo?${qs()}`, { headers }),
        fetch(`${API}/api/backoffice-jotform/heatmap?${qs()}`, { headers }),
        fetch(`${API}/api/backoffice-jotform/listado?${qs({ page: 1, pageSize: 50, ...(estadoFiltro ? { estadoRevision: estadoFiltro } : {}) })}`, { headers }),
      ]);
      const [dKpi, dEmb, dHeat, dList] = await Promise.all([rKpi.json(), rEmb.json(), rHeat.json(), rList.json()]);
      if (dKpi.success) setKpis(dKpi.kpis);
      if (dEmb.success) setEmbudo(dEmb);
      if (dHeat.success) setHeatmap(dHeat.celdas);
      if (dList.success) { setListado(dList.data); setTotal(dList.total); setPage(1); }
    } catch (err) {
      console.error("[BackofficeJotform] error cargando datos:", err);
    } finally { setLoading(false); }
  }, [qs, token, estadoFiltro]);

  useEffect(() => { if (!sinAcceso) cargarTodo(); }, [sinAcceso, cargarTodo]);

  const cargarPagina = useCallback(async (nuevaPagina) => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const r = await fetch(`${API}/api/backoffice-jotform/listado?${qs({ page: nuevaPagina, pageSize: 50, ...(estadoFiltro ? { estadoRevision: estadoFiltro } : {}) })}`, { headers });
      const d = await r.json();
      if (d.success) { setListado(d.data); setTotal(d.total); setPage(nuevaPagina); }
    } catch (_) {} finally { setLoading(false); }
  }, [qs, token, estadoFiltro]);

  const guardarRevision = async (id_externo, estado_revision, observacion) => {
    try {
      const r = await fetch(`${API}/api/backoffice-jotform/revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ empresa, id_externo, estado_revision, observacion }),
      });
      const d = await r.json();
      if (d.success) {
        setListado(l => l.map(row => row.id_externo === id_externo
          ? { ...row, estado_revision: d.data.estado_revision, observacion: d.data.observacion, revisado_por: d.data.revisado_por }
          : row));
        setEditRow(null);
        setObsTexto("");
      }
    } catch (err) { console.error("[BackofficeJotform] error guardando revisión:", err); }
  };

  const exportar = async () => {
    setExporting(true);
    try {
      const r = await fetch(`${API}/api/backoffice-jotform/export?${qs(estadoFiltro ? { estadoRevision: estadoFiltro } : {})}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Error al exportar");
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `backoffice_jotform_${empresa}_${fechaDesde}_${fechaHasta}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[BackofficeJotform] error exportando:", err);
    } finally { setExporting(false); }
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

  const funnelData = embudo ? embudo.embudo.map((e, i) => ({
    name: e.etapa, value: e.cantidad,
    fill: ["#6366f1", "#8b5cf6", "#10b981"][i] || "#64748b",
  })) : [];

  // Matriz heatmap: asesores únicos x 24 horas
  const asesoresHeatmap = [...new Set(heatmap.map(c => c.asesor))].sort();
  const maxCantidad = Math.max(1, ...heatmap.map(c => c.cantidad));
  const celda = (asesor, hora) => heatmap.find(c => c.asesor === asesor && c.hora === hora)?.cantidad || 0;
  const colorCelda = (v) => {
    if (v === 0) return "rgba(255,255,255,.03)";
    const t = v / maxCantidad;
    const r = Math.round(99 + t * (239 - 99));
    const g = Math.round(102 + t * (68 - 102));
    const b = Math.round(241 + t * (68 - 241));
    return `rgba(${r},${g},${b},${0.25 + t * 0.55})`;
  };

  const horaPorAsesorBar = embudo ? embudo.por_hora.map(h => ({ hora: `${h.hora}h`, ingresados: h.ingresados, activos: h.activos })) : [];

  return (
    <div style={C.page}>
      {/* Top bar */}
      <div style={C.topBar}>
        <div style={C.iconBox}>📋</div>
        <div>
          <h1 style={C.title}>Backoffice Jotform</h1>
          <p style={C.sub}>Revisión de envíos · embudo y cuello de botella · NOVONET / VELSA</p>
        </div>
      </div>

      {/* Filtros */}
      <div style={C.filtros}>
        <div style={C.field}>
          <span style={C.label}>Empresa</span>
          <select value={empresa} onChange={e => setEmpresa(e.target.value)} style={C.select}>
            <option value="novonet">NOVONET</option>
            <option value="velsa">VELSA</option>
          </select>
        </div>
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
          <span style={C.label}>Estado revisión</span>
          <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} style={C.select}>
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="APROBADO">Aprobado</option>
            <option value="RECHAZADO">Rechazado</option>
          </select>
        </div>
        <button onClick={cargarTodo} style={C.btn}>↻ {loading ? "Cargando…" : "Aplicar filtros"}</button>
        <button onClick={exportar} style={{ ...C.btnExport, opacity: exporting ? .7 : 1, marginLeft:"auto" }} disabled={exporting}>
          📤 {exporting ? "Exportando…" : "Exportar Excel"}
        </button>
      </div>

      {/* KPIs */}
      <div style={C.kpiRow}>
        <Kpi label="Ingresados" value={kpis?.ingresados} />
        <Kpi label="Gestionables" value={kpis?.gestionables}
          color="#a5b4fc"
          sub={kpis?.ingresados ? `${Math.round((kpis.gestionables / kpis.ingresados) * 100)}% del total` : null} />
        <Kpi label="Activos" value={kpis?.activos}
          color="#34d399"
          sub={kpis?.ingresados ? `${Math.round((kpis.activos / kpis.ingresados) * 100)}% conversión` : null} />
        <Kpi label="Venta Servicio" value={kpis?.venta_servicio}
          color="#14b8a6"
          sub={kpis?.activos ? `${Math.round((kpis.venta_servicio / kpis.activos) * 100)}% de activos` : null} />
        <Kpi label="Pendientes revisión" value={kpis?.pendientes_revision} color="#fbbf24" />
        <Kpi label="Aprobados" value={kpis?.aprobados} color="#34d399" />
        <Kpi label="Rechazados" value={kpis?.rechazados} color="#f87171" />
      </div>

      {/* Embudo + Hora */}
      <div style={C.panelsRow}>
        <div style={C.panel}>
          <div style={C.panelTitle}><span>🪣</span> Embudo (Ingresados → Gestionables → Activos)</div>
          <ResponsiveContainer width="100%" height={220}>
            <FunnelChart>
              <Tooltip />
              <Funnel dataKey="value" data={funnelData} isAnimationActive>
                <LabelList position="right" fill="#f1f5f9" stroke="none" dataKey="name" />
                <LabelList position="center" fill="#0f172a" stroke="none" dataKey="value" fontWeight={800} />
                {funnelData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
          {embudo?.cuello_de_botella && (
            <div style={C.bottleneckBadge}>
              🚧 Cuello de botella: {embudo.cuello_de_botella.de} → {embudo.cuello_de_botella.a} ({embudo.cuello_de_botella.conversion_pct}% conversión)
            </div>
          )}
        </div>

        <div style={C.panel}>
          <div style={C.panelTitle}><span>🕐</span> Ingresos vs Activos por hora del día</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={horaPorAsesorBar}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
              <XAxis dataKey="hora" tick={{ fill: "#64748b", fontSize: 11 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,.1)" }} />
              <Bar dataKey="ingresados" fill="#6366f1" radius={[4,4,0,0]} />
              <Bar dataKey="activos" fill="#34d399" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Heatmap asesor x hora */}
      <div style={C.panel}>
        <div style={C.panelTitle}><span>🔥</span> Heatmap — Ingresos por asesor x hora</div>
        {asesoresHeatmap.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: 13 }}>Sin datos en el rango seleccionado.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ ...C.th, position: "sticky", left: 0, background: "#0f172a" }}>Asesor</th>
                  {HORAS.map(h => <th key={h} style={{ ...C.th, textAlign: "center", padding: "6px 4px" }}>{h}h</th>)}
                </tr>
              </thead>
              <tbody>
                {asesoresHeatmap.map(asesor => (
                  <tr key={asesor}>
                    <td style={{ ...C.td, position: "sticky", left: 0, background: "#0f172a", fontWeight: 700 }}>{asesor}</td>
                    {HORAS.map(h => {
                      const v = celda(asesor, h);
                      return (
                        <td key={h} title={`${asesor} · ${h}h: ${v}`}
                          style={{ padding: "6px 4px", textAlign: "center", background: colorCelda(v), border: "1px solid rgba(255,255,255,.03)", color: v ? "#f1f5f9" : "#475569", fontWeight: v ? 700 : 400 }}>
                          {v || ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tabla de revisión */}
      <div style={C.tableWrap}>
        <div style={C.tableScroll}>
          <table style={C.table}>
            <thead>
              <tr>
                {["ID Jotform","Fecha","Hora","Asesor","Etapa CRM","Estado Jot.","Estado revisión","Observación","Acciones"].map(h => (
                  <th key={h} style={C.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ ...C.td, textAlign: "center", padding: 24 }}>Cargando…</td></tr>
              ) : listado.length === 0 ? (
                <tr><td colSpan={9} style={{ ...C.td, textAlign: "center", padding: 24 }}>Sin registros en el rango seleccionado.</td></tr>
              ) : listado.map(row => (
                <tr key={row.id_externo}>
                  <td style={{ ...C.td, color: "#6366f1", fontWeight: 700 }}>{row.id_externo}</td>
                  <td style={C.td}>{row.fecha}</td>
                  <td style={C.td}>{row.hora >= 0 ? `${row.hora}h` : "—"}</td>
                  <td style={C.td}>{row.asesor}</td>
                  <td style={C.td}>{row.etapa_crm || "—"}</td>
                  <td style={C.td}>
                    {row.estado_jot}
                    {row.es_venta_servicio ? (
                      <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#14b8a6" }} title="Venta de servicio">🛠️</span>
                    ) : null}
                  </td>
                  <td style={C.td}><span style={C.badge(REV_COLOR[row.estado_revision] || "#94a3b8")}>{row.estado_revision}</span></td>
                  <td style={C.td}>
                    {editRow === row.id_externo ? (
                      <textarea value={obsTexto} onChange={e => setObsTexto(e.target.value)} style={C.textarea} placeholder="Observación…" />
                    ) : (
                      <span style={{ color: row.observacion ? "#cbd5e1" : "#475569", fontStyle: row.observacion ? "normal" : "italic" }}>
                        {row.observacion || "—"}
                      </span>
                    )}
                  </td>
                  <td style={C.td}>
                    {editRow === row.id_externo ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button aria-label={`Aprobar registro ${row.id_externo}`} style={C.smallBtn("rgba(16,185,129,.18)", "#34d399")} onClick={() => guardarRevision(row.id_externo, "APROBADO", obsTexto)}>✓ Aprobar</button>
                        <button aria-label={`Rechazar registro ${row.id_externo}`} style={C.smallBtn("rgba(239,68,68,.18)", "#f87171")} onClick={() => guardarRevision(row.id_externo, "RECHAZADO", obsTexto)}>✕ Rechazar</button>
                        <button aria-label="Cancelar revisión" style={C.smallBtn("rgba(255,255,255,.08)", "#94a3b8")} onClick={() => { setEditRow(null); setObsTexto(""); }}>Cancelar</button>
                      </div>
                    ) : (
                      <button aria-label={`Revisar registro ${row.id_externo}`} style={C.smallBtn("rgba(99,102,241,.15)", "#a5b4fc")} onClick={() => { setEditRow(row.id_externo); setObsTexto(row.observacion || ""); }}>
                        ✏️ Revisar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={C.pagBar}>
          <span style={{ fontSize: 12, color: "#64748b" }}>{total} registros · página {page} de {Math.max(1, Math.ceil(total / 50))}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={C.btn} disabled={page <= 1} onClick={() => cargarPagina(page - 1)}>← Anterior</button>
            <button style={C.btn} disabled={page * 50 >= total} onClick={() => cargarPagina(page + 1)}>Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
