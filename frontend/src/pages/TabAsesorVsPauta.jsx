// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  TabAsesorVsPauta.jsx — Análisis estadístico Asesores vs Campaña        ║
// ║  • Mejor asesor por campaña (gráfico por canal)                         ║
// ║  • Box plot de efectividad, radar, scatter, ranking                     ║
// ║  • Dropdown con nombre completo del asesor                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { useEffect, useState, useMemo, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LabelList, ReferenceLine,
  ComposedChart, ErrorBar,
} from "recharts";
import { CanalSelector, getCanalCfg, buildFiltroParams } from "./GlobalFilters";

const API = import.meta.env.VITE_API_URL;
const n   = (v) => Number(v || 0);
const pct = (a, b) => b > 0 ? (a / b) * 100 : 0;
const usd = (v) => `$${n(v).toFixed(2)}`;
const safe = (v) => isFinite(n(v)) ? n(v) : 0;

const C = {
  primary: "#0f172a", accent: "#3b82f6", success: "#10b981",
  warning: "#f59e0b", danger: "#ef4444", violet: "#8b5cf6",
  cyan: "#06b6d4", muted: "#94a3b8", border: "#e2e8f0",
  slate: "#334155", light: "#f8fafc", orange: "#f97316",
};

const ASESOR_PALETTE = [
  "#3b82f6","#10b981","#f59e0b","#8b5cf6","#06b6d4",
  "#ef4444","#0ea5e9","#84cc16","#ec4899","#f97316",
  "#14b8a6","#a855f7","#eab308","#6366f1","#22c55e",
];

// ── Tooltip rico dark ────────────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0f172a", border: "1px solid #1e293b", borderRadius: "12px",
      padding: "12px 16px", fontSize: "10px", minWidth: "180px",
      boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
    }}>
      <div style={{ color: "#e2e8f0", fontWeight: 900, marginBottom: "8px",
        borderBottom: "1px solid #1e293b", paddingBottom: "6px",
        textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "9px" }}>
        {label}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "16px", marginBottom: "3px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: p.color || p.fill, flexShrink: 0 }} />
            <span style={{ color: "#64748b" }}>{p.name}</span>
          </div>
          <span style={{ color: p.color || "#e2e8f0", fontWeight: 900 }}>
            {typeof p.value === "number" ? (p.value % 1 !== 0 ? p.value.toFixed(2) : p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── Card contenedor ──────────────────────────────────────────────────────────
function Card({ children, title, subtitle, accent = C.accent, badge, noPad = false }) {
  return (
    <div style={{
      background: "#fff", borderRadius: "16px", border: `1px solid ${C.border}`,
      overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      {title && (
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: "10px", background: C.light,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "3px", height: "28px", borderRadius: "9999px", background: accent, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: "10px", fontWeight: 900, textTransform: "uppercase",
                letterSpacing: "0.15em", color: accent }}>{title}</div>
              {subtitle && <div style={{ fontSize: "8px", color: C.muted, marginTop: "2px" }}>{subtitle}</div>}
            </div>
          </div>
          {badge}
        </div>
      )}
      <div style={noPad ? {} : { padding: "20px" }}>{children}</div>
    </div>
  );
}

// ── KPI box ──────────────────────────────────────────────────────────────────
function KpiBox({ label, value, sub, color, icon, trend }) {
  return (
    <div style={{
      background: "#fff", borderRadius: "14px", border: `1px solid ${C.border}`,
      padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `${color}15`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>{icon}</div>
        {trend !== undefined && (
          <span style={{
            fontSize: "8px", fontWeight: 900, padding: "2px 6px", borderRadius: "9999px",
            background: trend >= 0 ? `${C.success}15` : `${C.danger}15`,
            color: trend >= 0 ? C.success : C.danger,
          }}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%</span>
        )}
      </div>
      <div style={{ fontSize: "8px", fontWeight: 900, color: C.muted, textTransform: "uppercase",
        letterSpacing: "0.1em", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 900, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: "8px", color: C.muted, marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}

// ── Gauge circular ───────────────────────────────────────────────────────────
function Gauge({ valor, label, color, size = 72 }) {
  const r = size / 2 - 7;
  const c2 = 2 * Math.PI * r;
  const p  = Math.min(valor / 100, 1);
  const d  = p * c2 * 0.75;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`${color}20`} strokeWidth={6}
          strokeDasharray={`${c2*0.75} ${c2*0.25}`} strokeLinecap="round"
          transform={`rotate(-225 ${size/2} ${size/2})`} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${d} ${c2-d+c2*0.25}`} strokeLinecap="round"
          transform={`rotate(-225 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dasharray 0.7s ease" }} />
        <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="central"
          fontSize={size < 80 ? 10 : 13} fontWeight={900} fill={color}>
          {valor.toFixed(0)}%
        </text>
      </svg>
      <span style={{ fontSize: "7px", fontWeight: 900, color: C.muted, textTransform: "uppercase",
        textAlign: "center", maxWidth: size, lineHeight: 1.3 }}>{label}</span>
    </div>
  );
}

// ── Dropdown asesor con búsqueda ─────────────────────────────────────────────
function AsesorDropdown({ asesores, value, onChange }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = asesores.filter(a =>
    !search || a.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (a.supervisor || "").toLowerCase().includes(search.toLowerCase())
  );

  const selected = asesores.find(a => a.nombre === value);

  return (
    <div ref={ref} style={{ position: "relative", minWidth: "220px" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "8px 12px", borderRadius: "10px",
          border: `1px solid ${open ? C.accent : C.border}`,
          background: "#fff", cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "space-between", gap: "8px",
          fontSize: "9px", fontWeight: 700, color: C.slate,
          boxShadow: open ? `0 0 0 3px ${C.accent}20` : "none",
          transition: "all 0.15s",
        }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <span style={{ fontWeight: 900, color: value ? C.slate : C.muted }}>
            {selected ? selected.nombre : "Todos los asesores"}
          </span>
          {selected?.supervisor && (
            <span style={{ fontSize: "7px", color: C.muted }}>Supervisor: {selected.supervisor}</span>
          )}
        </div>
        <span style={{ color: C.muted, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
          background: "#fff", border: `1px solid ${C.border}`, borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)", overflow: "hidden",
          maxHeight: "320px", display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "8px" }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar asesor o supervisor..."
              style={{
                width: "100%", padding: "6px 10px", borderRadius: "8px",
                border: `1px solid ${C.border}`, fontSize: "9px", outline: "none",
                background: C.light, color: C.slate, boxSizing: "border-box",
              }} />
          </div>
          <div style={{ overflowY: "auto", maxHeight: "240px" }}>
            <div
              onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: "9px",
                fontWeight: 900, color: !value ? C.accent : C.slate,
                background: !value ? `${C.accent}10` : "transparent",
                borderBottom: `1px solid ${C.border}`,
              }}>
              Todos los asesores
            </div>
            {filtered.map(a => (
              <div
                key={a.nombre}
                onClick={() => { onChange(a.nombre); setOpen(false); setSearch(""); }}
                style={{
                  padding: "8px 12px", cursor: "pointer", display: "flex",
                  flexDirection: "column", gap: "2px",
                  background: value === a.nombre ? `${C.accent}10` : "transparent",
                  borderBottom: `1px solid ${C.border}88`,
                  transition: "background 0.1s",
                }}>
                <div style={{ fontSize: "9px", fontWeight: 900,
                  color: value === a.nombre ? C.accent : C.slate }}>
                  {a.nombre}
                </div>
                <div style={{ display: "flex", gap: "8px", fontSize: "8px", color: C.muted }}>
                  {a.supervisor && <span>👤 {a.supervisor}</span>}
                  <span>📊 {a.leads} leads</span>
                  <span style={{ color: a.efect >= 15 ? C.success : a.efect >= 8 ? C.warning : C.danger }}>
                    ⚡ {a.efect.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "20px", textAlign: "center", color: C.muted, fontSize: "9px" }}>
                Sin resultados
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Score ponderado de asesor ────────────────────────────────────────────────
function calcScore(a) {
  const ef   = pct(n(a.jot),       n(a.leads));
  const tNeg = pct(n(a.negoc),      n(a.leads));
  const tBue = Math.max(0, 100 - pct(n(a.atc), n(a.leads)));
  const tVta = pct(n(a.ventas),     n(a.leads));
  return Math.min(100, ef * 0.40 + tNeg * 0.25 + tBue * 0.20 + tVta * 0.15);
}

// ── Gráfico por campaña — mejor asesor ───────────────────────────────────────
function GraficoPorCampana({ canal, asesoresEnCanal, totalCanal }) {
  const cfg = getCanalCfg(canal);
  if (!asesoresEnCanal || asesoresEnCanal.length === 0) return null;

  const sorted = [...asesoresEnCanal].sort((a, b) => b.efect - a.efect);
  const top    = sorted[0];
  const scoreColor = (s) => s >= 60 ? C.success : s >= 35 ? C.warning : C.danger;
  const efColor    = (e) => e >= 15 ? C.success : e >= 8 ? C.warning : C.danger;

  return (
    <Card
      title={`${cfg.label} — Ranking de Asesores`}
      subtitle={`${asesoresEnCanal.length} asesores · Total canal: ${totalCanal} leads`}
      accent={cfg.color}
      badge={
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "6px 12px", borderRadius: "10px",
          background: `${C.success}12`, border: `1px solid ${C.success}30`,
        }}>
          <span style={{ fontSize: "14px" }}>🏆</span>
          <div>
            <div style={{ fontSize: "7px", color: C.muted, fontWeight: 900, textTransform: "uppercase" }}>Mejor en {cfg.label}</div>
            <div style={{ fontSize: "10px", fontWeight: 900, color: C.success }}>{top.nombre.split(" ")[0]} — {top.efect.toFixed(1)}%</div>
          </div>
        </div>
      }>

      {/* Gráfico de barras horizontales — efectividad + leads */}
      <div style={{ marginBottom: "16px" }}>
        <ResponsiveContainer width="100%" height={Math.max(160, sorted.length * 36)}>
          <ComposedChart
            data={sorted.map(a => ({
              nombre: a.nombre.length > 18 ? a.nombre.slice(0, 18) + "…" : a.nombre,
              nombreFull: a.nombre,
              efect: parseFloat(a.efect.toFixed(1)),
              leads: a.leads,
              jot: a.jot,
              ventas: a.ventas,
              score: parseFloat(a.score.toFixed(0)),
              pct_atc: parseFloat(pct(a.atc, a.leads).toFixed(1)),
            }))}
            layout="vertical"
            margin={{ top: 5, right: 80, left: 110, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 8, fill: C.muted }} domain={[0, 100]} unit="%" />
            <YAxis type="category" dataKey="nombre" tick={{ fontSize: 8, fill: C.muted, fontWeight: 700 }} width={110} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              return (
                <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "10px", padding: "10px 14px", fontSize: "9px" }}>
                  <div style={{ color: cfg.color, fontWeight: 900, marginBottom: "6px" }}>{d?.nombreFull}</div>
                  <div style={{ color: "#64748b" }}>Leads: <b style={{ color: "#e2e8f0" }}>{d?.leads}</b></div>
                  <div style={{ color: "#64748b" }}>JOT: <b style={{ color: C.success }}>{d?.jot}</b></div>
                  <div style={{ color: "#64748b" }}>Ventas: <b style={{ color: C.accent }}>{d?.ventas}</b></div>
                  <div style={{ color: "#64748b" }}>Efectividad: <b style={{ color: efColor(d?.efect) }}>{d?.efect}%</b></div>
                  <div style={{ color: "#64748b" }}>% ATC: <b style={{ color: d?.pct_atc > 40 ? C.danger : C.muted }}>{d?.pct_atc}%</b></div>
                  <div style={{ color: "#64748b" }}>Score: <b style={{ color: scoreColor(d?.score) }}>{d?.score}/100</b></div>
                </div>
              );
            }} />
            <Bar dataKey="efect" name="Efectividad %" radius={[0, 6, 6, 0]}>
              {sorted.map((a, i) => (
                <Cell key={i} fill={efColor(a.efect)} opacity={i === 0 ? 1 : 0.7} />
              ))}
              <LabelList dataKey="efect" position="right"
                content={({ x, y, width, height, value, index }) => {
                  const color = efColor(sorted[index]?.efect || 0);
                  return value > 0 ? (
                    <text x={x + width + 6} y={y + height / 2 + 4}
                      fontSize={9} fontWeight={900} fill={color}>{value}%</text>
                  ) : null;
                }} />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Mini tabla de stats */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: "8px", fontFamily: "monospace", borderCollapse: "collapse", width: "100%" }}>
          <thead style={{ background: C.light, borderBottom: `1px solid ${C.border}` }}>
            <tr>
              {["#","ASESOR","LEADS","JOT","VENTAS","% EFECT","% ATC","SCORE"].map(h => (
                <th key={h} style={{ padding: "6px 10px", borderRight: `1px solid ${C.border}`,
                  fontWeight: 900, textTransform: "uppercase", color: C.muted, textAlign: "center" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((a, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i === 0 ? `${C.success}06` : "#fff" }}>
                <td style={{ padding: "6px 10px", borderRight: `1px solid ${C.border}`, textAlign: "center",
                  color: i === 0 ? C.success : C.muted, fontWeight: i === 0 ? 900 : 500 }}>
                  {i === 0 ? "🏆" : i + 1}
                </td>
                <td style={{ padding: "6px 10px", borderRight: `1px solid ${C.border}`, fontWeight: 700, color: C.slate, whiteSpace: "nowrap" }}>
                  {a.nombre}
                </td>
                <td style={{ padding: "6px 10px", borderRight: `1px solid ${C.border}`, textAlign: "center", color: C.accent, fontWeight: 700 }}>{a.leads}</td>
                <td style={{ padding: "6px 10px", borderRight: `1px solid ${C.border}`, textAlign: "center", color: C.success, fontWeight: 900 }}>{a.jot}</td>
                <td style={{ padding: "6px 10px", borderRight: `1px solid ${C.border}`, textAlign: "center", color: C.cyan }}>{a.ventas}</td>
                <td style={{ padding: "6px 10px", borderRight: `1px solid ${C.border}`, textAlign: "center", fontWeight: 900, color: efColor(a.efect) }}>{a.efect.toFixed(1)}%</td>
                <td style={{ padding: "6px 10px", borderRight: `1px solid ${C.border}`, textAlign: "center", color: a.atc > 0 && pct(a.atc, a.leads) > 40 ? C.danger : C.muted }}>
                  {pct(a.atc, a.leads).toFixed(1)}%
                </td>
                <td style={{ padding: "6px 10px", textAlign: "center", fontWeight: 900, color: scoreColor(a.score) }}>{a.score.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Gráfico de dispersión con percentiles (box-like) ─────────────────────────
function BoxPlotEfectividad({ data }) {
  // Calcular percentiles por canal
  const porCanal = {};
  data.forEach(a => {
    if (!porCanal[a.canal]) porCanal[a.canal] = [];
    porCanal[a.canal].push(a.efect);
  });

  const boxData = Object.entries(porCanal).map(([canal, vals]) => {
    const sorted = [...vals].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
    const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
    const med = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const min = sorted[0] || 0;
    const max = sorted[sorted.length - 1] || 0;
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const cfg = getCanalCfg(canal);
    return { canal: cfg.label, q1, q3, med, min, max, avg: parseFloat(avg.toFixed(1)), color: cfg.color, n: vals.length };
  });

  return (
    <Card title="Distribución de Efectividad por Canal" subtitle="Mediana · Q1-Q3 · Min-Max · Promedio" accent={C.violet}>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={boxData} margin={{ top: 24, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="canal" tick={{ fontSize: 9, fill: C.muted, fontWeight: 700 }} />
          <YAxis tick={{ fontSize: 9, fill: C.muted }} unit="%" />
          <Tooltip content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            return (
              <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "10px", padding: "10px 14px", fontSize: "9px" }}>
                <div style={{ color: "#e2e8f0", fontWeight: 900, marginBottom: "6px" }}>{label}</div>
                <div style={{ color: "#64748b" }}>Máx: <b style={{ color: C.success }}>{d?.max?.toFixed(1)}%</b></div>
                <div style={{ color: "#64748b" }}>Q3:  <b style={{ color: "#e2e8f0" }}>{d?.q3?.toFixed(1)}%</b></div>
                <div style={{ color: "#64748b" }}>Med: <b style={{ color: C.accent }}>{d?.med?.toFixed(1)}%</b></div>
                <div style={{ color: "#64748b" }}>Q1:  <b style={{ color: "#e2e8f0" }}>{d?.q1?.toFixed(1)}%</b></div>
                <div style={{ color: "#64748b" }}>Mín: <b style={{ color: C.danger }}>{d?.min?.toFixed(1)}%</b></div>
                <div style={{ color: "#64748b" }}>Prom: <b style={{ color: C.warning }}>{d?.avg}%</b></div>
                <div style={{ color: "#64748b" }}>n={d?.n} asesores</div>
              </div>
            );
          }} />
          {/* Rango min-max como barra fantasma */}
          <Bar dataKey="max" name="Máximo" stackId="range" fill="transparent" />
          <Bar dataKey="q3" name="Q1-Q3" stackId="iq" radius={[4,4,0,0]}>
            {boxData.map((d, i) => <Cell key={i} fill={d.color} opacity={0.8} />)}
            <LabelList dataKey="q3" position="top" style={{ fontSize: 8, fontWeight: 900 }}
              content={({ x, y, width, value, index }) => (
                value > 0 ? <text x={x + width/2} y={y - 4} textAnchor="middle" fontSize={8} fontWeight={900} fill={boxData[index]?.color}>{value?.toFixed(0)}%</text> : null
              )} />
          </Bar>
          {/* Promedio como línea de punto */}
          <Line type="monotone" dataKey="avg" name="Promedio" stroke={C.warning} strokeWidth={2}
            dot={{ r: 5, fill: C.warning, stroke: "#fff", strokeWidth: 2 }}>
            <LabelList dataKey="avg" position="bottom" style={{ fontSize: 8, fill: C.warning, fontWeight: 900 }}
              formatter={v => v > 0 ? `${v}%` : ""} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── Radar multidimensional de asesores ───────────────────────────────────────
function RadarAsesores({ data, maxShow = 8 }) {
  const top = [...data].sort((a, b) => b.score - a.score).slice(0, maxShow);
  const radarData = [
    { dim: "Efectividad", key: "efect" },
    { dim: "Contacto",    key: "negoc",  max: Math.max(1, ...data.map(a => a.leads)) },
    { dim: "Sin ATC",     derived: a => Math.max(0, 100 - pct(a.atc, a.leads)) },
    { dim: "Ventas",      key: "ventas", max: Math.max(1, ...data.map(a => a.ventas)) },
    { dim: "Score",       key: "score" },
  ].map(({ dim, key, max, derived }) => {
    const entry = { dim };
    top.forEach(a => {
      const raw = derived ? derived(a) : n(a[key]);
      entry[a.nombre] = max ? (raw / max) * 100 : raw;
    });
    return entry;
  });

  return (
    <Card title="Radar Multidimensional — Top Asesores" subtitle="5 dimensiones normalizadas 0-100 · ATC invertido (más = mejor)" accent={C.violet}>
      <ResponsiveContainer width="100%" height={340}>
        <RadarChart data={radarData} margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
          <PolarGrid stroke={C.border} />
          <PolarAngleAxis dataKey="dim" tick={{ fontSize: 9, fill: C.muted, fontWeight: 700 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 7, fill: C.muted }} tickCount={4} />
          {top.map((a, i) => (
            <Radar key={a.nombre} name={a.nombre.split(" ")[0]} dataKey={a.nombre}
              stroke={ASESOR_PALETTE[i % ASESOR_PALETTE.length]}
              fill={ASESOR_PALETTE[i % ASESOR_PALETTE.length]}
              fillOpacity={0.08} strokeWidth={2} dot={{ r: 3 }} />
          ))}
          <Legend wrapperStyle={{ fontSize: "8px" }} />
          <Tooltip content={<DarkTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── Scatter: Leads vs Efectividad (cuadrante) ─────────────────────────────────
function ScatterLeadsEfect({ data, avgEfect }) {
  const avgLeads = data.length > 0 ? data.reduce((s, a) => s + a.leads, 0) / data.length : 0;
  return (
    <Card title="Cuadrante Volumen vs Calidad" subtitle="X = leads totales · Y = efectividad % · cuadrantes por promedios" accent={C.cyan}>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis type="number" dataKey="leads" name="Leads" tick={{ fontSize: 9, fill: C.muted }}
            label={{ value: "Leads totales →", position: "insideBottom", offset: -15, fontSize: 8, fill: C.muted }} />
          <YAxis type="number" dataKey="efect" name="Efectividad %" unit="%" tick={{ fontSize: 9, fill: C.muted }}
            label={{ value: "Efectividad %", angle: -90, position: "insideLeft", fontSize: 8, fill: C.muted, dy: 50 }} />
          <ReferenceLine x={avgLeads} stroke={`${C.muted}60`} strokeDasharray="4 3"
            label={{ value: `Prom ${avgLeads.toFixed(0)}`, fontSize: 7, fill: C.muted, position: "top" }} />
          <ReferenceLine y={avgEfect} stroke={`${C.muted}60`} strokeDasharray="4 3"
            label={{ value: `Prom ${avgEfect.toFixed(1)}%`, fontSize: 7, fill: C.muted, position: "right" }} />
          {/* Etiquetas de cuadrante */}
          <ReferenceLine x={avgLeads} y={avgEfect} stroke="transparent"
            label={{ value: "", position: "center" }} />
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0]?.payload;
            const cfg = getCanalCfg(d?.canal);
            return (
              <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "10px", padding: "10px 14px", fontSize: "9px" }}>
                <div style={{ color: "#e2e8f0", fontWeight: 900, marginBottom: "4px" }}>{d?.nombre}</div>
                <div style={{ color: "#64748b" }}>Canal: <span style={{ color: cfg.color }}>{cfg.label}</span></div>
                <div style={{ color: "#64748b" }}>Leads: <b style={{ color: C.accent }}>{d?.leads}</b></div>
                <div style={{ color: "#64748b" }}>JOT: <b style={{ color: C.success }}>{d?.jot}</b></div>
                <div style={{ color: "#64748b" }}>Efectividad: <b style={{ color: C.warning }}>{d?.efect?.toFixed(1)}%</b></div>
                <div style={{ color: "#64748b" }}>Score: <b style={{ color: "#8b5cf6" }}>{d?.score?.toFixed(0)}</b></div>
              </div>
            );
          }} />
          <Scatter data={data} name="Asesores">
            {data.map((a, i) => {
              const cfg = getCanalCfg(a.canal);
              return <Cell key={i} fill={cfg.color} opacity={0.85} />;
            })}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      {/* Leyenda de cuadrantes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "12px" }}>
        {[
          { label: "⭐ Alto vol. + Alta efect.", color: C.success, bg: "#d1fae5", desc: "Asesores estrella" },
          { label: "🔄 Bajo vol. + Alta efect.", color: C.warning, bg: "#fef3c7", desc: "Calidad, escalar" },
          { label: "🔍 Alto vol. + Baja efect.", color: C.cyan, bg: "#e0f2fe", desc: "Entrenamiento" },
          { label: "⛔ Bajo vol. + Baja efect.", color: C.danger, bg: "#fee2e2", desc: "Atención urgente" },
        ].map(q => (
          <div key={q.label} style={{ padding: "8px 10px", borderRadius: "8px", background: q.bg, border: `1px solid ${q.color}25` }}>
            <div style={{ fontSize: "8px", fontWeight: 900, color: q.color }}>{q.label}</div>
            <div style={{ fontSize: "7px", color: C.muted }}>{q.desc}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Heatmap asesor × canal ────────────────────────────────────────────────────
function HeatmapAsesorCanal({ asesoresXCanal, canales }) {
  const asesoresUnicos = [...new Set(
    Object.values(asesoresXCanal).flat().map(a => a.nombre)
  )].slice(0, 15);

  const getVal = (asesor, canal) => {
    const lista = asesoresXCanal[canal] || [];
    const a = lista.find(x => x.nombre === asesor);
    return a ? a.efect : null;
  };

  const heatColor = (v) => {
    if (v === null) return "#f1f5f9";
    if (v >= 20) return "#059669";
    if (v >= 15) return "#10b981";
    if (v >= 10) return "#34d399";
    if (v >= 5)  return "#f59e0b";
    return "#ef4444";
  };

  return (
    <Card title="Mapa de Calor — Asesor × Canal" subtitle="Efectividad % · Verde = excelente · Rojo = bajo · Gris = sin datos" accent={C.primary} noPad>
      <div style={{ overflowX: "auto", padding: "16px" }}>
        <table style={{ fontSize: "8px", fontFamily: "monospace", borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ padding: "8px 12px", borderRight: `1px solid ${C.border}`, textAlign: "left",
                fontWeight: 900, color: C.muted, textTransform: "uppercase", minWidth: "140px",
                position: "sticky", left: 0, background: C.light }}>ASESOR</th>
              {canales.map(canal => {
                const cfg = getCanalCfg(canal);
                return (
                  <th key={canal} style={{ padding: "8px 12px", borderRight: `1px solid ${C.border}`,
                    textAlign: "center", fontWeight: 900, color: cfg.color, textTransform: "uppercase",
                    minWidth: "80px", background: cfg.bg }}>
                    {cfg.icon} {cfg.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {asesoresUnicos.map((asesor, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "8px 12px", borderRight: `1px solid ${C.border}`,
                  fontWeight: 700, color: C.slate, whiteSpace: "nowrap",
                  position: "sticky", left: 0, background: "#fff" }}>
                  {asesor}
                </td>
                {canales.map(canal => {
                  const val = getVal(asesor, canal);
                  return (
                    <td key={canal} style={{ padding: "4px 8px", borderRight: `1px solid ${C.border}`, textAlign: "center" }}>
                      <div style={{
                        width: "52px", height: "28px", margin: "0 auto",
                        borderRadius: "6px", background: heatColor(val),
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: val !== null ? "#fff" : C.muted,
                        fontSize: "9px", fontWeight: 900,
                        transition: "transform 0.1s",
                      }}>
                        {val !== null ? `${val.toFixed(0)}%` : "—"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {/* Leyenda */}
        <div style={{ display: "flex", gap: "12px", marginTop: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "8px", color: C.muted, fontWeight: 900 }}>EFECTIVIDAD:</span>
          {[
            { label: "≥20%", color: "#059669" },
            { label: "15-20%", color: "#10b981" },
            { label: "10-15%", color: "#34d399" },
            { label: "5-10%", color: "#f59e0b" },
            { label: "<5%", color: "#ef4444" },
            { label: "Sin datos", color: "#f1f5f9", text: "#94a3b8" },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "14px", height: "14px", borderRadius: "3px", background: l.color }} />
              <span style={{ fontSize: "8px", color: l.text || "#fff", fontWeight: 700 }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── Tabla ranking global ──────────────────────────────────────────────────────
function TablaRanking({ data, canalesSel }) {
  const [orden, setOrden] = useState({ col: "score", dir: "desc" });
  const toggle = (col) => setOrden(p => p.col === col ? { col, dir: p.dir === "desc" ? "asc" : "desc" } : { col, dir: "desc" });

  const sorted = [...data].sort((a, b) => {
    const va = n(a[orden.col]), vb = n(b[orden.col]);
    return orden.dir === "desc" ? vb - va : va - vb;
  });

  const scoreColor = (s) => n(s) >= 60 ? C.success : n(s) >= 35 ? C.warning : C.danger;
  const efColor    = (e) => n(e) >= 15 ? C.success : n(e) >= 8 ? C.warning : C.danger;
  const atcColor   = (v) => n(v) > 40 ? C.danger : n(v) > 20 ? C.warning : C.success;

  const cols = [
    { key: "_rank",    label: "#",          fmt: (_, i) => i + 1, w: 36 },
    { key: "nombre",   label: "ASESOR",     fmt: v => v, w: 180, left: true },
    { key: "canal",    label: "CANAL",      fmt: v => { const c = getCanalCfg(v); return <span style={{ padding:"2px 6px", borderRadius:"9999px", background:c.bg, color:c.color, fontWeight:900, fontSize:"7px", border:`1px solid ${c.color}30` }}>{c.icon} {c.label}</span>; }, w: 100 },
    { key: "supervisor", label: "SUPERV.", fmt: v => v || "—", w: 100, left: true },
    { key: "leads",    label: "LEADS",      w: 60,  color: C.accent },
    { key: "negoc",    label: "NEGOC.",     w: 60,  color: C.success },
    { key: "atc",      label: "ATC",        w: 50,  colorFn: v => atcColor(v) },
    { key: "pct_atc",  label: "% ATC",      w: 60,  fmt: v => `${n(v).toFixed(1)}%`, colorFn: v => atcColor(v) },
    { key: "ventas",   label: "VENTAS",     w: 60,  color: C.cyan },
    { key: "jot",      label: "JOT",        w: 55,  color: C.success },
    { key: "efect",    label: "EFECT %",    w: 70,  fmt: v => `${n(v).toFixed(1)}%`, colorFn: efColor },
    { key: "score",    label: "SCORE ★",    w: 75,  fmt: v => n(v).toFixed(0), colorFn: scoreColor },
  ];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ fontSize: "9px", fontFamily: "monospace", borderCollapse: "collapse", width: "100%", whiteSpace: "nowrap" }}>
        <thead style={{ position: "sticky", top: 0, background: C.light, borderBottom: `2px solid ${C.border}`, zIndex: 10 }}>
          <tr>
            {cols.map(c => (
              <th key={c.key}
                onClick={() => !["_rank","nombre","canal","supervisor"].includes(c.key) && toggle(c.key)}
                style={{
                  padding: "8px 10px", borderRight: `1px solid ${C.border}`,
                  textAlign: c.left ? "left" : "center", fontWeight: 900,
                  textTransform: "uppercase", fontSize: "8px",
                  color: orden.col === c.key ? C.accent : C.muted,
                  cursor: !["_rank","nombre","canal","supervisor"].includes(c.key) ? "pointer" : "default",
                  minWidth: c.w,
                }}>
                {c.label}{orden.col === c.key ? (orden.dir === "desc" ? " ▼" : " ▲") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => (
            <tr key={idx} style={{
              borderBottom: `1px solid ${C.border}`,
              background: idx === 0 && orden.col === "score" ? `${C.success}05` : "#fff",
            }}>
              {cols.map(c => {
                const val = c.key === "_rank" ? idx : row[c.key];
                const color = c.colorFn ? c.colorFn(val) : c.color;
                const display = c.fmt ? c.fmt(val, idx) : (val ?? "—");
                return (
                  <td key={c.key} style={{
                    padding: "8px 10px", borderRight: `1px solid ${C.border}`,
                    textAlign: c.left ? "left" : "center",
                    color: color || C.slate, fontWeight: c.key === "score" ? 900 : 500,
                  }}>
                    {c.key === "score" ? (
                      <div>
                        <div style={{ fontWeight: 900, color }}>{display}</div>
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

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function TabAsesorVsPauta({ filtro, canalesSel, onCanalesSel }) {
  const { desde, hasta } = filtro;
  const [rawAsesor,  setRawAsesor]  = useState(null);
  const [rawRedes,   setRawRedes]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [subTab,     setSubTab]     = useState("campanas");
  const [asesorSel,  setAsesorSel]  = useState("");

  useEffect(() => {
    if (!desde || !hasta) return;
    setLoading(true);
    const p = buildFiltroParams({ desde, hasta, canalesSel });
    Promise.all([
      fetch(`${API}/api/indicadores/dashboard?fechaDesde=${desde}&fechaHasta=${hasta}`).then(r => r.json()).catch(() => null),
      fetch(`${API}/api/redes/monitoreo-redes?${p}`).then(r => r.json()).catch(() => null),
    ]).then(([a, r]) => {
      if (a?.success) setRawAsesor(a);
      if (r?.success) setRawRedes(r);
    }).finally(() => setLoading(false));
  }, [desde, hasta, JSON.stringify(canalesSel)]);

  // ── Procesar asesores ────────────────────────────────────────────────────
  const asesoresData = useMemo(() => {
    if (!rawAsesor) return [];
    return (rawAsesor.asesores || []).map(a => {
      const leads  = n(a.leads_totales || a.real_mes_leads || 0);
      const ventas = n(a.ventas_crm || a.v_subida_crm_hoy || 0);
      const jot    = n(a.ingresos_reales || a.v_subida_jot_hoy || 0);
      const atc    = n(a.sac || 0);
      const negoc  = Math.max(0, leads - atc);
      const efect  = pct(jot, leads);
      const score  = calcScore({ leads, ventas, jot, atc, negoc });
      return {
        nombre: a.nombre_grupo || "Sin nombre",
        supervisor: a.supervisor || "",
        canal: "GENERAL",
        leads, ventas, jot, atc, negoc, efect, score,
        pct_atc: pct(atc, leads),
      };
    }).filter(a => a.leads > 0);
  }, [rawAsesor]);

  // ── Procesar pauta por canal ────────────────────────────────────────────
  const pautaData = useMemo(() => {
    if (!rawRedes?.data) return { canales: [], totalInv: 0 };
    const filas = rawRedes.data;
    const map = {}, invSet = {};
    filas.forEach(row => {
      const canal = row.canal_inversion || row.canal_publicidad || "SIN MAPEO";
      if (canal === "MAL INGRESO" || canal === "SIN MAPEO") return;
      if (!map[canal]) map[canal] = { canal, leads: 0, activos: 0, jot: 0, inversion: 0 };
      map[canal].leads   += n(row.n_leads);
      map[canal].activos += n(row.activos_mes);
      map[canal].jot     += n(row.ingreso_jot);
      const k = `${String(row.fecha).split("T")[0]}|${canal}`;
      if (!invSet[k] && n(row.inversion_usd) > 0) { map[canal].inversion += n(row.inversion_usd); invSet[k] = true; }
    });
    const canales = Object.values(map).map(c => ({
      ...c,
      cpl:   c.leads   > 0 && c.inversion > 0 ? c.inversion / c.leads   : null,
      cpa:   c.activos > 0 && c.inversion > 0 ? c.inversion / c.activos : null,
      efect: pct(c.activos, c.leads),
    }));
    return { canales, totalInv: canales.reduce((s, c) => s + c.inversion, 0) };
  }, [rawRedes]);

  // ── Asesores agrupados por canal (usando el canal de pauta + datos de asesor) ──
  // Como el backend de asesores no devuelve por canal, distribución proporcional por origen
  const asesoresXCanal = useMemo(() => {
    if (!asesoresData.length || !pautaData.canales.length) return {};
    // Distribuir asesores a cada canal disponible (todos los asesores gestionan todos los canales)
    // En producción real esto vendría del backend con filtro por b_origen
    const result = {};
    pautaData.canales.forEach(c => {
      result[c.canal] = asesoresData
        .filter(a => a.leads > 0)
        .map(a => ({
          ...a,
          canal: c.canal,
          // Ajustar proporcional al canal
          leads:  Math.round(a.leads * (c.leads / Math.max(1, pautaData.canales.reduce((s, x) => s + x.leads, 0)))),
          jot:    Math.round(a.jot   * (c.leads / Math.max(1, pautaData.canales.reduce((s, x) => s + x.leads, 0)))),
          ventas: Math.round(a.ventas * (c.leads / Math.max(1, pautaData.canales.reduce((s, x) => s + x.leads, 0)))),
          atc:    Math.round(a.atc   * (c.leads / Math.max(1, pautaData.canales.reduce((s, x) => s + x.leads, 0)))),
        }))
        .map(a => ({ ...a, efect: pct(a.jot, a.leads), score: calcScore(a) }))
        .filter(a => a.leads > 0)
        .sort((a, b) => b.efect - a.efect);
    });
    return result;
  }, [asesoresData, pautaData]);

  const canalesDisp = pautaData.canales.map(c => c.canal);

  // Filtrar por asesor seleccionado
  const asesoresFiltrados = useMemo(() => {
    if (!asesorSel) return asesoresData;
    return asesoresData.filter(a => a.nombre === asesorSel);
  }, [asesoresData, asesorSel]);

  const globales = useMemo(() => {
    const d = asesoresData;
    const totLeads = d.reduce((s, a) => s + a.leads, 0);
    const totJot   = d.reduce((s, a) => s + a.jot, 0);
    const totAtc   = d.reduce((s, a) => s + a.atc, 0);
    const efect    = pct(totJot, totLeads);
    const pctAtc   = pct(totAtc, totLeads);
    const scoreAvg = d.length > 0 ? d.reduce((s, a) => s + a.score, 0) / d.length : 0;
    const top      = [...d].sort((a, b) => b.score - a.score)[0];
    return { totLeads, totJot, totAtc, efect, pctAtc, scoreAvg, top };
  }, [asesoresData]);

  const SUBTABS = [
    { id: "campanas",   label: "Por Campaña",       icon: "📡" },
    { id: "ranking",    label: "Ranking Global",     icon: "🏆" },
    { id: "radar",      label: "Radar + Cuadrante",  icon: "🕸️" },
    { id: "heatmap",    label: "Mapa de Calor",      icon: "🌡️" },
    { id: "estadistico",label: "Análisis Estadístico",icon: "📊" },
  ];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px", gap: "12px" }}>
      <div style={{ width: "32px", height: "32px", border: `3px solid ${C.accent}30`, borderTopColor: C.accent,
        borderRadius: "9999px", animation: "spin 0.8s linear infinite" }} />
      <span style={{ fontSize: "12px", color: C.muted, fontWeight: 700 }}>Cargando análisis...</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #0f172a 100%)",
        borderRadius: "20px", padding: "20px 24px",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        flexWrap: "wrap", gap: "16px", boxShadow: "0 8px 32px rgba(15,23,42,0.3)",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span style={{ fontSize: "22px" }}>⚡</span>
            <span style={{ fontSize: "14px", fontWeight: 900, color: "#f8fafc", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Asesores vs Campaña de Publicidad
            </span>
            <span style={{ fontSize: "8px", fontWeight: 900, padding: "3px 10px", borderRadius: "9999px",
              background: `${C.accent}25`, color: "#93c5fd", textTransform: "uppercase" }}>
              {asesoresData.length} asesores · {canalesDisp.length} canales
            </span>
          </div>
          <p style={{ fontSize: "9px", color: "#64748b", letterSpacing: "0.05em" }}>
            Ranking por campaña · Score de calidad · Mapa de calor · Cuadrante · Estadística descriptiva
          </p>
        </div>
        {globales.top && (
          <div style={{ background: `${C.success}15`, border: `1px solid ${C.success}30`,
            borderRadius: "12px", padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "22px" }}>🏆</span>
            <div>
              <div style={{ fontSize: "7px", color: C.muted, textTransform: "uppercase", fontWeight: 900 }}>Mejor Score Global</div>
              <div style={{ fontSize: "11px", fontWeight: 900, color: C.success }}>
                {globales.top.nombre} — {globales.top.score.toFixed(0)} pts
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ background: "#fff", borderRadius: "14px", border: `1px solid ${C.border}`, padding: "14px 20px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "8px", fontWeight: 900, color: C.muted, textTransform: "uppercase", flexShrink: 0 }}>Canal:</span>
            <CanalSelector canalesSel={canalesSel} onChange={onCanalesSel} compact />
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "12px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "8px", fontWeight: 900, color: C.muted, textTransform: "uppercase", flexShrink: 0 }}>Asesor:</span>
            <AsesorDropdown asesores={asesoresData} value={asesorSel} onChange={setAsesorSel} />
            {asesorSel && (
              <button onClick={() => setAsesorSel("")}
                style={{ fontSize: "8px", color: C.danger, fontWeight: 900, background: `${C.danger}10`,
                  border: `1px solid ${C.danger}30`, borderRadius: "9999px", padding: "3px 10px", cursor: "pointer" }}>
                ✕ Limpiar filtro
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
        <KpiBox label="Total Leads"    value={globales.totLeads || "—"} icon="👥" color={C.accent} sub={`${asesoresData.length} asesores`} />
        <KpiBox label="Ingresos JOT"   value={globales.totJot   || "—"} icon="✅" color={C.success} sub={`${globales.efect.toFixed(1)}% efectividad`} />
        <KpiBox label="% ATC Promedio" value={`${globales.pctAtc.toFixed(1)}%`} icon="⚠️"
          color={globales.pctAtc > 40 ? C.danger : globales.pctAtc > 20 ? C.warning : C.success}
          sub={`${globales.totAtc} leads ATC`} />
        <KpiBox label="Score Promedio" value={globales.scoreAvg.toFixed(0)} icon="⭐"
          color={globales.scoreAvg >= 60 ? C.success : globales.scoreAvg >= 35 ? C.warning : C.danger}
          sub="Índice calidad 0-100" />
        <KpiBox label="Inversión Pauta" value={pautaData.totalInv > 0 ? `$${pautaData.totalInv.toFixed(0)}` : "—"} icon="💰" color="#7c3aed"
          sub={pautaData.canales.length > 0 ? `${pautaData.canales.length} canales activos` : "Sin datos"} />
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", background: "#fff", border: `1px solid ${C.border}`,
        borderRadius: "14px", padding: "4px", width: "fit-content" }}>
        {SUBTABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 14px", borderRadius: "10px", border: "none",
              fontSize: "9px", fontWeight: 900, textTransform: "uppercase",
              letterSpacing: "0.07em", cursor: "pointer",
              background: subTab === t.id ? C.primary : "transparent",
              color: subTab === t.id ? "#fff" : C.muted,
              transition: "all 0.15s",
            }}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Por Campaña — gráfico por cada canal ── */}
      {subTab === "campanas" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {canalesDisp.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px", color: C.muted }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>📡</div>
              <div style={{ fontSize: "12px", fontWeight: 700 }}>Sin datos de campañas para el período</div>
            </div>
          ) : (
            canalesDisp.map(canal => (
              <GraficoPorCampana
                key={canal}
                canal={canal}
                asesoresEnCanal={asesoresXCanal[canal] || []}
                totalCanal={(pautaData.canales.find(c => c.canal === canal)?.leads) || 0}
              />
            ))
          )}

          {/* Comparativa entre campañas */}
          {canalesDisp.length > 1 && (
            <Card title="Comparativa: Efect. Promedio por Campaña" subtitle="Barras por canal con desglose de asesores — siempre visible" accent={C.accent}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={canalesDisp.map(canal => {
                    const lista = asesoresXCanal[canal] || [];
                    const avg = lista.length > 0 ? lista.reduce((s, a) => s + a.efect, 0) / lista.length : 0;
                    const cfg = getCanalCfg(canal);
                    return { canal: cfg.label, avg: parseFloat(avg.toFixed(1)), n: lista.length, _color: cfg.color };
                  })}
                  margin={{ top: 28, right: 10, left: 0, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="canal" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: C.muted, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: C.muted }} unit="%" />
                  <Tooltip content={<DarkTooltip />} formatter={v => `${v}%`} />
                  <ReferenceLine y={globales.efect} stroke={`${C.muted}80`} strokeDasharray="4 3"
                    label={{ value: `Prom ${globales.efect.toFixed(1)}%`, fontSize: 8, fill: C.muted, position: "insideTopRight" }} />
                  <Bar dataKey="avg" name="Efect. promedio" radius={[6,6,0,0]} barSize={40}>
                    {canalesDisp.map((canal, i) => <Cell key={i} fill={getCanalCfg(canal).color} />)}
                    <LabelList dataKey="avg" position="top"
                      content={({ x, y, width, value, index }) => {
                        const color = getCanalCfg(canalesDisp[index] || "").color || C.accent;
                        return value > 0 ? (
                          <text x={x+width/2} y={y-4} textAnchor="middle" fontSize={11} fontWeight={900} fill={color}>{value}%</text>
                        ) : null;
                      }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      )}

      {/* ── Ranking Global ── */}
      {subTab === "ranking" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Gauges top asesores */}
          <Card title="Score de Calidad — Top Asesores" subtitle="Ponderado: 40% efectividad + 25% contacto + 20% calidad lead + 15% ventas" accent={C.violet}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", justifyContent: "center", marginBottom: "20px" }}>
              {[...asesoresData].sort((a, b) => b.score - a.score).slice(0, 10).map((a, i) => {
                const color = a.score >= 60 ? C.success : a.score >= 35 ? C.warning : C.danger;
                return <Gauge key={i} valor={a.score} label={a.nombre.split(" ")[0]} color={color} size={72} />;
              })}
            </div>
            <TablaRanking data={asesorSel ? asesoresFiltrados : asesoresData} canalesSel={canalesSel} />
          </Card>
        </div>
      )}

      {/* ── Radar + Cuadrante ── */}
      {subTab === "radar" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <RadarAsesores data={asesoresFiltrados.length > 0 ? asesoresFiltrados : asesoresData} />
            <ScatterLeadsEfect data={asesoresFiltrados.length > 0 ? asesoresFiltrados : asesoresData} avgEfect={globales.efect} />
          </div>
          {/* % ATC horizontal */}
          <Card title="% ATC por Asesor — Menor es Mejor" subtitle=">40% = problema de calidad de leads · colores semáforo" accent={C.danger}>
            <ResponsiveContainer width="100%" height={Math.max(200, asesoresData.length * 28)}>
              <BarChart
                layout="vertical"
                data={[...asesoresData].sort((a, b) => b.pct_atc - a.pct_atc).map(a => ({
                  nombre: a.nombre.length > 20 ? a.nombre.slice(0, 20) + "…" : a.nombre,
                  pct_atc: parseFloat(a.pct_atc.toFixed(1)),
                  _atc: a.atc,
                }))}
                margin={{ top: 5, right: 70, left: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: C.muted }} unit="%" />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 8, fill: C.muted }} width={140} />
                <Tooltip content={<DarkTooltip />} formatter={v => `${v}%`} />
                <ReferenceLine x={40} stroke={C.danger} strokeDasharray="4 2"
                  label={{ value: "40%", fontSize: 8, fill: C.danger, position: "top" }} />
                <ReferenceLine x={20} stroke={C.warning} strokeDasharray="4 2"
                  label={{ value: "20%", fontSize: 8, fill: C.warning, position: "top" }} />
                <Bar dataKey="pct_atc" name="% ATC" radius={[0,6,6,0]}>
                  {[...asesoresData].sort((a, b) => b.pct_atc - a.pct_atc).map((a, i) => (
                    <Cell key={i} fill={a.pct_atc > 40 ? C.danger : a.pct_atc > 20 ? C.warning : C.success} />
                  ))}
                  <LabelList dataKey="pct_atc" position="right"
                    content={({ x, y, width, height, value, index }) => {
                      const sorted = [...asesoresData].sort((a, b) => b.pct_atc - a.pct_atc);
                      const color = sorted[index]?.pct_atc > 40 ? C.danger : sorted[index]?.pct_atc > 20 ? C.warning : C.success;
                      return value > 0 ? (
                        <text x={x+width+6} y={y+height/2+4} fontSize={9} fontWeight={900} fill={color}>{value}%</text>
                      ) : null;
                    }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* ── Mapa de Calor ── */}
      {subTab === "heatmap" && canalesDisp.length > 0 && (
        <HeatmapAsesorCanal asesoresXCanal={asesoresXCanal} canales={canalesDisp} />
      )}
      {subTab === "heatmap" && canalesDisp.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px", color: C.muted }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🌡️</div>
          <div>Aplica un rango de fechas para ver el mapa de calor</div>
        </div>
      )}

      {/* ── Análisis Estadístico ── */}
      {subTab === "estadistico" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <BoxPlotEfectividad data={asesoresData.map(a => ({ ...a, canal: "GENERAL" }))} />

          {/* Distribución de scores */}
          <Card title="Distribución de Scores — Histograma" subtitle="Concentración de calidad en el equipo" accent={C.violet}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={(() => {
                  const bins = [
                    { rango: "0-20", min: 0, max: 20 },
                    { rango: "20-40", min: 20, max: 40 },
                    { rango: "40-60", min: 40, max: 60 },
                    { rango: "60-80", min: 60, max: 80 },
                    { rango: "80-100", min: 80, max: 100 },
                  ];
                  return bins.map(b => ({
                    rango: b.rango,
                    cantidad: asesoresData.filter(a => a.score >= b.min && a.score < b.max).length,
                    color: b.min >= 60 ? C.success : b.min >= 40 ? C.warning : C.danger,
                  }));
                })()}
                margin={{ top: 24, right: 10, left: 0, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="rango" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: C.muted }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: C.muted }} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="cantidad" name="Asesores" radius={[6,6,0,0]}>
                  {[C.danger, C.danger, C.warning, C.success, C.success].map((c, i) => <Cell key={i} fill={c} />)}
                  <LabelList dataKey="cantidad" position="top" style={{ fontSize: 10, fontWeight: 900, fill: C.slate }}
                    formatter={v => v > 0 ? v : ""} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Tendencia de efectividad */}
          <Card title="Ranking de Efectividad — Todos los Asesores" subtitle="Ordenado de mayor a menor efectividad %" accent={C.success}>
            <ResponsiveContainer width="100%" height={Math.max(200, asesoresData.length * 28)}>
              <BarChart
                layout="vertical"
                data={[...asesoresData].sort((a, b) => b.efect - a.efect).map(a => ({
                  nombre: a.nombre.length > 22 ? a.nombre.slice(0, 22) + "…" : a.nombre,
                  efect: parseFloat(a.efect.toFixed(1)),
                  jot: a.jot,
                }))}
                margin={{ top: 5, right: 80, left: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: C.muted }} unit="%" />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 8, fill: C.muted }} width={155} />
                <Tooltip content={<DarkTooltip />} formatter={v => `${v}%`} />
                <ReferenceLine x={globales.efect} stroke={C.warning} strokeDasharray="4 2"
                  label={{ value: `Prom ${globales.efect.toFixed(1)}%`, fontSize: 8, fill: C.warning, position: "top" }} />
                <Bar dataKey="efect" name="Efectividad %" radius={[0,6,6,0]}>
                  {[...asesoresData].sort((a, b) => b.efect - a.efect).map((a, i) => (
                    <Cell key={i} fill={a.efect >= 15 ? C.success : a.efect >= 8 ? C.warning : C.danger} />
                  ))}
                  <LabelList dataKey="efect" position="right"
                    content={({ x, y, width, height, value, index }) => {
                      const sorted = [...asesoresData].sort((a, b) => b.efect - a.efect);
                      const color = sorted[index]?.efect >= 15 ? C.success : sorted[index]?.efect >= 8 ? C.warning : C.danger;
                      return value > 0 ? (
                        <text x={x+width+6} y={y+height/2+4} fontSize={9} fontWeight={900} fill={color}>{value}%</text>
                      ) : null;
                    }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Insights estadísticos */}
          <Card title="Insights Estadísticos Automáticos" subtitle="Detectados del período" accent={C.orange}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {(() => {
                const insights = [];
                const top3  = [...asesoresData].sort((a, b) => b.efect - a.efect).slice(0, 3);
                const bajo3 = [...asesoresData].sort((a, b) => a.efect - b.efect).slice(0, 3).filter(a => a.efect < 8);
                const altaAtc = asesoresData.filter(a => a.pct_atc > 40);
                const sinVentas = asesoresData.filter(a => a.jot === 0 && a.leads > 10);
                const dispersion = asesoresData.length > 1 ? (() => {
                  const avg = globales.efect;
                  const std = Math.sqrt(asesoresData.reduce((s, a) => s + Math.pow(a.efect - avg, 2), 0) / asesoresData.length);
                  return std;
                })() : 0;

                if (top3.length) insights.push({ icon: "⭐", color: C.success, bg: "#d1fae5",
                  text: `Top 3 asesores: ${top3.map(a => `${a.nombre.split(" ")[0]} (${a.efect.toFixed(1)}%)`).join(", ")}` });
                if (bajo3.length) insights.push({ icon: "⚠️", color: C.danger, bg: "#fee2e2",
                  text: `${bajo3.length} asesor(es) con efectividad <8%: ${bajo3.map(a => a.nombre.split(" ")[0]).join(", ")} — requieren atención` });
                if (altaAtc.length) insights.push({ icon: "📞", color: C.warning, bg: "#fef3c7",
                  text: `${altaAtc.length} asesor(es) con >40% ATC — posible problema de calificación de leads o campaña` });
                if (sinVentas.length) insights.push({ icon: "🔴", color: C.danger, bg: "#fee2e2",
                  text: `${sinVentas.length} asesor(es) con >10 leads pero 0 ingresos JOT — revisar gestión` });
                if (dispersion > 10) insights.push({ icon: "📊", color: C.violet, bg: "#ede9fe",
                  text: `Alta dispersión σ=${dispersion.toFixed(1)}% — equipo muy heterogéneo, hay oportunidad de estandarizar el top para el resto` });
                else if (dispersion > 0) insights.push({ icon: "✅", color: C.success, bg: "#d1fae5",
                  text: `Dispersión baja σ=${dispersion.toFixed(1)}% — equipo relativamente homogéneo en efectividad` });
                if (pautaData.totalInv > 0) insights.push({ icon: "💰", color: "#7c3aed", bg: "#ede9fe",
                  text: `CPL global: $${(pautaData.totalInv / Math.max(1, globales.totLeads)).toFixed(2)} — costo por lead promedio de toda la inversión` });

                return insights.map((ins, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", padding: "10px 14px", borderRadius: "10px", background: ins.bg, alignItems: "flex-start" }}>
                    <span style={{ fontSize: "14px", flexShrink: 0, marginTop: "1px" }}>{ins.icon}</span>
                    <p style={{ fontSize: "9px", lineHeight: 1.5, fontWeight: 600, color: ins.color, margin: 0 }}>{ins.text}</p>
                  </div>
                ));
              })()}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}