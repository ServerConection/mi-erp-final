import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell
} from "recharts";
import TabReporteData from "./TabReporteData";

// ── Paleta corporativa clara ──────────────────────────────────────────────────
const C = {
  primary:   "#1e40af",
  success:   "#059669",
  warning:   "#d97706",
  danger:    "#dc2626",
  violet:    "#7c3aed",
  cyan:      "#0891b2",
  slate:     "#475569",
  bg:        "#f8fafc",
  card:      "#ffffff",
  border:    "#e2e8f0",
  text:      "#1e293b",
  muted:     "#64748b",
};

const ETAPAS_COLORS = [C.primary, C.success, C.warning, C.danger, C.violet, C.cyan, "#f59e0b", "#10b981"];

const getFechaHoy = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });

const formatFecha = (f) => {
  if (!f) return "—";
  const d = String(f).split("T")[0];
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
};

const fmt2   = (v) => Number(v || 0).toFixed(2);
const fmtPct = (v) => `${Number(v || 0).toFixed(1)}%`;
const fmtUsd = (v) => `$${Number(v || 0).toFixed(0)}`;

const pctStyle = (v) => {
  const n = Number(v);
  if (n >= 80) return { color: C.success, fontWeight: 800 };
  if (n >= 50) return { color: C.warning, fontWeight: 800 };
  return { color: C.danger, fontWeight: 800 };
};

const API = import.meta.env.VITE_API_URL;
const apiUrl = (ruta, desde, hasta) =>
  `${API}/api/redes/${ruta}?fechaDesde=${desde}&fechaHasta=${hasta}`;

// ══════════════════════════════════════════════════════════════════════════════
// UI ATOMS
// ══════════════════════════════════════════════════════════════════════════════
function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle, accent = C.primary, badge }) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: accent }} />
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: accent }}>{title}</div>
          {subtitle && <div className="text-[9px] text-slate-400 font-medium mt-0.5">{subtitle}</div>}
        </div>
      </div>
      {badge}
    </div>
  );
}

function KpiCard({ label, value, color = C.primary, icon }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
        style={{ background: `${color}15` }}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest truncate">{label}</div>
        <div className="text-lg font-black leading-tight truncate" style={{ color }}>{value}</div>
      </div>
    </div>
  );
}

function FiltroPeriodo({ fechaDesde, fechaHasta, onChange, onAplicar, loading }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {[["Desde", "fechaDesde", fechaDesde], ["Hasta", "fechaHasta", fechaHasta]].map(([label, key, val]) => (
        <div key={key} className="flex flex-col gap-1">
          <label className="text-[9px] font-black uppercase tracking-widest" style={{ color: C.primary }}>{label}</label>
          <input type="date" value={val}
            onChange={(e) => onChange(key, e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400 bg-white [color-scheme:light]"
          />
        </div>
      ))}
      <button onClick={onAplicar}
        className="px-6 py-2 rounded-xl text-[10px] font-black uppercase text-white transition-all active:scale-95 shadow-sm"
        style={{ background: C.primary }}>
        {loading ? "Cargando..." : "Aplicar"}
      </button>
    </div>
  );
}

function VistaToggle({ value, onChange, options, color = C.primary }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-slate-200">
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

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-[10px] max-w-xs">
      <div className="font-black text-slate-600 mb-2 uppercase text-[9px]">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-0.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-slate-500 truncate">{p.name}:</span>
          <span className="font-black text-slate-800">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// HOOK CENTRAL DE DATOS
// ══════════════════════════════════════════════════════════════════════════════
function useMonitoreoData(desde, hasta) {
  const [data,    setData]    = useState({ principal: null, ciudad: null, hora: null, atc: null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!desde || !hasta) return;
    setLoading(true);
    Promise.all([
      fetch(apiUrl("monitoreo-redes",  desde, hasta)).then(r => r.json()).catch(() => null),
      fetch(apiUrl("monitoreo-ciudad", desde, hasta)).then(r => r.json()).catch(() => null),
      fetch(apiUrl("monitoreo-hora",   desde, hasta)).then(r => r.json()).catch(() => null),
      fetch(apiUrl("monitoreo-atc",    desde, hasta)).then(r => r.json()).catch(() => null),
    ]).then(([p, c, h, a]) => {
      setData({
        principal: p?.success ? p : null,
        ciudad:    c?.success ? c : null,
        hora:      h?.success ? h : null,
        atc:       a?.success ? a : null,
      });
    }).finally(() => setLoading(false));
  }, [desde, hasta]);

  return { data, loading };
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — MONITOREO GENERAL
// ══════════════════════════════════════════════════════════════════════════════
function TabMonitoreoGeneral({ data, loading }) {
  const { principal, ciudad, hora, atc } = data;
  const [vistaCity, setVistaCity] = useState("resumen");
  const [vistaHora, setVistaHora] = useState("resumen");
  const [vistaAtc,  setVistaAtc]  = useState("resumen");

  const totP  = principal?.totales || {};
  const diasP = principal?.data    || [];

  const cols = [
    { key: "fecha",                 label: "FECHA",    fmt: formatFecha },
    { key: "dia_semana",            label: "DÍA" },
    { key: "n_leads",               label: "LEADS",    color: C.primary },
    { key: "negociables",           label: "NEGOC.",   color: C.success },
    { key: "atc_soporte",           label: "ATC",      color: C.danger },
    { key: "fuera_cobertura",       label: "F.COB." },
    { key: "innegociable",          label: "INNEG.",   color: C.warning },
    { key: "venta_subida_bitrix",   label: "V.SUBIDA", color: C.primary },
    { key: "ingreso_jot",           label: "ING.JOT",  color: C.success },
    { key: "activo_backlog",        label: "BACKLOG" },
    { key: "activos_mes",           label: "ACTIVOS",  color: C.success },
    { key: "pago_cuenta",           label: "P.CTA" },
    { key: "pago_efectivo",         label: "P.EFECT" },
    { key: "pago_tarjeta",          label: "P.TARJ" },
    { key: "ciclo_0_dias",          label: "C.0D" },
    { key: "ciclo_1_dia",           label: "C.1D" },
    { key: "ciclo_2_dias",          label: "C.2D" },
    { key: "ciclo_3_dias",          label: "C.3D" },
    { key: "ciclo_4_dias",          label: "C.4D" },
    { key: "ciclo_mas5_dias",       label: "C.+5D" },
    { key: "inversion_usd",         label: "INV.$",    fmt: fmtUsd,             color: C.violet },
    { key: "cpl",                   label: "CPL",      fmt: v=>`$${fmt2(v)}`,   color: C.violet },
    { key: "costo_activa",          label: "C.ACTIVA", fmt: v=>`$${fmt2(v)}` },
    { key: "pct_atc",               label: "% ATC",    fmt: fmtPct, pct: true },
    { key: "pct_negociable",        label: "% NEGOC.", fmt: fmtPct },
    { key: "efectividad_total",     label: "% EFECT.", fmt: fmtPct, pct: true },
  ];

  if (loading) return <div className="text-center py-20 text-slate-400 text-sm font-medium">Cargando datos...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Leads"         value={totP.n_leads      ?? "—"} icon="👥" color={C.primary} />
        <KpiCard label="Negociables"   value={totP.negociables  ?? "—"} icon="🤝" color={C.success} />
        <KpiCard label="Ing. JOT"      value={totP.ingreso_jot  ?? "—"} icon="📋" color={C.cyan} />
        <KpiCard label="Activos"       value={totP.activos_mes  ?? "—"} icon="✅" color={C.success} />
        <KpiCard label="Inversión"     value={totP.inversion_usd ? fmtUsd(totP.inversion_usd) : "—"} icon="💰" color={C.violet} />
        <KpiCard label="% Efectividad" value={totP.efectividad_total ? fmtPct(totP.efectividad_total) : "—"} icon="📈" color={C.warning} />
      </div>

      <Card>
        <CardHeader title="Métricas Diarias" subtitle="mv_monitoreo_publicidad" accent={C.primary}
          badge={<span className="text-[9px] font-black px-3 py-1 rounded-full" style={{ background:`${C.primary}12`, color:C.primary }}>{diasP.length} días</span>} />
        <div className="overflow-auto max-h-96">
          {diasP.length === 0
            ? <div className="text-center py-12 text-slate-400 text-xs">Sin datos para el período</div>
            : (
              <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b-2 border-slate-200 text-slate-500 font-black uppercase">
                    {cols.map(c => <th key={c.key} className="px-3 py-2 border-r border-slate-100 text-center last:border-r-0">{c.label}</th>)}
                  </tr>
                  <tr className="border-b-2 border-blue-100" style={{ background:`${C.primary}06` }}>
                    {cols.map(c => {
                      const raw = totP[c.key];
                      const display = c.fmt ? c.fmt(raw ?? 0) : (raw ?? "—");
                      return (
                        <td key={c.key} className="px-3 py-2 border-r border-slate-100 text-center last:border-r-0 font-black"
                          style={c.key==="fecha" ? {color:C.primary} : c.pct ? pctStyle(raw) : {color:c.color||C.slate}}>
                          {c.key==="fecha" ? "▶ TOTAL" : display}
                        </td>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {diasP.map((row, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      {cols.map(c => {
                        const raw = row[c.key];
                        const display = c.fmt ? c.fmt(raw ?? 0) : (raw ?? "—");
                        return (
                          <td key={c.key} className="px-3 py-1.5 border-r border-slate-100 text-center last:border-r-0"
                            style={c.key==="fecha" ? {color:C.primary,fontWeight:800} : c.pct ? pctStyle(raw) : {color:c.color||C.slate}}>
                            {display}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Por Ciudad" accent={C.cyan}
            badge={<VistaToggle value={vistaCity} onChange={setVistaCity} color={C.cyan}
              options={[{value:"resumen",label:"Resumen"},{value:"detalle",label:"Detalle"}]} />} />
          <div className="overflow-auto max-h-72">
            <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr className="text-slate-500 font-black uppercase">
                  {(vistaCity==="resumen"
                    ? ["CIUDAD","PROVINCIA","LEADS","ACTIVOS","ING.JOT","% ACTIVOS"]
                    : ["FECHA","CIUDAD","LEADS","ACTIVOS","% ACTIVOS"]
                  ).map(h=><th key={h} className="px-3 py-2 border-r border-slate-100 text-center last:border-r-0">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(vistaCity==="resumen" ? ciudad?.totales||[] : ciudad?.data||[]).map((row,i)=>(
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    {vistaCity==="resumen" ? <>
                      <td className="px-3 py-1.5 border-r border-slate-100 font-black" style={{color:C.cyan}}>{row.ciudad}</td>
                      <td className="px-3 py-1.5 border-r border-slate-100 text-slate-500">{row.provincia}</td>
                      <td className="px-3 py-1.5 border-r border-slate-100 text-center text-slate-700">{row.total_leads}</td>
                      <td className="px-3 py-1.5 border-r border-slate-100 text-center font-black" style={{color:C.success}}>{row.activos}</td>
                      <td className="px-3 py-1.5 border-r border-slate-100 text-center text-slate-700">{row.ingresos_jot}</td>
                      <td className="px-3 py-1.5 text-center font-black" style={pctStyle(row.pct_activos)}>{row.pct_activos}%</td>
                    </> : <>
                      <td className="px-3 py-1.5 border-r border-slate-100 font-black" style={{color:C.primary}}>{formatFecha(row.fecha)}</td>
                      <td className="px-3 py-1.5 border-r border-slate-100 font-black" style={{color:C.cyan}}>{row.ciudad}</td>
                      <td className="px-3 py-1.5 border-r border-slate-100 text-center text-slate-700">{row.total_leads}</td>
                      <td className="px-3 py-1.5 border-r border-slate-100 text-center font-black" style={{color:C.success}}>{row.activos}</td>
                      <td className="px-3 py-1.5 text-center font-black" style={pctStyle(row.pct_activos)}>{row.pct_activos}%</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Motivos ATC" accent={C.danger}
            badge={<VistaToggle value={vistaAtc} onChange={setVistaAtc} color={C.danger}
              options={[{value:"resumen",label:"Resumen"},{value:"detalle",label:"Detalle"}]} />} />
          <div className="overflow-auto max-h-72">
            {vistaAtc==="resumen" ? (
              <div className="p-4 space-y-2.5">
                {(atc?.totales||[]).map((row,i)=>{
                  const total=(atc?.totales||[]).reduce((a,r)=>a+Number(r.cantidad||0),0);
                  const pct=total>0?((Number(row.cantidad)/total)*100).toFixed(1):0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="text-[9px] font-bold text-slate-600 w-40 truncate">{row.motivo_atc}</div>
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-1.5 rounded-full" style={{width:`${pct}%`,background:C.danger}} />
                      </div>
                      <div className="text-[9px] font-black w-8 text-right" style={{color:C.danger}}>{row.cantidad}</div>
                      <div className="text-[9px] text-slate-400 w-10 text-right">{pct}%</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                  <tr className="text-slate-500 font-black uppercase">
                    {["FECHA","MOTIVO","CANTIDAD"].map(h=><th key={h} className="px-3 py-2 border-r border-slate-100 text-center last:border-r-0">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(atc?.data||[]).map((row,i)=>(
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-1.5 border-r border-slate-100 font-black" style={{color:C.primary}}>{formatFecha(row.fecha)}</td>
                      <td className="px-3 py-1.5 border-r border-slate-100 font-bold" style={{color:C.danger}}>{row.motivo_atc}</td>
                      <td className="px-3 py-1.5 text-center font-black text-slate-800">{row.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Leads por Hora" accent={C.violet}
          badge={<VistaToggle value={vistaHora} onChange={setVistaHora} color={C.violet}
            options={[{value:"resumen",label:"Resumen"},{value:"detalle",label:"Detalle"}]} />} />
        <div className="overflow-auto max-h-72">
          <table className="text-[9px] font-mono border-collapse w-full whitespace-nowrap">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-500 font-black uppercase">
                {(vistaHora==="resumen" ? ["HORA","LEADS","ATC","% ATC"] : ["FECHA","HORA","LEADS","ATC","% ATC"])
                  .map(h=><th key={h} className="px-3 py-2 border-r border-slate-100 text-center last:border-r-0">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(vistaHora==="resumen" ? hora?.totales||[] : hora?.data||[]).map((row,i)=>(
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                  {vistaHora==="detalle" && <td className="px-3 py-1.5 border-r border-slate-100 font-black" style={{color:C.primary}}>{formatFecha(row.fecha)}</td>}
                  <td className="px-3 py-1.5 border-r border-slate-100 text-center font-black" style={{color:C.violet}}>{String(row.hora).padStart(2,"0")}:00</td>
                  <td className="px-3 py-1.5 border-r border-slate-100 text-center text-slate-700">{row.n_leads}</td>
                  <td className="px-3 py-1.5 border-r border-slate-100 text-center" style={{color:C.danger}}>{row.atc}</td>
                  <td className="px-3 py-1.5 text-center font-black" style={pctStyle(row.pct_atc_hora)}>{row.pct_atc_hora}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — GRÁFICOS GERENCIA
// ══════════════════════════════════════════════════════════════════════════════
function TabGraficos({ data, loading }) {
  const { principal, hora, atc } = data;

  if (loading) return <div className="text-center py-20 text-slate-400 text-sm font-medium">Generando gráficos...</div>;
  if (!principal) return <div className="text-center py-20 text-slate-400 text-sm">Sin datos — aplica un filtro de fechas.</div>;

  const totP    = principal?.totales || {};
  const diasRaw = (principal?.data || []).slice().reverse();

  const diasData = diasRaw.map(d => ({
    fecha:      formatFecha(d.fecha),
    "Leads":    Number(d.n_leads            || 0),
    "Negoc.":   Number(d.negociables         || 0),
    "Ing.JOT":  Number(d.ingreso_jot         || 0),
    "Activos":  Number(d.activos_mes         || 0),
    "ATC":      Number(d.atc_soporte         || 0),
    "V.Subida": Number(d.venta_subida_bitrix  || 0),
    "% Efect":  Number(d.efectividad_total    || 0),
    "% ATC":    Number(d.pct_atc             || 0),
    "Inv.$":    Number(d.inversion_usd       || 0),
    "CPL":      Number(d.cpl                 || 0),
  }));

  const horaData = (hora?.totales || []).map(h => ({
    hora:    `${String(h.hora).padStart(2,"0")}h`,
    "Leads": Number(h.n_leads      || 0),
    "ATC":   Number(h.atc          || 0),
    "% ATC": Number(h.pct_atc_hora || 0),
  }));

  const maxLeads = Math.max(1, ...horaData.map(h => h["Leads"]));
  const maxAtc   = Math.max(1, ...horaData.map(h => h["ATC"]));

  const atcData = (atc?.totales || []).map(a => ({
    name:     (a.motivo_atc || "").length > 22 ? (a.motivo_atc||"").slice(0,20)+"…" : a.motivo_atc,
    Cantidad: Number(a.cantidad || 0),
  }));

  const DIAS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  const heatRaw = {};
  (hora?.data || []).forEach(row => {
    const h   = `${String(row.hora).padStart(2,"0")}h`;
    const fd  = new Date(String(row.fecha).split("T")[0] + "T12:00:00");
    const dow = fd.getDay();
    const dia = DIAS[dow === 0 ? 6 : dow - 1];
    if (!heatRaw[h]) heatRaw[h] = {};
    heatRaw[h][dia] = (heatRaw[h][dia] || 0) + Number(row.n_leads || 0);
  });
  const heatHoras = Object.keys(heatRaw).sort();
  const heatMax   = Math.max(1, ...Object.values(heatRaw).flatMap(v => Object.values(v)));
  const heatColor = (v) => {
    if (!v) return "#f1f5f9";
    const t = v / heatMax;
    if (t > 0.75) return "#1e40af";
    if (t > 0.5)  return "#3b82f6";
    if (t > 0.25) return "#93c5fd";
    return "#dbeafe";
  };

  const embudo = [
    { etapa: "Leads",         valor: Number(totP.n_leads             || 0) },
    { etapa: "Gestionables",  valor: Number(totP.total_gestionables  || 0) },
    { etapa: "Negociables",   valor: Number(totP.negociables         || 0) },
    { etapa: "V. Subida CRM", valor: Number(totP.venta_subida_bitrix || 0) },
    { etapa: "Ing. JOT",      valor: Number(totP.ingreso_jot         || 0) },
    { etapa: "Activos mes",   valor: Number(totP.activos_mes         || 0) },
  ];

  const pagoData = [
    { name:"Cuenta",   Ingresos:Number(totP.pago_cuenta   ||0), Activas:Number(totP.pago_cuenta_activa  ||0) },
    { name:"Efectivo", Ingresos:Number(totP.pago_efectivo ||0), Activas:Number(totP.pago_efectivo_activa||0) },
    { name:"Tarjeta",  Ingresos:Number(totP.pago_tarjeta  ||0), Activas:Number(totP.pago_tarjeta_activa ||0) },
  ];

  const cicloData = [
    { ciclo:"0d",  valor:Number(totP.ciclo_0_dias   ||0) },
    { ciclo:"1d",  valor:Number(totP.ciclo_1_dia    ||0) },
    { ciclo:"2d",  valor:Number(totP.ciclo_2_dias   ||0) },
    { ciclo:"3d",  valor:Number(totP.ciclo_3_dias   ||0) },
    { ciclo:"4d",  valor:Number(totP.ciclo_4_dias   ||0) },
    { ciclo:"+5d", valor:Number(totP.ciclo_mas5_dias||0) },
  ];
  const cicloColors = [C.success, C.cyan, C.primary, C.warning, C.danger, "#7c3aed"];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Evolución del Funnel Diario" accent={C.primary} subtitle="Leads · Negociables · Ingresos JOT · Activos" />
        <div className="p-5">
          <ResponsiveContainer width="100%" height={270}>
            <AreaChart data={diasData} margin={{top:5,right:10,left:0,bottom:5}}>
              <defs>
                {[["l",C.primary],["n",C.success],["j",C.cyan],["a","#10b981"]].map(([id,c])=>(
                  <linearGradient key={id} id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={c} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={c} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="fecha" tick={{fontSize:9,fill:C.muted}} />
              <YAxis tick={{fontSize:9,fill:C.muted}} width={32} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{fontSize:10}} />
              <Area type="monotone" dataKey="Leads"   stroke={C.primary} fill="url(#gl)" strokeWidth={2} dot={{r:2.5}} />
              <Area type="monotone" dataKey="Negoc."  stroke={C.success} fill="url(#gn)" strokeWidth={2} dot={{r:2.5}} />
              <Area type="monotone" dataKey="Ing.JOT" stroke={C.cyan}    fill="url(#gj)" strokeWidth={2} dot={{r:2.5}} />
              <Area type="monotone" dataKey="Activos" stroke="#10b981"   fill="url(#ga)" strokeWidth={2} dot={{r:2.5}} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="% Efectividad vs % ATC" accent={C.warning} subtitle="Indicadores de calidad diarios" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={diasData} margin={{top:5,right:10,left:0,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="fecha" tick={{fontSize:9,fill:C.muted}} />
                <YAxis tick={{fontSize:9,fill:C.muted}} width={35} unit="%" domain={[0,100]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{fontSize:10}} />
                <Line type="monotone" dataKey="% Efect" stroke={C.success} strokeWidth={2.5} dot={{r:3}} activeDot={{r:5}} />
                <Line type="monotone" dataKey="% ATC"   stroke={C.danger}  strokeWidth={2.5} dot={{r:3}} strokeDasharray="5 3" activeDot={{r:5}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Inversión & CPL Diario" accent={C.violet} subtitle="Costo de adquisición por día" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={diasData} margin={{top:5,right:10,left:0,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="fecha" tick={{fontSize:9,fill:C.muted}} />
                <YAxis yAxisId="l" tick={{fontSize:9,fill:C.muted}} width={42} />
                <YAxis yAxisId="r" orientation="right" tick={{fontSize:9,fill:C.muted}} width={35} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{fontSize:10}} />
                <Bar  yAxisId="l" dataKey="Inv.$" fill={C.violet} radius={[4,4,0,0]} opacity={0.8} />
                <Line yAxisId="r" type="monotone" dataKey="CPL" stroke={C.warning} strokeWidth={2.5} dot={{r:3}} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Leads por Hora del Día" accent={C.cyan} subtitle="Acumulado del período" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={horaData} margin={{top:5,right:10,left:0,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="hora" tick={{fontSize:8,fill:C.muted}} />
                <YAxis tick={{fontSize:9,fill:C.muted}} width={30} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Leads" radius={[4,4,0,0]}>
                  {horaData.map((d,i) => <Cell key={i} fill={d["Leads"]===maxLeads ? C.primary : "#93c5fd"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Soporte ATC por Hora" accent={C.danger} subtitle="Horarios de mayor demanda ATC" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={horaData} margin={{top:5,right:10,left:0,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="hora" tick={{fontSize:8,fill:C.muted}} />
                <YAxis tick={{fontSize:9,fill:C.muted}} width={30} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ATC" radius={[4,4,0,0]}>
                  {horaData.map((d,i) => <Cell key={i} fill={d["ATC"]===maxAtc ? C.danger : "#fca5a5"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {heatHoras.length > 0 && (
        <Card>
          <CardHeader title="Mapa de Calor — Leads · Hora × Día de Semana" accent={C.primary} subtitle="Identifica los horarios de mayor tráfico por día" />
          <div className="p-5 overflow-auto">
            <div className="inline-flex gap-1.5 text-[8px]">
              <div className="flex flex-col gap-1.5">
                <div className="h-7" />
                {heatHoras.map(h => (
                  <div key={h} className="h-8 w-9 flex items-center justify-end pr-1 font-black text-slate-400">{h}</div>
                ))}
              </div>
              {DIAS.map(dia => (
                <div key={dia} className="flex flex-col gap-1.5">
                  <div className="h-7 w-12 flex items-center justify-center font-black text-slate-500 uppercase text-[8px]">{dia}</div>
                  {heatHoras.map(h => {
                    const v = heatRaw[h]?.[dia] || 0;
                    return (
                      <div key={h} title={`${h} ${dia}: ${v} leads`}
                        className="h-8 w-12 rounded-lg flex items-center justify-center font-black cursor-default transition-all hover:opacity-80"
                        style={{ background: heatColor(v), color: v/heatMax > 0.45 ? "#fff" : C.slate }}>
                        {v > 0 ? v : ""}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-4 text-[9px] text-slate-400">
              <span className="font-medium">Bajo</span>
              {["#dbeafe","#93c5fd","#3b82f6","#1e40af"].map(c => (
                <div key={c} className="w-8 h-3 rounded" style={{background:c}} />
              ))}
              <span className="font-medium">Alto</span>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Ranking Motivos ATC" accent={C.danger} subtitle="Acumulado del período" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={atcData} layout="vertical" margin={{top:5,right:30,left:5,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{fontSize:9,fill:C.muted}} />
                <YAxis type="category" dataKey="name" tick={{fontSize:8,fill:C.muted}} width={130} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Cantidad" fill={C.danger} radius={[0,4,4,0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Embudo de Conversión" accent={C.success} subtitle="Del lead al activo" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={embudo} layout="vertical" margin={{top:5,right:30,left:5,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{fontSize:9,fill:C.muted}} />
                <YAxis type="category" dataKey="etapa" tick={{fontSize:9,fill:C.muted}} width={120} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="valor" radius={[0,4,4,0]}>
                  {embudo.map((_,i) => <Cell key={i} fill={ETAPAS_COLORS[i]} opacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Forma de Pago" accent={C.cyan} subtitle="Ingresos JOT vs Activos por tipo" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={pagoData} margin={{top:5,right:10,left:0,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{fontSize:10,fill:C.muted}} />
                <YAxis tick={{fontSize:9,fill:C.muted}} width={30} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{fontSize:10}} />
                <Bar dataKey="Ingresos" fill={C.cyan}    radius={[4,4,0,0]} opacity={0.9} />
                <Bar dataKey="Activas"  fill={C.success} radius={[4,4,0,0]} opacity={0.9} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Ciclo de Venta" accent={C.violet} subtitle="Días entre lead e ingreso JOT" />
          <div className="p-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={cicloData} margin={{top:5,right:10,left:0,bottom:5}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="ciclo" tick={{fontSize:10,fill:C.muted}} />
                <YAxis tick={{fontSize:9,fill:C.muted}} width={30} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="valor" radius={[4,4,0,0]}>
                  {cicloData.map((_,i) => <Cell key={i} fill={cicloColors[i]} opacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — METAS VS LOGROS
// ══════════════════════════════════════════════════════════════════════════════

function MetaInput({ label, value, onChange, prefix = "", suffix = "", placeholder = "0" }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 truncate">{label}</label>
      <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white focus-within:border-blue-400 transition-all">
        {prefix && <span className="px-2 text-[10px] font-black text-slate-400 bg-slate-50 border-r border-slate-100">{prefix}</span>}
        <input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-2 py-1.5 text-[11px] font-bold text-slate-700 outline-none bg-white min-w-0" />
        {suffix && <span className="px-2 text-[10px] font-black text-slate-400 bg-slate-50 border-l border-slate-100">{suffix}</span>}
      </div>
    </div>
  );
}

function colorDiff(diff, invertir) {
  if (diff === null || diff === undefined || isNaN(Number(diff))) return C.slate;
  const n = Number(diff);
  if (n === 0) return C.slate;
  return (invertir ? n < 0 : n > 0) ? C.success : C.danger;
}

function buildFilas(canal, metas) {
  const leads = Number(canal.total_leads || 0), sac = Number(canal.leads_sac || 0);
  const calidad = Number(canal.leads_calidad || 0), ventas = Number(canal.venta_subida || 0);
  const jot = Number(canal.ingreso_jot || 0), inversion = Number(canal.inversion_usd || 0);
  const pctSac = leads > 0 ? (sac/leads)*100 : 0;
  const pctCal = leads > 0 ? (calidad/leads)*100 : 0;
  const pctVen = leads > 0 ? (ventas/leads)*100 : 0;
  const pctJot = leads > 0 ? (jot/leads)*100 : 0;
  const cplReal    = leads  > 0 && inversion > 0 ? inversion/leads   : null;
  const cplGReal   = calidad> 0 && inversion > 0 ? inversion/calidad : null;
  const cpaReal    = ventas > 0 && inversion > 0 ? inversion/ventas  : null;
  const cpaJotReal = jot    > 0 && inversion > 0 ? inversion/jot     : null;
  const mLeads=Number(metas.leads_totales||0), mPctSac=Number(metas.pct_sac||0);
  const mPctCal=Number(metas.pct_calidad||0), mPctVen=Number(metas.pct_ventas||0);
  const mPctJot=Number(metas.pct_ventas_jot||0), mPresu=Number(metas.presupuesto||0);
  const mCtr=Number(metas.ctr||0), mCpl=Number(metas.cpl||0), mCplG=Number(metas.cpl_gest||0);
  const mCpa=Number(metas.cpa||0), mCpaJot=Number(metas.cpa_jot||0);
  const d=(logro,meta)=>(meta>0&&logro!==null)?logro-meta:null;
  const p=(logro,meta)=>(meta>0&&logro!==null)?(logro/meta)*100:null;
  return [
    { label:"LEADS TOTALES", objetivo:mLeads>0?mLeads:null, logro:leads, diff:d(leads,mLeads), pct:p(leads,mLeads), fmtO:v=>String(Math.round(v)), fmtL:v=>String(Math.round(v)), fmtD:v=>v>=0?`+${Math.round(v)}`:String(Math.round(v)), fmtP:v=>`${v.toFixed(2)}%`, invertir:false, rowBg:"" },
    { label:"LEADS SAC / ATC", objetivo:mPctSac>0?mPctSac:null, logro:sac, logroSub:`${pctSac.toFixed(1)}%`, diff:d(pctSac,mPctSac), pct:mPctSac>0?pctSac-mPctSac:null, fmtO:v=>`${Number(v).toFixed(2)}%`, fmtL:v=>String(Math.round(v)), fmtD:v=>v>=0?`+${v.toFixed(2)}%`:`${v.toFixed(2)}%`, fmtP:v=>`${v.toFixed(2)}%`, invertir:true, rowBg:"" },
    { label:"LEADS CALIDAD", objetivo:mPctCal>0?mPctCal:null, logro:calidad, logroSub:`${pctCal.toFixed(1)}%`, diff:d(pctCal,mPctCal), pct:mPctCal>0?pctCal-mPctCal:null, fmtO:v=>`${Number(v).toFixed(2)}%`, fmtL:v=>String(Math.round(v)), fmtD:v=>v>=0?`+${v.toFixed(2)}%`:`${v.toFixed(2)}%`, fmtP:v=>`${v.toFixed(2)}%`, invertir:false, rowBg:"" },
    { label:"VENTAS", objetivo:mPctVen>0?mPctVen:null, logro:ventas, logroSub:`${pctVen.toFixed(1)}%`, diff:d(pctVen,mPctVen), pct:mPctVen>0?pctVen-mPctVen:null, fmtO:v=>`${Number(v).toFixed(2)}%`, fmtL:v=>String(Math.round(v)), fmtD:v=>v>=0?`+${v.toFixed(2)}%`:`${v.toFixed(2)}%`, fmtP:v=>`${v.toFixed(2)}%`, invertir:false, rowBg:"" },
    { label:"VENTAS JOT", objetivo:mPctJot>0?mPctJot:null, logro:jot, logroSub:`${pctJot.toFixed(1)}%`, diff:d(pctJot,mPctJot), pct:mPctJot>0?pctJot-mPctJot:null, fmtO:v=>`${Number(v).toFixed(2)}%`, fmtL:v=>String(Math.round(v)), fmtD:v=>v>=0?`+${v.toFixed(2)}%`:`${v.toFixed(2)}%`, fmtP:v=>`${v.toFixed(2)}%`, invertir:false, rowBg:"" },
    { label:"CONSUMO PRESUPUESTO", objetivo:mPresu>0?mPresu:null, logro:inversion>0?inversion:null, diff:mPresu>0&&inversion>0?inversion-mPresu:null, pct:mPresu>0&&inversion>0?(inversion/mPresu)*100:null, fmtO:v=>`$${Number(v).toFixed(2)}`, fmtL:v=>`$${Number(v).toFixed(2)}`, fmtD:v=>v>=0?`+$${v.toFixed(2)}`:`-$${Math.abs(v).toFixed(2)}`, fmtP:v=>`${v.toFixed(2)}%`, invertir:true, rowBg:"bg-violet-50" },
    { label:"CONSUMO + 10%", objetivo:mPresu>0?mPresu*1.1:null, logro:inversion>0?inversion*1.1:null, diff:null, pct:null, fmtO:v=>`$${Number(v).toFixed(2)}`, fmtL:v=>`$${Number(v).toFixed(2)}`, fmtD:()=>"—", fmtP:()=>"—", invertir:false, rowBg:"bg-violet-50" },
    { label:"CTR / OBJETIVO CTR", objetivo:mCtr>0?mCtr:null, logro:null, diff:null, pct:null, fmtO:v=>`${Number(v).toFixed(2)}%`, fmtL:()=>"—", fmtD:()=>"—", fmtP:()=>"—", invertir:false, rowBg:"", esManual:true },
    { label:"CPL / OBJETIVO CPL", objetivo:mCpl>0?mCpl:null, logro:cplReal, diff:mCpl>0&&cplReal!==null?cplReal-mCpl:null, pct:null, fmtO:v=>`$${Number(v).toFixed(2)}`, fmtL:v=>v!==null?`$${Number(v).toFixed(2)}`:"—", fmtD:v=>v>=0?`+$${v.toFixed(2)}`:`-$${Math.abs(v).toFixed(2)}`, fmtP:()=>"—", invertir:true, rowBg:"" },
    { label:"CPL GEST / OBJETIVO CPL GEST", objetivo:mCplG>0?mCplG:null, logro:cplGReal, diff:mCplG>0&&cplGReal!==null?cplGReal-mCplG:null, pct:null, fmtO:v=>`$${Number(v).toFixed(2)}`, fmtL:v=>v!==null?`$${Number(v).toFixed(2)}`:"—", fmtD:v=>v>=0?`+$${v.toFixed(2)}`:`-$${Math.abs(v).toFixed(2)}`, fmtP:()=>"—", invertir:true, rowBg:"" },
    { label:"CPA / OBJETIVO CPA", objetivo:mCpa>0?mCpa:null, logro:cpaReal, diff:mCpa>0&&cpaReal!==null?cpaReal-mCpa:null, pct:null, fmtO:v=>`$${Number(v).toFixed(2)}`, fmtL:v=>v!==null?`$${Number(v).toFixed(2)}`:"—", fmtD:v=>v>=0?`+$${v.toFixed(2)}`:`-$${Math.abs(v).toFixed(2)}`, fmtP:()=>"—", invertir:true, rowBg:"" },
    { label:"CPA JOT / OBJETIVO CPA JOT", objetivo:mCpaJot>0?mCpaJot:null, logro:cpaJotReal, diff:mCpaJot>0&&cpaJotReal!==null?cpaJotReal-mCpaJot:null, pct:null, fmtO:v=>`$${Number(v).toFixed(2)}`, fmtL:v=>v!==null?`$${Number(v).toFixed(2)}`:"—", fmtD:v=>v>=0?`+$${v.toFixed(2)}`:`-$${Math.abs(v).toFixed(2)}`, fmtP:()=>"—", invertir:true, rowBg:"" },
  ];
}

const CANAL_COLORS = [C.primary, C.success, C.warning, C.violet, C.cyan, C.danger];

function TabMetas({ filtro }) {
  const [fechaDesde, setFechaDesde] = useState(filtro.desde);
  const [fechaHasta, setFechaHasta] = useState(filtro.hasta);
  const [modoFecha,  setModoFecha]  = useState("rango");
  const [origenes,   setOrigenes]   = useState([]);
  const [origenesDisp, setOrigenesDisp] = useState([]);
  const [loadingOrig,  setLoadingOrig]  = useState(false);
  const [canales,    setCanales]    = useState([]);
  const [loadingData,setLoadingData] = useState(false);
  const [metas, setMetas] = useState({ leads_totales:"", pct_sac:"", pct_calidad:"", pct_ventas:"", pct_ventas_jot:"", presupuesto:"", ctr:"", cpl:"", cpl_gest:"", cpa:"", cpa_jot:"" });
  const setMeta = (k) => (v) => setMetas((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!fechaDesde || !fechaHasta) return;
    setLoadingOrig(true);
    const params = new URLSearchParams({ fechaDesde, fechaHasta, modo: modoFecha });
    fetch(`${API}/api/redes/monitoreo-metas?${params}`)
      .then(r => r.json()).then(d => { if (d.success) setOrigenesDisp(d.origenes_disponibles || []); })
      .catch(() => {}).finally(() => setLoadingOrig(false));
  }, [fechaDesde, fechaHasta, modoFecha]);

  const handleAplicar = () => {
    if (!fechaDesde || !fechaHasta) return;
    setLoadingData(true);
    const params = new URLSearchParams({ fechaDesde, fechaHasta, modo: modoFecha, origenes: origenes.join(",") });
    fetch(`${API}/api/redes/monitoreo-metas?${params}`)
      .then(r => r.json()).then(d => { if (d.success) setCanales(d.canales || []); })
      .catch(() => {}).finally(() => setLoadingData(false));
  };

  const toggleOrigen = (o) => setOrigenes(prev => prev.includes(o) ? prev.filter(x => x !== o) : [...prev, o]);
  const mPresu = Number(metas.presupuesto || 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Filtros — Metas vs Logros" accent={C.primary} />
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Modo Fecha</span>
            <VistaToggle value={modoFecha} onChange={setModoFecha} color={C.primary} options={[{value:"rango",label:"Rango"},{value:"mes",label:"Por Mes"}]} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {modoFecha === "rango" ? (
              [["Desde",fechaDesde,setFechaDesde],["Hasta",fechaHasta,setFechaHasta]].map(([label,val,setter]) => (
                <div key={label} className="flex flex-col gap-1">
                  <label className="text-[9px] font-black uppercase tracking-widest" style={{color:C.primary}}>{label}</label>
                  <input type="date" value={val} onChange={e=>setter(e.target.value)}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400 bg-white [color-scheme:light]" />
                </div>
              ))
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-widest" style={{color:C.primary}}>Mes</label>
                <input type="month" value={fechaDesde.slice(0,7)}
                  onChange={e=>{setFechaDesde(e.target.value+"-01");setFechaHasta(e.target.value+"-31");}}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:border-blue-400 bg-white [color-scheme:light]" />
              </div>
            )}
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
              Orígenes {loadingOrig && <span className="text-blue-400 normal-case font-medium ml-2">cargando...</span>}
            </div>
            {origenesDisp.length === 0 && !loadingOrig && <p className="text-[9px] text-slate-400 italic">Selecciona un período para ver los orígenes disponibles</p>}
            <div className="flex flex-wrap gap-2">
              {origenesDisp.map((o,idx) => {
                const sel=origenes.includes(o), col=CANAL_COLORS[idx%CANAL_COLORS.length];
                return (
                  <button key={o} onClick={()=>toggleOrigen(o)}
                    className="px-3 py-1 rounded-full text-[9px] font-black uppercase border transition-all"
                    style={sel?{background:col,color:"#fff",borderColor:col}:{background:"#fff",color:C.muted,borderColor:"#e2e8f0"}}>{o}</button>
                );
              })}
            </div>
          </div>
          <button onClick={handleAplicar}
            className="px-6 py-2 rounded-xl text-[10px] font-black uppercase text-white transition-all active:scale-95 shadow-sm"
            style={{background:C.primary}}>{loadingData?"Cargando...":"Aplicar y Calcular"}</button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Ingreso de Objetivos / Metas" accent={C.violet} subtitle="Los logros se calculan automáticamente desde la base de datos" />
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            <MetaInput label="Leads Totales"       value={metas.leads_totales}  onChange={setMeta("leads_totales")}  placeholder="133" />
            <MetaInput label="% SAC / ATC"         value={metas.pct_sac}        onChange={setMeta("pct_sac")}        suffix="%" placeholder="45" />
            <MetaInput label="% Calidad"           value={metas.pct_calidad}    onChange={setMeta("pct_calidad")}    suffix="%" placeholder="60" />
            <MetaInput label="% Ventas"            value={metas.pct_ventas}     onChange={setMeta("pct_ventas")}     suffix="%" placeholder="45" />
            <MetaInput label="% Ventas JOT"        value={metas.pct_ventas_jot} onChange={setMeta("pct_ventas_jot")} suffix="%" placeholder="45" />
            <MetaInput label="Presupuesto $"       value={metas.presupuesto}    onChange={setMeta("presupuesto")}    prefix="$" placeholder="585.20" />
            <MetaInput label="CTR Objetivo %"      value={metas.ctr}            onChange={setMeta("ctr")}            suffix="%" placeholder="35" />
            <MetaInput label="CPL Objetivo $"      value={metas.cpl}            onChange={setMeta("cpl")}            prefix="$" placeholder="4.40" />
            <MetaInput label="CPL Gest Objetivo $" value={metas.cpl_gest}       onChange={setMeta("cpl_gest")}       prefix="$" placeholder="8.00" />
            <MetaInput label="CPA Objetivo $"      value={metas.cpa}            onChange={setMeta("cpa")}            prefix="$" placeholder="22.00" />
            <MetaInput label="CPA JOT Objetivo $"  value={metas.cpa_jot}        onChange={setMeta("cpa_jot")}        prefix="$" placeholder="22.00" />
          </div>
          {mPresu > 0 && <p className="mt-3 text-[9px] text-slate-400 font-medium">💡 Consumo + 10%: <span className="font-black" style={{color:C.violet}}>${(mPresu*1.1).toFixed(2)}</span></p>}
        </div>
      </Card>

      {loadingData && <div className="text-center py-12 text-slate-400 text-sm font-medium">Calculando logros...</div>}

      {!loadingData && canales.length > 0 && (
        <div className="space-y-6">
          {canales.map((canal, idx) => {
            const col = CANAL_COLORS[idx % CANAL_COLORS.length];
            const filas = buildFilas(canal, metas);
            return (
              <Card key={canal.origen}>
                <CardHeader title={`NETLIFE VELSA — ${canal.origen}`} accent={col}
                  subtitle={`${fechaDesde} → ${fechaHasta}`}
                  badge={<span className="text-[9px] font-black px-3 py-1 rounded-full" style={{background:`${col}15`,color:col}}>{canal.total_leads} leads</span>} />
                <div className="overflow-auto">
                  <table className="w-full border-collapse text-[10px] whitespace-nowrap">
                    <thead className="sticky top-0 z-10 bg-slate-50 border-b-2 border-slate-200">
                      <tr>
                        <th className="px-5 py-3 text-left font-black uppercase tracking-widest text-slate-600 border-r border-slate-200 min-w-[220px]">CANAL</th>
                        <th className="px-5 py-3 text-center font-black uppercase tracking-widest border-r border-slate-200 min-w-[140px]" style={{color:C.primary}}>OBJETIVO METAS</th>
                        <th className="px-5 py-3 text-center font-black uppercase tracking-widest border-r border-slate-200 min-w-[140px]" style={{color:C.success}}>LOGRO</th>
                        <th className="px-5 py-3 text-center font-black uppercase tracking-widest border-r border-slate-200 min-w-[130px]" style={{color:C.warning}}>DIFERENCIAL</th>
                        <th className="px-5 py-3 text-center font-black uppercase tracking-widest min-w-[100px]" style={{color:C.violet}}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f, fi) => {
                        const cD = f.diff !== null ? colorDiff(f.diff, f.invertir) : C.slate;
                        const cP = f.pct  !== null ? colorDiff(f.invertir ? -f.pct : f.pct, false) : C.slate;
                        return (
                          <tr key={fi} className={`border-b border-slate-100 transition-colors hover:brightness-[0.97] ${f.rowBg||"bg-white"}`}>
                            <td className={`px-5 py-2.5 font-black text-slate-700 border-r border-slate-200 ${f.rowBg||"bg-white"}`}>{f.label}</td>
                            <td className="px-5 py-2.5 text-center font-bold border-r border-slate-200" style={{color:C.primary}}>
                              {f.objetivo!==null?f.fmtO(f.objetivo):<span className="text-slate-300 text-[9px]">Sin meta</span>}
                            </td>
                            <td className="px-5 py-2.5 text-center font-black border-r border-slate-200" style={{color:f.esManual?C.muted:C.slate}}>
                              {f.esManual?<span className="text-[9px] italic text-slate-400">Externo</span>
                                :f.logro!==null&&f.logro!==undefined?<span>{f.fmtL(f.logro)}{f.logroSub&&<span className="ml-1 text-[8px] text-slate-400">({f.logroSub})</span>}</span>
                                :<span className="text-slate-300 text-[9px]">—</span>}
                            </td>
                            <td className="px-5 py-2.5 text-center font-black border-r border-slate-200" style={{color:cD}}>
                              {f.diff!==null?f.fmtD(f.diff):<span className="text-slate-300 text-[9px]">—</span>}
                            </td>
                            <td className="px-5 py-2.5 text-center font-black" style={{color:cP}}>
                              {f.pct!==null?f.fmtP(f.pct):<span className="text-slate-300 text-[9px]">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-2.5 border-t border-slate-100 flex items-center gap-4 text-[8px] font-bold flex-wrap">
                  <span style={{color:C.success}}>● Verde = supera la meta</span>
                  <span style={{color:C.danger}}>● Rojo = bajo meta</span>
                  <span className="text-slate-300 ml-1">| Costos y SAC/ATC: menor es mejor</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {!loadingData && canales.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="text-4xl">🎯</div>
          <div className="text-sm font-black text-slate-600">Selecciona orígenes y aplica el filtro</div>
          <div className="text-xs text-slate-400 text-center max-w-sm leading-relaxed">
            Elige el período, selecciona uno o más canales, completa los objetivos y presiona "Aplicar y Calcular".
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 5 — PRÓXIMAMENTE
// ══════════════════════════════════════════════════════════════════════════════
function TabProximamente() {
  return (
    <div className="flex flex-col items-center justify-center py-28 gap-5">
      <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center text-4xl shadow-inner">🚀</div>
      <div className="text-xl font-black text-slate-700 tracking-tight">Próximamente</div>
      <div className="text-sm text-slate-400 text-center max-w-sm leading-relaxed">
        Este módulo está en desarrollo. Aquí encontrarás nuevos análisis, reportes comparativos y proyecciones.
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT
// ══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: "general",      label: "Monitoreo General", icon: "📊" },
  { id: "graficos",     label: "Gráficos Gerencia", icon: "📈" },
  { id: "metas",        label: "Metas vs Logros",   icon: "🎯" },
  { id: "reporte",      label: "Reporte Data",       icon: "📑" },
  { id: "proximamente", label: "Próximamente",        icon: "🚀" },
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
    <div className="min-h-screen bg-slate-50 p-5 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5 mb-7">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-base shadow-sm"
              style={{ background: C.primary }}>V</div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Monitoreo Redes</h1>
            <span className="text-[9px] font-black px-2.5 py-1 rounded-full uppercase"
              style={{ background:`${C.success}15`, color:C.success }}>● Live</span>
          </div>
          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest ml-12">
            VELSA NETLIFE — Actualización cada 15 minutos
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm">
          <FiltroPeriodo fechaDesde={fechaDesde} fechaHasta={fechaHasta}
            onChange={(k,v) => k==="fechaDesde" ? setFechaDesde(v) : setFechaHasta(v)}
            onAplicar={handleAplicar} loading={applying||loading} />
          <p className="text-[8px] text-slate-400 font-medium mt-2 uppercase tracking-wide">
            Mostrando: {filtro.desde} → {filtro.hasta}
          </p>
        </div>
      </div>

      <div className="flex gap-1 bg-white border border-slate-200 rounded-2xl p-1 mb-7 w-fit shadow-sm">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all"
            style={tab===t.id
              ? { background:C.primary, color:"#fff", boxShadow:`0 2px 10px ${C.primary}35` }
              : { color:C.muted }}>
            <span className="text-sm">{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab==="general"      && <TabMonitoreoGeneral data={data} loading={loading} />}
      {tab==="graficos"     && <TabGraficos         data={data} loading={loading} />}
      {tab==="metas"        && <TabMetas            filtro={filtro} />}
      {tab==="reporte"      && <TabReporteData />}
      {tab==="proximamente" && <TabProximamente />}
    </div>
  );
}