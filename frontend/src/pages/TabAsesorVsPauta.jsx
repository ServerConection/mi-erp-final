// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  TabAsesorVsPauta.jsx — Rendimiento Asesores vs Inversión en Pauta      ║
// ║  Compara: CPL real · efectividad por asesor · costo por activo          ║
// ║  Gráficos siempre visibles — labels inline permanentes                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LabelList, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { CanalSelector, SupervisorSelector, getCanalCfg, buildFiltroParams } from "./GlobalFilters";

const API = import.meta.env.VITE_API_URL;
const n   = (v) => Number(v || 0);
const pct = (a, b) => b > 0 ? (a / b) * 100 : 0;
const usd = (v) => `$${n(v).toFixed(2)}`;
const C = {
  primary: "#0f172a", accent: "#3b82f6", success: "#10b981",
  warning: "#f59e0b", danger: "#ef4444", violet: "#8b5cf6",
  cyan: "#06b6d4", muted: "#94a3b8", border: "#e2e8f0",
  slate: "#334155", light: "#f8fafc",
};

// ── Tooltip ultra-detallado siempre visible ──────────────────────────────────
const RichTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px",
      padding: "12px 16px", fontSize: "10px", minWidth: "200px",
      boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
    }}>
      <div style={{ color: "#e2e8f0", fontWeight: 900, marginBottom: "8px", borderBottom: "1px solid #1e293b", paddingBottom: "6px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "3px" }}>
          <span style={{ color: "#64748b" }}>{p.name}</span>
          <span style={{ color: p.color || "#e2e8f0", fontWeight: 900 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Label siempre visible en barras ─────────────────────────────────────────
const AlwaysLabel = ({ x, y, width, value, fill = "#fff", fontSize = 8 }) => {
  if (!value && value !== 0) return null;
  const display = typeof value === "number" ? (value % 1 !== 0 ? value.toFixed(1) : value) : value;
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={fontSize}
      fontWeight={800} fill={fill}>
      {display}
    </text>
  );
};

// ── Gauge circular mini ──────────────────────────────────────────────────────
function MiniGauge({ valor, label, color, size = 60 }) {
  const r = size / 2 - 6;
  const c2 = 2 * Math.PI * r;
  const p  = Math.min(valor / 100, 1);
  const d  = p * c2 * 0.75;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`${color}20`} strokeWidth={5}
          strokeDasharray={`${c2*0.75} ${c2*0.25}`} strokeLinecap="round"
          transform={`rotate(-225 ${size/2} ${size/2})`} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${d} ${c2-d+c2*0.25}`} strokeLinecap="round"
          transform={`rotate(-225 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dasharray 0.6s" }} />
        <text x={size/2} y={size/2+4} textAnchor="middle" fontSize={9} fontWeight={900} fill={color}>
          {valor.toFixed(0)}%
        </text>
      </svg>
      <span style={{ fontSize: "7px", fontWeight: 900, color: C.muted, textTransform: "uppercase", textAlign: "center", maxWidth: size }}>
        {label}
      </span>
    </div>
  );
}

// ── Card con header ──────────────────────────────────────────────────────────
function Card({ children, title, subtitle, accent = C.accent, badge, style = {} }) {
  return (
    <div style={{
      background: "#fff", borderRadius: "16px", border: `1px solid ${C.border}`,
      overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", ...style
    }}>
      {title && (
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: "12px", flexWrap: "wrap", background: "#f8fafc",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "3px", height: "28px", borderRadius: "9999px", background: accent }} />
            <div>
              <div style={{ fontSize: "10px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: accent }}>{title}</div>
              {subtitle && <div style={{ fontSize: "8px", color: C.muted, marginTop: "2px" }}>{subtitle}</div>}
            </div>
          </div>
          {badge}
        </div>
      )}
      {children}
    </div>
  );
}

// ── KPI card mejorado ─────────────────────────────────────────────────────────
function KpiBox({ label, value, sub, color, icon, trend }) {
  return (
    <div style={{
      background: "#fff", borderRadius: "14px", border: `1px solid ${C.border}`,
      padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `${color}15`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>
          {icon}
        </div>
        {trend !== undefined && (
          <span style={{
            fontSize: "8px", fontWeight: 900, padding: "2px 6px", borderRadius: "9999px",
            background: trend >= 0 ? `${C.success}15` : `${C.danger}15`,
            color: trend >= 0 ? C.success : C.danger,
          }}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <div style={{ fontSize: "8px", fontWeight: 900, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 900, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: "8px", color: C.muted, marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}

// ── Tabla ranking asesores ───────────────────────────────────────────────────
function TablaRankingAsesores({ data, canalesSel }) {
  const [orden, setOrden] = useState({ col: "score", dir: "desc" });
  const toggle = (col) => setOrden(p => p.col === col ? { col, dir: p.dir === "desc" ? "asc" : "desc" } : { col, dir: "desc" });

  const sorted = [...data].sort((a, b) => {
    const va = n(a[orden.col]), vb = n(b[orden.col]);
    return orden.dir === "desc" ? vb - va : va - vb;
  });

  const cols = [
    { key: "rank",         label: "#",           fmt: (_, i) => i + 1 },
    { key: "nombre",       label: "ASESOR",       fmt: v => v },
    { key: "supervisor",   label: "SUPERVISOR",   fmt: v => v || "—" },
    { key: "leads",        label: "LEADS",        color: C.accent },
    { key: "negociables",  label: "NEGOC.",       color: C.success },
    { key: "pct_atc",      label: "% ATC",        fmt: v => `${n(v).toFixed(1)}%`, colorFn: v => n(v) > 40 ? C.danger : n(v) > 20 ? C.warning : C.success },
    { key: "ventas",       label: "VENTAS",       color: C.accent },
    { key: "jot",          label: "JOT",          color: C.success },
    { key: "efect",        label: "EFECT %",      fmt: v => `${n(v).toFixed(1)}%`, colorFn: v => n(v) >= 15 ? C.success : n(v) >= 8 ? C.warning : C.danger },
    { key: "cpl_real",     label: "CPL REAL $",   fmt: v => v ? `$${n(v).toFixed(2)}` : "—", color: C.violet },
    { key: "cpa_real",     label: "CPA REAL $",   fmt: v => v ? `$${n(v).toFixed(2)}` : "—", color: C.violet },
    { key: "score",        label: "SCORE ★",      fmt: v => n(v).toFixed(0), colorFn: v => n(v) >= 70 ? C.success : n(v) >= 45 ? C.warning : C.danger },
  ];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ fontSize: "9px", fontFamily: "monospace", borderCollapse: "collapse", width: "100%", whiteSpace: "nowrap" }}>
        <thead style={{ position: "sticky", top: 0, background: C.light, borderBottom: `2px solid ${C.border}`, zIndex: 10 }}>
          <tr>
            {cols.map(c => (
              <th key={c.key}
                onClick={() => c.key !== "rank" && c.key !== "nombre" && toggle(c.key)}
                style={{
                  padding: "8px 12px", borderRight: `1px solid ${C.border}`, textAlign: "center",
                  fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em",
                  color: orden.col === c.key ? C.accent : C.muted,
                  cursor: c.key !== "rank" && c.key !== "nombre" ? "pointer" : "default",
                }}>
                {c.label}{orden.col === c.key ? (orden.dir === "desc" ? " ▼" : " ▲") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => (
            <tr key={idx}
              style={{
                borderBottom: `1px solid ${C.border}`,
                background: idx === 0 && orden.col === "score" ? `${C.success}05` : "#fff",
              }}>
              {cols.map(c => {
                const val = row[c.key];
                const color = c.colorFn ? c.colorFn(val) : c.color;
                const display = c.fmt ? c.fmt(val, idx) : (val ?? "—");
                return (
                  <td key={c.key} style={{
                    padding: "8px 12px", borderRight: `1px solid ${C.border}`,
                    textAlign: c.key === "nombre" || c.key === "supervisor" ? "left" : "center",
                    color: color || C.slate,
                    fontWeight: c.key === "score" || c.key === "efect" ? 900 : 500,
                  }}>
                    {c.key === "score" ? (
                      <div>
                        <div style={{ fontWeight: 900, color: color }}>{display}</div>
                        <div style={{ height: "3px", borderRadius: "9999px", marginTop: "3px", background: `${color}20` }}>
                          <div style={{ width: `${Math.min(n(val), 100)}%`, height: "100%", background: color, borderRadius: "9999px" }} />
                        </div>
                      </div>
                    ) : display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Score de asesor ponderado ─────────────────────────────────────────────────
function calcScoreAsesor(a) {
  const ef    = pct(n(a.jot), n(a.leads));
  const tNeg  = pct(n(a.negociables), n(a.leads));
  const tBue  = Math.max(0, 100 - pct(n(a.atc), n(a.leads)));
  const tVta  = pct(n(a.ventas), n(a.leads));
  return Math.min(100, ef * 0.40 + tNeg * 0.25 + tBue * 0.20 + tVta * 0.15);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function TabAsesorVsPauta({ filtro, canalesSel, onCanalesSel, supervisorSel, onSupervisorSel }) {
  const { desde, hasta } = filtro;

  const [rawAsesor,   setRawAsesor]   = useState(null);
  const [rawRedes,    setRawRedes]    = useState(null);
  const [supervisores, setSupervisores] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [subTab,      setSubTab]      = useState("rendimiento");

  useEffect(() => {
    if (!desde || !hasta) return;
    setLoading(true);

    const params = buildFiltroParams({ desde, hasta, canalesSel, supervisor: supervisorSel });

    Promise.all([
      fetch(`${API}/api/indicadores/dashboard?fechaDesde=${desde}&fechaHasta=${hasta}${supervisorSel ? `&supervisor=${supervisorSel}` : ""}`).then(r => r.json()).catch(() => null),
      fetch(`${API}/api/redes/monitoreo-redes?${params}`).then(r => r.json()).catch(() => null),
    ]).then(([asesorData, redesData]) => {
      if (asesorData?.success) {
        setRawAsesor(asesorData);
        const sups = [...new Set((asesorData.asesores || []).map(a => a.supervisor || a.nombre_grupo?.split(" ")[0]).filter(Boolean))];
        setSupervisores(sups);
      }
      if (redesData?.success) setRawRedes(redesData);
    }).finally(() => setLoading(false));
  }, [desde, hasta, canalesSel, supervisorSel]);

  // ── Procesar asesores ────────────────────────────────────────────────────
  const asesoresData = useMemo(() => {
    if (!rawAsesor) return [];
    return (rawAsesor.asesores || []).map(a => {
      const leads     = n(a.leads_totales || a.total_leads || a.real_mes_leads || 0);
      const ventas    = n(a.ventas_crm || a.v_subida_crm_hoy || 0);
      const jot       = n(a.ingresos_reales || a.v_subida_jot_hoy || 0);
      const atc       = n(a.sac || a.atc || 0);
      const negoc     = Math.max(0, leads - atc);
      const activos   = n(a.real_mes || a.activos || 0);
      const efect     = pct(jot, leads);
      const pct_atc   = pct(atc, leads);
      const score     = calcScoreAsesor({ leads, ventas, jot, atc, negociables: negoc });
      return {
        nombre:       a.nombre_grupo || a.nombre || "Sin nombre",
        supervisor:   a.supervisor || "",
        leads, ventas, jot, atc, negociables: negoc, activos,
        efect, pct_atc, score,
        cpl_real:  null, // se calculará si hay inversión de pauta
        cpa_real:  null,
      };
    }).filter(a => a.leads > 0);
  }, [rawAsesor]);

  // ── Procesar datos de pauta por canal ────────────────────────────────────
  const pautaData = useMemo(() => {
    if (!rawRedes?.data) return { totalInv: 0, cplGlobal: null, canales: [] };
    const filas = rawRedes.data;
    const map = {}, invSet = {};
    let totalInv = 0, totalLeads = 0;
    filas.forEach(row => {
      const canal = row.canal_inversion || row.canal_publicidad || "SIN MAPEO";
      if (canal === "MAL INGRESO" || canal === "SIN MAPEO") return;
      if (!map[canal]) map[canal] = { canal, leads: 0, activos: 0, jot: 0, inversion: 0 };
      map[canal].leads   += n(row.n_leads);
      map[canal].activos += n(row.activos_mes);
      map[canal].jot     += n(row.ingreso_jot);
      const k = `${String(row.fecha).split("T")[0]}|${canal}`;
      if (!invSet[k] && n(row.inversion_usd) > 0) {
        map[canal].inversion += n(row.inversion_usd);
        invSet[k] = true;
      }
      totalLeads += n(row.n_leads);
    });
    filas.forEach(row => {
      const canal = row.canal_inversion || row.canal_publicidad || "SIN MAPEO";
      const k = `${String(row.fecha).split("T")[0]}|${canal}`;
      if (!invSet[`_counted_${k}`] && n(row.inversion_usd) > 0) {
        totalInv += n(row.inversion_usd);
        invSet[`_counted_${k}`] = true;
      }
    });
    const canales = Object.values(map).map(c => ({
      ...c,
      cpl:   c.leads   > 0 && c.inversion > 0 ? c.inversion / c.leads   : null,
      cpa:   c.activos > 0 && c.inversion > 0 ? c.inversion / c.activos : null,
      efect: pct(c.activos, c.leads),
    }));
    return {
      totalInv,
      cplGlobal: totalLeads > 0 && totalInv > 0 ? totalInv / totalLeads : null,
      canales,
    };
  }, [rawRedes]);

  // ── Métricas globales comparativas ───────────────────────────────────────
  const globales = useMemo(() => {
    const totLeads  = asesoresData.reduce((s, a) => s + a.leads, 0);
    const totJot    = asesoresData.reduce((s, a) => s + a.jot, 0);
    const totActivos = asesoresData.reduce((s, a) => s + a.activos, 0);
    const totAtc    = asesoresData.reduce((s, a) => s + a.atc, 0);
    const topAsesor = [...asesoresData].sort((a, b) => b.score - a.score)[0];
    const efect     = pct(totJot, totLeads);
    const pctAtc    = pct(totAtc, totLeads);
    const scorePromedio = asesoresData.length > 0
      ? asesoresData.reduce((s, a) => s + a.score, 0) / asesoresData.length : 0;

    return { totLeads, totJot, totActivos, totAtc, efect, pctAtc, topAsesor, scorePromedio };
  }, [asesoresData]);

  // ── Datos radar multi-asesor ─────────────────────────────────────────────
  const radarData = useMemo(() => {
    if (!asesoresData.length) return [];
    const dims = [
      { dim: "Efectividad", key: "efect" },
      { dim: "Contacto",    key: "negociables", max: Math.max(1, ...asesoresData.map(a => a.negociables)) },
      { dim: "Sin ATC",     key: "pct_no_atc",  derived: a => Math.max(0, 100 - a.pct_atc) },
      { dim: "Ventas",      key: "ventas",       max: Math.max(1, ...asesoresData.map(a => a.ventas)) },
      { dim: "Score",       key: "score" },
    ];
    return dims.map(({ dim, key, max, derived }) => {
      const entry = { dim };
      asesoresData.slice(0, 8).forEach(a => {
        const raw = derived ? derived(a) : n(a[key]);
        entry[a.nombre] = max ? (raw / max) * 100 : raw;
      });
      return entry;
    });
  }, [asesoresData]);

  // ── Colores para asesores ────────────────────────────────────────────────
  const ASESOR_COLORS = [
    "#3b82f6","#10b981","#f59e0b","#8b5cf6","#06b6d4",
    "#ef4444","#0ea5e9","#84cc16","#ec4899","#f97316"
  ];

  const SUBTABS = [
    { id: "rendimiento",  label: "Rendimiento General", icon: "📊" },
    { id: "vspautas",     label: "Asesores vs Pauta",   icon: "🔀" },
    { id: "radar",        label: "Radar Asesores",      icon: "🕸️" },
    { id: "distribucion", label: "Distribución",        icon: "🗂️" },
  ];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px", gap: "12px" }}>
      <div style={{ width: "32px", height: "32px", border: `3px solid ${C.accent}30`, borderTopColor: C.accent, borderRadius: "9999px", animation: "spin 0.8s linear infinite" }} />
      <span style={{ fontSize: "12px", color: C.muted, fontWeight: 700 }}>Cargando análisis de asesores...</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        borderRadius: "20px", padding: "20px 24px",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        flexWrap: "wrap", gap: "16px",
        boxShadow: "0 8px 32px rgba(15,23,42,0.3)",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span style={{ fontSize: "20px" }}>⚡</span>
            <span style={{ fontSize: "14px", fontWeight: 900, color: "#f8fafc", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Análisis Asesores vs Pauta
            </span>
            <span style={{
              fontSize: "8px", fontWeight: 900, padding: "3px 10px", borderRadius: "9999px",
              background: `${C.accent}20`, color: C.accent, textTransform: "uppercase",
            }}>
              {asesoresData.length} asesores · {desde} → {hasta}
            </span>
          </div>
          <p style={{ fontSize: "9px", color: "#64748b", letterSpacing: "0.05em" }}>
            Rendimiento individual · CPL real · Score de calidad · Correlación con inversión publicitaria
          </p>
        </div>
        {globales.topAsesor && (
          <div style={{
            background: `${C.success}15`, border: `1px solid ${C.success}30`,
            borderRadius: "12px", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px",
          }}>
            <span style={{ fontSize: "20px" }}>🏆</span>
            <div>
              <div style={{ fontSize: "7px", color: C.muted, textTransform: "uppercase", fontWeight: 900 }}>Mejor Score</div>
              <div style={{ fontSize: "11px", fontWeight: 900, color: C.success }}>
                {globales.topAsesor.nombre} — {globales.topAsesor.score.toFixed(0)} pts
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Filtros ── */}
      <div style={{ background: "#fff", borderRadius: "14px", border: `1px solid ${C.border}`, padding: "14px 20px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "8px", fontWeight: 900, color: C.muted, textTransform: "uppercase" }}>Canal:</span>
            <CanalSelector canalesSel={canalesSel} onChange={onCanalesSel} compact />
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "10px" }}>
            <SupervisorSelector supervisores={supervisores} supervisorSel={supervisorSel} onChange={onSupervisorSel} />
          </div>
        </div>
      </div>

      {/* ── KPIs globales ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
        <KpiBox label="Total Leads"    value={globales.totLeads || "—"} icon="👥" color={C.accent}
          sub={`${asesoresData.length} asesores`} />
        <KpiBox label="Ingresos JOT"  value={globales.totJot || "—"} icon="✅" color={C.success}
          sub={`${globales.efect.toFixed(1)}% efectividad`} />
        <KpiBox label="% ATC Promedio" value={`${globales.pctAtc.toFixed(1)}%`} icon="⚠️"
          color={globales.pctAtc > 40 ? C.danger : globales.pctAtc > 20 ? C.warning : C.success}
          sub={`${globales.totAtc} leads derivados`} />
        <KpiBox label="Score Promedio" value={globales.scorePromedio.toFixed(0)} icon="⭐"
          color={globales.scorePromedio >= 60 ? C.success : globales.scorePromedio >= 35 ? C.warning : C.danger}
          sub="Índice de calidad 0-100" />
        <KpiBox label="Inversión Pauta" value={pautaData.totalInv > 0 ? `$${pautaData.totalInv.toFixed(0)}` : "—"} icon="💰"
          color="#7c3aed" sub={pautaData.cplGlobal ? `CPL global $${pautaData.cplGlobal.toFixed(2)}` : "Sin inversión"} />
      </div>

      {/* ── Sub-tabs ── */}
      <div style={{ display: "flex", gap: "4px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: "12px", padding: "4px", width: "fit-content" }}>
        {SUBTABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 16px", borderRadius: "8px", border: "none",
              fontSize: "9px", fontWeight: 900, textTransform: "uppercase",
              letterSpacing: "0.08em", cursor: "pointer",
              background: subTab === t.id ? C.primary : "transparent",
              color: subTab === t.id ? "#fff" : C.muted,
              boxShadow: subTab === t.id ? `0 2px 8px ${C.primary}30` : "none",
              transition: "all 0.15s",
            }}>
            <span>{t.icon}</span>
            <span style={{ display: "none" /* show on lg */ }}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Rendimiento General ── */}
      {subTab === "rendimiento" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Barras: Leads vs JOT por asesor — labels siempre visibles */}
          <Card title="Leads vs Ingresos JOT por Asesor" subtitle="Labels siempre visibles · haz clic en una barra para detalles" accent={C.accent}>
            <div style={{ padding: "20px" }}>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={asesoresData.map(a => ({
                    nombre: a.nombre.length > 16 ? a.nombre.slice(0, 16) + "…" : a.nombre,
                    leads: a.leads, jot: a.jot, ventas: a.ventas,
                  }))}
                  margin={{ top: 28, right: 10, left: 0, bottom: 60 }}
                  barCategoryGap="20%" barGap={3}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="nombre" axisLine={false} tickLine={false}
                    tick={({ x, y, payload }) => (
                      <g transform={`translate(${x},${y})`}>
                        <text x={0} y={0} dy={8} textAnchor="end" fill="#94a3b8"
                          fontSize={8} fontWeight={700} transform="rotate(-45)">
                          {payload.value}
                        </text>
                      </g>
                    )} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#94a3b8" }} />
                  <Tooltip content={<RichTooltip />} />
                  <Legend wrapperStyle={{ fontSize: "9px", paddingTop: "8px" }} />
                  <Bar dataKey="leads" name="Leads" fill={`${C.accent}70`} radius={[4,4,0,0]} barSize={18}>
                    <LabelList dataKey="leads" position="top" style={{ fontSize: 8, fill: C.accent, fontWeight: 900 }}
                      formatter={v => v > 0 ? v : ""} />
                  </Bar>
                  <Bar dataKey="ventas" name="Ventas Bitrix" fill={`${C.cyan}90`} radius={[4,4,0,0]} barSize={18}>
                    <LabelList dataKey="ventas" position="top" style={{ fontSize: 8, fill: C.cyan, fontWeight: 900 }}
                      formatter={v => v > 0 ? v : ""} />
                  </Bar>
                  <Bar dataKey="jot" name="Ingresos JOT" fill={C.success} radius={[4,4,0,0]} barSize={18}>
                    <LabelList dataKey="jot" position="top" style={{ fontSize: 8, fill: C.success, fontWeight: 900 }}
                      formatter={v => v > 0 ? v : ""} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Efectividad % por asesor con colores semáforo y label siempre visible */}
          <Card title="Efectividad % por Asesor (JOT / Leads)" subtitle="Verde ≥15% · Amarillo ≥8% · Rojo <8% — semáforo automático" accent={C.success}>
            <div style={{ padding: "20px" }}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={[...asesoresData].sort((a, b) => b.efect - a.efect).map(a => ({
                    nombre: a.nombre.length > 14 ? a.nombre.slice(0, 14) + "…" : a.nombre,
                    efect: parseFloat(a.efect.toFixed(1)),
                    _color: a.efect >= 15 ? C.success : a.efect >= 8 ? C.warning : C.danger,
                  }))}
                  margin={{ top: 28, right: 10, left: 0, bottom: 55 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="nombre" axisLine={false} tickLine={false}
                    tick={({ x, y, payload }) => (
                      <g transform={`translate(${x},${y})`}>
                        <text x={0} y={0} dy={8} textAnchor="end" fill="#94a3b8"
                          fontSize={8} fontWeight={700} transform="rotate(-45)">
                          {payload.value}
                        </text>
                      </g>
                    )} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#94a3b8" }} unit="%" />
                  <Tooltip content={<RichTooltip />} formatter={v => `${v}%`} />
                  <ReferenceLine y={15} stroke={C.success} strokeDasharray="4 2"
                    label={{ value: "Meta 15%", fill: C.success, fontSize: 8, position: "insideTopRight" }} />
                  <ReferenceLine y={8} stroke={C.warning} strokeDasharray="4 2"
                    label={{ value: "Mín 8%", fill: C.warning, fontSize: 8, position: "insideTopRight" }} />
                  <Bar dataKey="efect" radius={[6,6,0,0]} barSize={22}>
                    {[...asesoresData].sort((a, b) => b.efect - a.efect).map((a, i) => (
                      <Cell key={i} fill={a.efect >= 15 ? C.success : a.efect >= 8 ? C.warning : C.danger} />
                    ))}
                    <LabelList dataKey="efect" position="top" style={{ fontWeight: 900, fontSize: 9 }}
                      content={({ x, y, width, value, index }) => {
                        if (!value) return null;
                        const sorted = [...asesoresData].sort((a, b) => b.efect - a.efect);
                        const color = sorted[index]?.efect >= 15 ? C.success : sorted[index]?.efect >= 8 ? C.warning : C.danger;
                        return (
                          <text x={x + width / 2} y={y - 4} textAnchor="middle"
                            fontSize={9} fontWeight={900} fill={color}>{value}%</text>
                        );
                      }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Score ranking con gauges */}
          <Card title="Score de Calidad por Asesor" subtitle="Ponderado: 40% efectividad + 25% contacto + 20% calidad lead + 15% ventas" accent={C.violet}>
            <div style={{ padding: "20px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", justifyContent: "center", marginBottom: "20px" }}>
                {[...asesoresData].sort((a, b) => b.score - a.score).slice(0, 10).map((a, i) => {
                  const color = a.score >= 60 ? C.success : a.score >= 35 ? C.warning : C.danger;
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                      <MiniGauge valor={a.score} label={a.nombre.split(" ")[0]} color={color} size={64} />
                    </div>
                  );
                })}
              </div>
              <TablaRankingAsesores data={asesoresData} canalesSel={canalesSel} />
            </div>
          </Card>
        </div>
      )}

      {/* ── Asesores vs Pauta ── */}
      {subTab === "vspautas" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Comparativa lado a lado */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

            {/* Panel izquierdo: rendimiento asesores */}
            <Card title="Rendimiento Asesores" subtitle={`${asesoresData.length} asesores activos`} accent={C.accent}>
              <div style={{ padding: "20px" }}>
                {asesoresData.length === 0 ? (
                  <div style={{ textAlign: "center", color: C.muted, padding: "40px", fontSize: "11px" }}>
                    Sin datos de asesores para el período
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={asesoresData.map(a => ({
                        nombre: a.nombre.split(" ")[0],
                        jot: a.jot, efect: parseFloat(a.efect.toFixed(1)),
                      }))}
                      margin={{ top: 24, right: 8, left: 0, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="nombre" axisLine={false} tickLine={false}
                        tick={{ fontSize: 8, fill: "#94a3b8", fontWeight: 700 }} />
                      <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: "#94a3b8" }} />
                      <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false}
                        tick={{ fontSize: 8, fill: "#94a3b8" }} unit="%" />
                      <Tooltip content={<RichTooltip />} />
                      <Bar yAxisId="left" dataKey="jot" name="JOT" fill={C.success} radius={[4,4,0,0]} barSize={20}>
                        <LabelList dataKey="jot" position="top" style={{ fontSize: 8, fill: C.success, fontWeight: 900 }}
                          formatter={v => v > 0 ? v : ""} />
                      </Bar>
                      <Line yAxisId="right" type="monotone" dataKey="efect" name="Efect %" stroke={C.warning}
                        strokeWidth={2.5} dot={{ r: 4, fill: C.warning }}>
                        <LabelList dataKey="efect" position="top" style={{ fontSize: 8, fill: C.warning, fontWeight: 900 }}
                          formatter={v => v > 0 ? `${v}%` : ""} />
                      </Line>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Panel derecho: distribución de pauta */}
            <Card title="Inversión en Pauta por Canal" subtitle="CPL y efectividad de cada canal" accent="#7c3aed">
              <div style={{ padding: "20px" }}>
                {pautaData.canales.length === 0 ? (
                  <div style={{ textAlign: "center", color: C.muted, padding: "40px", fontSize: "11px" }}>
                    Sin datos de inversión para el período
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={pautaData.canales.map(c => ({
                        canal: getCanalCfg(c.canal).label,
                        leads: c.leads, inversion: Math.round(c.inversion),
                        efect: parseFloat(c.efect.toFixed(1)),
                        cpl: c.cpl ? parseFloat(c.cpl.toFixed(2)) : 0,
                        _color: getCanalCfg(c.canal).color,
                      }))}
                      margin={{ top: 24, right: 8, left: 0, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="canal" axisLine={false} tickLine={false}
                        tick={{ fontSize: 8, fill: "#94a3b8", fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: "#94a3b8" }} />
                      <Tooltip content={<RichTooltip />} />
                      <Bar dataKey="leads" name="Leads" radius={[4,4,0,0]} barSize={24}>
                        {pautaData.canales.map((c, i) => (
                          <Cell key={i} fill={getCanalCfg(c.canal).color} />
                        ))}
                        <LabelList dataKey="leads" position="top" style={{ fontSize: 8, fontWeight: 900 }}
                          content={({ x, y, width, value, index }) => {
                            const color = getCanalCfg(pautaData.canales[index]?.canal || "").color || C.accent;
                            return value > 0 ? (
                              <text x={x + width/2} y={y - 4} textAnchor="middle"
                                fontSize={8} fontWeight={900} fill={color}>{value}</text>
                            ) : null;
                          }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          {/* Scatter: Efect asesor vs CPL canal — cuadrantes */}
          <Card
            title="Cuadrante Asesores vs Canales de Pauta"
            subtitle="Cruce de efectividad de asesores con eficiencia de inversión publicitaria"
            accent={C.primary}
          >
            <div style={{ padding: "20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px" }}>
                <div>
                  <ResponsiveContainer width="100%" height={320}>
                    <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" dataKey="leads" name="Leads" tick={{ fontSize: 9, fill: C.muted }}
                        label={{ value: "Leads totales →", position: "insideBottom", offset: -12, fontSize: 8, fill: C.muted }} />
                      <YAxis type="number" dataKey="efect" name="Efectividad %" tick={{ fontSize: 9, fill: C.muted }}
                        label={{ value: "Efectividad %", angle: -90, position: "insideLeft", fontSize: 8, fill: C.muted, dy: 50 }} />
                      <ReferenceLine y={globales.efect} stroke={`${C.muted}60`} strokeDasharray="4 3"
                        label={{ value: `Prom ${globales.efect.toFixed(1)}%`, fontSize: 7, fill: C.muted, position: "right" }} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        return (
                          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "10px", padding: "10px 14px", fontSize: "9px" }}>
                            <div style={{ color: "#e2e8f0", fontWeight: 900, marginBottom: "6px" }}>{d?.nombre}</div>
                            <div style={{ color: "#64748b" }}>Leads: <span style={{ color: C.accent, fontWeight: 900 }}>{d?.leads}</span></div>
                            <div style={{ color: "#64748b" }}>JOT: <span style={{ color: C.success, fontWeight: 900 }}>{d?.jot}</span></div>
                            <div style={{ color: "#64748b" }}>Efectividad: <span style={{ color: C.warning, fontWeight: 900 }}>{d?.efect?.toFixed(1)}%</span></div>
                            <div style={{ color: "#64748b" }}>Score: <span style={{ color: "#8b5cf6", fontWeight: 900 }}>{d?.score?.toFixed(0)}</span></div>
                          </div>
                        );
                      }} />
                      <Scatter data={asesoresData.map(a => ({ ...a }))}>
                        {asesoresData.map((a, i) => (
                          <Cell key={i} fill={ASESOR_COLORS[i % ASESOR_COLORS.length]} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                {/* Leyenda y análisis */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 900, color: C.muted, textTransform: "uppercase", marginBottom: "4px" }}>
                    Asesores detectados
                  </div>
                  {asesoresData.map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: ASESOR_COLORS[i % ASESOR_COLORS.length], flexShrink: 0 }} />
                      <span style={{ fontSize: "8px", color: C.slate, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {a.nombre.split(" ")[0]}
                      </span>
                      <span style={{ fontSize: "8px", fontWeight: 900, color: a.efect >= 15 ? C.success : a.efect >= 8 ? C.warning : C.danger }}>
                        {a.efect.toFixed(0)}%
                      </span>
                    </div>
                  ))}

                  {/* Insights */}
                  <div style={{ marginTop: "12px", borderTop: `1px solid ${C.border}`, paddingTop: "12px" }}>
                    <div style={{ fontSize: "8px", fontWeight: 900, color: C.muted, textTransform: "uppercase", marginBottom: "8px" }}>
                      Insights
                    </div>
                    {(() => {
                      const insights = [];
                      const top = [...asesoresData].sort((a, b) => b.efect - a.efect)[0];
                      const bajo = [...asesoresData].sort((a, b) => a.efect - b.efect)[0];
                      const altaAtc = asesoresData.filter(a => a.pct_atc > 40);
                      if (top) insights.push({ icon: "⭐", text: `${top.nombre.split(" ")[0]} lidera con ${top.efect.toFixed(1)}%`, color: C.success });
                      if (bajo && bajo !== top) insights.push({ icon: "⚠️", text: `${bajo.nombre.split(" ")[0]} con ${bajo.efect.toFixed(1)}% necesita apoyo`, color: C.warning });
                      if (altaAtc.length) insights.push({ icon: "📞", text: `${altaAtc.length} asesor(es) con ATC >40%`, color: C.danger });
                      if (pautaData.cplGlobal) insights.push({ icon: "💰", text: `CPL pauta: $${pautaData.cplGlobal.toFixed(2)}`, color: "#7c3aed" });
                      return insights.map((ins, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "flex-start", gap: "6px",
                          padding: "6px 8px", borderRadius: "8px", marginBottom: "4px",
                          background: `${ins.color}10`,
                        }}>
                          <span style={{ fontSize: "11px" }}>{ins.icon}</span>
                          <span style={{ fontSize: "8px", color: ins.color, fontWeight: 700, lineHeight: 1.4 }}>{ins.text}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Tabla comparativa canal vs asesor */}
          {pautaData.canales.length > 0 && (
            <Card title="Canal de Pauta vs Mejor Asesor del Período" subtitle="Cruce de inversión con rendimiento real" accent="#7c3aed">
              <div style={{ overflowX: "auto", padding: "0" }}>
                <table style={{ fontSize: "9px", fontFamily: "monospace", borderCollapse: "collapse", width: "100%", whiteSpace: "nowrap" }}>
                  <thead style={{ background: C.light, borderBottom: `2px solid ${C.border}` }}>
                    <tr>
                      {["CANAL", "LEADS PAUTA", "INVERSIÓN", "CPL PAUTA", "CPA PAUTA", "% EFECT CANAL", "ASESORES TOP", "EFECT ASESOR PROM"].map(h => (
                        <th key={h} style={{ padding: "8px 14px", borderRight: `1px solid ${C.border}`, textAlign: "center", fontWeight: 900, color: C.muted, textTransform: "uppercase", fontSize: "8px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pautaData.canales.map((c, i) => {
                      const cfg = getCanalCfg(c.canal);
                      const efectColor = c.efect >= 15 ? C.success : c.efect >= 8 ? C.warning : C.danger;
                      const promEfectAsesores = asesoresData.length > 0
                        ? (asesoresData.reduce((s, a) => s + a.efect, 0) / asesoresData.length).toFixed(1)
                        : "—";
                      const topAsesores = [...asesoresData].sort((a, b) => b.efect - a.efect).slice(0, 2).map(a => a.nombre.split(" ")[0]).join(", ");
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: "#fff" }}>
                          <td style={{ padding: "10px 14px", borderRight: `1px solid ${C.border}` }}>
                            <span style={{ padding: "2px 8px", borderRadius: "9999px", background: cfg.bg, color: cfg.color, fontWeight: 900, fontSize: "8px", border: `1px solid ${cfg.color}30` }}>
                              {cfg.icon} {cfg.label}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px", borderRight: `1px solid ${C.border}`, textAlign: "center", fontWeight: 900, color: C.accent }}>{c.leads}</td>
                          <td style={{ padding: "10px 14px", borderRight: `1px solid ${C.border}`, textAlign: "center", fontWeight: 900, color: "#7c3aed" }}>{c.inversion > 0 ? `$${c.inversion.toFixed(0)}` : "—"}</td>
                          <td style={{ padding: "10px 14px", borderRight: `1px solid ${C.border}`, textAlign: "center", fontWeight: 900, color: c.cpl ? (c.cpl <= 4 ? C.success : c.cpl <= 8 ? C.warning : C.danger) : C.muted }}>
                            {c.cpl ? usd(c.cpl) : "—"}
                          </td>
                          <td style={{ padding: "10px 14px", borderRight: `1px solid ${C.border}`, textAlign: "center", fontWeight: 900, color: c.cpa ? (c.cpa <= 20 ? C.success : c.cpa <= 40 ? C.warning : C.danger) : C.muted }}>
                            {c.cpa ? usd(c.cpa) : "—"}
                          </td>
                          <td style={{ padding: "10px 14px", borderRight: `1px solid ${C.border}`, textAlign: "center", fontWeight: 900, color: efectColor }}>
                            {c.efect.toFixed(1)}%
                          </td>
                          <td style={{ padding: "10px 14px", borderRight: `1px solid ${C.border}`, textAlign: "center", fontSize: "8px", color: C.slate }}>
                            {topAsesores || "—"}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 900, color: Number(promEfectAsesores) >= 15 ? C.success : C.warning }}>
                            {promEfectAsesores}{promEfectAsesores !== "—" ? "%" : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Radar Asesores ── */}
      {subTab === "radar" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <Card title="Radar Multidimensional — Asesores" subtitle="5 dimensiones normalizadas · mayor = mejor (ATC: invertido)" accent={C.violet}>
            <div style={{ padding: "20px" }}>
              {radarData.length < 2 ? (
                <div style={{ textAlign: "center", color: C.muted, padding: "60px", fontSize: "11px" }}>Se necesitan al menos 2 asesores</div>
              ) : (
                <ResponsiveContainer width="100%" height={360}>
                  <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid stroke={C.border} />
                    <PolarAngleAxis dataKey="dim" tick={{ fontSize: 9, fill: C.muted, fontWeight: 700 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 7, fill: C.muted }} tickCount={4} />
                    {asesoresData.slice(0, 8).map((a, i) => (
                      <Radar key={a.nombre} name={a.nombre.split(" ")[0]} dataKey={a.nombre}
                        stroke={ASESOR_COLORS[i % ASESOR_COLORS.length]}
                        fill={ASESOR_COLORS[i % ASESOR_COLORS.length]}
                        fillOpacity={0.10} strokeWidth={2} dot={{ r: 3 }} />
                    ))}
                    <Legend wrapperStyle={{ fontSize: "8px" }} />
                    <Tooltip content={<RichTooltip />} />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* % ATC comparativo */}
          <Card title="% ATC por Asesor" subtitle="Menor es mejor · >40% = problema de calidad de leads" accent={C.danger}>
            <div style={{ padding: "20px" }}>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart
                  layout="vertical"
                  data={[...asesoresData].sort((a, b) => b.pct_atc - a.pct_atc).map(a => ({
                    nombre: a.nombre.split(" ")[0],
                    pct_atc: parseFloat(a.pct_atc.toFixed(1)),
                    _color: a.pct_atc > 40 ? C.danger : a.pct_atc > 20 ? C.warning : C.success,
                  }))}
                  margin={{ top: 5, right: 60, left: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: C.muted }} unit="%" />
                  <YAxis type="category" dataKey="nombre" tick={{ fontSize: 9, fill: C.muted }} width={80} />
                  <Tooltip content={<RichTooltip />} formatter={v => `${v}%`} />
                  <ReferenceLine x={40} stroke={C.danger} strokeDasharray="4 2"
                    label={{ value: "40%", fontSize: 8, fill: C.danger, position: "top" }} />
                  <ReferenceLine x={20} stroke={C.warning} strokeDasharray="4 2"
                    label={{ value: "20%", fontSize: 8, fill: C.warning, position: "top" }} />
                  <Bar dataKey="pct_atc" name="% ATC" radius={[0,6,6,0]}>
                    {[...asesoresData].sort((a, b) => b.pct_atc - a.pct_atc).map((a, i) => (
                      <Cell key={i} fill={a.pct_atc > 40 ? C.danger : a.pct_atc > 20 ? C.warning : C.success} />
                    ))}
                    <LabelList dataKey="pct_atc" position="right" style={{ fontSize: 8, fontWeight: 900 }}
                      content={({ x, y, width, height, value, index }) => {
                        if (!value) return null;
                        const sorted = [...asesoresData].sort((a, b) => b.pct_atc - a.pct_atc);
                        const color = sorted[index]?.pct_atc > 40 ? C.danger : sorted[index]?.pct_atc > 20 ? C.warning : C.success;
                        return (
                          <text x={x + width + 6} y={y + height / 2 + 4}
                            fontSize={8} fontWeight={900} fill={color}>{value}%</text>
                        );
                      }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* ── Distribución ── */}
      {subTab === "distribucion" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Leads por supervisor */}
          <Card title="Distribución de Leads por Supervisor" subtitle="Análisis del volumen gestionado por cada supervisor" accent={C.cyan}>
            <div style={{ padding: "20px" }}>
              {(() => {
                const porSup = {};
                asesoresData.forEach(a => {
                  const sup = a.supervisor || "Sin asignar";
                  if (!porSup[sup]) porSup[sup] = { supervisor: sup, leads: 0, jot: 0, asesores: 0, efect: 0 };
                  porSup[sup].leads   += a.leads;
                  porSup[sup].jot     += a.jot;
                  porSup[sup].asesores++;
                  porSup[sup].efect   += a.efect;
                });
                const supData = Object.values(porSup).map(s => ({
                  ...s,
                  efect: s.asesores > 0 ? parseFloat((s.efect / s.asesores).toFixed(1)) : 0,
                }));
                return (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={supData} margin={{ top: 24, right: 10, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="supervisor" axisLine={false} tickLine={false}
                        tick={{ fontSize: 9, fill: "#94a3b8", fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#94a3b8" }} />
                      <Tooltip content={<RichTooltip />} />
                      <Legend wrapperStyle={{ fontSize: "9px" }} />
                      <Bar dataKey="leads" name="Leads" fill={`${C.cyan}70`} radius={[4,4,0,0]} barSize={28}>
                        <LabelList dataKey="leads" position="top" style={{ fontSize: 9, fill: C.cyan, fontWeight: 900 }}
                          formatter={v => v > 0 ? v : ""} />
                      </Bar>
                      <Bar dataKey="jot" name="JOT" fill={C.success} radius={[4,4,0,0]} barSize={28}>
                        <LabelList dataKey="jot" position="top" style={{ fontSize: 9, fill: C.success, fontWeight: 900 }}
                          formatter={v => v > 0 ? v : ""} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          </Card>

          {/* Tabla completa */}
          <Card title="Tabla Completa — Todos los Asesores" subtitle="Datos detallados ordenables" accent={C.primary}>
            <TablaRankingAsesores data={asesoresData} canalesSel={canalesSel} />
          </Card>
        </div>
      )}
    </div>
  );
}