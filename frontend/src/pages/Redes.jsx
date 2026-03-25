// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Redes.jsx — Monitoreo Redes VELSA NETLIFE                              ║
// ║  Tabs: General | Gráficos Gerencia | Metas vs Logros | Reporte Data     ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { useEffect, useState } from "react";
import {
  ComposedChart, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import TabReporteData from "./TabReporteData";

// ─────────────────────────────────────────────────────────────────────────────
// PALETA CORPORATIVA
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  primary: "#1e3a8a", sky: "#0ea5e9", success: "#059669",
  warning: "#f59e0b", danger: "#ef4444", violet: "#7c3aed",
  cyan: "#06b6d4", slate: "#334155", muted: "#64748b",
  light: "#f8fafc", border: "#e2e8f0",
};

// ─────────────────────────────────────────────────────────────────────────────
// CANALES CON IDENTIDAD VISUAL
// ─────────────────────────────────────────────────────────────────────────────
const CANALES = {
  "ARTS":               { color: "#1e3a8a", bg: "#dbeafe", icon: "🎨", label: "ARTS" },
  "ARTS FACEBOOK":      { color: "#1877f2", bg: "#eff6ff", icon: "📘", label: "ARTS FB" },
  "ARTS GOOGLE":        { color: "#ea4335", bg: "#fee2e2", icon: "🔍", label: "ARTS GG" },
  "REMARKETING":        { color: "#7c3aed", bg: "#ede9fe", icon: "🔁", label: "REMARKETING" },
  "VIDIKA GOOGLE":      { color: "#059669", bg: "#d1fae5", icon: "📺", label: "VIDIKA GG" },
  "POR RECOMENDACIÓN":  { color: "#f59e0b", bg: "#fef3c7", icon: "🤝", label: "RECOMEND." },
  "MAL INGRESO":        { color: "#94a3b8", bg: "#f1f5f9", icon: "⚠️", label: "MAL ING." },
  "SIN MAPEO":          { color: "#cbd5e1", bg: "#f8fafc", icon: "❓", label: "SIN MAPEO" },
};

// Mapeo origen → canal (usado en frontend para clasificar)
const ORIGEN_CANAL = {
  "BASE 593-979083368":                   "ARTS",
  "BASE 593-995211968":                   "ARTS FACEBOOK",
  "BASE 593-992827793":                   "ARTS GOOGLE",
  "FORMULARIO LANDING 3":                 "ARTS GOOGLE",
  "LLAMADA LANDING 3":                    "ARTS GOOGLE",
  "POR RECOMENDACIÓN":                    "POR RECOMENDACIÓN",
  "REFERIDO PERSONAL":                    "POR RECOMENDACIÓN",
  "TIENDA ONLINE":                        "POR RECOMENDACIÓN",
  "BASE 593-958993371":                   "REMARKETING",
  "BASE 593-984414273":                   "REMARKETING",
  "BASE 593-995967355":                   "REMARKETING",
  "WHATSAPP 593958993371":                "REMARKETING",
  "BASE 593-962881280":                   "VIDIKA GOOGLE",
  "BASE 593-987133635":                   "VIDIKA GOOGLE",
  "BASE API 593963463480":                "VIDIKA GOOGLE",
  "FORMULARIO LANDING 4":                 "VIDIKA GOOGLE",
  "LLAMADA":                              "VIDIKA GOOGLE",
  "LLAMADA LANDING 4":                    "VIDIKA GOOGLE",
  "BASE 593-958688121":                   "MAL INGRESO",
  "CONTRATO NETLIFE":                     "MAL INGRESO",
  "NO VOLVER A CONTACTAR":                "MAL INGRESO",
  "OPORTUNIDADES":                        "MAL INGRESO",
  "WAZZUP: WHATSAPP - ECUANET REGESTION": "MAL INGRESO",
  "ZONAS PELIGROSAS":                     "MAL INGRESO",
  "VENTA ECUANET DIRECTA":                "MAL INGRESO",
};

// Orígenes por canal (para selector en Metas)
const CANAL_A_ORIGENES = {
  "ARTS":              ["BASE 593-979083368"],
  "ARTS FACEBOOK":     ["BASE 593-995211968"],
  "ARTS GOOGLE":       ["BASE 593-992827793", "FORMULARIO LANDING 3", "LLAMADA LANDING 3"],
  "REMARKETING":       ["BASE 593-958993371", "BASE 593-984414273", "BASE 593-995967355", "WHATSAPP 593958993371"],
  "VIDIKA GOOGLE":     ["BASE 593-962881280", "BASE 593-987133635", "BASE API 593963463480", "FORMULARIO LANDING 4", "LLAMADA", "LLAMADA LANDING 4"],
  "POR RECOMENDACIÓN": ["POR RECOMENDACIÓN", "REFERIDO PERSONAL", "TIENDA ONLINE"],
};

const getCanal     = (o) => !o ? "SIN MAPEO" : ORIGEN_CANAL[o.toUpperCase()] || ORIGEN_CANAL[o] || "SIN MAPEO";
const getCfg       = (c) => CANALES[c] || { color: C.muted, bg: "#f8fafc", icon: "•", label: c };
const esPublicidad = (c) => c !== "MAL INGRESO" && c !== "SIN MAPEO";

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────────────────────
const getFechaHoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
const formatFecha = (f) => { if (!f) return "—"; const [, m, d] = String(f).split("T")[0].split("-"); return `${d}/${m}`; };
const n       = (v) => Number(v || 0);
const fmt2    = (v) => n(v).toFixed(2);
const fmtPct  = (v) => `${n(v).toFixed(1)}%`;
const fmtUsd  = (v) => `$${n(v).toFixed(0)}`;
const fmtUsd2 = (v) => `$${n(v).toFixed(2)}`;
const pctColor = (v) => { const x = n(v); return x >= 15 ? C.success : x >= 8 ? C.warning : C.danger; };

const API    = import.meta.env.VITE_API_URL;
const apiUrl = (r, d, h) => `${API}/api/redes/${r}?fechaDesde=${d}&fechaHasta=${h}`;

// ─────────────────────────────────────────────────────────────────────────────
// AGREGADORES — inversión contada UNA VEZ por canal×día
// ─────────────────────────────────────────────────────────────────────────────
function agregarPorCanalDia(filas) {
  const map = {};
  filas.forEach((row) => {
    // El backend ya devuelve canal_inversion directamente
    const canal = row.canal_inversion || getCanal(row.canal_publicidad);
    const fecha = String(row.fecha).split("T")[0];
    const key   = `${fecha}|${canal}`;
    if (!map[key]) map[key] = {
      fecha: row.fecha, canal, dia_semana: row.dia_semana,
      n_leads: 0, negociables: 0, atc_soporte: 0, fuera_cobertura: 0,
      innegociable: 0, venta_subida_bitrix: 0, seguimiento_negociacion: 0,
      ingreso_jot: 0, activos_mes: 0, activo_backlog: 0, inversion_usd: 0, _inv: false,
    };
    const a = map[key];
    a.n_leads += n(row.n_leads); a.negociables += n(row.negociables);
    a.atc_soporte += n(row.atc_soporte); a.fuera_cobertura += n(row.fuera_cobertura);
    a.innegociable += n(row.innegociable); a.venta_subida_bitrix += n(row.venta_subida_bitrix);
    a.seguimiento_negociacion += n(row.seguimiento_negociacion);
    a.ingreso_jot += n(row.ingreso_jot); a.activos_mes += n(row.activos_mes);
    a.activo_backlog += n(row.activo_backlog);
    if (!a._inv && n(row.inversion_usd) > 0) { a.inversion_usd = n(row.inversion_usd); a._inv = true; }
  });
  return Object.values(map).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || a.canal.localeCompare(b.canal));
}

function agregarPorFecha(filas) {
  const map = {};
  filas.forEach((row) => {
    const fecha = String(row.fecha).split("T")[0];
    if (!map[fecha]) map[fecha] = {
      fecha: row.fecha, n_leads: 0, negociables: 0, atc_soporte: 0,
      venta_subida_bitrix: 0, ingreso_jot: 0, activos_mes: 0, inversion_usd: 0, _invSet: new Set(),
    };
    const a = map[fecha];
    a.n_leads += n(row.n_leads); a.negociables += n(row.negociables);
    a.atc_soporte += n(row.atc_soporte); a.venta_subida_bitrix += n(row.venta_subida_bitrix);
    a.ingreso_jot += n(row.ingreso_jot); a.activos_mes += n(row.activos_mes);
    const canal = row.canal_inversion || getCanal(row.canal_publicidad);
    const k = `${fecha}|${canal}`;
    if (!a._invSet.has(k) && n(row.inversion_usd) > 0) { a.inversion_usd += n(row.inversion_usd); a._invSet.add(k); }
  });
  return Object.values(map).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
}

function agregarPorCanal(filas) {
  const map = {}, invC = {};
  filas.forEach((row) => {
    // FIX: el backend ya devuelve canal_inversion directamente — no hacer doble mapeo
    const canal = row.canal_inversion || getCanal(row.canal_publicidad);
    if (!map[canal]) map[canal] = { canal, n_leads: 0, negociables: 0, atc_soporte: 0, venta_subida_bitrix: 0, ingreso_jot: 0, activos_mes: 0, inversion_usd: 0 };
    const a = map[canal];
    a.n_leads += n(row.n_leads); a.negociables += n(row.negociables);
    a.atc_soporte += n(row.atc_soporte); a.venta_subida_bitrix += n(row.venta_subida_bitrix);
    a.ingreso_jot += n(row.ingreso_jot);
    // FIX ACTIVOS: sumar activos_mes directamente — el backend lo devuelve correcto
    a.activos_mes += n(row.activos_mes);
    const k = `${String(row.fecha).split("T")[0]}|${canal}`;
    if (!invC[k] && n(row.inversion_usd) > 0) { a.inversion_usd += n(row.inversion_usd); invC[k] = true; }
  });
  return Object.values(map).sort((a, b) => b.n_leads - a.n_leads);
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK CENTRAL DE DATOS
// ─────────────────────────────────────────────────────────────────────────────
function useMonitoreoData(desde, hasta) {
  const [data, setData]       = useState({ principal: null, ciudad: null, hora: null, atc: null });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!desde || !hasta) return;
    setLoading(true);
    Promise.all([
      fetch(apiUrl("monitoreo-redes",  desde, hasta)).then(r => r.json()).catch(() => null),
      fetch(apiUrl("monitoreo-ciudad", desde, hasta)).then(r => r.json()).catch(() => null),
      fetch(apiUrl("monitoreo-hora",   desde, hasta)).then(r => r.json()).catch(() => null),
      fetch(apiUrl("monitoreo-atc",    desde, hasta)).then(r => r.json()).catch(() => null),
    ]).then(([p, c, h, a]) => setData({
      principal: p?.success ? p : null, ciudad: c?.success ? c : null,
      hora: h?.success ? h : null, atc: a?.success ? a : null,
    })).finally(() => setLoading(false));
  }, [desde, hasta]);
  return { data, loading };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL AMPLIAR GRÁFICA
// ─────────────────────────────────────────────────────────────────────────────
function ChartModal({ title, onClose, children }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.border }}>
          <span className="text-sm font-black uppercase tracking-wide" style={{ color: C.primary }}>{title}</span>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors font-black text-sm" style={{ color: C.muted }}>✕</button>
        </div>
        <div className="p-6 overflow-auto" style={{ maxHeight: "calc(90vh - 70px)" }}>
          <ResponsiveContainer width="100%" height={500}>{children}</ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, accent = C.primary, height = 230, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 rounded-full" style={{ background: accent }} />
            <div>
              <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: accent }}>{title}</div>
              {subtitle && <div className="text-[9px] font-medium mt-0.5" style={{ color: C.muted }}>{subtitle}</div>}
            </div>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="text-[8px] font-black uppercase px-3 py-1 rounded-full border hover:shadow-sm transition-all"
            style={{ borderColor: C.border, color: C.muted }}
          >
            ⤢ Ampliar
          </button>
        </div>
        <div className="p-5"><ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer></div>
      </div>
      {open && <ChartModal title={title} onClose={() => setOpen(false)}>{children}</ChartModal>}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GRÁFICO COMBINADO — Funnel principal
// ─────────────────────────────────────────────────────────────────────────────
function GraficoFunnelCombinado({ diasData, tendCanalData, canalesPresentes, height = 320 }) {
  const dataFinal = diasData.map((d) => {
    const tend = tendCanalData.find((t) => t.fecha === d.fecha) || {};
    const jotPorCanal = {};
    canalesPresentes.forEach((canal) => {
      jotPorCanal[`JOT·${getCfg(canal).label}`] = tend[canal] || 0;
    });
    return { ...d, ...jotPorCanal };
  });

  const jotKeys = canalesPresentes.map((c) => `JOT·${getCfg(c).label}`);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={dataFinal} margin={{ top: 8, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: C.muted }} />
        <YAxis yAxisId="vol" tick={{ fontSize: 9, fill: C.muted }} width={38}
          label={{ value: "Leads", angle: -90, position: "insideLeft", fontSize: 8, fill: C.muted, dy: 25 }} />
        <YAxis yAxisId="jot" orientation="right" tick={{ fontSize: 9, fill: C.muted }} width={32}
          label={{ value: "JOT", angle: 90, position: "insideRight", fontSize: 8, fill: C.muted, dy: -20 }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 9 }} />
        <Bar yAxisId="vol" dataKey="Leads" name="Leads total"
          fill={`${C.primary}35`} stroke={C.primary} strokeWidth={0.5}
          radius={[3, 3, 0, 0]} barSize={20} />
        <Bar yAxisId="vol" dataKey="V. Subida" name="Venta Subida total"
          fill={`${C.success}70`} stroke={C.success} strokeWidth={0.5}
          radius={[3, 3, 0, 0]} barSize={20} />
        {canalesPresentes.map((canal) => (
          <Line key={canal} yAxisId="jot" type="monotone"
            dataKey={`JOT·${getCfg(canal).label}`}
            stroke={getCfg(canal).color} strokeWidth={2.5}
            dot={{ r: 3, fill: getCfg(canal).color, strokeWidth: 0 }}
            activeDot={{ r: 6 }} connectNulls />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR DE CANALES (usado en tab General/Gráficos)
// ─────────────────────────────────────────────────────────────────────────────
function OrigenesSelector({ origenesDisp, origenes, setOrigenes, loadingOrig = false }) {
  const canalesDisp = [...new Set(
    origenesDisp
      .map(getCanal)
      .filter((c) => esPublicidad(c))
  )];

  const canalesSel = [...new Set(origenes.map(getCanal).filter(esPublicidad))];

  const toggleCanal = (canal) => {
    const origenesDelCanal = Object.entries(ORIGEN_CANAL)
      .filter(([, c]) => c === canal)
      .map(([o]) => o);

    const yaSeleccionado = canalesSel.includes(canal);
    if (yaSeleccionado) {
      setOrigenes((prev) => prev.filter((o) => !origenesDelCanal.includes(o)));
    } else {
      const disponibles = origenesDelCanal.filter((o) => origenesDisp.includes(o));
      setOrigenes((prev) => [...new Set([...prev, ...disponibles])]);
    }
  };

  if (!origenesDisp.length && !loadingOrig) return (
    <p className="text-[9px] italic" style={{ color: C.muted }}>
      Aplica un período para ver los canales disponibles.
    </p>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {loadingOrig && (
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 border-2 rounded-full animate-spin"
            style={{ borderColor: `${C.sky}30`, borderTopColor: C.sky }} />
          <span className="text-[9px]" style={{ color: C.muted }}>Cargando...</span>
        </div>
      )}

      {!loadingOrig && (
        <>
          <button
            onClick={() => setOrigenes([])}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[8px] font-black uppercase border transition-all"
            style={origenes.length === 0
              ? { background: C.primary, color: "#fff", borderColor: C.primary }
              : { background: "#fff",    color: C.muted, borderColor: C.border }
            }
          >
            Todos
          </button>

          {canalesDisp.map((canal) => {
            const cfg = getCfg(canal);
            const sel = canalesSel.includes(canal);
            return (
              <button
                key={canal}
                onClick={() => toggleCanal(canal)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[8px] font-black uppercase border transition-all hover:shadow-sm"
                style={sel
                  ? { background: cfg.color, color: "#fff",   borderColor: cfg.color }
                  : { background: cfg.bg,    color: cfg.color, borderColor: `${cfg.color}40` }
                }
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
              </button>
            );
          })}

          {canalesSel.length > 0 && (
            <span className="text-[8px] font-medium" style={{ color: C.muted }}>
              {canalesSel.length} canal{canalesSel.length !== 1 ? "es" : ""}
              {" · "}
              <button
                onClick={() => setOrigenes([])}
                className="underline hover:no-underline"
                style={{ color: C.danger }}
              >
                limpiar
              </button>
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UI ATOMS
// ─────────────────────────────────────────────────────────────────────────────
function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${className}`} style={{ borderColor: C.border }}>{children}</div>;
}
function CardHeader({ title, subtitle, accent = C.primary, badge, action }) {
  return (
    <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: C.border }}>
      <div className="flex items-center gap-3">
        <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: accent }} />
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: accent }}>{title}</div>
          {subtitle && <div className="text-[9px] font-medium mt-0.5" style={{ color: C.muted }}>{subtitle}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">{badge}{action}</div>
    </div>
  );
}
function KpiCard({ label, value, color = C.primary, icon }) {
  return (
    <div className="bg-white rounded-2xl border shadow-sm px-4 py-3 flex items-center gap-3" style={{ borderColor: C.border }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: `${color}15` }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[8px] font-black uppercase tracking-widest truncate" style={{ color: C.muted }}>{label}</div>
        <div className="text-xl font-black leading-tight truncate" style={{ color }}>{value}</div>
      </div>
    </div>
  );
}
function CanalBadge({ canal, size = "sm" }) {
  const cfg = getCfg(canal);
  const cls = size === "sm" ? "px-2 py-0.5 text-[8px]" : "px-3 py-1 text-[9px]";
  return (
    <span
      className={`${cls} rounded-full font-black uppercase inline-flex items-center gap-1`}
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30` }}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}
function VistaToggle({ value, onChange, options, color = C.primary }) {
  return (
    <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: C.border }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="px-3 py-1.5 text-[8px] font-black uppercase transition-all"
          style={value === o.value
            ? { background: color, color: "#fff" }
            : { background: "#fff", color: C.muted }
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
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
function Spinner() {
  return (
    <div className="flex items-center justify-center py-32">
      <div
        className="w-12 h-12 border-4 rounded-full animate-spin"
        style={{ borderColor: `${C.primary}30`, borderTopColor: C.primary }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — MONITOREO GENERAL
// ─────────────────────────────────────────────────────────────────────────────
function TabMonitoreoGeneral({ data, loading }) {
  const { principal, ciudad, hora, atc } = data;
  const [vistaTabla, setVistaTabla] = useState("canal");
  const [vistaCity,  setVistaCity]  = useState("resumen");
  const [vistaHora,  setVistaHora]  = useState("resumen");
  const [vistaAtc,   setVistaAtc]   = useState("resumen");

  const rawFilas   = principal?.data || [];
  const filasAgr   = agregarPorCanalDia(rawFilas);
  // FIX ACTIVOS: agregarPorCanal ya acumula activos_mes correctamente
  const porCanal   = agregarPorCanal(rawFilas).filter((c) => esPublicidad(c.canal));
  const totalLeads = porCanal.reduce((s, c) => s + c.n_leads, 0);
  const totalAct   = porCanal.reduce((s, c) => s + c.activos_mes, 0);
  const totalJot   = porCanal.reduce((s, c) => s + c.ingreso_jot, 0);
  const totalInv   = porCanal.reduce((s, c) => s + c.inversion_usd, 0);
  const totalNeg   = porCanal.reduce((s, c) => s + c.negociables, 0);
  const efect      = totalLeads > 0 ? (totalAct / totalLeads) * 100 : 0;

  const filasConCalc = filasAgr.map((r) => ({
    ...r,
    _cpl:          r.n_leads > 0 && r.inversion_usd > 0 ? r.inversion_usd / r.n_leads : null,
    _costo_activa: r.activos_mes > 0 && r.inversion_usd > 0 ? r.inversion_usd / r.activos_mes : null,
    _pct_atc:      r.n_leads > 0 ? (r.atc_soporte / r.n_leads) * 100 : 0,
    _efect:        r.n_leads > 0 ? (r.activos_mes / r.n_leads) * 100 : 0,
  }));

  const cols = [
    { key: "fecha",               label: "FECHA",   fmt: formatFecha },
    { key: "dia_semana",          label: "DÍA" },
    { key: "canal",               label: "CANAL",   fmt: (v) => <CanalBadge canal={v} /> },
    { key: "n_leads",             label: "LEADS",   color: C.primary },
    { key: "negociables",         label: "NEGOC.",  color: C.success },
    { key: "atc_soporte",         label: "ATC",     color: C.danger },
    { key: "fuera_cobertura",     label: "F.COB." },
    { key: "innegociable",        label: "INNEG.",  color: C.warning },
    { key: "venta_subida_bitrix", label: "V.SUB.",  color: C.primary },
    { key: "ingreso_jot",         label: "JOT",     color: C.success },
    { key: "activos_mes",         label: "ACTIVOS", color: C.success },
    { key: "inversion_usd",       label: "INV.$",   fmt: fmtUsd,                          color: C.violet },
    { key: "_cpl",                label: "CPL",     fmt: (v) => v ? `$${fmt2(v)}` : "—", color: C.violet },
    { key: "_costo_activa",       label: "C.ACT.",  fmt: (v) => v ? `$${fmt2(v)}` : "—" },
    { key: "_pct_atc",            label: "% ATC",   fmt: fmtPct },
    { key: "_efect",              label: "% EF.",   fmt: fmtPct },
  ];

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Leads Totales"  value={totalLeads || "—"} icon="👥" color={C.primary} />
        <KpiCard label="Negociables"    value={totalNeg   || "—"} icon="🤝" color={C.success} />
        <KpiCard label="Ing. JOT"       value={totalJot   || "—"} icon="📋" color={C.cyan} />
        <KpiCard label="Activos Mes"    value={totalAct   || "—"} icon="✅" color={C.success} />
        <KpiCard label="Inversión"      value={totalInv > 0 ? fmtUsd(totalInv) : "—"} icon="💰" color={C.violet} />
        <KpiCard label="% Efectividad"  value={efect > 0 ? fmtPct(efect) : "—"}       icon="📈" color={C.warning} />
      </div>

      {/* Cards por canal */}
      {porCanal.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {porCanal.map((c) => {
            const cfg = getCfg(c.canal);
            const cpl = c.n_leads > 0 && c.inversion_usd > 0 ? c.inversion_usd / c.n_leads : null;
            const ef  = c.n_leads > 0 ? (c.activos_mes / c.n_leads) * 100 : 0;
            return (
              <div key={c.canal} className="rounded-2xl border p-4 hover:shadow-md transition-all"
                style={{ borderColor: `${cfg.color}30`, background: cfg.bg }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xl">{cfg.icon}</span>
                  <span className="text-[8px] font-black px-2 py-0.5 rounded-full" style={{ background: cfg.color, color: "#fff" }}>{cfg.label}</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    ["Leads",     c.n_leads,              cfg.color],
                    ["Activos",   c.activos_mes,           C.success],
                    ["Ing. JOT",  c.ingreso_jot,           C.cyan],
                    ["Inversión", fmtUsd(c.inversion_usd), C.violet],
                    ...(cpl ? [["CPL", `$${cpl.toFixed(2)}`, C.violet]] : []),
                  ].map(([lbl, val, col]) => (
                    <div key={lbl} className="flex justify-between items-center">
                      <span className="text-[9px] font-bold" style={{ color: C.muted }}>{lbl}</span>
                      <span className="text-[10px] font-black" style={{ color: col }}>{val}</span>
                    </div>
                  ))}
                  <div className="mt-2 pt-2 border-t" style={{ borderColor: `${cfg.color}20` }}>
                    <div className="flex justify-between mb-1">
                      <span className="text-[8px] font-bold" style={{ color: C.muted }}>Efectividad</span>
                      <span className="text-[9px] font-black" style={{ color: pctColor(ef) }}>{ef.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-white rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(ef, 100)}%`, background: cfg.color }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabla métricas diarias */}
      <Card>
        <CardHeader title="Métricas por Canal y Día" subtitle="Inversión sin duplicar — agrupada por canal×día" accent={C.primary}
          badge={<span className="text-[9px] font-black px-3 py-1 rounded-full" style={{ background: `${C.primary}12`, color: C.primary }}>{filasConCalc.length} registros</span>}
          action={<VistaToggle value={vistaTabla} onChange={setVistaTabla} color={C.primary} options={[{ value: "canal", label: "Por Canal" }, { value: "dia", label: "Por Día" }]} />}
        />
        <div className="overflow-auto max-h-96">
          {filasConCalc.length === 0
            ? <div className="text-center py-12 text-[11px]" style={{ color: C.muted }}>Sin datos para el período</div>
            : (
              <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
                <thead className="sticky top-0 z-10" style={{ background: C.light, borderBottom: `2px solid ${C.border}` }}>
                  <tr>{cols.map((c) => <th key={c.key} className="px-3 py-2 border-r text-center font-black uppercase" style={{ color: C.muted, borderColor: C.border }}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {(vistaTabla === "canal"
                    ? [...filasConCalc].sort((a, b) => a.canal.localeCompare(b.canal) || String(a.fecha).localeCompare(String(b.fecha)))
                    : filasConCalc
                  ).map((row, i) => (
                    <tr key={i} className="border-b hover:bg-slate-50 transition-colors" style={{ borderColor: C.border }}>
                      {cols.map((c) => {
                        const val = row[c.key];
                        return (
                          <td
                            key={c.key}
                            className="px-3 py-1.5 border-r text-center"
                            style={{
                              color:       c.key === "fecha" ? C.primary : c.color || C.slate,
                              fontWeight:  c.key === "fecha" ? 800 : 400,
                              borderColor: C.border,
                            }}
                          >
                            {c.fmt ? c.fmt(val ?? 0) : (val ?? "—")}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </Card>

      {/* Ciudad + ATC */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title="Por Ciudad"
            accent={C.cyan}
            badge={
              <VistaToggle
                value={vistaCity}
                onChange={setVistaCity}
                color={C.cyan}
                options={[{ value: "resumen", label: "Resumen" }, { value: "detalle", label: "Detalle" }]}
              />
            }
          />
          <div className="overflow-auto max-h-72">
            <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
              <thead className="sticky top-0 border-b" style={{ background: C.light, borderColor: C.border }}>
                <tr>
                  {(vistaCity === "resumen"
                    ? ["CIUDAD", "PROV.", "LEADS", "ACTIVOS", "JOT", "% ACT."]
                    : ["FECHA",  "CIUDAD", "LEADS", "ACTIVOS", "% ACT."]
                  ).map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 border-r text-center font-black uppercase"
                      style={{ color: C.muted, borderColor: C.border }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(vistaCity === "resumen" ? ciudad?.totales || [] : ciudad?.data || []).map((row, i) => (
                  <tr key={i} className="border-b hover:bg-slate-50" style={{ borderColor: C.border }}>
                    {vistaCity === "resumen" ? <>
                      <td className="px-3 py-1.5 border-r font-black" style={{ color: C.cyan, borderColor: C.border }}>{row.ciudad}</td>
                      <td className="px-3 py-1.5 border-r text-[8px]" style={{ color: C.muted, borderColor: C.border }}>{row.provincia}</td>
                      <td className="px-3 py-1.5 border-r text-center" style={{ borderColor: C.border }}>{row.total_leads}</td>
                      <td className="px-3 py-1.5 border-r text-center font-black" style={{ color: C.success, borderColor: C.border }}>{row.activos}</td>
                      <td className="px-3 py-1.5 border-r text-center" style={{ borderColor: C.border }}>{row.ingresos_jot}</td>
                      <td className="px-3 py-1.5 text-center font-black" style={{ color: pctColor(row.pct_activos) }}>{row.pct_activos}%</td>
                    </> : <>
                      <td className="px-3 py-1.5 border-r font-black" style={{ color: C.primary, borderColor: C.border }}>{formatFecha(row.fecha)}</td>
                      <td className="px-3 py-1.5 border-r font-black" style={{ color: C.cyan, borderColor: C.border }}>{row.ciudad}</td>
                      <td className="px-3 py-1.5 border-r text-center" style={{ borderColor: C.border }}>{row.total_leads}</td>
                      <td className="px-3 py-1.5 border-r text-center font-black" style={{ color: C.success, borderColor: C.border }}>{row.activos}</td>
                      <td className="px-3 py-1.5 text-center font-black" style={{ color: pctColor(row.pct_activos) }}>{row.pct_activos}%</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Motivos ATC"
            accent={C.danger}
            badge={
              <VistaToggle
                value={vistaAtc}
                onChange={setVistaAtc}
                color={C.danger}
                options={[{ value: "resumen", label: "Resumen" }, { value: "detalle", label: "Detalle" }]}
              />
            }
          />
          <div className="overflow-auto max-h-72">
            {vistaAtc === "resumen" ? (
              <div className="p-4 space-y-2.5">
                {(atc?.totales || []).map((row, i) => {
                  const total = (atc?.totales || []).reduce((a, r) => a + n(r.cantidad), 0);
                  const pct   = total > 0 ? ((n(row.cantidad) / total) * 100).toFixed(1) : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="text-[9px] font-bold w-44 truncate" style={{ color: C.slate }}>{row.motivo_atc}</div>
                      <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ background: `${C.danger}15` }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: C.danger }} />
                      </div>
                      <div className="text-[9px] font-black w-8 text-right" style={{ color: C.danger }}>{row.cantidad}</div>
                      <div className="text-[9px] w-10 text-right" style={{ color: C.muted }}>{pct}%</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
                <thead className="sticky top-0 border-b" style={{ background: C.light, borderColor: C.border }}>
                  <tr>
                    {["FECHA", "MOTIVO", "CANT."].map((h) => (
                      <th key={h} className="px-3 py-2 border-r text-center font-black uppercase" style={{ color: C.muted, borderColor: C.border }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(atc?.data || []).map((row, i) => (
                    <tr key={i} className="border-b hover:bg-slate-50" style={{ borderColor: C.border }}>
                      <td className="px-3 py-1.5 border-r font-black" style={{ color: C.primary, borderColor: C.border }}>{formatFecha(row.fecha)}</td>
                      <td className="px-3 py-1.5 border-r font-bold" style={{ color: C.danger, borderColor: C.border }}>{row.motivo_atc}</td>
                      <td className="px-3 py-1.5 text-center font-black" style={{ color: C.slate }}>{row.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>

      {/* Hora */}
      <Card>
        <CardHeader
          title="Leads por Hora"
          accent={C.violet}
          badge={
            <VistaToggle
              value={vistaHora}
              onChange={setVistaHora}
              color={C.violet}
              options={[{ value: "resumen", label: "Resumen" }, { value: "detalle", label: "Detalle" }]}
            />
          }
        />
        <div className="overflow-auto max-h-64">
          <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
            <thead className="sticky top-0 border-b" style={{ background: C.light, borderColor: C.border }}>
              <tr>
                {(vistaHora === "resumen"
                  ? ["HORA", "LEADS", "ATC", "% ATC"]
                  : ["FECHA", "HORA", "LEADS", "ATC", "% ATC"]
                ).map((h) => (
                  <th key={h} className="px-3 py-2 border-r text-center font-black uppercase" style={{ color: C.muted, borderColor: C.border }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(vistaHora === "resumen" ? hora?.totales || [] : hora?.data || []).map((row, i) => (
                <tr key={i} className="border-b hover:bg-slate-50" style={{ borderColor: C.border }}>
                  {vistaHora === "detalle" && <td className="px-3 py-1.5 border-r font-black" style={{ color: C.primary, borderColor: C.border }}>{formatFecha(row.fecha)}</td>}
                  <td className="px-3 py-1.5 border-r text-center font-black" style={{ color: C.violet, borderColor: C.border }}>{String(row.hora).padStart(2, "0")}:00</td>
                  <td className="px-3 py-1.5 border-r text-center" style={{ borderColor: C.border }}>{row.n_leads}</td>
                  <td className="px-3 py-1.5 border-r text-center" style={{ color: C.danger, borderColor: C.border }}>{row.atc}</td>
                  <td className="px-3 py-1.5 text-center font-black" style={{ color: n(row.pct_atc_hora) > 40 ? C.danger : n(row.pct_atc_hora) > 20 ? C.warning : C.success }}>{row.pct_atc_hora}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — GRÁFICOS GERENCIA
// ─────────────────────────────────────────────────────────────────────────────
function TabGraficos({ data, loading }) {
  const { principal, hora, atc } = data;
  const [openFunnel, setOpenFunnel] = useState(false);

  if (loading) return <Spinner />;
  if (!principal) return <div className="text-center py-32 text-sm font-bold" style={{ color: C.muted }}>Sin datos — aplica un filtro de fechas.</div>;

  const rawFilas = principal?.data || [];
  const porFecha = agregarPorFecha(rawFilas);
  const porCanal = agregarPorCanal(rawFilas).filter((c) => esPublicidad(c.canal));

  const tendMap = {};
  rawFilas.forEach((row) => {
    const canal = row.canal_inversion || getCanal(row.canal_publicidad);
    if (!esPublicidad(canal)) return;
    const fecha = formatFecha(row.fecha);
    if (!tendMap[fecha]) tendMap[fecha] = { fecha };
    tendMap[fecha][canal] = (tendMap[fecha][canal] || 0) + n(row.ingreso_jot);
  });
  const tendCanalData    = Object.values(tendMap).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const canalesPresentes = [...new Set(rawFilas.map((r) => r.canal_inversion || getCanal(r.canal_publicidad)).filter(esPublicidad))];

  const diasData = porFecha.map((d) => ({
    fecha:      formatFecha(d.fecha),
    "Leads":    d.n_leads,
    "Negoc.":   d.negociables,
    "Ing.JOT":  d.ingreso_jot,
    "Activos":  d.activos_mes,
    "V. Subida": d.venta_subida_bitrix,
    "Inv.$":    Math.round(d.inversion_usd),
    "CPL":      d.n_leads > 0 && d.inversion_usd > 0 ? +(d.inversion_usd / d.n_leads).toFixed(2) : 0,
    "% Efect":  d.n_leads > 0 ? +((d.activos_mes / d.n_leads) * 100).toFixed(1) : 0,
    "% ATC":    d.n_leads > 0 ? +((d.atc_soporte / d.n_leads) * 100).toFixed(1) : 0,
  }));

  const gestionBarData = porCanal.map((c) => ({
    name: getCfg(c.canal).label, fill: getCfg(c.canal).color,
    "Leads": c.n_leads, "Negociables": c.negociables,
    "V. Subida": c.venta_subida_bitrix, "Activos": c.activos_mes,
  }));

  const donaLeads = porCanal.map((c) => ({ name: getCfg(c.canal).label, value: c.n_leads, fill: getCfg(c.canal).color }));
  const donaInv   = porCanal.filter((c) => c.inversion_usd > 0).map((c) => ({ name: getCfg(c.canal).label, value: Math.round(c.inversion_usd), fill: getCfg(c.canal).color }));

  const horaData = (hora?.totales || []).map((h) => ({ hora: `${String(h.hora).padStart(2, "0")}h`, "Leads": n(h.n_leads), "ATC": n(h.atc) }));
  const maxL = Math.max(1, ...horaData.map((h) => h["Leads"]));
  const maxA = Math.max(1, ...horaData.map((h) => h["ATC"]));

  const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const heatRaw = {};
  (hora?.data || []).forEach((row) => {
    const h  = `${String(row.hora).padStart(2, "0")}h`;
    const fd = new Date(`${String(row.fecha).split("T")[0]}T12:00:00`);
    const dia = DIAS_SEMANA[fd.getDay() === 0 ? 6 : fd.getDay() - 1];
    if (!heatRaw[h]) heatRaw[h] = {};
    heatRaw[h][dia] = (heatRaw[h][dia] || 0) + n(row.n_leads);
  });
  const heatHoras = Object.keys(heatRaw).sort();
  const heatMax   = Math.max(1, ...Object.values(heatRaw).flatMap((v) => Object.values(v)));
  const heatColor = (v) => { if (!v) return "#f1f5f9"; const t = v / heatMax; return t > 0.75 ? C.primary : t > 0.5 ? C.sky : t > 0.25 ? "#93c5fd" : "#dbeafe"; };

  const embudo = [
    { e: "Leads",       v: porFecha.reduce((s, d) => s + d.n_leads, 0) },
    { e: "Negociables", v: porFecha.reduce((s, d) => s + d.negociables, 0) },
    { e: "V. Subida",   v: porFecha.reduce((s, d) => s + d.venta_subida_bitrix, 0) },
    { e: "Ing. JOT",    v: porFecha.reduce((s, d) => s + d.ingreso_jot, 0) },
    { e: "Activos",     v: porFecha.reduce((s, d) => s + d.activos_mes, 0) },
  ];
  const embudoColors = [C.primary, C.sky, C.cyan, C.success, "#10b981"];

  const atcData  = (atc?.totales || []).slice(0, 8).map((a) => ({ name: (a.motivo_atc || "").slice(0, 18), Cantidad: n(a.cantidad) }));
  const totP     = principal?.totales || {};
  const cicloData = [
    { c: "0d", v: n(totP.ciclo_0_dias) }, { c: "1d", v: n(totP.ciclo_1_dia) },
    { c: "2d", v: n(totP.ciclo_2_dias) }, { c: "3d", v: n(totP.ciclo_3_dias) },
    { c: "4d", v: n(totP.ciclo_4_dias) }, { c: "+5d", v: n(totP.ciclo_mas5_dias) },
  ];
  const cicloColors = [C.success, C.cyan, C.primary, C.warning, C.danger, C.violet];

  return (
    <div className="space-y-6">
      {/* Gráfico principal combinado */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-3" style={{ borderColor: C.border }}>
          <div className="flex items-center gap-3">
            <div className="w-1 h-7 rounded-full" style={{ background: C.primary }} />
            <div>
              <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: C.primary }}>
                Leads & Venta Subida (total) · Ingresos JOT por Campaña
              </div>
              <div className="text-[9px] font-medium mt-0.5" style={{ color: C.muted }}>
                Barras = totales consolidados · Líneas = JOT desglosado por canal de publicidad
              </div>
            </div>
          </div>
          <button onClick={() => setOpenFunnel(true)}
            className="text-[8px] font-black uppercase px-3 py-1 rounded-full border hover:shadow-sm transition-all"
            style={{ borderColor: C.border, color: C.muted }}>⤢ Ampliar</button>
        </div>
        <div className="p-5">
          <GraficoFunnelCombinado diasData={diasData} tendCanalData={tendCanalData} canalesPresentes={canalesPresentes} height={320} />
        </div>
        <div className="px-5 pb-4 flex flex-wrap gap-1.5">
          {canalesPresentes.map((canal) => (
            <span key={canal} className="text-[7px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1"
              style={{ background: getCfg(canal).bg, color: getCfg(canal).color, border: `1px solid ${getCfg(canal).color}30` }}>
              {getCfg(canal).icon} JOT {getCfg(canal).label}
            </span>
          ))}
          <span className="text-[7px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1"
            style={{ background: `${C.primary}15`, color: C.primary, border: `1px solid ${C.primary}30` }}>
            ▬ Leads total
          </span>
          <span className="text-[7px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1"
            style={{ background: `${C.success}15`, color: C.success, border: `1px solid ${C.success}30` }}>
            ▬ Venta Subida total
          </span>
        </div>
      </div>

      {openFunnel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)" }} onClick={() => setOpenFunnel(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.border }}>
              <span className="text-sm font-black uppercase tracking-wide" style={{ color: C.primary }}>Leads & Venta Subida · JOT por Campaña</span>
              <button onClick={() => setOpenFunnel(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 font-black text-sm" style={{ color: C.muted }}>✕</button>
            </div>
            <div className="p-6">
              <GraficoFunnelCombinado diasData={diasData} tendCanalData={tendCanalData} canalesPresentes={canalesPresentes} height={520} />
            </div>
          </div>
        </div>
      )}

      <ChartCard title="Gestionables & Venta Subida por Canal" subtitle="Leads · Negociables · Venta Subida · Activos por campaña" accent={C.success} height={250}>
        <BarChart data={gestionBarData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.muted }} />
          <YAxis tick={{ fontSize: 9, fill: C.muted }} width={35} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="Leads"       radius={[4, 4, 0, 0]} opacity={0.35}>{gestionBarData.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar>
          <Bar dataKey="Negociables" radius={[4, 4, 0, 0]} opacity={0.65}>{gestionBarData.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar>
          <Bar dataKey="V. Subida"   radius={[4, 4, 0, 0]}>{gestionBarData.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar>
        </BarChart>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Leads por Canal" accent={C.primary} height={220}>
          <PieChart>
            <Pie data={donaLeads} cx="40%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>{donaLeads.map((e, i) => <Cell key={i} fill={e.fill} />)}</Pie>
            <Legend wrapperStyle={{ fontSize: 9 }} /><Tooltip />
          </PieChart>
        </ChartCard>
        <ChartCard title="Inversión por Canal" accent={C.violet} height={220}>
          <PieChart>
            <Pie data={donaInv} cx="40%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>{donaInv.map((e, i) => <Cell key={i} fill={e.fill} />)}</Pie>
            <Legend wrapperStyle={{ fontSize: 9 }} formatter={(v, e) => `${v}: ${fmtUsd(e.payload.value)}`} />
            <Tooltip formatter={(v) => fmtUsd(v)} />
          </PieChart>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="% Efectividad vs % ATC" subtitle="Indicadores de calidad diarios" accent={C.warning} height={220}>
          <LineChart data={diasData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: C.muted }} />
            <YAxis tick={{ fontSize: 9, fill: C.muted }} width={35} unit="%" domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} /><Legend wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="% Efect" stroke={C.success} strokeWidth={2.5} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="% ATC"   stroke={C.danger}  strokeWidth={2.5} dot={{ r: 3 }} strokeDasharray="5 3" />
          </LineChart>
        </ChartCard>
        <ChartCard title="Inversión & CPL Diario" subtitle="Costo de adquisición por día" accent={C.violet} height={220}>
          <BarChart data={diasData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: C.muted }} />
            <YAxis yAxisId="l" tick={{ fontSize: 9, fill: C.muted }} width={50} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9, fill: C.muted }} width={35} />
            <Tooltip content={<CustomTooltip />} /><Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar  yAxisId="l" dataKey="Inv.$" fill={C.violet} radius={[4, 4, 0, 0]} opacity={0.8} />
            <Line yAxisId="r" type="monotone" dataKey="CPL" stroke={C.warning} strokeWidth={2.5} dot={{ r: 3 }} />
          </BarChart>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Leads por Hora del Día" subtitle="Acumulado del período" accent={C.cyan} height={220}>
          <BarChart data={horaData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="hora" tick={{ fontSize: 8, fill: C.muted }} />
            <YAxis tick={{ fontSize: 9, fill: C.muted }} width={30} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="Leads" radius={[4, 4, 0, 0]}>{horaData.map((d, i) => <Cell key={i} fill={d["Leads"] === maxL ? C.primary : "#93c5fd"} />)}</Bar>
          </BarChart>
        </ChartCard>
        <ChartCard title="Soporte ATC por Hora" subtitle="Horarios de mayor demanda" accent={C.danger} height={220}>
          <BarChart data={horaData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="hora" tick={{ fontSize: 8, fill: C.muted }} />
            <YAxis tick={{ fontSize: 9, fill: C.muted }} width={30} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="ATC" radius={[4, 4, 0, 0]}>{horaData.map((d, i) => <Cell key={i} fill={d["ATC"] === maxA ? C.danger : "#fca5a5"} />)}</Bar>
          </BarChart>
        </ChartCard>
      </div>

      {heatHoras.length > 0 && (
        <Card>
          <CardHeader title="Mapa de Calor — Leads × Hora × Día de Semana" subtitle="Identifica los horarios de mayor tráfico" accent={C.primary} />
          <div className="p-5 overflow-auto">
            <div className="inline-flex gap-1.5 text-[8px]">
              <div className="flex flex-col gap-1.5">
                <div className="h-7" />
                {heatHoras.map((h) => <div key={h} className="h-8 w-9 flex items-center justify-end pr-1 font-black" style={{ color: C.muted }}>{h}</div>)}
              </div>
              {DIAS_SEMANA.map((dia) => (
                <div key={dia} className="flex flex-col gap-1.5">
                  <div className="h-7 w-12 flex items-center justify-center font-black uppercase text-[8px]" style={{ color: C.muted }}>{dia}</div>
                  {heatHoras.map((h) => {
                    const v = heatRaw[h]?.[dia] || 0;
                    return (
                      <div key={h} title={`${h} ${dia}: ${v} leads`}
                        className="h-8 w-12 rounded-lg flex items-center justify-center font-black cursor-default transition-all hover:opacity-80"
                        style={{ background: heatColor(v), color: v / heatMax > 0.45 ? "#fff" : C.slate }}>
                        {v > 0 ? v : ""}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-4 text-[9px]" style={{ color: C.muted }}>
              <span className="font-medium">Bajo</span>
              {["#dbeafe","#93c5fd",C.sky,C.primary].map((col) => <div key={col} className="w-8 h-3 rounded" style={{ background: col }} />)}
              <span className="font-medium">Alto</span>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard title="Embudo de Conversión" subtitle="Del lead al activo" accent={C.success} height={220}>
          <BarChart data={embudo} layout="vertical" margin={{ top: 5, right: 30, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 9, fill: C.muted }} />
            <YAxis type="category" dataKey="e" tick={{ fontSize: 9, fill: C.muted }} width={80} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="v" radius={[0, 4, 4, 0]}>{embudo.map((_, i) => <Cell key={i} fill={embudoColors[i]} opacity={0.9} />)}</Bar>
          </BarChart>
        </ChartCard>
        <ChartCard title="Ciclo de Venta" subtitle="Días entre lead e ingreso JOT" accent={C.warning} height={220}>
          <BarChart data={cicloData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="c" tick={{ fontSize: 10, fill: C.muted }} />
            <YAxis tick={{ fontSize: 9, fill: C.muted }} width={30} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="v" radius={[4, 4, 0, 0]}>{cicloData.map((_, i) => <Cell key={i} fill={cicloColors[i]} opacity={0.9} />)}</Bar>
          </BarChart>
        </ChartCard>
        <ChartCard title="Ranking Motivos ATC" subtitle="Principales causas de soporte" accent={C.danger} height={220}>
          <BarChart data={atcData} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 9, fill: C.muted }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 8, fill: C.muted }} width={100} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="Cantidad" fill={C.danger} radius={[0, 4, 4, 0]} opacity={0.85} />
          </BarChart>
        </ChartCard>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — METAS VS LOGROS
// ─────────────────────────────────────────────────────────────────────────────
function MetaInput({ label, value, onChange, prefix = "", suffix = "", placeholder = "0" }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[8px] font-black uppercase tracking-widest truncate" style={{ color: C.muted }}>{label}</label>
      <div className="flex items-center border rounded-xl overflow-hidden bg-white focus-within:ring-1" style={{ borderColor: C.border }}>
        {prefix && <span className="px-2 text-[10px] font-black border-r flex-shrink-0" style={{ color: C.muted, borderColor: C.border, background: C.light }}>{prefix}</span>}
        <input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full px-2 py-1.5 text-[11px] font-bold outline-none bg-white min-w-0" style={{ color: C.slate }} />
        {suffix && <span className="px-2 text-[10px] font-black border-l flex-shrink-0" style={{ color: C.muted, borderColor: C.border, background: C.light }}>{suffix}</span>}
      </div>
    </div>
  );
}

function colorDiff(diff, invertir) {
  if (diff === null || isNaN(n(diff))) return C.muted;
  const x = n(diff); if (x === 0) return C.muted;
  return (invertir ? x < 0 : x > 0) ? C.success : C.danger;
}

function buildFilas(canal, metas) {
  const leads = n(canal.total_leads), sac = n(canal.leads_sac), calidad = n(canal.leads_calidad);
  const ventas = n(canal.venta_subida), jot = n(canal.ingreso_jot), inv = n(canal.inversion_usd);
  const pS = leads > 0 ? (sac    / leads) * 100 : 0, pC = leads > 0 ? (calidad / leads) * 100 : 0;
  const pV = leads > 0 ? (ventas / leads) * 100 : 0, pJ = leads > 0 ? (jot    / leads) * 100 : 0;
  const cplR = leads > 0 && inv > 0 ? inv / leads : null, cplGR = calidad > 0 && inv > 0 ? inv / calidad : null;
  const cpaR = ventas > 0 && inv > 0 ? inv / ventas : null, cpaJR = jot > 0 && inv > 0 ? inv / jot : null;
  const mL = n(metas.leads_totales), mS = n(metas.pct_sac),    mC = n(metas.pct_calidad);
  const mV = n(metas.pct_ventas),    mJ = n(metas.pct_ventas_jot), mP = n(metas.presupuesto);
  const mCtr = n(metas.ctr), mCpl = n(metas.cpl), mCplG = n(metas.cpl_gest), mCpa = n(metas.cpa), mCpaJ = n(metas.cpa_jot);
  const d = (l, m) => m > 0 && l !== null ? l - m : null;
  const p = (l, m) => m > 0 && l !== null ? (l / m) * 100 : null;
  const fD = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  return [
    { label:"LEADS TOTALES", obj:mL>0?mL:null, logro:leads, diff:d(leads,mL), pct:p(leads,mL), sub:null, fmtO:(v)=>String(Math.round(v)), fmtL:(v)=>String(Math.round(v)), fmtD:(v)=>`${v>=0?"+":""}${Math.round(v)}`, fmtP:(v)=>`${v.toFixed(1)}%`, inv:false },
    { label:"SAC / ATC", obj:mS>0?mS:null, logro:sac, diff:d(pS,mS), pct:mS>0?pS-mS:null, sub:`${pS.toFixed(1)}%`, fmtO:(v)=>`${n(v).toFixed(1)}%`, fmtL:(v)=>String(Math.round(v)), fmtD:fD, fmtP:(v)=>`${v.toFixed(1)}%`, inv:true },
    { label:"LEADS CALIDAD", obj:mC>0?mC:null, logro:calidad, diff:d(pC,mC), pct:mC>0?pC-mC:null, sub:`${pC.toFixed(1)}%`, fmtO:(v)=>`${n(v).toFixed(1)}%`, fmtL:(v)=>String(Math.round(v)), fmtD:fD, fmtP:(v)=>`${v.toFixed(1)}%`, inv:false },
    { label:"VENTAS BITRIX", obj:mV>0?mV:null, logro:ventas, diff:d(pV,mV), pct:mV>0?pV-mV:null, sub:`${pV.toFixed(1)}%`, fmtO:(v)=>`${n(v).toFixed(1)}%`, fmtL:(v)=>String(Math.round(v)), fmtD:fD, fmtP:(v)=>`${v.toFixed(1)}%`, inv:false },
    { label:"VENTAS JOT", obj:mJ>0?mJ:null, logro:jot, diff:d(pJ,mJ), pct:mJ>0?pJ-mJ:null, sub:`${pJ.toFixed(1)}%`, fmtO:(v)=>`${n(v).toFixed(1)}%`, fmtL:(v)=>String(Math.round(v)), fmtD:fD, fmtP:(v)=>`${v.toFixed(1)}%`, inv:false },
    { label:"PRESUPUESTO", obj:mP>0?mP:null, logro:inv>0?inv:null, diff:mP>0&&inv>0?inv-mP:null, pct:mP>0&&inv>0?(inv/mP)*100:null, sub:null, fmtO:fmtUsd2, fmtL:fmtUsd2, fmtD:(v)=>`${v>=0?"+":"-"}${fmtUsd2(Math.abs(v))}`, fmtP:(v)=>`${v.toFixed(1)}%`, inv:true, bg:"bg-violet-50" },
    { label:"PRESUPUESTO +10%", obj:mP>0?mP*1.1:null, logro:inv>0?inv:null, diff:null, pct:null, sub:null, fmtO:fmtUsd2, fmtL:fmtUsd2, fmtD:()=>"—", fmtP:()=>"—", inv:false, bg:"bg-violet-50" },
    { label:"CTR", obj:mCtr>0?mCtr:null, logro:null, diff:null, pct:null, sub:null, fmtO:(v)=>`${n(v).toFixed(1)}%`, fmtL:()=>"—", fmtD:()=>"—", fmtP:()=>"—", inv:false, manual:true },
    { label:"CPL", obj:mCpl>0?mCpl:null, logro:cplR, diff:mCpl>0&&cplR!==null?cplR-mCpl:null, pct:null, sub:null, fmtO:fmtUsd2, fmtL:(v)=>v!==null?fmtUsd2(v):"—", fmtD:(v)=>`${v>=0?"+":"-"}${fmtUsd2(Math.abs(v))}`, fmtP:()=>"—", inv:true },
    { label:"CPL GESTIONABLE", obj:mCplG>0?mCplG:null, logro:cplGR, diff:mCplG>0&&cplGR!==null?cplGR-mCplG:null, pct:null, sub:null, fmtO:fmtUsd2, fmtL:(v)=>v!==null?fmtUsd2(v):"—", fmtD:(v)=>`${v>=0?"+":"-"}${fmtUsd2(Math.abs(v))}`, fmtP:()=>"—", inv:true },
    { label:"CPA BITRIX", obj:mCpa>0?mCpa:null, logro:cpaR, diff:mCpa>0&&cpaR!==null?cpaR-mCpa:null, pct:null, sub:null, fmtO:fmtUsd2, fmtL:(v)=>v!==null?fmtUsd2(v):"—", fmtD:(v)=>`${v>=0?"+":"-"}${fmtUsd2(Math.abs(v))}`, fmtP:()=>"—", inv:true },
    { label:"CPA JOT", obj:mCpaJ>0?mCpaJ:null, logro:cpaJR, diff:mCpaJ>0&&cpaJR!==null?cpaJR-mCpaJ:null, pct:null, sub:null, fmtO:fmtUsd2, fmtL:(v)=>v!==null?fmtUsd2(v):"—", fmtD:(v)=>`${v>=0?"+":"-"}${fmtUsd2(Math.abs(v))}`, fmtP:()=>"—", inv:true },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR DE CANALES PARA METAS — muestra canales con sus orígenes debajo
// Permite seleccionar por CANAL (agrupa orígenes) o por ORIGEN individual
// ─────────────────────────────────────────────────────────────────────────────
function MetasCanalSelector({ canalesDisp, canalesSel, setCanalesSel, loadingOrig }) {
  const [expandido, setExpandido] = useState(null); // canal con orígenes visibles

  // canalesDisp viene del backend: [{ canal, lineas: [origen1, origen2...] }]
  // canalesSel es array de canales (strings como "ARTS GOOGLE")

  const toggleCanal = (canal) => {
    setCanalesSel((prev) =>
      prev.includes(canal) ? prev.filter((c) => c !== canal) : [...prev, canal]
    );
  };

  const selAll = () => setCanalesSel([]);

  if (loadingOrig) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: `${C.sky}30`, borderTopColor: C.sky }} />
        <span className="text-[9px]" style={{ color: C.muted }}>Cargando canales...</span>
      </div>
    );
  }

  if (!canalesDisp.length) {
    return <p className="text-[9px] italic py-1" style={{ color: C.muted }}>Aplica un período para ver los canales disponibles.</p>;
  }

  return (
    <div className="space-y-2">
      {/* Fila de chips de canal */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Chip Todos */}
        <button
          onClick={selAll}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[8px] font-black uppercase border transition-all"
          style={canalesSel.length === 0
            ? { background: C.primary, color: "#fff", borderColor: C.primary }
            : { background: "#fff", color: C.muted, borderColor: C.border }
          }
        >
          Todos
        </button>

        {canalesDisp.map(({ canal, lineas }) => {
          const cfg    = getCfg(canal);
          const sel    = canalesSel.includes(canal);
          const isExp  = expandido === canal;
          return (
            <div key={canal} className="inline-flex items-center gap-0">
              {/* Chip canal principal */}
              <button
                onClick={() => toggleCanal(canal)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[8px] font-black uppercase border transition-all hover:shadow-sm"
                style={{
                  borderRadius: lineas?.length ? "9999px 0 0 9999px" : "9999px",
                  background: sel ? cfg.color : cfg.bg,
                  color:      sel ? "#fff"    : cfg.color,
                  borderColor: sel ? cfg.color : `${cfg.color}40`,
                }}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
              </button>
              {/* Botón expandir orígenes */}
              {lineas?.length > 0 && (
                <button
                  onClick={() => setExpandido(isExp ? null : canal)}
                  className="inline-flex items-center justify-center w-5 h-[26px] text-[9px] font-black border-l-0 border transition-all"
                  style={{
                    borderRadius: "0 9999px 9999px 0",
                    background: isExp ? cfg.color : sel ? `${cfg.color}cc` : cfg.bg,
                    color:      isExp || sel ? "#fff" : cfg.color,
                    borderColor: sel || isExp ? cfg.color : `${cfg.color}40`,
                  }}
                  title={`Ver orígenes de ${cfg.label}`}
                >
                  {isExp ? "▴" : "▾"}
                </button>
              )}
            </div>
          );
        })}

        {canalesSel.length > 0 && (
          <span className="text-[8px] font-medium" style={{ color: C.muted }}>
            {canalesSel.length} canal{canalesSel.length !== 1 ? "es" : ""}
            {" · "}
            <button onClick={selAll} className="underline hover:no-underline" style={{ color: C.danger }}>limpiar</button>
          </span>
        )}
      </div>

      {/* Panel de orígenes del canal expandido */}
      {expandido && (() => {
        const canalInfo = canalesDisp.find(c => c.canal === expandido);
        const cfg = getCfg(expandido);
        if (!canalInfo) return null;
        return (
          <div className="rounded-xl border p-3" style={{ borderColor: `${cfg.color}30`, background: cfg.bg }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[8px] font-black uppercase" style={{ color: cfg.color }}>
                {cfg.icon} {cfg.label} — Orígenes / Líneas de publicidad
              </span>
              <button onClick={() => setExpandido(null)} className="text-[9px] font-bold" style={{ color: cfg.color }}>✕</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(canalInfo.lineas || []).map((origen) => (
                <span key={origen}
                  className="text-[8px] px-2 py-0.5 rounded-full font-medium inline-flex items-center"
                  style={{ background: "#ffffff90", color: C.slate, border: `1px solid ${cfg.color}25` }}>
                  {origen}
                </span>
              ))}
            </div>
            <p className="text-[7px] mt-2" style={{ color: C.muted }}>
              Al seleccionar este canal se incluyen todos sus orígenes. La inversión se asigna una sola vez al canal.
            </p>
          </div>
        );
      })()}
    </div>
  );
}

function TabMetas({ filtro }) {
  const { desde, hasta } = filtro;
  const [canalesSel,   setCanalesSel]   = useState([]);   // canales seleccionados (p.e. ["ARTS GOOGLE"])
  const [canalesDisp,  setCanalesDisp]  = useState([]);   // [{ canal, lineas }]
  const [loadingOrig,  setLoadingOrig]  = useState(false);
  const [canalesData,  setCanalesData]  = useState([]);   // resultado del backend
  const [loadingData,  setLoadingData]  = useState(false);
  const [metas, setMetas] = useState({
    leads_totales:"", pct_sac:"", pct_calidad:"", pct_ventas:"", pct_ventas_jot:"",
    presupuesto:"", ctr:"", cpl:"", cpl_gest:"", cpa:"", cpa_jot:""
  });
  const setMeta = (k) => (v) => setMetas((prev) => ({ ...prev, [k]: v }));

  // Cargar canales disponibles cuando cambia el período
  useEffect(() => {
    if (!desde || !hasta) return;
    setCanalesSel([]);
    setCanalesData([]);
    setLoadingOrig(true);
    fetch(`${API}/api/redes/monitoreo-metas?fechaDesde=${desde}&fechaHasta=${hasta}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          // El backend devuelve canales_disponibles: [{ canal, lineas }]
          setCanalesDisp(d.canales_disponibles || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingOrig(false));
  }, [desde, hasta]);

  const handleAplicar = () => {
    setLoadingData(true);
    const params = new URLSearchParams({ fechaDesde: desde, fechaHasta: hasta });
    if (canalesSel.length > 0) params.set("canales", canalesSel.join(","));
    fetch(`${API}/api/redes/monitoreo-metas?${params}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setCanalesData(d.canales || []); })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  };

  return (
    <div className="space-y-6">
      {/* Banner período */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-blue-600">📅</span>
        <span className="text-[10px] font-black uppercase tracking-wide text-blue-700">Período: {desde} → {hasta}</span>
        <span className="text-[9px] text-blue-400">(cambia las fechas desde el filtro principal)</span>
      </div>

      {/* Selector de canal */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: C.border }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 rounded-full" style={{ background: C.primary }} />
            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: C.primary }}>
              Filtrar por Canal de Publicidad
            </span>
          </div>
          <MetasCanalSelector
            canalesDisp={canalesDisp}
            canalesSel={canalesSel}
            setCanalesSel={setCanalesSel}
            loadingOrig={loadingOrig}
          />
        </div>
        <div className="px-5 py-3 flex justify-end">
          <button
            onClick={handleAplicar}
            className="px-5 py-1.5 rounded-lg text-[10px] font-black uppercase text-white transition-all active:scale-95 shadow-sm"
            style={{ background: C.primary }}
          >
            {loadingData ? "Calculando..." : "Calcular Logros"}
          </button>
        </div>
      </div>

      {/* Objetivos */}
      <Card>
        <CardHeader title="Objetivos / Metas" subtitle="Modifica los valores — los logros se recalculan automáticamente" accent={C.violet} />
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            <MetaInput label="Leads Totales"  value={metas.leads_totales}  onChange={setMeta("leads_totales")}  placeholder="133" />
            <MetaInput label="% SAC / ATC"    value={metas.pct_sac}        onChange={setMeta("pct_sac")}        suffix="%" placeholder="45" />
            <MetaInput label="% Calidad"      value={metas.pct_calidad}    onChange={setMeta("pct_calidad")}    suffix="%" placeholder="60" />
            <MetaInput label="% Ventas"       value={metas.pct_ventas}     onChange={setMeta("pct_ventas")}     suffix="%" placeholder="45" />
            <MetaInput label="% Ventas JOT"   value={metas.pct_ventas_jot} onChange={setMeta("pct_ventas_jot")} suffix="%" placeholder="45" />
            <MetaInput label="Presupuesto $"  value={metas.presupuesto}    onChange={setMeta("presupuesto")}    prefix="$" placeholder="585" />
            <MetaInput label="CTR %"          value={metas.ctr}            onChange={setMeta("ctr")}            suffix="%" placeholder="35" />
            <MetaInput label="CPL $"          value={metas.cpl}            onChange={setMeta("cpl")}            prefix="$" placeholder="4.40" />
            <MetaInput label="CPL Gest $"     value={metas.cpl_gest}       onChange={setMeta("cpl_gest")}       prefix="$" placeholder="8.00" />
            <MetaInput label="CPA Bitrix $"   value={metas.cpa}            onChange={setMeta("cpa")}            prefix="$" placeholder="22.00" />
            <MetaInput label="CPA JOT $"      value={metas.cpa_jot}        onChange={setMeta("cpa_jot")}        prefix="$" placeholder="22.00" />
          </div>
        </div>
      </Card>

      {loadingData && <div className="text-center py-12 text-sm font-bold" style={{ color: C.muted }}>Calculando logros...</div>}

      {!loadingData && canalesData.length > 0 && canalesData.map((canal) => {
        const cNombre = canal.canal;
        const cfg     = getCfg(cNombre);
        const filas   = buildFilas(canal, metas);

        // Orígenes/líneas de este canal
        const lineasCanal = (canalesDisp.find(c => c.canal === cNombre)?.lineas) || canal.lineas || [];

        return (
          <Card key={cNombre}>
            <CardHeader
              title={cfg.label || cNombre}
              subtitle={`${desde} → ${hasta}`}
              accent={cfg.color}
              badge={
                <div className="flex items-center gap-2 flex-wrap">
                  <CanalBadge canal={cNombre} size="md" />
                  <span className="text-[9px] font-black px-3 py-1 rounded-full"
                    style={{ background: `${cfg.color}15`, color: cfg.color }}>
                    {canal.total_leads} leads
                  </span>
                </div>
              }
            />

            {/* Orígenes del canal */}
            {lineasCanal.length > 0 && (
              <div className="px-5 py-2.5 border-b flex flex-wrap gap-1.5 items-center" style={{ borderColor: C.border, background: cfg.bg }}>
                <span className="text-[7px] font-black uppercase" style={{ color: cfg.color }}>Orígenes incluidos:</span>
                {lineasCanal.map((origen) => (
                  <span key={origen} className="text-[7px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: "#ffffff90", color: C.slate, border: `1px solid ${cfg.color}25` }}>
                    {origen}
                  </span>
                ))}
              </div>
            )}

            <div className="overflow-auto">
              <table className="w-full border-collapse text-[10px] whitespace-nowrap">
                <thead className="sticky top-0 z-10 border-b-2" style={{ background: C.light, borderColor: C.border }}>
                  <tr>
                    {[["INDICADOR","left",200],["OBJETIVO","center",130],["LOGRO","center",130],["DIFERENCIAL","center",120],["%","center",90]].map(([h,align,w]) => (
                      <th key={h} className="px-5 py-3 font-black uppercase tracking-widest border-r"
                        style={{ textAlign:align, minWidth:w, color:C.muted, borderColor:C.border }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, fi) => {
                    const cD = f.diff !== null ? colorDiff(f.diff, f.inv) : C.muted;
                    const cP = f.pct  !== null ? colorDiff(f.inv ? -f.pct : f.pct, false) : C.muted;
                    return (
                      <tr key={fi} className={`border-b hover:brightness-95 transition-all ${f.bg || "bg-white"}`} style={{ borderColor: C.border }}>
                        <td className={`px-5 py-2.5 font-black border-r ${f.bg||"bg-white"}`} style={{ color:C.slate, borderColor:C.border }}>{f.label}</td>
                        <td className="px-5 py-2.5 text-center font-bold border-r" style={{ color:C.primary, borderColor:C.border }}>
                          {f.obj !== null ? f.fmtO(f.obj) : <span className="text-[9px]" style={{ color:C.border }}>Sin meta</span>}
                        </td>
                        <td className="px-5 py-2.5 text-center font-black border-r" style={{ color:C.slate, borderColor:C.border }}>
                          {f.manual
                            ? <span className="text-[9px] italic" style={{color:C.muted}}>Externo</span>
                            : f.logro!==null&&f.logro!==undefined
                              ? <span>{f.fmtL(f.logro)}{f.sub&&<span className="ml-1 text-[8px]" style={{color:C.muted}}>({f.sub})</span>}</span>
                              : <span className="text-[9px]" style={{color:C.border}}>—</span>}
                        </td>
                        <td className="px-5 py-2.5 text-center font-black border-r" style={{ color:cD, borderColor:C.border }}>{f.diff!==null?f.fmtD(f.diff):"—"}</td>
                        <td className="px-5 py-2.5 text-center font-black" style={{ color:cP }}>{f.pct!==null?f.fmtP(f.pct):"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-2.5 border-t flex items-center gap-4 text-[8px] font-bold flex-wrap" style={{ borderColor: C.border }}>
              <span style={{ color: C.success }}>● Verde = supera la meta</span>
              <span style={{ color: C.danger }}>● Rojo = bajo la meta</span>
              <span style={{ color: C.muted }}>· Costos y SAC: menor es mejor</span>
            </div>
          </Card>
        );
      })}

      {!loadingData && canalesData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="text-5xl">🎯</div>
          <div className="text-sm font-black" style={{ color: C.slate }}>Selecciona canales y calcula los logros</div>
          <div className="text-xs text-center max-w-sm leading-relaxed" style={{ color: C.muted }}>
            Elige uno o más canales de publicidad, completa los objetivos y presiona "Calcular Logros".
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT — Redes
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "general",      label: "Monitoreo General", icon: "📊" },
  { id: "graficos",     label: "Gráficos Gerencia",  icon: "📈" },
  { id: "metas",        label: "Metas vs Logros",    icon: "🎯" },
  { id: "reporte",      label: "Reporte Data",        icon: "📑" },
  { id: "proximamente", label: "Próximamente",         icon: "🚀" },
];

export default function Redes() {
  const hoy = getFechaHoy();
  const [tab,        setTab]        = useState("general");
  const [fechaDesde, setFechaDesde] = useState(hoy);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [filtro,     setFiltro]     = useState({ desde: hoy, hasta: hoy });
  const [applying,   setApplying]   = useState(false);

  const { data, loading } = useMonitoreoData(filtro.desde, filtro.hasta);

  const handleAplicar = () => {
    setApplying(true);
    setFiltro({ desde: fechaDesde, hasta: fechaHasta });
    setTimeout(() => setApplying(false), 500);
  };

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: C.light }}>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-5 mb-7">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-base shadow-sm" style={{ background: C.primary }}>V</div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: "#0f172a" }}>Monitoreo Redes</h1>
            <span className="text-[9px] font-black px-2.5 py-1 rounded-full uppercase" style={{ background: `${C.success}15`, color: C.success }}>● Live</span>
          </div>
          <p className="text-[10px] font-medium uppercase tracking-widest ml-12" style={{ color: C.muted }}>VELSA NETLIFE — Actualización cada 15 minutos</p>
          <div className="flex flex-wrap gap-1.5 ml-12 mt-2">
            {Object.entries(CANALES).filter(([k]) => esPublicidad(k)).map(([canal, cfg]) => (
              <span key={canal} className="text-[8px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
                {cfg.icon} {cfg.label}
              </span>
            ))}
          </div>
        </div>

        {/* Filtro global */}
        <div className="bg-white border rounded-2xl px-5 py-4 shadow-sm" style={{ borderColor: C.border }}>
          <div className="flex flex-wrap items-end gap-3">
            {[["Desde","fechaDesde",fechaDesde],["Hasta","fechaHasta",fechaHasta]].map(([label, key, val]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-widest" style={{ color: C.primary }}>{label}</label>
                <input type="date" value={val}
                  onChange={(e) => key === "fechaDesde" ? setFechaDesde(e.target.value) : setFechaHasta(e.target.value)}
                  className="border rounded-xl px-3 py-2 text-[11px] font-bold outline-none bg-white [color-scheme:light]"
                  style={{ borderColor: C.border }} />
              </div>
            ))}
            <button onClick={handleAplicar}
              className="px-6 py-2 rounded-xl text-[10px] font-black uppercase text-white active:scale-95 shadow-sm transition-all"
              style={{ background: applying || loading ? C.muted : C.primary }}>
              {applying || loading ? "Cargando..." : "Aplicar"}
            </button>
          </div>
          <p className="text-[8px] font-medium mt-2 uppercase tracking-wide" style={{ color: C.muted }}>Período: {filtro.desde} → {filtro.hasta}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border rounded-2xl p-1 mb-7 w-fit shadow-sm" style={{ borderColor: C.border }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all"
            style={tab === t.id ? { background: C.primary, color: "#fff", boxShadow: `0 2px 10px ${C.primary}35` } : { color: C.muted }}>
            <span className="text-sm">{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === "general"      && <TabMonitoreoGeneral data={data} loading={loading} />}
      {tab === "graficos"     && <TabGraficos         data={data} loading={loading} />}
      {tab === "metas"        && <TabMetas            filtro={filtro} />}
      {tab === "reporte"      && <TabReporteData      filtro={filtro} />}
      {tab === "proximamente" && (
        <div className="flex flex-col items-center justify-center py-28 gap-5">
          <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center text-4xl shadow-inner">🚀</div>
          <div className="text-xl font-black tracking-tight" style={{ color: C.slate }}>Próximamente</div>
          <div className="text-sm text-center max-w-sm leading-relaxed" style={{ color: C.muted }}>Este módulo está en desarrollo.</div>
        </div>
      )}
    </div>
  );
}