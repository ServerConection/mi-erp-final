// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Redes.jsx — Monitoreo Redes VELSA NETLIFE — v2 MEJORADO               ║
// ║  ✅ Filtros globales Canal + Supervisor en TODOS los tabs               ║
// ║  ✅ Labels siempre visibles en gráficos (no requiere hover)             ║
// ║  ✅ Nuevo tab: Asesores vs Pauta                                        ║
// ║  ✅ Diseño premium dark/light cohesivo                                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { useEffect, useState, useMemo } from "react";
import {
  ComposedChart, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList, ReferenceLine,
} from "recharts";
import TabReporteData    from "./TabReporteData";
import TabAnalisisPautas from "./TabAnalisisPautas";
import TabComparativo    from "./TabComparativo";
import TabAsesorVsPauta  from "./TabAsesorVsPauta";
import { CanalSelector, SupervisorSelector, getCanalCfg, buildFiltroParams, TODOS_CANALES } from "./GlobalFilters";

// ── Paleta de colores ─────────────────────────────────────────────────────────
const C = {
  primary: "#1e3a8a", sky: "#0ea5e9", success: "#059669",
  warning: "#f59e0b", danger: "#ef4444", violet: "#7c3aed",
  cyan: "#06b6d4", slate: "#334155", muted: "#64748b",
  light: "#f8fafc", border: "#e2e8f0",
};

const ORIGEN_CANAL = {
  "BASE 593-979083368": "ARTS", "BASE 593-995211968": "ARTS FACEBOOK",
  "BASE 593-992827793": "ARTS GOOGLE", "FORMULARIO LANDING 3": "ARTS GOOGLE",
  "LLAMADA LANDING 3": "ARTS GOOGLE", "POR RECOMENDACIÓN": "POR RECOMENDACIÓN",
  "REFERIDO PERSONAL": "POR RECOMENDACIÓN", "TIENDA ONLINE": "POR RECOMENDACIÓN",
  "BASE 593-958993371": "REMARKETING", "BASE 593-984414273": "REMARKETING",
  "BASE 593-995967355": "REMARKETING", "WHATSAPP 593958993371": "REMARKETING",
  "BASE 593-962881280": "VIDIKA GOOGLE", "BASE 593-987133635": "VIDIKA GOOGLE",
  "BASE API 593963463480": "VIDIKA GOOGLE", "FORMULARIO LANDING 4": "VIDIKA GOOGLE",
  "LLAMADA": "VIDIKA GOOGLE", "LLAMADA LANDING 4": "VIDIKA GOOGLE",
};

const CANAL_A_ORIGENES = {
  "ARTS":              ["BASE 593-979083368"],
  "ARTS FACEBOOK":     ["BASE 593-995211968"],
  "ARTS GOOGLE":       ["BASE 593-992827793", "FORMULARIO LANDING 3", "LLAMADA LANDING 3"],
  "REMARKETING":       ["BASE 593-958993371", "BASE 593-984414273", "BASE 593-995967355", "WHATSAPP 593958993371"],
  "VIDIKA GOOGLE":     ["BASE 593-962881280", "BASE 593-987133635", "BASE API 593963463480", "FORMULARIO LANDING 4", "LLAMADA", "LLAMADA LANDING 4"],
  "POR RECOMENDACIÓN": ["POR RECOMENDACIÓN", "REFERIDO PERSONAL", "TIENDA ONLINE"],
};

const getCanal    = (o) => ORIGEN_CANAL[o?.toUpperCase()] || ORIGEN_CANAL[o] || "SIN MAPEO";
const esPublicidad = (c) => c !== "MAL INGRESO" && c !== "SIN MAPEO";
const getFechaHoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
const formatFecha = (f) => { if (!f) return "—"; const [, m, d] = String(f).split("T")[0].split("-"); return `${d}/${m}`; };
const n       = (v) => Number(v || 0);
const fmt2    = (v) => n(v).toFixed(2);
const fmtPct  = (v) => `${n(v).toFixed(1)}%`;
const fmtUsd  = (v) => `$${n(v).toFixed(0)}`;
const pctColor = (v) => { const x = n(v); return x >= 15 ? C.success : x >= 8 ? C.warning : C.danger; };
const API = import.meta.env.VITE_API_URL;
const apiUrl = (r, p) => `${API}/api/redes/${r}?${p}`;

// ─────────────────────────────────────────────────────────────────────────────
// AGREGADORES (igual que antes)
// ─────────────────────────────────────────────────────────────────────────────
function agregarPorCanalDia(filas) {
  const map = {};
  filas.forEach((row) => {
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
    a.n_leads              += n(row.n_leads);
    a.negociables          += n(row.negociables);
    a.atc_soporte          += n(row.atc_soporte);
    a.fuera_cobertura      += n(row.fuera_cobertura);
    a.innegociable         += n(row.innegociable);
    a.venta_subida_bitrix  += n(row.venta_subida_bitrix);
    a.seguimiento_negociacion += n(row.seguimiento_negociacion);
    a.ingreso_jot          += n(row.ingreso_jot);
    a.activos_mes          += n(row.activos_mes);
    a.activo_backlog       += n(row.activo_backlog);
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
    a.n_leads             += n(row.n_leads);
    a.negociables         += n(row.negociables);
    a.atc_soporte         += n(row.atc_soporte);
    a.venta_subida_bitrix += n(row.venta_subida_bitrix);
    a.ingreso_jot         += n(row.ingreso_jot);
    a.activos_mes         += n(row.activos_mes);
    const canal = row.canal_inversion || getCanal(row.canal_publicidad);
    const k = `${fecha}|${canal}`;
    if (!a._invSet.has(k) && n(row.inversion_usd) > 0) { a.inversion_usd += n(row.inversion_usd); a._invSet.add(k); }
  });
  return Object.values(map).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
}

function agregarPorCanal(filas) {
  const map = {}, invC = {};
  filas.forEach((row) => {
    const canal = row.canal_inversion || getCanal(row.canal_publicidad);
    if (!esPublicidad(canal)) return;
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
  return Object.values(map).sort((a, b) => b.n_leads - a.n_leads);
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK CENTRAL — respeta filtros globales
// ─────────────────────────────────────────────────────────────────────────────
function useMonitoreoData(desde, hasta, canalesSel) {
  const [data, setData]       = useState({ principal: null, ciudad: null, hora: null, atc: null });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!desde || !hasta) return;
    setLoading(true);
    const p = buildFiltroParams({ desde, hasta, canalesSel });
    Promise.all([
      fetch(apiUrl("monitoreo-redes",  p)).then(r => r.json()).catch(() => null),
      fetch(apiUrl("monitoreo-ciudad", `fechaDesde=${desde}&fechaHasta=${hasta}`)).then(r => r.json()).catch(() => null),
      fetch(apiUrl("monitoreo-hora",   `fechaDesde=${desde}&fechaHasta=${hasta}`)).then(r => r.json()).catch(() => null),
      fetch(apiUrl("monitoreo-atc",    `fechaDesde=${desde}&fechaHasta=${hasta}`)).then(r => r.json()).catch(() => null),
    ]).then(([p_, c, h, a]) => setData({
      principal: p_?.success ? p_ : null,
      ciudad:    c?.success  ? c  : null,
      hora:      h?.success  ? h  : null,
      atc:       a?.success  ? a  : null,
    })).finally(() => setLoading(false));
  }, [desde, hasta, JSON.stringify(canalesSel)]);
  return { data, loading };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI ATOMS
// ─────────────────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="w-12 h-12 border-4 rounded-full animate-spin"
        style={{ borderColor: `${C.primary}30`, borderTopColor: C.primary }} />
    </div>
  );
}

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

function KpiCard({ label, value, color = C.primary, icon, sub }) {
  return (
    <div className="bg-white rounded-2xl border shadow-sm px-4 py-3 flex items-center gap-3" style={{ borderColor: C.border }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: `${color}15` }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[8px] font-black uppercase tracking-widest truncate" style={{ color: C.muted }}>{label}</div>
        <div className="text-xl font-black leading-tight truncate" style={{ color }}>{value}</div>
        {sub && <div className="text-[8px] font-medium mt-0.5" style={{ color: C.muted }}>{sub}</div>}
      </div>
    </div>
  );
}

// Tooltip rico para todos los gráficos
const RichTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl shadow-2xl px-4 py-3 text-[10px] min-w-[160px]">
      <div className="font-black text-white mb-2 uppercase tracking-widest border-b border-slate-800 pb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 mb-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="text-slate-400">{p.name}</span>
          </div>
          <span className="font-black" style={{ color: p.color || "#fff" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// Label siempre visible
const AlwaysVisibleLabel = ({ x, y, width, value, fill = "#334155", fontSize = 8 }) => {
  if (!value && value !== 0) return null;
  const display = typeof value === "number" && value % 1 !== 0 ? value.toFixed(1) : value;
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle"
      fontSize={fontSize} fontWeight={800} fill={fill}>
      {display}
    </text>
  );
};

function VistaToggle({ value, onChange, options, color = C.primary }) {
  return (
    <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: C.border }}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className="px-3 py-1.5 text-[8px] font-black uppercase transition-all"
          style={value === o.value ? { background: color, color: "#fff" } : { background: "#fff", color: C.muted }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PANEL FILTROS GLOBALES — aparece en todos los tabs excepto ReporteData y Metas
// ─────────────────────────────────────────────────────────────────────────────
function PanelFiltrosGlobales({ canalesSel, onCanalesSel, supervisorSel, onSupervisorSel, supervisores, compact = false }) {
  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden mb-5" style={{ borderColor: C.border }}>
      <div className="px-5 py-3 flex flex-wrap items-center gap-4 border-b" style={{ borderColor: C.border, background: "#f8fafc" }}>
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full" style={{ background: C.primary }} />
          <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: C.primary }}>Filtros Globales</span>
        </div>
        <div className="flex-1 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[8px] font-black uppercase" style={{ color: C.muted }}>Canal:</span>
            <CanalSelector canalesSel={canalesSel} onChange={onCanalesSel} compact />
          </div>
          {supervisores.length > 0 && (
            <div className="border-l pl-3" style={{ borderColor: C.border }}>
              <SupervisorSelector supervisores={supervisores} supervisorSel={supervisorSel} onChange={onSupervisorSel} />
            </div>
          )}
        </div>
      </div>
      {(canalesSel.length > 0 || supervisorSel) && (
        <div className="px-5 py-2 flex items-center gap-2 text-[8px]" style={{ color: C.muted }}>
          <span className="font-bold">Activos:</span>
          {canalesSel.map(c => {
            const cfg = getCanalCfg(c);
            return (
              <span key={c} style={{ padding: "2px 8px", borderRadius: "9999px", background: cfg.bg, color: cfg.color, fontWeight: 900, border: `1px solid ${cfg.color}30` }}>
                {cfg.icon} {cfg.label}
              </span>
            );
          })}
          {supervisorSel && (
            <span style={{ padding: "2px 8px", borderRadius: "9999px", background: "#e0f2fe", color: "#0ea5e9", fontWeight: 900, border: "1px solid #bae6fd" }}>
              👤 {supervisorSel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — MONITOREO GENERAL (mejorado con labels visibles)
// ─────────────────────────────────────────────────────────────────────────────
function TabMonitoreoGeneral({ data, loading, canalesSel, supervisorSel }) {
  const { principal, ciudad, hora, atc } = data;
  const [vistaTabla, setVistaTabla] = useState("canal");
  const [vistaCity,  setVistaCity]  = useState("resumen");
  const [vistaHora,  setVistaHora]  = useState("resumen");

  const rawFilas = principal?.data || [];
  const filasAgr = agregarPorCanalDia(rawFilas);
  const porCanal = agregarPorCanal(rawFilas);

  const totalLeads = porCanal.reduce((s, c) => s + c.n_leads, 0);
  const totalAct   = porCanal.reduce((s, c) => s + c.activos_mes, 0);
  const totalJot   = porCanal.reduce((s, c) => s + c.ingreso_jot, 0);
  const totalInv   = porCanal.reduce((s, c) => s + c.inversion_usd, 0);
  const totalAtc   = porCanal.reduce((s, c) => s + c.atc_soporte, 0);
  const efect      = totalLeads > 0 ? (totalAct / totalLeads) * 100 : 0;
  const pctAtcGral = totalLeads > 0 ? (totalAtc / totalLeads) * 100 : 0;
  const cplGral    = totalLeads > 0 && totalInv > 0 ? totalInv / totalLeads : null;

  if (loading) return <Spinner />;

  // Datos para barras con label siempre visible
  const barData = porCanal.map(c => {
    const cfg = getCanalCfg(c.canal);
    return {
      canal: cfg.label,
      leads: c.n_leads,
      negoc: c.negociables,
      jot:   c.ingreso_jot,
      activos: c.activos_mes,
      atc:   c.atc_soporte,
      _color: cfg.color,
    };
  });

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard label="Leads Totales"  value={totalLeads || "—"} icon="👥" color={C.primary} sub={`${porCanal.length} canales`} />
        <KpiCard label="Negociables"    value={porCanal.reduce((s,c)=>s+c.negociables,0) || "—"} icon="🤝" color={C.success}
          sub={totalLeads > 0 ? `${((porCanal.reduce((s,c)=>s+c.negociables,0)/totalLeads)*100).toFixed(1)}%` : undefined} />
        <KpiCard label="Ing. JOT"       value={totalJot || "—"} icon="📋" color={C.cyan}
          sub={porCanal.reduce((s,c)=>s+c.venta_subida_bitrix,0) > 0 ? `${porCanal.reduce((s,c)=>s+c.venta_subida_bitrix,0)} V.Subida` : undefined} />
        <KpiCard label="Activos Mes"    value={totalAct || "—"} icon="✅" color={C.success}
          sub={efect > 0 ? `${efect.toFixed(1)}% efectividad` : undefined} />
        <KpiCard label="Backlog Activo" value={filasAgr.reduce((s,r)=>s+n(r.activo_backlog),0) || "—"} icon="📦" color={C.sky} />
        <KpiCard label="Inversión"      value={totalInv > 0 ? fmtUsd(totalInv) : "—"} icon="💰" color={C.violet}
          sub={cplGral ? `CPL $${cplGral.toFixed(2)}` : undefined} />
        <KpiCard label="% ATC / SAC"    value={pctAtcGral > 0 ? fmtPct(pctAtcGral) : "—"} icon="📞"
          color={pctAtcGral > 40 ? C.danger : pctAtcGral > 20 ? C.warning : C.success}
          sub={`${totalAtc} leads`} />
      </div>

      {/* Gráfico barras por canal — labels SIEMPRE visibles */}
      <Card>
        <CardHeader title="Leads · Negociables · JOT · Activos por Canal" accent={C.primary}
          subtitle="Labels permanentes — sin necesidad de hover" />
        <div className="p-5">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} margin={{ top: 28, right: 10, left: 0, bottom: 5 }} barCategoryGap="25%" barGap={3}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="canal" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: C.muted, fontWeight: 700 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: C.muted }} />
              <Tooltip content={<RichTooltip />} />
              <Legend wrapperStyle={{ fontSize: "9px" }} />
              <Bar dataKey="leads" name="Leads" radius={[4,4,0,0]} barSize={16}>
                {barData.map((d, i) => <Cell key={i} fill={`${d._color}60`} />)}
                <LabelList dataKey="leads" content={({ x, y, width, value, index }) => (
                  value > 0 ? <text x={x+width/2} y={y-4} textAnchor="middle" fontSize={8} fontWeight={900} fill={barData[index]?._color}>{value}</text> : null
                )} />
              </Bar>
              <Bar dataKey="negoc" name="Negoc." radius={[4,4,0,0]} barSize={16}>
                {barData.map((d, i) => <Cell key={i} fill={`${d._color}85`} />)}
                <LabelList dataKey="negoc" content={({ x, y, width, value, index }) => (
                  value > 0 ? <text x={x+width/2} y={y-4} textAnchor="middle" fontSize={8} fontWeight={900} fill={barData[index]?._color}>{value}</text> : null
                )} />
              </Bar>
              <Bar dataKey="jot" name="JOT" radius={[4,4,0,0]} barSize={16}>
                {barData.map((d, i) => <Cell key={i} fill={d._color} />)}
                <LabelList dataKey="jot" content={({ x, y, width, value, index }) => (
                  value > 0 ? <text x={x+width/2} y={y-4} textAnchor="middle" fontSize={9} fontWeight={900} fill={barData[index]?._color}>{value}</text> : null
                )} />
              </Bar>
              <Bar dataKey="activos" name="Activos" radius={[4,4,0,0]} barSize={16} fill={C.success}>
                <LabelList dataKey="activos" content={({ x, y, width, value }) => (
                  value > 0 ? <text x={x+width/2} y={y-4} textAnchor="middle" fontSize={8} fontWeight={900} fill={C.success}>{value}</text> : null
                )} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Tabla canales */}
      {porCanal.length > 0 && (
        <Card>
          <CardHeader title="Resumen por Canal de Publicidad" accent={C.primary}
            badge={<span className="text-[9px] font-black px-3 py-1 rounded-full" style={{ background: `${C.primary}12`, color: C.primary }}>{porCanal.length} canales</span>} />
          <div className="overflow-auto">
            <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
              <thead style={{ background: C.light, borderBottom: `2px solid ${C.border}` }}>
                <tr>
                  {["CANAL","LEADS","NEGOC.","ATC","V.SUB.","JOT","ACTIVOS","INV.$","CPL","% EF."].map(h => (
                    <th key={h} className="px-3 py-2.5 border-r text-center font-black uppercase text-[8px]" style={{ color: C.muted, borderColor: C.border }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porCanal.map((c, i) => {
                  const cfg = getCanalCfg(c.canal);
                  const cpl = c.n_leads > 0 && c.inversion_usd > 0 ? c.inversion_usd / c.n_leads : null;
                  const ef  = c.n_leads > 0 ? (c.activos_mes / c.n_leads) * 100 : 0;
                  return (
                    <tr key={i} className="border-b hover:bg-slate-50" style={{ borderColor: C.border }}>
                      <td className="px-3 py-2 border-r" style={{ borderColor: C.border }}>
                        <span style={{ padding: "2px 8px", borderRadius: "9999px", background: cfg.bg, color: cfg.color, fontWeight: 900, fontSize: "8px", border: `1px solid ${cfg.color}30`, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-r text-center font-black" style={{ color: C.primary, borderColor: C.border }}>{c.n_leads}</td>
                      <td className="px-3 py-2 border-r text-center font-black" style={{ color: C.success, borderColor: C.border }}>{c.negociables}</td>
                      <td className="px-3 py-2 border-r text-center font-black" style={{ color: C.danger, borderColor: C.border }}>{c.atc_soporte}</td>
                      <td className="px-3 py-2 border-r text-center" style={{ borderColor: C.border }}>{c.venta_subida_bitrix}</td>
                      <td className="px-3 py-2 border-r text-center font-black" style={{ color: C.cyan, borderColor: C.border }}>{c.ingreso_jot}</td>
                      <td className="px-3 py-2 border-r text-center font-black" style={{ color: C.success, borderColor: C.border }}>{c.activos_mes}</td>
                      <td className="px-3 py-2 border-r text-center font-black" style={{ color: C.violet, borderColor: C.border }}>{fmtUsd(c.inversion_usd)}</td>
                      <td className="px-3 py-2 border-r text-center" style={{ color: C.violet, borderColor: C.border }}>{cpl ? `$${cpl.toFixed(2)}` : "—"}</td>
                      <td className="px-3 py-2 text-center font-black" style={{ color: pctColor(ef) }}>{ef.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Ciudad + ATC */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Por Ciudad" accent={C.cyan}
            badge={<VistaToggle value={vistaCity} onChange={setVistaCity} color={C.cyan}
              options={[{ value: "resumen", label: "Resumen" }, { value: "detalle", label: "Detalle" }]} />} />
          <div className="overflow-auto max-h-72">
            <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
              <thead className="sticky top-0 border-b" style={{ background: C.light, borderColor: C.border }}>
                <tr>{(vistaCity === "resumen" ? ["CIUDAD","PROV.","LEADS","ACTIVOS","JOT","% ACT."] : ["FECHA","CIUDAD","LEADS","ACTIVOS","% ACT."]).map(h => (
                  <th key={h} className="px-3 py-2 border-r text-center font-black uppercase" style={{ color: C.muted, borderColor: C.border }}>{h}</th>
                ))}</tr>
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
          <CardHeader title="Motivos ATC" accent={C.danger}
            badge={<span className="text-[9px] font-black px-2 py-1 rounded-full" style={{ background: `${C.danger}12`, color: C.danger }}>
              {(atc?.totales || []).reduce((s,r)=>s+n(r.cantidad),0)} total
            </span>} />
          <div className="p-4 space-y-2.5">
            {(() => {
              const total = (atc?.totales || []).reduce((s, r) => s + n(r.cantidad), 0);
              return (atc?.totales || []).slice(0, 10).map((r, i) => {
                const pct_ = total > 0 ? ((n(r.cantidad) / total) * 100).toFixed(1) : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="text-[9px] font-semibold w-44 truncate" style={{ color: C.slate }}>{r.motivo_atc}</div>
                    <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ background: `${C.danger}15` }}>
                      <div className="h-1.5 rounded-full" style={{ width: `${pct_}%`, background: C.danger }} />
                    </div>
                    <div className="text-[9px] font-black w-8 text-right" style={{ color: C.danger }}>{n(r.cantidad)}</div>
                    <div className="text-[9px] w-10 text-right" style={{ color: C.muted }}>{pct_}%</div>
                  </div>
                );
              });
            })()}
          </div>
        </Card>
      </div>

      {/* Hora */}
      <Card>
        <CardHeader title="Leads por Hora" accent={C.violet}
          badge={<VistaToggle value={vistaHora} onChange={setVistaHora} color={C.violet}
            options={[{ value: "resumen", label: "Resumen" }, { value: "detalle", label: "Detalle" }]} />} />
        <div className="overflow-auto max-h-64">
          <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
            <thead className="sticky top-0 border-b" style={{ background: C.light, borderColor: C.border }}>
              <tr>{(vistaHora === "resumen" ? ["HORA","LEADS","ATC","% ATC"] : ["FECHA","HORA","LEADS","ATC","% ATC"]).map(h => (
                <th key={h} className="px-3 py-2 border-r text-center font-black uppercase" style={{ color: C.muted, borderColor: C.border }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {(vistaHora === "resumen" ? hora?.totales || [] : hora?.data || []).map((row, i) => (
                <tr key={i} className="border-b hover:bg-slate-50" style={{ borderColor: C.border }}>
                  {vistaHora === "detalle" && <td className="px-3 py-1.5 border-r font-black" style={{ color: C.primary, borderColor: C.border }}>{formatFecha(row.fecha)}</td>}
                  <td className="px-3 py-1.5 border-r text-center font-black" style={{ color: C.violet, borderColor: C.border }}>{String(row.hora).padStart(2,"0")}:00</td>
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
// TAB 2 — GRÁFICOS (labels siempre visibles, mejorado)
// ─────────────────────────────────────────────────────────────────────────────
function TabGraficos({ data, loading, canalesSel }) {
  if (loading) return <Spinner />;
  if (!data.principal) return (
    <div className="text-center py-32 text-sm font-bold" style={{ color: C.muted }}>
      Sin datos — aplica un filtro de fechas.
    </div>
  );

  const rawFilas     = data.principal?.data || [];
  const porFecha     = agregarPorFecha(rawFilas);
  const porCanal     = agregarPorCanal(rawFilas);

  const tendMap = {};
  rawFilas.forEach((row) => {
    const canal = row.canal_inversion || getCanal(row.canal_publicidad);
    if (!esPublicidad(canal)) return;
    const fecha = formatFecha(row.fecha);
    if (!tendMap[fecha]) tendMap[fecha] = { fecha };
    tendMap[fecha][canal] = (tendMap[fecha][canal] || 0) + n(row.ingreso_jot);
  });
  const tendCanalData    = Object.values(tendMap).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const canalesPresentes = [...new Set(rawFilas.map(r => r.canal_inversion || getCanal(r.canal_publicidad)).filter(esPublicidad))];

  const diasData = porFecha.map((d) => ({
    fecha:     formatFecha(d.fecha),
    Leads:     d.n_leads,
    "V.Subida": d.venta_subida_bitrix,
    JOT:       d.ingreso_jot,
    Activos:   d.activos_mes,
    "% Efect": d.n_leads > 0 ? +((d.activos_mes / d.n_leads) * 100).toFixed(1) : 0,
    "% ATC":   d.n_leads > 0 ? +((d.atc_soporte / d.n_leads) * 100).toFixed(1) : 0,
    CPL:       d.n_leads > 0 && d.inversion_usd > 0 ? +(d.inversion_usd / d.n_leads).toFixed(2) : 0,
    "Inv.$":   Math.round(d.inversion_usd),
  }));

  const embudo = [
    { e: "Leads",       v: porFecha.reduce((s, d) => s + d.n_leads, 0) },
    { e: "Negociables", v: porFecha.reduce((s, d) => s + d.negociables, 0) },
    { e: "V. Subida",   v: porFecha.reduce((s, d) => s + d.venta_subida_bitrix, 0) },
    { e: "Ing. JOT",    v: porFecha.reduce((s, d) => s + d.ingreso_jot, 0) },
    { e: "Activos",     v: porFecha.reduce((s, d) => s + d.activos_mes, 0) },
  ];
  const embudoColors = [C.primary, C.sky, C.cyan, C.success, "#10b981"];

  return (
    <div className="space-y-6">
      {/* Combinado Leads + JOT — labels siempre visibles */}
      <Card>
        <CardHeader title="Leads & Ventas Diarias + JOT por Canal" accent={C.primary}
          subtitle="Barras = totales · Líneas = JOT por canal — datos siempre visibles" />
        <div className="p-5">
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={diasData.map(d => {
              const tend = tendCanalData.find(t => t.fecha === d.fecha) || {};
              return { ...d, ...canalesPresentes.reduce((acc, c) => ({ ...acc, [`JOT·${getCanalCfg(c).label}`]: tend[c] || 0 }), {}) };
            })} margin={{ top: 28, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: C.muted }} />
              <YAxis yAxisId="vol" tick={{ fontSize: 9, fill: C.muted }} width={38} />
              <YAxis yAxisId="jot" orientation="right" tick={{ fontSize: 9, fill: C.muted }} width={32} />
              <Tooltip content={<RichTooltip />} />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              <Bar yAxisId="vol" dataKey="Leads" fill={`${C.primary}35`} stroke={C.primary} strokeWidth={0.5} radius={[3,3,0,0]} barSize={20}>
                <LabelList dataKey="Leads" position="top" style={{ fontSize: 7, fill: C.primary, fontWeight: 800 }} formatter={v => v > 0 ? v : ""} />
              </Bar>
              <Bar yAxisId="vol" dataKey="V.Subida" fill={`${C.success}70`} stroke={C.success} strokeWidth={0.5} radius={[3,3,0,0]} barSize={20}>
                <LabelList dataKey="V.Subida" position="top" style={{ fontSize: 7, fill: C.success, fontWeight: 800 }} formatter={v => v > 0 ? v : ""} />
              </Bar>
              {canalesPresentes.map((canal) => (
                <Line key={canal} yAxisId="jot" type="monotone" dataKey={`JOT·${getCanalCfg(canal).label}`}
                  name={`JOT ${getCanalCfg(canal).label}`}
                  stroke={getCanalCfg(canal).color} strokeWidth={2.5}
                  dot={{ r: 4, fill: getCanalCfg(canal).color, strokeWidth: 0 }}
                  connectNulls>
                  <LabelList dataKey={`JOT·${getCanalCfg(canal).label}`} position="top"
                    style={{ fontSize: 7, fill: getCanalCfg(canal).color, fontWeight: 800 }}
                    formatter={v => v > 0 ? v : ""} />
                </Line>
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* % Efect + % ATC — líneas con labels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="% Efectividad vs % ATC Diario" accent={C.warning} subtitle="Labels siempre visibles" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={diasData} margin={{ top: 24, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: C.muted }} />
                <YAxis tick={{ fontSize: 9, fill: C.muted }} unit="%" domain={[0, 100]} />
                <Tooltip content={<RichTooltip />} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                <Line type="monotone" dataKey="% Efect" stroke={C.success} strokeWidth={2.5} dot={{ r: 4, fill: C.success }}>
                  <LabelList dataKey="% Efect" position="top" style={{ fontSize: 8, fill: C.success, fontWeight: 800 }} formatter={v => v > 0 ? `${v}%` : ""} />
                </Line>
                <Line type="monotone" dataKey="% ATC" stroke={C.danger} strokeWidth={2.5} dot={{ r: 4, fill: C.danger }} strokeDasharray="5 3">
                  <LabelList dataKey="% ATC" position="bottom" style={{ fontSize: 8, fill: C.danger, fontWeight: 800 }} formatter={v => v > 0 ? `${v}%` : ""} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Inversión & CPL Diario" accent={C.violet} subtitle="Labels siempre visibles" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={diasData} margin={{ top: 24, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: C.muted }} />
                <YAxis yAxisId="l" tick={{ fontSize: 9, fill: C.muted }} width={50} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9, fill: C.muted }} width={35} />
                <Tooltip content={<RichTooltip />} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                <Bar yAxisId="l" dataKey="Inv.$" fill={C.violet} radius={[4,4,0,0]} opacity={0.8}>
                  <LabelList dataKey="Inv.$" position="top" style={{ fontSize: 7, fill: C.violet, fontWeight: 800 }} formatter={v => v > 0 ? `$${v}` : ""} />
                </Bar>
                <Line yAxisId="r" type="monotone" dataKey="CPL" stroke={C.warning} strokeWidth={2.5} dot={{ r: 4, fill: C.warning }}>
                  <LabelList dataKey="CPL" position="top" style={{ fontSize: 7, fill: C.warning, fontWeight: 800 }} formatter={v => v > 0 ? `$${v}` : ""} />
                </Line>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Embudo de conversión — siempre visible */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Embudo de Conversión" accent={C.success} subtitle="Todos los valores visibles" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={embudo} layout="vertical" margin={{ top: 5, right: 70, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: C.muted }} />
                <YAxis type="category" dataKey="e" tick={{ fontSize: 9, fill: C.muted }} width={80} />
                <Tooltip content={<RichTooltip />} />
                <Bar dataKey="v" radius={[0,6,6,0]}>
                  {embudo.map((_, i) => <Cell key={i} fill={embudoColors[i]} opacity={0.9} />)}
                  <LabelList dataKey="v" position="right"
                    content={({ x, y, width, height, value, index }) =>
                      value > 0 ? (
                        <text x={x+width+8} y={y+height/2+4} fontSize={9} fontWeight={900} fill={embudoColors[index]}>{value}</text>
                      ) : null
                    } />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Dona leads por canal */}
        <Card>
          <CardHeader title="Distribución Leads por Canal" accent={C.primary} />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={porCanal.map(c => ({ name: getCanalCfg(c.canal).label, value: c.n_leads, fill: getCanalCfg(c.canal).color }))}
                  cx="45%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3}
                  label={({ name, value, percent }) => `${name}: ${value} (${(percent*100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {porCanal.map((c, i) => <Cell key={i} fill={getCanalCfg(c.canal).color} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 9 }} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WRAPPPERS PARA TABS CON FILTROS — pasan filtros globales a cada sub-tab
// ─────────────────────────────────────────────────────────────────────────────
function TabMetasWrapped({ filtro, canalesSel, supervisorSel }) {
  // Lazy import para evitar ciclos
  const [TabMetas, setTabMetas] = useState(null);
  useEffect(() => {
    import("./TabMetas").then(m => setTabMetas(() => m.default)).catch(() => {});
  }, []);
  if (!TabMetas) return <div className="text-center py-20" style={{ color: C.muted }}>Cargando...</div>;
  return <TabMetas filtro={filtro} canalesSel={canalesSel} supervisorSel={supervisorSel} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "general",       label: "Monitoreo General",    icon: "📊" },
  { id: "graficos",      label: "Gráficos Gerencia",    icon: "📈" },
  { id: "asesorvpauta",  label: "Asesores vs Pauta",    icon: "⚡" },
  { id: "metas",         label: "Metas vs Logros",      icon: "🎯" },
  { id: "comparativo",   label: "Comparativo",          icon: "🔀" },
  { id: "pautas",        label: "Análisis Pautas",      icon: "🔬" },
  { id: "reporte",       label: "Reporte Data",         icon: "📑" },
];

export default function Redes() {
  const hoy = getFechaHoy();

  // ── Estado global ─────────────────────────────────────────────────────────
  const [tab,           setTab]           = useState("general");
  const [fechaDesde,    setFechaDesde]    = useState(hoy);
  const [fechaHasta,    setFechaHasta]    = useState(hoy);
  const [filtro,        setFiltro]        = useState({ desde: hoy, hasta: hoy });

  // ── FILTROS GLOBALES (compartidos entre todos los tabs) ───────────────────
  const [canalesSel,    setCanalesSel]    = useState([]);   // [] = todos
  const [supervisorSel, setSupervisorSel] = useState("");   // "" = todos
  const [supervisores,  setSupervisores]  = useState([]);   // lista de supervisores disponibles

  const [applying, setApplying] = useState(false);

  const { data, loading } = useMonitoreoData(filtro.desde, filtro.hasta, canalesSel);

  // Extraer supervisores de los datos cuando llegan
  useEffect(() => {
    if (data?.principal?.data) {
      // supervisores no vienen de redes directamente, se cargan en TabAsesorVsPauta
    }
  }, [data]);

  const handleAplicar = () => {
    setApplying(true);
    setFiltro({ desde: fechaDesde, hasta: fechaHasta });
    setTimeout(() => setApplying(false), 500);
  };

  // Tabs que usan los filtros globales de canal
  const tabsConFiltroCanal = ["general", "graficos", "asesorvpauta", "metas", "comparativo", "pautas"];

  return (
    <div className="min-h-screen p-5 md:p-7" style={{ background: "#f1f5f9" }}>

      {/* ── Header principal ── */}
      <div className="flex flex-wrap items-start justify-between gap-5 mb-7">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-base shadow-sm" style={{ background: C.primary }}>V</div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: "#0f172a" }}>Monitoreo Redes</h1>
            <span className="text-[9px] font-black px-2.5 py-1 rounded-full uppercase" style={{ background: `${C.success}15`, color: C.success }}>● Live</span>
          </div>
          <p className="text-[10px] font-medium uppercase tracking-widest ml-12" style={{ color: C.muted }}>VELSA NETLIFE — Actualización cada 15 minutos</p>
          <div className="flex flex-wrap gap-1.5 ml-12 mt-2">
            {Object.entries({
              "ARTS": { color: "#1e3a8a", bg: "#dbeafe", icon: "🎨" },
              "ARTS FACEBOOK": { color: "#1877f2", bg: "#eff6ff", icon: "📘" },
              "ARTS GOOGLE": { color: "#ea4335", bg: "#fee2e2", icon: "🔍" },
              "REMARKETING": { color: "#7c3aed", bg: "#ede9fe", icon: "🔁" },
              "VIDIKA GOOGLE": { color: "#059669", bg: "#d1fae5", icon: "📺" },
              "POR RECOMENDACIÓN": { color: "#f59e0b", bg: "#fef3c7", icon: "🤝" },
            }).map(([canal, cfg]) => (
              <span key={canal} className="text-[8px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
                {cfg.icon} {getCanalCfg(canal).label || canal}
              </span>
            ))}
          </div>
        </div>

        {/* Selector de fechas */}
        <div className="bg-white border rounded-2xl px-5 py-4 shadow-sm" style={{ borderColor: C.border }}>
          <div className="flex flex-wrap items-end gap-3">
            {[["Desde", "desde", fechaDesde], ["Hasta", "hasta", fechaHasta]].map(([label, key, val]) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-widest" style={{ color: C.primary }}>{label}</label>
                <input type="date" value={val}
                  onChange={e => key === "desde" ? setFechaDesde(e.target.value) : setFechaHasta(e.target.value)}
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
          <p className="text-[8px] font-medium mt-2 uppercase tracking-wide" style={{ color: C.muted }}>
            Período activo: {filtro.desde} → {filtro.hasta}
          </p>
        </div>
      </div>

      {/* ── Tabs de navegación ── */}
      <div className="flex flex-wrap gap-1 bg-white border rounded-2xl p-1 mb-5 shadow-sm" style={{ borderColor: C.border }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all"
            style={tab === t.id
              ? { background: C.primary, color: "#fff", boxShadow: `0 2px 10px ${C.primary}35` }
              : { color: C.muted }}>
            <span className="text-sm">{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Panel de filtros globales — aparece en todos los tabs relevantes ── */}
      {tabsConFiltroCanal.includes(tab) && (
        <PanelFiltrosGlobales
          canalesSel={canalesSel}
          onCanalesSel={setCanalesSel}
          supervisorSel={supervisorSel}
          onSupervisorSel={setSupervisorSel}
          supervisores={supervisores}
        />
      )}

      {/* ── Contenido de cada tab ── */}
      {tab === "general" && (
        <TabMonitoreoGeneral data={data} loading={loading} canalesSel={canalesSel} supervisorSel={supervisorSel} />
      )}
      {tab === "graficos" && (
        <TabGraficos data={data} loading={loading} canalesSel={canalesSel} />
      )}
      {tab === "asesorvpauta" && (
        <TabAsesorVsPauta
          filtro={filtro}
          canalesSel={canalesSel}
          onCanalesSel={setCanalesSel}
          supervisorSel={supervisorSel}
          onSupervisorSel={setSupervisorSel}
        />
      )}
      {tab === "metas" && (
        <TabMetasWrapped filtro={filtro} canalesSel={canalesSel} supervisorSel={supervisorSel} />
      )}
      {tab === "comparativo" && (
        <TabComparativo filtro={filtro} canalesSel={canalesSel} supervisorSel={supervisorSel} />
      )}
      {tab === "pautas" && (
        <TabAnalisisPautas filtro={filtro} canalesSel={canalesSel} supervisorSel={supervisorSel} />
      )}
      {tab === "reporte" && (
        <TabReporteData filtro={filtro} />
      )}
    </div>
  );
}