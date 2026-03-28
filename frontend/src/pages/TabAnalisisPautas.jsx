// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  TabAnalisisPautas.jsx — Análisis Avanzado de Pautas VELSA NETLIFE      ║
// ║  KPIs: Tasa contacto · Velocidad · CPActivado · ROAS · Índice calidad   ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { useEffect, useState, useMemo } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LabelList, ReferenceLine,
} from "recharts";

// ─── Colores y config (mismos que Redes.jsx) ────────────────────────────────
const C = {
  primary: "#1e3a8a", sky: "#0ea5e9", success: "#059669",
  warning: "#f59e0b", danger: "#ef4444", violet: "#7c3aed",
  cyan: "#06b6d4", slate: "#334155", muted: "#64748b",
  light: "#f8fafc", border: "#e2e8f0", orange: "#ea580c",
};

const CANALES = {
  "ARTS":              { color: "#1e3a8a", bg: "#dbeafe", icon: "🎨", label: "ARTS" },
  "ARTS FACEBOOK":     { color: "#1877f2", bg: "#eff6ff", icon: "📘", label: "ARTS FB" },
  "ARTS GOOGLE":       { color: "#ea4335", bg: "#fee2e2", icon: "🔍", label: "ARTS GG" },
  "REMARKETING":       { color: "#7c3aed", bg: "#ede9fe", icon: "🔁", label: "REMARKETING" },
  "VIDIKA GOOGLE":     { color: "#059669", bg: "#d1fae5", icon: "📺", label: "VIDIKA GG" },
  "POR RECOMENDACIÓN": { color: "#f59e0b", bg: "#fef3c7", icon: "🤝", label: "RECOMEND." },
};

const getCfg = (c) => CANALES[c] || { color: C.muted, bg: "#f8fafc", icon: "•", label: c };

const API = import.meta.env.VITE_API_URL;
const n   = (v) => Number(v || 0);
const pct = (a, b) => b > 0 ? ((a / b) * 100) : 0;
const fmt2    = (v) => `$${n(v).toFixed(2)}`;
const fmtPct  = (v) => `${n(v).toFixed(1)}%`;
const fmtUsd  = (v) => `$${n(v).toFixed(0)}`;
const formatFecha = (f) => { if (!f) return "—"; const [, m, d] = String(f).split("T")[0].split("-"); return `${d}/${m}`; };

// ─── Helpers de color semáforo ───────────────────────────────────────────────
const colorSemaforo = (val, umbrales, invertir = false) => {
  const [bajo, medio] = umbrales;
  if (invertir) return val <= bajo ? C.success : val <= medio ? C.warning : C.danger;
  return val >= bajo ? C.success : val >= medio ? C.warning : C.danger;
};

// ─── Cálculo del Índice de Calidad de Pauta (ICP) ───────────────────────────
// Fórmula ponderada 0-100:
//   40% efectividad (activos/leads)
//   25% tasa contacto (negociables/leads)  ← proxy si no hay campo directo
//   20% inverso ATC  (leads - atc) / leads
//   15% eficiencia inversión (si hay inversión: 100 - CPL normalizado)
function calcICP(c, maxCPL) {
  const ef   = pct(c.activos_mes,          c.n_leads);           // 0-100
  const tNeg = pct(c.negociables,          c.n_leads);           // proxy contactabilidad
  const tBue = pct(c.n_leads - c.atc_soporte, c.n_leads);       // inverso ATC
  const cpl  = c.n_leads > 0 && c.inversion_usd > 0 ? c.inversion_usd / c.n_leads : null;
  const eInv = cpl !== null && maxCPL > 0 ? Math.max(0, 100 - (cpl / maxCPL) * 100) : null;

  const score =
    ef   * 0.40 +
    tNeg * 0.25 +
    tBue * 0.20 +
    (eInv !== null ? eInv * 0.15 : tBue * 0.15); // fallback si no hay inversión

  return Math.min(100, Math.max(0, score));
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="w-12 h-12 border-4 rounded-full animate-spin"
        style={{ borderColor: `${C.primary}30`, borderTopColor: C.primary }} />
    </div>
  );
}

// ─── Card base ───────────────────────────────────────────────────────────────
function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${className}`}
      style={{ borderColor: C.border }}>{children}</div>
  );
}
function CardHeader({ title, subtitle, accent = C.primary, badge, right }) {
  return (
    <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap"
      style={{ borderColor: C.border }}>
      <div className="flex items-center gap-3">
        <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: accent }} />
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: accent }}>{title}</div>
          {subtitle && <div className="text-[9px] font-medium mt-0.5" style={{ color: C.muted }}>{subtitle}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">{badge}{right}</div>
    </div>
  );
}

// ─── KPI card con tendencia ───────────────────────────────────────────────────
function KpiAvanzado({ label, value, sub, color, icon, trend, trendLabel, info }) {
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div className="bg-white rounded-2xl border shadow-sm p-4 relative" style={{ borderColor: C.border }}>
      <div className="flex items-start justify-between mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
          style={{ background: `${color}15` }}>{icon}</div>
        <div className="flex items-center gap-1.5">
          {trend !== undefined && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
              style={{
                background: trend >= 0 ? `${C.success}15` : `${C.danger}15`,
                color: trend >= 0 ? C.success : C.danger
              }}>
              {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%
            </span>
          )}
          {info && (
            <button onClick={() => setShowInfo(!showInfo)}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black"
              style={{ background: `${C.muted}15`, color: C.muted }}>?</button>
          )}
        </div>
      </div>
      <div className="text-[8px] font-black uppercase tracking-widest mb-0.5" style={{ color: C.muted }}>{label}</div>
      <div className="text-xl font-black leading-tight" style={{ color }}>{value}</div>
      {sub && <div className="text-[8px] font-medium mt-1" style={{ color: C.muted }}>{sub}</div>}
      {trend !== undefined && trendLabel && (
        <div className="text-[7px] mt-0.5" style={{ color: C.muted }}>{trendLabel}</div>
      )}
      {showInfo && info && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 p-3 bg-white rounded-xl border shadow-xl text-[8px] leading-relaxed"
          style={{ borderColor: C.border, color: C.slate }}>
          {info}
          <button onClick={() => setShowInfo(false)} className="ml-2 font-black" style={{ color: C.danger }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Gauge circular SVG ───────────────────────────────────────────────────────
function GaugeCircular({ valor, max = 100, label, color, size = 80 }) {
  const radio = size / 2 - 8;
  const circunf = 2 * Math.PI * radio;
  const progreso = Math.min(valor / max, 1);
  const dash = progreso * circunf * 0.75;  // 270° del círculo
  const gap  = circunf - dash;
  const rotacion = -225; // empieza abajo-izquierda

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle cx={size/2} cy={size/2} r={radio}
          fill="none" stroke={`${color}18`} strokeWidth={7}
          strokeDasharray={`${circunf * 0.75} ${circunf * 0.25}`}
          strokeLinecap="round"
          transform={`rotate(${rotacion} ${size/2} ${size/2})`} />
        {/* Progress */}
        <circle cx={size/2} cy={size/2} r={radio}
          fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${dash} ${gap + circunf * 0.25}`}
          strokeLinecap="round"
          transform={`rotate(${rotacion} ${size/2} ${size/2})`}
          style={{ transition: "stroke-dasharray 0.6s ease" }} />
        {/* Valor central */}
        <text x={size/2} y={size/2 + 1} textAnchor="middle" dominantBaseline="central"
          fontSize={size < 80 ? 10 : 13} fontWeight={800} fill={color}>
          {valor.toFixed(0)}
        </text>
        <text x={size/2} y={size/2 + (size < 80 ? 11 : 14)} textAnchor="middle"
          fontSize={size < 80 ? 6 : 7} fill={C.muted}>
          /{max}
        </text>
      </svg>
      <div className="text-[7.5px] font-black uppercase text-center leading-tight" style={{ color: C.muted, maxWidth: size }}>
        {label}
      </div>
    </div>
  );
}

// ─── Tooltip custom ──────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border rounded-xl shadow-xl px-4 py-3 text-[10px] max-w-xs" style={{ borderColor: C.border }}>
      <div className="font-black mb-2 uppercase text-[9px]" style={{ color: C.slate }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-0.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span style={{ color: C.muted }}>{p.name}:</span>
          <span className="font-black" style={{ color: C.slate }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Tabla comparativa de pautas ──────────────────────────────────────────────
function TablaComparativaPautas({ metricas, maxCPL }) {
  const [orden, setOrden] = useState({ col: "icp", dir: "desc" });

  const cols = [
    { key: "canal",       label: "CANAL",          fmt: (v, row) => (
      <span className="inline-flex items-center gap-1 text-[8px] font-black px-2 py-0.5 rounded-full"
        style={{ background: getCfg(v).bg, color: getCfg(v).color, border: `1px solid ${getCfg(v).color}30` }}>
        {getCfg(v).icon} {getCfg(v).label}
      </span>
    )},
    { key: "n_leads",     label: "LEADS",          color: C.primary },
    { key: "tContacto",   label: "T. CONTACTO",    fmt: (v) => fmtPct(v),  color: colorSemaforo(0, [50, 35]) },
    { key: "negociables", label: "NEGOCIABLES",    color: C.success },
    { key: "atc_soporte", label: "ATC",            color: C.danger },
    { key: "pctAtc",      label: "% ATC",          fmt: (v) => fmtPct(v),  colorFn: (v) => colorSemaforo(v, [40, 25], true) },
    { key: "venta_subida_bitrix", label: "V.SUBIDA", color: C.sky },
    { key: "activos_mes", label: "ACTIVOS",        color: C.success },
    { key: "efect",       label: "% EFECT.",       fmt: (v) => fmtPct(v),  colorFn: (v) => colorSemaforo(v, [15, 8]) },
    { key: "cpl",         label: "CPL",            fmt: (v) => v !== null ? fmt2(v) : "—", colorFn: (v) => v !== null ? colorSemaforo(v, [4, 8], true) : C.muted },
    { key: "cpActivado",  label: "CP ACTIVADO",   fmt: (v) => v !== null ? fmt2(v) : "—", colorFn: (v) => v !== null ? colorSemaforo(v, [20, 40], true) : C.muted },
    { key: "roas",        label: "ROAS",           fmt: (v) => v !== null ? `${v.toFixed(1)}x` : "—", colorFn: (v) => v !== null ? colorSemaforo(v, [3, 1.5]) : C.muted },
    { key: "inversion_usd", label: "INVERSIÓN",   fmt: (v) => fmtUsd(v),  color: C.violet },
    { key: "icp",         label: "ICP ★",          fmt: (v) => v.toFixed(0), colorFn: (v) => colorSemaforo(v, [60, 35]) },
  ];

  const sorted = [...metricas].sort((a, b) => {
    const va = a[orden.col] ?? -1, vb = b[orden.col] ?? -1;
    return orden.dir === "desc" ? vb - va : va - vb;
  });

  const toggleOrden = (col) => setOrden(prev =>
    prev.col === col ? { col, dir: prev.dir === "desc" ? "asc" : "desc" } : { col, dir: "desc" }
  );

  return (
    <div className="overflow-auto">
      <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
        <thead className="sticky top-0 z-10" style={{ background: C.light, borderBottom: `2px solid ${C.border}` }}>
          <tr>
            {cols.map((c) => (
              <th key={c.key}
                onClick={() => c.key !== "canal" && toggleOrden(c.key)}
                className="px-3 py-2.5 border-r text-center font-black uppercase cursor-pointer select-none hover:bg-slate-100 transition-colors"
                style={{ color: orden.col === c.key ? C.primary : C.muted, borderColor: C.border }}>
                {c.label}{orden.col === c.key ? (orden.dir === "desc" ? " ▼" : " ▲") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.canal} className="border-b hover:bg-slate-50 transition-colors"
              style={{ borderColor: C.border, background: i === 0 && orden.col === "icp" ? `${C.success}06` : undefined }}>
              {cols.map((c) => {
                const val = row[c.key];
                const color = c.colorFn ? c.colorFn(val) : c.color;
                return (
                  <td key={c.key} className="px-3 py-2 border-r text-center"
                    style={{ color: color || C.slate, fontWeight: c.key === "icp" ? 900 : 500, borderColor: C.border }}>
                    {c.fmt ? c.fmt(val, row) : (val ?? "—")}
                    {c.key === "icp" && (
                      <div className="w-full mt-0.5 rounded-full overflow-hidden" style={{ height: "2px", background: `${colorSemaforo(val, [60, 35])}20` }}>
                        <div style={{ width: `${val}%`, height: "100%", background: colorSemaforo(val, [60, 35]) }} />
                      </div>
                    )}
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

// ─── Gráfico Radar de canales ─────────────────────────────────────────────────
function RadarPautas({ metricas }) {
  // Normalizar cada dimensión a 0-100 para radar
  const maxVal = (key) => Math.max(1, ...metricas.map(m => n(m[key])));

  const radarData = [
    { dim: "Efectividad",  key: "efect" },
    { dim: "Contacto",     key: "tContacto" },
    { dim: "Sin ATC",      key: "pctBuena" },
    { dim: "V. Subida",    key: "pctVenta" },
    { dim: "ICP",          key: "icp" },
  ].map(({ dim, key }) => {
    const entry = { dim };
    metricas.forEach(m => {
      entry[m.canal] = key === "icp" ? n(m[key]) : Math.min(100, n(m[key]));
    });
    return entry;
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke={C.border} />
        <PolarAngleAxis dataKey="dim" tick={{ fontSize: 9, fill: C.muted, fontWeight: 700 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 7, fill: C.muted }} tickCount={4} />
        {metricas.map((m) => (
          <Radar key={m.canal} name={getCfg(m.canal).label} dataKey={m.canal}
            stroke={getCfg(m.canal).color} fill={getCfg(m.canal).color} fillOpacity={0.12}
            strokeWidth={2} dot={{ r: 3, fill: getCfg(m.canal).color }} />
        ))}
        <Legend wrapperStyle={{ fontSize: 9 }} />
        <Tooltip content={<CustomTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ─── Scatter CPL vs Efectividad ───────────────────────────────────────────────
function ScatterCPLEfect({ metricas }) {
  const conInv = metricas.filter(m => m.cpl !== null);
  if (conInv.length === 0) return (
    <div className="flex items-center justify-center h-48 text-[10px]" style={{ color: C.muted }}>
      Sin datos de inversión para este período
    </div>
  );

  const avgEfect = conInv.reduce((s, m) => s + m.efect, 0) / conInv.length;
  const avgCpl   = conInv.reduce((s, m) => s + m.cpl,   0) / conInv.length;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis type="number" dataKey="cpl" name="CPL $" tick={{ fontSize: 9, fill: C.muted }}
          label={{ value: "CPL ($) →", position: "insideBottom", offset: -10, fontSize: 8, fill: C.muted }} />
        <YAxis type="number" dataKey="efect" name="Efectividad %" tick={{ fontSize: 9, fill: C.muted }}
          label={{ value: "Efectividad %", angle: -90, position: "insideLeft", fontSize: 8, fill: C.muted, dy: 45 }} />
        {/* Líneas de referencia (cuadrantes) */}
        <ReferenceLine x={avgCpl} stroke={`${C.muted}60`} strokeDasharray="4 3"
          label={{ value: `Avg $${avgCpl.toFixed(2)}`, fontSize: 7, fill: C.muted, position: "top" }} />
        <ReferenceLine y={avgEfect} stroke={`${C.muted}60`} strokeDasharray="4 3"
          label={{ value: `Avg ${avgEfect.toFixed(1)}%`, fontSize: 7, fill: C.muted, position: "right" }} />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const d = payload[0]?.payload;
          if (!d) return null;
          const cfg = getCfg(d.canal);
          return (
            <div className="bg-white border rounded-xl shadow-xl px-4 py-3 text-[9px]" style={{ borderColor: C.border }}>
              <div className="font-black mb-1" style={{ color: cfg.color }}>{cfg.icon} {cfg.label}</div>
              <div style={{ color: C.muted }}>CPL: <span className="font-black" style={{ color: C.slate }}>${d.cpl?.toFixed(2)}</span></div>
              <div style={{ color: C.muted }}>Efectividad: <span className="font-black" style={{ color: C.slate }}>{d.efect?.toFixed(1)}%</span></div>
              <div style={{ color: C.muted }}>Leads: <span className="font-black" style={{ color: C.slate }}>{d.n_leads}</span></div>
              <div style={{ color: C.muted }}>ICP: <span className="font-black" style={{ color: colorSemaforo(d.icp, [60, 35]) }}>{d.icp?.toFixed(0)}</span></div>
            </div>
          );
        }} />
        <Scatter data={conInv.map(m => ({ ...m, x: m.cpl, y: m.efect }))}>
          {conInv.map((m, i) => (
            <Cell key={m.canal} fill={getCfg(m.canal).color} />
          ))}
        </Scatter>
        {/* Etiquetas de canal en scatter */}
        {conInv.map((m) => (
          <text key={m.canal + "-label"} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ─── Cuadrante visual (mejor/peor) con anotaciones ───────────────────────────
function CuadrantePautas({ metricas }) {
  const conInv = metricas.filter(m => m.cpl !== null && m.efect !== null);
  if (conInv.length < 2) return null;

  const avgEfect = conInv.reduce((s, m) => s + m.efect, 0) / conInv.length;
  const avgCpl   = conInv.reduce((s, m) => s + m.cpl,   0) / conInv.length;

  const cuadrante = (m) => {
    const buenEfect = m.efect >= avgEfect;
    const buenCpl   = m.cpl   <= avgCpl;
    if ( buenEfect &&  buenCpl) return { label: "⭐ Estrella",    color: C.success,  bg: "#d1fae5", desc: "Buen CPL + alta efectividad" };
    if ( buenEfect && !buenCpl) return { label: "🔄 Optimizable", color: C.warning,  bg: "#fef3c7", desc: "Alta efectividad, CPL caro" };
    if (!buenEfect &&  buenCpl) return { label: "🔍 Revisar",     color: C.sky,      bg: "#e0f2fe", desc: "CPL barato, baja efectividad" };
    return                             { label: "⛔ Crítico",     color: C.danger,   bg: "#fee2e2", desc: "CPL caro + baja efectividad" };
  };

  const grupos = {};
  conInv.forEach(m => {
    const q = cuadrante(m);
    if (!grupos[q.label]) grupos[q.label] = { ...q, canales: [] };
    grupos[q.label].canales.push(m);
  });

  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.values(grupos).map((g) => (
        <div key={g.label} className="rounded-xl border p-3" style={{ borderColor: `${g.color}30`, background: g.bg }}>
          <div className="text-[10px] font-black mb-0.5" style={{ color: g.color }}>{g.label}</div>
          <div className="text-[8px] mb-2" style={{ color: C.muted }}>{g.desc}</div>
          <div className="space-y-1.5">
            {g.canales.map(m => {
              const cfg = getCfg(m.canal);
              return (
                <div key={m.canal} className="flex items-center justify-between bg-white bg-opacity-70 rounded-lg px-2 py-1">
                  <span className="text-[8px] font-black" style={{ color: cfg.color }}>{cfg.icon} {cfg.label}</span>
                  <div className="flex items-center gap-2 text-[7.5px]">
                    <span style={{ color: C.muted }}>CPL</span>
                    <span className="font-black" style={{ color: g.color }}>${m.cpl.toFixed(2)}</span>
                    <span style={{ color: C.muted }}>EF</span>
                    <span className="font-black" style={{ color: g.color }}>{m.efect.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Panel de tendencia diaria por canal ──────────────────────────────────────
function TendenciaDiaria({ rawFilas, canalesActivos }) {
  const [metrica, setMetrica] = useState("icp_proxy");

  // Agregar por fecha×canal
  const mapaFechaCanal = {};
  rawFilas.forEach(row => {
    const canal = row.canal_inversion || row.canal;
    if (!canalesActivos.includes(canal)) return;
    const fecha = String(row.fecha).split("T")[0];
    const k = `${fecha}|${canal}`;
    if (!mapaFechaCanal[k]) mapaFechaCanal[k] = {
      fecha, canal, n_leads: 0, negociables: 0, atc_soporte: 0,
      activos_mes: 0, venta_subida_bitrix: 0, ingreso_jot: 0, inversion_usd: 0, _inv: false,
    };
    const a = mapaFechaCanal[k];
    a.n_leads             += n(row.n_leads);
    a.negociables         += n(row.negociables);
    a.atc_soporte         += n(row.atc_soporte);
    a.activos_mes         += n(row.activos_mes);
    a.venta_subida_bitrix += n(row.venta_subida_bitrix);
    a.ingreso_jot         += n(row.ingreso_jot);
    if (!a._inv && n(row.inversion_usd) > 0) { a.inversion_usd = n(row.inversion_usd); a._inv = true; }
  });

  // Construir líneas por fecha
  const fechas = [...new Set(Object.values(mapaFechaCanal).map(r => r.fecha))].sort();
  const lineData = fechas.map(fecha => {
    const entry = { fecha: formatFecha(fecha) };
    canalesActivos.forEach(canal => {
      const k = `${fecha}|${canal}`;
      const r = mapaFechaCanal[k];
      if (!r) return;
      const leads = n(r.n_leads);
      if (leads === 0) return;
      if (metrica === "icp_proxy") {
        const ef   = pct(r.activos_mes, leads);
        const tNeg = pct(r.negociables, leads);
        const tBue = pct(leads - r.atc_soporte, leads);
        entry[canal] = +(ef * 0.40 + tNeg * 0.25 + tBue * 0.35).toFixed(1);
      } else if (metrica === "efect") {
        entry[canal] = +pct(r.activos_mes, leads).toFixed(1);
      } else if (metrica === "cpl") {
        entry[canal] = r.inversion_usd > 0 ? +(r.inversion_usd / leads).toFixed(2) : null;
      } else if (metrica === "pct_atc") {
        entry[canal] = +pct(r.atc_soporte, leads).toFixed(1);
      }
    });
    return entry;
  });

  const METRICAS = [
    { value: "icp_proxy", label: "ICP (índice calidad)" },
    { value: "efect",     label: "% Efectividad" },
    { value: "cpl",       label: "CPL $" },
    { value: "pct_atc",   label: "% ATC" },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {METRICAS.map(m => (
          <button key={m.value} onClick={() => setMetrica(m.value)}
            className="px-3 py-1 rounded-full text-[8px] font-black uppercase border transition-all"
            style={metrica === m.value
              ? { background: C.primary, color: "#fff", borderColor: C.primary }
              : { background: "#fff", color: C.muted, borderColor: C.border }}>
            {m.label}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={lineData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: C.muted }} />
          <YAxis tick={{ fontSize: 9, fill: C.muted }} width={38}
            tickFormatter={v => metrica === "cpl" ? `$${v}` : `${v}${metrica !== "icp_proxy" ? "%" : ""}`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 9 }} />
          {canalesActivos.map(canal => (
            <Line key={canal} type="monotone" dataKey={canal}
              name={getCfg(canal).label}
              stroke={getCfg(canal).color} strokeWidth={2.5}
              dot={{ r: 3, fill: getCfg(canal).color, strokeWidth: 0 }}
              activeDot={{ r: 5 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function TabAnalisisPautas({ filtro }) {
  const { desde, hasta } = filtro;
  const [rawData,   setRawData]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [tabActivo, setTabActivo] = useState("resumen");

  // Cargar datos del endpoint principal de redes
  useEffect(() => {
    if (!desde || !hasta) return;
    setLoading(true);
    fetch(`${API}/api/redes/monitoreo-redes?fechaDesde=${desde}&fechaHasta=${hasta}`)
      .then(r => r.json())
      .then(d => setRawData(d?.success ? d : null))
      .catch(() => setRawData(null))
      .finally(() => setLoading(false));
  }, [desde, hasta]);

  // ── Calcular métricas avanzadas por canal ──────────────────────────────────
  const { metricas, canalesActivos, resumenGlobal } = useMemo(() => {
    if (!rawData?.data) return { metricas: [], canalesActivos: [], resumenGlobal: null };

    const filas = rawData.data;

    // Agrupar por canal
    const map = {}, invC = {};
    filas.forEach(row => {
      const canal = row.canal_inversion || row.canal;
      if (!canal || canal === "MAL INGRESO" || canal === "SIN MAPEO") return;
      if (!map[canal]) map[canal] = {
        canal, n_leads: 0, negociables: 0, atc_soporte: 0,
        venta_subida_bitrix: 0, ingreso_jot: 0, activos_mes: 0, inversion_usd: 0,
      };
      const a = map[canal];
      a.n_leads             += n(row.n_leads);
      a.negociables         += n(row.negociables);
      a.atc_soporte         += n(row.atc_soporte);
      a.venta_subida_bitrix += n(row.venta_subida_bitrix);
      a.ingreso_jot         += n(row.ingreso_jot);
      a.activos_mes         += n(row.activos_mes);
      const k = `${String(row.fecha).split("T")[0]}|${canal}`;
      if (!invC[k] && n(row.inversion_usd) > 0) { a.inversion_usd += n(row.inversion_usd); invC[k] = true; }
    });

    const base = Object.values(map).filter(m => m.n_leads > 0);
    const maxCPL = Math.max(1, ...base.filter(m => m.inversion_usd > 0).map(m => m.inversion_usd / m.n_leads));

    // Ingreso estimado por activo (asumimos ticket promedio $25/mes como referencia — ajustable)
    const TICKET_MENSUAL = 25;

    const metricas = base.map(m => {
      const leads = m.n_leads;
      const tContacto  = pct(m.negociables, leads);               // proxy: negociables/leads
      const efect      = pct(m.activos_mes, leads);
      const pctAtc     = pct(m.atc_soporte, leads);
      const pctBuena   = Math.max(0, 100 - pctAtc);               // leads sin ATC
      const pctVenta   = pct(m.venta_subida_bitrix, leads);
      const cpl        = leads > 0 && m.inversion_usd > 0 ? m.inversion_usd / leads : null;
      const cpActivado = m.activos_mes > 0 && m.inversion_usd > 0 ? m.inversion_usd / m.activos_mes : null;
      // ROAS: ingresos estimados / inversión
      const ingresoEst = m.activos_mes * TICKET_MENSUAL;
      const roas       = m.inversion_usd > 0 ? ingresoEst / m.inversion_usd : null;
      const icp        = calcICP(m, maxCPL);

      return {
        ...m,
        tContacto, efect, pctAtc, pctBuena, pctVenta,
        cpl, cpActivado, roas, icp,
        ingresoEst,
      };
    }).sort((a, b) => b.icp - a.icp);

    // Resumen global
    const totLeads = metricas.reduce((s, m) => s + m.n_leads, 0);
    const totAct   = metricas.reduce((s, m) => s + m.activos_mes, 0);
    const totInv   = metricas.reduce((s, m) => s + m.inversion_usd, 0);
    const totAtc   = metricas.reduce((s, m) => s + m.atc_soporte, 0);
    const totNeg   = metricas.reduce((s, m) => s + m.negociables, 0);
    const totIng   = metricas.reduce((s, m) => s + m.ingresoEst, 0);
    const icpProm  = metricas.length > 0 ? metricas.reduce((s, m) => s + m.icp, 0) / metricas.length : 0;

    const resumenGlobal = {
      totLeads, totAct, totInv, totAtc, totNeg, totIng,
      efect:      pct(totAct, totLeads),
      tContacto:  pct(totNeg, totLeads),
      pctAtc:     pct(totAtc, totLeads),
      cpl:        totLeads > 0 && totInv > 0 ? totInv / totLeads : null,
      cpActivado: totAct   > 0 && totInv > 0 ? totInv / totAct   : null,
      roas:       totInv > 0 ? totIng / totInv : null,
      icpProm,
    };

    return { metricas, canalesActivos: metricas.map(m => m.canal), resumenGlobal };
  }, [rawData]);

  const maxCPL = useMemo(() =>
    Math.max(1, ...metricas.filter(m => m.cpl !== null).map(m => m.cpl)),
    [metricas]
  );

  // ─── Mejor canal (ICP más alto) ─────────────────────────────────────────
  const mejorCanal = metricas[0] || null;

  if (loading) return <Spinner />;

  if (!rawData) return (
    <div className="flex flex-col items-center justify-center py-28 gap-4">
      <div className="text-5xl">📡</div>
      <div className="text-sm font-black" style={{ color: C.slate }}>Sin datos — aplica un rango de fechas</div>
      <div className="text-xs text-center max-w-sm leading-relaxed" style={{ color: C.muted }}>
        Selecciona un período desde el filtro principal y espera a que carguen los datos.
      </div>
    </div>
  );

  const SUBTABS = [
    { id: "resumen",    label: "Resumen Ejecutivo", icon: "📋" },
    { id: "tabla",      label: "Comparativa",        icon: "📊" },
    { id: "radar",      label: "Radar Canales",      icon: "🕸️" },
    { id: "cuadrante",  label: "Cuadrante CPL",      icon: "🗺️" },
    { id: "tendencia",  label: "Tendencia",           icon: "📈" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border px-5 py-4 flex items-start justify-between gap-4 flex-wrap"
        style={{ borderColor: `${C.primary}30`, background: "#eff6ff" }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🔬</span>
            <span className="text-[13px] font-black uppercase tracking-wide" style={{ color: C.primary }}>
              Análisis de Pautas
            </span>
            <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase"
              style={{ background: `${C.primary}15`, color: C.primary }}>
              {metricas.length} canales · {desde} → {hasta}
            </span>
          </div>
          <p className="text-[9px] leading-relaxed" style={{ color: C.muted }}>
            Tasa de contacto · CPL · CP Activado · ROAS · Índice de Calidad de Pauta (ICP)
          </p>
        </div>
        {mejorCanal && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl border"
            style={{ borderColor: `${C.success}30`, background: "#d1fae5" }}>
            <span className="text-xl">{getCfg(mejorCanal.canal).icon}</span>
            <div>
              <div className="text-[7px] font-black uppercase" style={{ color: C.muted }}>Mejor pauta (ICP)</div>
              <div className="text-[10px] font-black" style={{ color: C.success }}>
                {getCfg(mejorCanal.canal).label} — {mejorCanal.icp.toFixed(0)} pts
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KPIs globales */}
      {resumenGlobal && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <KpiAvanzado label="Leads totales"   value={resumenGlobal.totLeads || "—"} icon="👥"
            color={C.primary} sub={`${metricas.length} canales`} />
          <KpiAvanzado label="T. Contacto"     value={fmtPct(resumenGlobal.tContacto)} icon="📞"
            color={colorSemaforo(resumenGlobal.tContacto, [50, 35])}
            sub="negociables / leads"
            info="Proxy de contactabilidad: leads que pasaron a negociación vs total. Incluye los efectivamente contactados y cualificados." />
          <KpiAvanzado label="% ATC Global"    value={fmtPct(resumenGlobal.pctAtc)} icon="⚠️"
            color={colorSemaforo(resumenGlobal.pctAtc, [40, 25], true)}
            sub={`${resumenGlobal.totAtc} leads ATC`}
            info="Porcentaje de leads derivados a soporte ATC. Menor = mejor calidad de pauta." />
          <KpiAvanzado label="Efectividad"     value={fmtPct(resumenGlobal.efect)} icon="✅"
            color={colorSemaforo(resumenGlobal.efect, [15, 8])}
            sub={`${resumenGlobal.totAct} activos`}
            info="Activos del mes sobre total de leads. Indicador clave de conversión final." />
          <KpiAvanzado label="CPL Promedio"    value={resumenGlobal.cpl !== null ? fmt2(resumenGlobal.cpl) : "—"} icon="💸"
            color={colorSemaforo(resumenGlobal.cpl || 999, [4, 8], true)}
            sub="inversión / leads"
            info="Costo por lead promedio entre todos los canales con inversión registrada." />
          <KpiAvanzado label="CP Activado"     value={resumenGlobal.cpActivado !== null ? fmt2(resumenGlobal.cpActivado) : "—"} icon="🎯"
            color={colorSemaforo(resumenGlobal.cpActivado || 999, [20, 40], true)}
            sub="inversión / activo"
            info="Costo real por cliente activado. Más relevante que el CPL para medir rentabilidad real de la pauta." />
          <KpiAvanzado label="ROAS Estimado"   value={resumenGlobal.roas !== null ? `${resumenGlobal.roas.toFixed(1)}x` : "—"} icon="📈"
            color={colorSemaforo(resumenGlobal.roas || 0, [3, 1.5])}
            sub="ingreso est. / inversión"
            info="Return on Ad Spend estimado. Asume $25/mes por cliente activo. Ajustar según ticket real." />
        </div>
      )}

      {/* Gauges por canal — ICP */}
      {metricas.length > 0 && (
        <Card>
          <CardHeader title="Índice de Calidad de Pauta (ICP)" accent={C.primary}
            subtitle="Score 0-100 · ponderado: 40% efectividad + 25% contacto + 20% calidad lead + 15% eficiencia inversión"
            badge={
              <span className="text-[8px] font-medium px-2 py-1 rounded-full" style={{ background: `${C.primary}10`, color: C.primary }}>
                Mayor = mejor pauta
              </span>
            } />
          <div className="p-5">
            <div className="flex flex-wrap gap-6 justify-center mb-5">
              {metricas.map((m) => (
                <div key={m.canal} className="flex flex-col items-center gap-2">
                  <GaugeCircular
                    valor={m.icp} max={100}
                    label={getCfg(m.canal).label}
                    color={colorSemaforo(m.icp, [60, 35])}
                    size={88} />
                  <div className="text-center space-y-0.5">
                    <div className="text-[7.5px] font-bold" style={{ color: C.muted }}>
                      EF {m.efect.toFixed(0)}% · ATC {m.pctAtc.toFixed(0)}%
                    </div>
                    {m.cpl !== null && (
                      <div className="text-[7.5px] font-bold" style={{ color: C.violet }}>
                        CPL ${m.cpl.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Leyenda ICP */}
            <div className="flex flex-wrap justify-center gap-3 pt-3 border-t" style={{ borderColor: C.border }}>
              {[
                { label: "ICP ≥ 60 · Pauta excelente", color: C.success },
                { label: "ICP 35-59 · Pauta aceptable",  color: C.warning },
                { label: "ICP < 35 · Requiere atención", color: C.danger },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                  <span className="text-[8px] font-medium" style={{ color: C.muted }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-white border rounded-xl p-1 w-fit" style={{ borderColor: C.border }}>
        {SUBTABS.map(t => (
          <button key={t.id} onClick={() => setTabActivo(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all"
            style={tabActivo === t.id
              ? { background: C.primary, color: "#fff" }
              : { color: C.muted }}>
            <span>{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Contenido de sub-tabs */}
      {tabActivo === "resumen" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ranking por ICP */}
          <Card>
            <CardHeader title="Ranking de Pautas" subtitle="Ordenado por ICP — de mejor a peor" accent={C.success} />
            <div className="p-4 space-y-3">
              {metricas.map((m, i) => {
                const cfg = getCfg(m.canal);
                const icpColor = colorSemaforo(m.icp, [60, 35]);
                return (
                  <div key={m.canal} className="rounded-xl border p-3" style={{ borderColor: `${cfg.color}20`, background: cfg.bg }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: `${cfg.color}20`, color: cfg.color }}>
                          {i + 1}
                        </span>
                        <span className="text-base">{cfg.icon}</span>
                        <span className="text-[10px] font-black uppercase" style={{ color: cfg.color }}>{cfg.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-black" style={{ color: icpColor }}>{m.icp.toFixed(0)}</span>
                        <span className="text-[7px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: `${icpColor}15`, color: icpColor }}>ICP</span>
                      </div>
                    </div>
                    {/* Mini métricas */}
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        ["Contacto", `${m.tContacto.toFixed(0)}%`, colorSemaforo(m.tContacto, [50, 35])],
                        ["Efect.",   `${m.efect.toFixed(0)}%`,     colorSemaforo(m.efect, [15, 8])],
                        ["ATC",      `${m.pctAtc.toFixed(0)}%`,    colorSemaforo(m.pctAtc, [40, 25], true)],
                        m.cpl !== null
                          ? ["CPL", `$${m.cpl.toFixed(2)}`, colorSemaforo(m.cpl, [4, 8], true)]
                          : ["ROAS", m.roas !== null ? `${m.roas.toFixed(1)}x` : "—", C.muted],
                      ].map(([lbl, val, col]) => (
                        <div key={lbl} className="text-center bg-white bg-opacity-60 rounded-lg py-1.5">
                          <div className="text-[7px] font-bold" style={{ color: C.muted }}>{lbl}</div>
                          <div className="text-[9px] font-black" style={{ color: col }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {/* Barra ICP */}
                    <div className="mt-2">
                      <div className="w-full rounded-full overflow-hidden" style={{ height: "3px", background: `${icpColor}20` }}>
                        <div style={{ width: `${m.icp}%`, height: "100%", background: icpColor, transition: "width 0.6s" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Cuadrante CPL vs Efectividad */}
          <div className="space-y-4">
            <Card>
              <CardHeader title="Cuadrante de Pautas" subtitle="CPL vs Efectividad — referencia: promedios del período" accent={C.violet} />
              <div className="p-4">
                <CuadrantePautas metricas={metricas} />
              </div>
            </Card>

            {/* Insights automáticos */}
            <Card>
              <CardHeader title="Insights Automáticos" accent={C.orange} subtitle="Detectados del período" />
              <div className="p-4 space-y-2.5">
                {(() => {
                  const insights = [];
                  const mejorIcp = metricas[0];
                  const peorIcp  = metricas[metricas.length - 1];
                  const altaAtc  = metricas.filter(m => m.pctAtc > 40);
                  const sinInv   = metricas.filter(m => m.cpl === null);
                  const mejorCpl = [...metricas].filter(m => m.cpl !== null).sort((a, b) => a.cpl - b.cpl)[0];
                  const mejorEf  = [...metricas].sort((a, b) => b.efect - a.efect)[0];

                  if (mejorIcp) insights.push({
                    tipo: "success", icon: "⭐",
                    texto: `${getCfg(mejorIcp.canal).label} es la mejor pauta del período con ICP ${mejorIcp.icp.toFixed(0)}/100 — priorizar presupuesto aquí.`,
                  });
                  if (peorIcp && metricas.length > 1 && peorIcp.icp < 35) insights.push({
                    tipo: "danger", icon: "⛔",
                    texto: `${getCfg(peorIcp.canal).label} tiene ICP bajo (${peorIcp.icp.toFixed(0)}) — revisar segmentación y creativos.`,
                  });
                  if (altaAtc.length > 0) insights.push({
                    tipo: "warning", icon: "⚠️",
                    texto: `${altaAtc.map(m => getCfg(m.canal).label).join(", ")} supera 40% de ATC — leads de baja calidad, ajustar audiencia.`,
                  });
                  if (mejorCpl && mejorEf && mejorCpl.canal !== mejorEf.canal) insights.push({
                    tipo: "info", icon: "💡",
                    texto: `El canal más barato (${getCfg(mejorCpl.canal).label}, CPL $${mejorCpl.cpl.toFixed(2)}) ≠ el más efectivo (${getCfg(mejorEf.canal).label}, ${mejorEf.efect.toFixed(1)}%). Usar ambos según objetivo.`,
                  });
                  if (sinInv.length > 0) insights.push({
                    tipo: "neutral", icon: "📌",
                    texto: `${sinInv.map(m => getCfg(m.canal).label).join(", ")} sin inversión registrada — ROAS/CPL no calculable. Verificar integración de datos de pauta.`,
                  });

                  const colores = { success: C.success, danger: C.danger, warning: C.warning, info: C.primary, neutral: C.muted };
                  const bgs     = { success: "#d1fae5", danger: "#fee2e2", warning: "#fef3c7", info: "#dbeafe", neutral: "#f8fafc" };

                  return insights.map((ins, i) => (
                    <div key={i} className="flex gap-2 p-2.5 rounded-xl" style={{ background: bgs[ins.tipo] }}>
                      <span className="text-sm flex-shrink-0 mt-0.5">{ins.icon}</span>
                      <p className="text-[8.5px] leading-relaxed font-medium" style={{ color: colores[ins.tipo] }}>
                        {ins.texto}
                      </p>
                    </div>
                  ));
                })()}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tabActivo === "tabla" && (
        <Card>
          <CardHeader title="Tabla Comparativa de Pautas" accent={C.primary}
            subtitle="Haz clic en los encabezados para ordenar · ICP = Índice de Calidad de Pauta"
            badge={<span className="text-[8px] px-2 py-1 rounded-full font-bold"
              style={{ background: `${C.primary}12`, color: C.primary }}>
              {metricas.length} canales · click columna para ordenar
            </span>} />
          <TablaComparativaPautas metricas={metricas} maxCPL={maxCPL} />
          {/* Nota ROAS */}
          <div className="px-5 py-2.5 border-t text-[7.5px] flex flex-wrap gap-3" style={{ borderColor: C.border, color: C.muted }}>
            <span>★ ICP: 0-100 — mayor es mejor</span>
            <span>· ROAS estimado asume $25/mes por cliente activo</span>
            <span>· CP Activado = inversión / activos del mes</span>
            <span>· T. Contacto = negociables / leads (proxy)</span>
          </div>
        </Card>
      )}

      {tabActivo === "radar" && (
        <Card>
          <CardHeader title="Radar Multidimensional por Canal" accent={C.violet}
            subtitle="Comparación en 5 dimensiones normalizadas (0-100 cada eje)" />
          <div className="p-5">
            {metricas.length < 2 ? (
              <div className="text-center py-12 text-[10px]" style={{ color: C.muted }}>
                Se necesitan al menos 2 canales para el radar
              </div>
            ) : (
              <RadarPautas metricas={metricas} />
            )}
            <div className="mt-4 pt-3 border-t grid grid-cols-5 gap-2" style={{ borderColor: C.border }}>
              {[
                ["Efectividad", "activos/leads"],
                ["Contacto",    "negociables/leads"],
                ["Sin ATC",     "leads buenos/total"],
                ["V. Subida",   "ventas/leads"],
                ["ICP",         "índice ponderado"],
              ].map(([dim, desc]) => (
                <div key={dim} className="text-center">
                  <div className="text-[8px] font-black" style={{ color: C.slate }}>{dim}</div>
                  <div className="text-[7px]" style={{ color: C.muted }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {tabActivo === "cuadrante" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader title="Scatter: CPL vs Efectividad" accent={C.violet}
              subtitle="Ideal: arriba-izquierda (CPL bajo + alta efectividad)" />
            <div className="p-5">
              <ScatterCPLEfect metricas={metricas} />
              <div className="mt-3 grid grid-cols-2 gap-2 text-[7.5px]" style={{ color: C.muted }}>
                <div className="p-2 rounded-lg" style={{ background: "#d1fae580" }}>
                  <span style={{ color: C.success }}>▲ Arriba-Izquierda</span><br />
                  Bajo CPL + alta efectividad = pauta ideal
                </div>
                <div className="p-2 rounded-lg" style={{ background: "#fee2e280" }}>
                  <span style={{ color: C.danger }}>▼ Abajo-Derecha</span><br />
                  Alto CPL + baja efectividad = revisar urgente
                </div>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Clasificación por Cuadrante" accent={C.orange}
              subtitle="Basado en promedios del período" />
            <div className="p-4">
              <CuadrantePautas metricas={metricas} />
            </div>
          </Card>
        </div>
      )}

      {tabActivo === "tendencia" && (
        <Card>
          <CardHeader title="Evolución Diaria por Canal" accent={C.cyan}
            subtitle="Selecciona la métrica para comparar tendencias" />
          <div className="p-5">
            {rawData?.data && (
              <TendenciaDiaria rawFilas={rawData.data} canalesActivos={canalesActivos} />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}