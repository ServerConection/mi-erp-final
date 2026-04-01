// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  TabAnalisisPautas.jsx — Análisis Avanzado de Pautas VELSA NETLIFE      ║
// ║  ✅ Gauges ICP premium con gradientes                                    ║
// ║  ✅ Scatter CPL vs Efectividad mejorado                                  ║
// ║  ✅ AreaChart tendencia con gradientes                                   ║
// ║  ✅ Barras horizontales ranking con animación                            ║
// ║  ✅ Cuadrante visual con anotaciones                                     ║
// ║  ✅ Insights automáticos con iconos semáforo                             ║
// ║  ✅ Tabla comparativa con mini-barras ICP inline                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { useEffect, useState, useMemo } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LabelList, ReferenceLine,
  ComposedChart,
} from "recharts";

const C = {
  primary: "#1e3a8a", sky: "#0ea5e9", success: "#059669",
  warning: "#f59e0b", danger: "#ef4444", violet: "#7c3aed",
  cyan: "#06b6d4", slate: "#334155", muted: "#64748b",
  light: "#f8fafc", border: "#e2e8f0", orange: "#ea580c",
};

const CANALES = {
  "ARTS":              { color:"#1e3a8a", bg:"#dbeafe", icon:"🎨", label:"ARTS" },
  "ARTS FACEBOOK":     { color:"#1877f2", bg:"#eff6ff", icon:"📘", label:"ARTS FB" },
  "ARTS GOOGLE":       { color:"#ea4335", bg:"#fee2e2", icon:"🔍", label:"ARTS GG" },
  "REMARKETING":       { color:"#7c3aed", bg:"#ede9fe", icon:"🔁", label:"REMARKETING" },
  "VIDIKA GOOGLE":     { color:"#059669", bg:"#d1fae5", icon:"📺", label:"VIDIKA GG" },
  "POR RECOMENDACIÓN": { color:"#f59e0b", bg:"#fef3c7", icon:"🤝", label:"RECOMEND." },
};

const getCfg = c => CANALES[c] || { color:C.muted, bg:"#f8fafc", icon:"•", label:c };

const API       = import.meta.env.VITE_API_URL;
const n         = v => Number(v||0);
const pct       = (a,b) => b>0 ? (a/b)*100 : 0;
const fmt2      = v => `$${n(v).toFixed(2)}`;
const fmtPct    = v => `${n(v).toFixed(1)}%`;
const fmtUsd    = v => `$${n(v).toFixed(0)}`;
const formatF   = f => { if(!f) return "—"; const [,m,d]=String(f).split("T")[0].split("-"); return `${d}/${m}`; };
const semaforo  = (v,u,inv=false) => { const [b,med]=u; if(inv) return v<=b?C.success:v<=med?C.warning:C.danger; return v>=b?C.success:v>=med?C.warning:C.danger; };
const TICKET    = 25;

function calcICP(c, maxCPL) {
  const ef   = pct(c.activos_mes, c.n_leads);
  const tNeg = pct(c.negociables, c.n_leads);
  const tBue = pct(c.n_leads - c.atc_soporte, c.n_leads);
  const cpl  = c.n_leads>0 && c.inversion_usd>0 ? c.inversion_usd/c.n_leads : null;
  const eInv = cpl!==null && maxCPL>0 ? Math.max(0,100-(cpl/maxCPL)*100) : null;
  return Math.min(100, Math.max(0,
    ef*0.40 + tNeg*0.25 + tBue*0.20 + (eInv!==null ? eInv*0.15 : tBue*0.15)
  ));
}

// ─────────────────────────────────────────────────────────────────────────────
// UI ATOMS
// ─────────────────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"80px" }}>
      <div style={{ width:"44px", height:"44px", border:`4px solid ${C.primary}25`,
        borderTopColor:C.primary, borderRadius:"9999px", animation:"spin 0.8s linear infinite" }} />
    </div>
  );
}

function Card({ children, title, subtitle, accent=C.primary, badge, noPad=false, right }) {
  return (
    <div style={{ background:"#fff", borderRadius:"20px", border:`1px solid ${C.border}`,
      overflow:"hidden", boxShadow:"0 4px 24px rgba(0,0,0,0.06)" }}>
      {title && (
        <div style={{ padding:"16px 22px", borderBottom:`1px solid ${C.border}`,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          flexWrap:"wrap", gap:"10px",
          background:`linear-gradient(135deg,${accent}08 0%,#fff 65%)` }}>
          <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
            <div style={{ width:"4px", height:"30px", borderRadius:"9999px",
              background:`linear-gradient(180deg,${accent},${accent}55)`, flexShrink:0 }} />
            <div>
              <div style={{ fontSize:"10px", fontWeight:900, textTransform:"uppercase",
                letterSpacing:"0.15em", color:accent }}>{title}</div>
              {subtitle && <div style={{ fontSize:"8px", color:C.muted, marginTop:"2px" }}>{subtitle}</div>}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:"8px", flexWrap:"wrap" }}>{badge}{right}</div>
        </div>
      )}
      <div style={noPad ? {} : { padding:"20px" }}>{children}</div>
    </div>
  );
}

function KpiCard({ label, value, sub, color, icon, info }) {
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div style={{ background:`linear-gradient(135deg,${color}12,${color}04)`,
      borderRadius:"16px", border:`1px solid ${color}25`, padding:"16px 18px",
      boxShadow:`0 4px 20px ${color}10`, position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", right:"-10px", top:"-10px", width:"60px", height:"60px",
        borderRadius:"50%", background:`${color}07`, pointerEvents:"none" }} />
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:"8px" }}>
        <div style={{ width:"36px", height:"36px", borderRadius:"10px", background:`${color}20`,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:"18px" }}>{icon}</div>
        {info && (
          <button onClick={()=>setShowInfo(!showInfo)}
            style={{ width:"18px", height:"18px", borderRadius:"50%", border:`1px solid ${C.border}`,
              background:C.light, cursor:"pointer", fontSize:"9px", fontWeight:900, color:C.muted,
              display:"flex", alignItems:"center", justifyContent:"center" }}>?</button>
        )}
      </div>
      <div style={{ fontSize:"8px", fontWeight:900, color:`${color}90`, textTransform:"uppercase",
        letterSpacing:"0.1em", marginBottom:"2px" }}>{label}</div>
      <div style={{ fontSize:"22px", fontWeight:900, color, lineHeight:1.1 }}>{value}</div>
      {sub && <div style={{ fontSize:"8px", color:C.muted, marginTop:"4px" }}>{sub}</div>}
      {showInfo && info && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:20, marginTop:"4px",
          padding:"10px 14px", background:"#fff", borderRadius:"12px", border:`1px solid ${C.border}`,
          boxShadow:"0 8px 24px rgba(0,0,0,0.12)", fontSize:"8px", lineHeight:1.5, color:C.slate }}>
          {info}
          <button onClick={()=>setShowInfo(false)} style={{ marginLeft:"6px", fontWeight:900, color:C.danger, background:"none", border:"none", cursor:"pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ── Gauge premium con gradiente ─────────────────────────────────────────────
function GaugePremium({ valor, label, color, size=90, sublabel }) {
  const r = size/2-9;
  const circ = 2*Math.PI*r;
  const p = Math.min(valor/100,1);
  const dash = p*circ*0.75;
  const id = `gp_${label.replace(/\W/g,"")}`;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"4px" }}>
      <div style={{ position:"relative" }}>
        <svg width={size} height={size}>
          <defs>
            <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="1" />
            </linearGradient>
            <filter id={`glow${id}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          {/* Track */}
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`${color}18`} strokeWidth={8}
            strokeDasharray={`${circ*0.75} ${circ*0.25}`} strokeLinecap="round"
            transform={`rotate(-225 ${size/2} ${size/2})`} />
          {/* Progress */}
          <circle cx={size/2} cy={size/2} r={r} fill="none"
            stroke={`url(#${id})`} strokeWidth={8}
            strokeDasharray={`${dash} ${circ-dash+circ*0.25}`} strokeLinecap="round"
            transform={`rotate(-225 ${size/2} ${size/2})`}
            filter={`url(#glow${id})`}
            style={{ transition:"stroke-dasharray 0.7s cubic-bezier(.4,0,.2,1)" }} />
          {/* Valor */}
          <text x={size/2} y={size/2-2} textAnchor="middle" dominantBaseline="central"
            fontSize={14} fontWeight={900} fill={color}>{valor.toFixed(0)}</text>
          <text x={size/2} y={size/2+13} textAnchor="middle" fontSize={8} fill={C.muted}>/100</text>
        </svg>
        {/* Punto indicador */}
        <div style={{
          position:"absolute", bottom:"4px", left:"50%", transform:"translateX(-50%)",
          width:"8px", height:"3px", borderRadius:"9999px", background:color,
          boxShadow:`0 0 6px ${color}`,
        }} />
      </div>
      <div style={{ fontSize:"7.5px", fontWeight:900, color:C.muted, textTransform:"uppercase",
        textAlign:"center", maxWidth:size+14, lineHeight:1.3 }}>{label}</div>
      {sublabel && <div style={{ fontSize:"7px", color:C.muted, textAlign:"center" }}>{sublabel}</div>}
    </div>
  );
}

// ── Tooltip dark ────────────────────────────────────────────────────────────
const DarkTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"linear-gradient(135deg,#0f172a,#1e293b)", border:"1px solid #334155",
      borderRadius:"14px", padding:"12px 16px", fontSize:"10px", minWidth:"170px",
      boxShadow:"0 20px 50px rgba(0,0,0,0.55)" }}>
      <div style={{ color:"#f1f5f9", fontWeight:900, marginBottom:"7px",
        borderBottom:"1px solid #334155", paddingBottom:"5px",
        textTransform:"uppercase", letterSpacing:"0.08em", fontSize:"9px" }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:"14px", marginBottom:"3px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"5px" }}>
            <div style={{ width:"7px", height:"7px", borderRadius:"50%", background:p.color||p.fill, flexShrink:0 }} />
            <span style={{ color:"#64748b" }}>{p.name}</span>
          </div>
          <span style={{ color:p.color||"#f1f5f9", fontWeight:900 }}>
            {typeof p.value==="number" ? (p.value%1!==0 ? p.value.toFixed(2) : p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── Toggle de vistas ────────────────────────────────────────────────────────
function Toggle({ value, onChange, options, color=C.primary }) {
  return (
    <div style={{ display:"flex", borderRadius:"10px", overflow:"hidden", border:`1px solid ${C.border}` }}>
      {options.map(o => (
        <button key={o.v} onClick={()=>onChange(o.v)} style={{
          padding:"5px 14px", fontSize:"8px", fontWeight:900,
          textTransform:"uppercase", border:"none", cursor:"pointer",
          background:value===o.v?color:"#fff",
          color:value===o.v?"#fff":C.muted,
          transition:"all 0.15s",
        }}>{o.l}</button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLA COMPARATIVA — con mini-barra ICP inline
// ─────────────────────────────────────────────────────────────────────────────
function TablaComparativa({ metricas }) {
  const [ord, setOrd] = useState({ col:"icp", dir:"desc" });
  const toggle = col => setOrd(p => p.col===col ? { col, dir:p.dir==="desc"?"asc":"desc" } : { col, dir:"desc" });

  const cols = [
    { k:"canal",   l:"CANAL",         fmt:(v)=>{const c=getCfg(v);return <span style={{ padding:"2px 8px", borderRadius:"9999px", background:c.bg, color:c.color, fontWeight:900, fontSize:"7.5px", border:`1px solid ${c.color}30`, display:"inline-flex", gap:"3px", alignItems:"center" }}>{c.icon}{c.label}</span>;} },
    { k:"n_leads", l:"LEADS",         color:C.primary },
    { k:"tContacto",l:"T.CONTACTO",  fmt:fmtPct, cf:v=>semaforo(v,[50,35]) },
    { k:"negociables",l:"NEGOC.",     color:C.success },
    { k:"atc_soporte",l:"ATC",        color:C.danger },
    { k:"pctAtc",  l:"%ATC",          fmt:fmtPct, cf:v=>semaforo(v,[40,25],true) },
    { k:"venta_subida_bitrix",l:"V.SUB.", color:C.sky },
    { k:"activos_mes",l:"ACTIVOS",    color:C.success },
    { k:"efect",   l:"%EFECT.",       fmt:fmtPct, cf:v=>semaforo(v,[15,8]) },
    { k:"cpl",     l:"CPL",           fmt:v=>v!==null?fmt2(v):"—", cf:v=>v!==null?semaforo(v,[4,8],true):C.muted },
    { k:"cpActivado",l:"CP ACTIV.",   fmt:v=>v!==null?fmt2(v):"—", cf:v=>v!==null?semaforo(v,[20,40],true):C.muted },
    { k:"roas",    l:"ROAS",          fmt:v=>v!==null?`${v.toFixed(1)}x`:"—", cf:v=>v!==null?semaforo(v,[3,1.5]):C.muted },
    { k:"inversion_usd",l:"INV.",     fmt:fmtUsd, color:C.violet },
    { k:"icp",     l:"ICP ★",         fmt:v=>v.toFixed(0), cf:v=>semaforo(v,[60,35]) },
  ];

  const sorted = [...metricas].sort((a,b) => {
    const va=a[ord.col]??-1, vb=b[ord.col]??-1;
    return ord.dir==="desc"?vb-va:va-vb;
  });

  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ fontSize:"9px", fontFamily:"monospace", borderCollapse:"collapse", width:"100%", whiteSpace:"nowrap" }}>
        <thead style={{ position:"sticky", top:0, background:C.light, borderBottom:`2px solid ${C.border}`, zIndex:10 }}>
          <tr>
            {cols.map(c => (
              <th key={c.k} onClick={()=>c.k!=="canal"&&toggle(c.k)}
                style={{ padding:"9px 12px", borderRight:`1px solid ${C.border}`,
                  textAlign:"center", fontWeight:900, fontSize:"8px",
                  textTransform:"uppercase", letterSpacing:"0.05em",
                  color:ord.col===c.k?C.primary:C.muted,
                  cursor:c.k!=="canal"?"pointer":"default",
                  background:ord.col===c.k?`${C.primary}06`:"transparent" }}>
                {c.l}{ord.col===c.k?(ord.dir==="desc"?" ▼":" ▲"):""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row,i) => (
            <tr key={row.canal} style={{ borderBottom:`1px solid ${C.border}`,
              background:i===0&&ord.col==="icp"?`${C.success}05`:"#fff" }}>
              {cols.map(c => {
                const val = row[c.k];
                const color = c.cf ? c.cf(val) : c.color;
                return (
                  <td key={c.k} style={{ padding:"9px 12px", borderRight:`1px solid ${C.border}`,
                    textAlign:"center", color:color||C.slate,
                    fontWeight:c.k==="icp"?900:500 }}>
                    {c.k==="icp" ? (
                      <div>
                        <div style={{ fontWeight:900, color }}>{n(val).toFixed(0)}</div>
                        <div style={{ height:"3px", borderRadius:"9999px", marginTop:"3px",
                          background:`${color}20`, width:"60px", margin:"3px auto 0" }}>
                          <div style={{ width:`${Math.min(n(val),100)}%`, height:"100%",
                            background:color, borderRadius:"9999px" }} />
                        </div>
                      </div>
                    ) : c.fmt ? c.fmt(val,row) : (val??'—')}
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
// RADAR
// ─────────────────────────────────────────────────────────────────────────────
function RadarPautas({ metricas }) {
  const radarData = [
    { dim:"Efectividad" }, { dim:"Contacto" },
    { dim:"Sin ATC" }, { dim:"V. Subida" }, { dim:"ICP" },
  ].map(({ dim }) => {
    const e = { dim };
    metricas.forEach(m => {
      if (dim==="Efectividad")  e[m.canal] = m.efect;
      else if (dim==="Contacto") e[m.canal] = m.tContacto;
      else if (dim==="Sin ATC")  e[m.canal] = m.pctBuena;
      else if (dim==="V. Subida") e[m.canal] = m.pctVenta;
      else e[m.canal] = m.icp;
    });
    return e;
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={radarData} margin={{ top:10, right:30, bottom:10, left:30 }}>
        <PolarGrid stroke={C.border} />
        <PolarAngleAxis dataKey="dim" tick={{ fontSize:9, fill:C.muted, fontWeight:700 }} />
        <PolarRadiusAxis domain={[0,100]} tick={{ fontSize:7, fill:C.muted }} tickCount={4} />
        {metricas.map(m => (
          <Radar key={m.canal} name={getCfg(m.canal).label} dataKey={m.canal}
            stroke={getCfg(m.canal).color} fill={getCfg(m.canal).color}
            fillOpacity={0.10} strokeWidth={2.5}
            dot={{ r:4, fill:getCfg(m.canal).color }} />
        ))}
        <Legend wrapperStyle={{ fontSize:9 }} />
        <Tooltip content={<DarkTip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCATTER CPL vs Efectividad — premium
// ─────────────────────────────────────────────────────────────────────────────
function ScatterPremium({ metricas }) {
  const conInv = metricas.filter(m => m.cpl!==null);
  if (!conInv.length) return (
    <div style={{ textAlign:"center", padding:"60px", color:C.muted, fontSize:"10px" }}>
      Sin datos de inversión para este período
    </div>
  );
  const avgEf  = conInv.reduce((s,m)=>s+m.efect,0)/conInv.length;
  const avgCpl = conInv.reduce((s,m)=>s+m.cpl,0)/conInv.length;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top:20, right:30, bottom:40, left:10 }}>
        <defs>
          {conInv.map(m => (
            <radialGradient key={m.canal} id={`sc${m.canal.replace(/\W/g,"")}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={getCfg(m.canal).color} stopOpacity="0.9" />
              <stop offset="100%" stopColor={getCfg(m.canal).color} stopOpacity="0.4" />
            </radialGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis type="number" dataKey="cpl" name="CPL $" tick={{ fontSize:9, fill:C.muted }}
          tickFormatter={v=>`$${v.toFixed(2)}`}
          label={{ value:"← CPL más barato mejor →", position:"insideBottom", offset:-28, fontSize:8, fill:C.muted }} />
        <YAxis type="number" dataKey="efect" name="Efectividad %" tick={{ fontSize:9, fill:C.muted }} unit="%"
          label={{ value:"Efectividad %", angle:-90, position:"insideLeft", fontSize:8, fill:C.muted, dy:50 }} />
        <ReferenceLine x={avgCpl} stroke={`${C.muted}50`} strokeDasharray="5 3"
          label={{ value:`Avg $${avgCpl.toFixed(2)}`, fontSize:7, fill:C.muted, position:"top" }} />
        <ReferenceLine y={avgEf} stroke={`${C.muted}50`} strokeDasharray="5 3"
          label={{ value:`Avg ${avgEf.toFixed(1)}%`, fontSize:7, fill:C.muted, position:"right" }} />
        <Tooltip content={({ active, payload }) => {
          if(!active||!payload?.length) return null;
          const d=payload[0]?.payload;
          const cfg=getCfg(d?.canal);
          return (
            <div style={{ background:"linear-gradient(135deg,#0f172a,#1e293b)", border:"1px solid #334155",
              borderRadius:"14px", padding:"14px 18px", fontSize:"9px" }}>
              <div style={{ color:cfg.color, fontWeight:900, marginBottom:"6px", fontSize:"11px" }}>
                {cfg.icon} {cfg.label}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
                {[
                  ["CPL",`$${d?.cpl?.toFixed(2)}`,C.violet],
                  ["Efectividad",`${d?.efect?.toFixed(1)}%`,C.success],
                  ["Leads",d?.n_leads,C.sky],["ICP",d?.icp?.toFixed(0),semaforo(d?.icp,[60,35])],
                  ["Inversión",fmtUsd(d?.inversion_usd),C.violet],
                  ["CP Activ.",d?.cpActivado?fmt2(d.cpActivado):"—",C.orange],
                ].map(([l,v,c])=>(
                  <div key={l}>
                    <div style={{ fontSize:"7px", color:"#64748b" }}>{l}</div>
                    <div style={{ fontSize:"10px", fontWeight:900, color:c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        }} />
        <Scatter data={conInv}>
          {conInv.map((m,i) => (
            <Cell key={m.canal}
              fill={`url(#sc${m.canal.replace(/\W/g,"")})`}
              stroke={getCfg(m.canal).color}
              strokeWidth={2} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ÁREA: Tendencia diaria por canal
// ─────────────────────────────────────────────────────────────────────────────
function TendenciaArea({ rawFilas, canalesActivos }) {
  const [metrica, setMetrica] = useState("efect");

  const mapaFC = {};
  rawFilas.forEach(row => {
    const canal = row.canal_inversion || row.canal;
    if (!canalesActivos.includes(canal)) return;
    const fecha = String(row.fecha).split("T")[0];
    const k = `${fecha}|${canal}`;
    if (!mapaFC[k]) mapaFC[k] = { fecha, canal, n_leads:0, negociables:0, atc_soporte:0,
      activos_mes:0, venta_subida_bitrix:0, ingreso_jot:0, inversion_usd:0, _inv:false };
    const a=mapaFC[k];
    a.n_leads+=n(row.n_leads); a.negociables+=n(row.negociables); a.atc_soporte+=n(row.atc_soporte);
    a.activos_mes+=n(row.activos_mes); a.venta_subida_bitrix+=n(row.venta_subida_bitrix); a.ingreso_jot+=n(row.ingreso_jot);
    if(!a._inv&&n(row.inversion_usd)>0){a.inversion_usd=n(row.inversion_usd);a._inv=true;}
  });

  const fechas=[...new Set(Object.values(mapaFC).map(r=>r.fecha))].sort();
  const lineData=fechas.map(fecha=>{
    const e={fecha:formatF(fecha)};
    canalesActivos.forEach(canal=>{
      const k=`${fecha}|${canal}`; const r=mapaFC[k];
      if(!r||!r.n_leads) return;
      const L=r.n_leads;
      if(metrica==="efect")   e[canal]=+pct(r.activos_mes,L).toFixed(1);
      else if(metrica==="cpl") e[canal]=r.inversion_usd>0?+(r.inversion_usd/L).toFixed(2):null;
      else if(metrica==="pct_atc") e[canal]=+pct(r.atc_soporte,L).toFixed(1);
      else { // icp
        const ef=pct(r.activos_mes,L), tN=pct(r.negociables,L), tB=pct(L-r.atc_soporte,L);
        e[canal]=+(ef*0.40+tN*0.25+tB*0.35).toFixed(1);
      }
    });
    return e;
  });

  const METS=[
    {v:"icp",l:"ICP"},{v:"efect",l:"Efectividad %"},
    {v:"cpl",l:"CPL $"},{v:"pct_atc",l:"% ATC"},
  ];

  return (
    <div>
      <div style={{ display:"flex", gap:"6px", marginBottom:"14px", flexWrap:"wrap" }}>
        {METS.map(m=>(
          <button key={m.v} onClick={()=>setMetrica(m.v)} style={{
            padding:"5px 14px", borderRadius:"9999px", border:"none",
            fontSize:"8px", fontWeight:900, cursor:"pointer",
            background:metrica===m.v?C.primary:C.light,
            color:metrica===m.v?"#fff":C.muted, transition:"all 0.15s",
          }}>{m.l}</button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={lineData} margin={{ top:10, right:20, left:0, bottom:5 }}>
          <defs>
            {canalesActivos.map(c=>(
              <linearGradient key={c} id={`ag_${c.replace(/\W/g,"")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={getCfg(c).color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={getCfg(c).color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="fecha" tick={{ fontSize:9, fill:C.muted }} />
          <YAxis tick={{ fontSize:9, fill:C.muted }} width={38}
            tickFormatter={v=>metrica==="cpl"?`$${v}`:`${v}${metrica!=="icp"?"%":""}`} />
          <Tooltip content={<DarkTip />} />
          <Legend wrapperStyle={{ fontSize:9 }} />
          {canalesActivos.map(c=>(
            <Area key={c} type="monotone" dataKey={c} name={getCfg(c).label}
              stroke={getCfg(c).color} fill={`url(#ag_${c.replace(/\W/g,"")})`}
              strokeWidth={2.5}
              dot={{ r:3, fill:getCfg(c).color, strokeWidth:0 }}
              activeDot={{ r:5 }} connectNulls />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CUADRANTE visual
// ─────────────────────────────────────────────────────────────────────────────
function Cuadrante({ metricas }) {
  const conInv=metricas.filter(m=>m.cpl!==null&&m.efect!==null);
  if(conInv.length<2) return null;
  const avgEf=conInv.reduce((s,m)=>s+m.efect,0)/conInv.length;
  const avgCpl=conInv.reduce((s,m)=>s+m.cpl,0)/conInv.length;
  const q = m => {
    const be=m.efect>=avgEf, bc=m.cpl<=avgCpl;
    if(be&&bc) return { l:"⭐ Estrella",    c:C.success, bg:"#d1fae5", d:"Bajo CPL + alta efect." };
    if(be&&!bc) return { l:"🔄 Optimizable",c:C.warning, bg:"#fef3c7", d:"Alta efect., CPL caro" };
    if(!be&&bc) return { l:"🔍 Revisar",    c:C.sky,     bg:"#e0f2fe", d:"CPL barato, baja efect." };
    return               { l:"⛔ Crítico",   c:C.danger,  bg:"#fee2e2", d:"CPL caro + baja efect." };
  };
  const grupos={};
  conInv.forEach(m=>{ const qd=q(m); if(!grupos[qd.l]) grupos[qd.l]={...qd,canales:[]}; grupos[qd.l].canales.push(m); });
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
      {Object.values(grupos).map(g=>(
        <div key={g.l} style={{ padding:"12px 14px", borderRadius:"14px", background:g.bg, border:`1px solid ${g.c}25` }}>
          <div style={{ fontSize:"10px", fontWeight:900, color:g.c, marginBottom:"4px" }}>{g.l}</div>
          <div style={{ fontSize:"8px", color:C.muted, marginBottom:"8px" }}>{g.d}</div>
          {g.canales.map(m=>{
            const cfg=getCfg(m.canal);
            return (
              <div key={m.canal} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                background:"rgba(255,255,255,0.7)", borderRadius:"8px", padding:"5px 10px", marginBottom:"4px" }}>
                <span style={{ fontSize:"8px", fontWeight:900, color:cfg.color }}>{cfg.icon} {cfg.label}</span>
                <div style={{ display:"flex", gap:"10px", fontSize:"7.5px" }}>
                  <span style={{ color:C.muted }}>CPL</span>
                  <span style={{ fontWeight:900, color:g.c }}>${m.cpl.toFixed(2)}</span>
                  <span style={{ color:C.muted }}>EF</span>
                  <span style={{ fontWeight:900, color:g.c }}>{m.efect.toFixed(1)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RANKING BARRAS horizontal mejorado
// ─────────────────────────────────────────────────────────────────────────────
function RankingBars({ metricas }) {
  const sorted=[...metricas].sort((a,b)=>b.icp-a.icp);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      {sorted.map((m,i)=>{
        const cfg=getCfg(m.canal);
        const icpColor=semaforo(m.icp,[60,35]);
        return (
          <div key={m.canal} style={{ borderRadius:"14px", border:`1px solid ${cfg.color}20`,
            background:`linear-gradient(135deg,${cfg.bg},${cfg.bg}50)`,
            padding:"12px 16px", boxShadow:`0 2px 12px ${cfg.color}10` }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"8px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                <span style={{ width:"22px", height:"22px", borderRadius:"50%",
                  background:`${cfg.color}20`, color:cfg.color, fontWeight:900, fontSize:"9px",
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {i===0?"🏆":i+1}
                </span>
                <span style={{ fontSize:"14px" }}>{cfg.icon}</span>
                <span style={{ fontSize:"10px", fontWeight:900, color:cfg.color, textTransform:"uppercase" }}>{cfg.label}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                <span style={{ fontSize:"14px", fontWeight:900, color:icpColor }}>{m.icp.toFixed(0)}</span>
                <span style={{ fontSize:"7px", fontWeight:900, padding:"2px 6px", borderRadius:"9999px",
                  background:`${icpColor}15`, color:icpColor }}>ICP</span>
              </div>
            </div>
            {/* Métricas mini grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"6px", marginBottom:"8px" }}>
              {[
                ["Contacto",`${m.tContacto.toFixed(0)}%`,semaforo(m.tContacto,[50,35])],
                ["Efect.",  `${m.efect.toFixed(0)}%`,    semaforo(m.efect,[15,8])],
                ["ATC",     `${m.pctAtc.toFixed(0)}%`,   semaforo(m.pctAtc,[40,25],true)],
                m.cpl!==null
                  ? ["CPL",`$${m.cpl.toFixed(2)}`,semaforo(m.cpl,[4,8],true)]
                  : ["ROAS",m.roas!==null?`${m.roas.toFixed(1)}x`:"—",C.muted],
              ].map(([l,v,c])=>(
                <div key={l} style={{ background:"rgba(255,255,255,0.65)", borderRadius:"8px", padding:"5px 6px", textAlign:"center" }}>
                  <div style={{ fontSize:"7px", fontWeight:700, color:C.muted }}>{l}</div>
                  <div style={{ fontSize:"9px", fontWeight:900, color:c }}>{v}</div>
                </div>
              ))}
            </div>
            {/* Barra ICP */}
            <div>
              <div style={{ width:"100%", borderRadius:"9999px", overflow:"hidden",
                height:"4px", background:`${icpColor}18` }}>
                <div style={{ width:`${m.icp}%`, height:"100%", background:`linear-gradient(90deg,${icpColor}80,${icpColor})`,
                  borderRadius:"9999px", transition:"width 0.7s cubic-bezier(.4,0,.2,1)" }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHTS automáticos
// ─────────────────────────────────────────────────────────────────────────────
function Insights({ metricas, resumen }) {
  const items = useMemo(() => {
    const ins = [];
    const top   = metricas[0];
    const peor  = metricas[metricas.length-1];
    const altaA = metricas.filter(m=>m.pctAtc>40);
    const sinInv= metricas.filter(m=>m.cpl===null);
    const topCpl= [...metricas].filter(m=>m.cpl!==null).sort((a,b)=>a.cpl-b.cpl)[0];
    const topEf = [...metricas].sort((a,b)=>b.efect-a.efect)[0];
    const std   = metricas.length>1 ? Math.sqrt(metricas.reduce((s,m)=>s+Math.pow(m.icp-(resumen?.icpProm||0),2),0)/metricas.length) : 0;

    if(top) ins.push({ t:"success", i:"⭐",
      txt:`${getCfg(top.canal).label} lidera con ICP ${top.icp.toFixed(0)}/100 — concentrar presupuesto aquí.` });
    if(peor&&metricas.length>1&&peor.icp<35) ins.push({ t:"danger", i:"⛔",
      txt:`${getCfg(peor.canal).label} tiene ICP bajo (${peor.icp.toFixed(0)}) — revisar segmentación y creativos.` });
    if(altaA.length) ins.push({ t:"warning", i:"⚠️",
      txt:`${altaA.map(m=>getCfg(m.canal).label).join(", ")} supera 40% ATC — leads de baja calidad, ajustar audiencia.` });
    if(topCpl&&topEf&&topCpl.canal!==topEf.canal) ins.push({ t:"info", i:"💡",
      txt:`Canal más barato (${getCfg(topCpl.canal).label} $${topCpl.cpl.toFixed(2)}) ≠ más efectivo (${getCfg(topEf.canal).label} ${topEf.efect.toFixed(1)}%). Usar según objetivo.` });
    if(sinInv.length) ins.push({ t:"neutral", i:"📌",
      txt:`${sinInv.map(m=>getCfg(m.canal).label).join(", ")} sin inversión registrada. ROAS/CPL no calculable.` });
    if(std>10) ins.push({ t:"violet", i:"📊",
      txt:`Alta dispersión de ICP (σ=${std.toFixed(1)}) — canales muy desiguales. Analizar qué hace diferente al top.` });
    if(resumen?.roas!==null&&resumen?.roas>0) ins.push({ t:"success", i:"💰",
      txt:`ROAS estimado global: ${resumen.roas.toFixed(1)}x (asumiendo $${TICKET}/cliente activo). ${resumen.roas>=3?"🟢 Rentable":"⚠️ Revisar ticket promedio real."}` });

    return ins;
  }, [metricas, resumen]);

  const MAP = {
    success:{c:C.success, bg:"#d1fae5"}, danger:{c:C.danger, bg:"#fee2e2"},
    warning:{c:C.warning, bg:"#fef3c7"}, info:{c:C.primary, bg:"#dbeafe"},
    neutral:{c:C.muted,   bg:"#f8fafc"}, violet:{c:C.violet, bg:"#ede9fe"},
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
      {items.map((ins,i) => (
        <div key={i} style={{ display:"flex", gap:"10px", padding:"10px 14px",
          borderRadius:"12px", background:MAP[ins.t].bg,
          border:`1px solid ${MAP[ins.t].c}20`, alignItems:"flex-start" }}>
          <span style={{ fontSize:"14px", flexShrink:0, marginTop:"1px" }}>{ins.i}</span>
          <p style={{ fontSize:"8.5px", lineHeight:1.5, fontWeight:600,
            color:MAP[ins.t].c, margin:0 }}>{ins.txt}</p>
        </div>
      ))}
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

  useEffect(() => {
    if (!desde||!hasta) return;
    setLoading(true);
    fetch(`${API}/api/redes/monitoreo-redes?fechaDesde=${desde}&fechaHasta=${hasta}`)
      .then(r=>r.json()).then(d=>setRawData(d?.success?d:null))
      .catch(()=>setRawData(null)).finally(()=>setLoading(false));
  }, [desde, hasta]);

  const { metricas, canalesActivos, resumenGlobal } = useMemo(() => {
    if (!rawData?.data) return { metricas:[], canalesActivos:[], resumenGlobal:null };
    const filas=rawData.data; const map={}, invC={};
    filas.forEach(row=>{
      const canal=row.canal_inversion||row.canal;
      if(!canal||canal==="MAL INGRESO"||canal==="SIN MAPEO") return;
      if(!map[canal]) map[canal]={ canal, n_leads:0, negociables:0, atc_soporte:0,
        venta_subida_bitrix:0, ingreso_jot:0, activos_mes:0, inversion_usd:0 };
      const a=map[canal];
      a.n_leads+=n(row.n_leads); a.negociables+=n(row.negociables); a.atc_soporte+=n(row.atc_soporte);
      a.venta_subida_bitrix+=n(row.venta_subida_bitrix); a.ingreso_jot+=n(row.ingreso_jot); a.activos_mes+=n(row.activos_mes);
      const k=`${String(row.fecha).split("T")[0]}|${canal}`;
      if(!invC[k]&&n(row.inversion_usd)>0){a.inversion_usd+=n(row.inversion_usd);invC[k]=true;}
    });
    const base=Object.values(map).filter(m=>m.n_leads>0);
    const maxCPL=Math.max(1,...base.filter(m=>m.inversion_usd>0).map(m=>m.inversion_usd/m.n_leads));
    const metricas=base.map(m=>{
      const tContacto=pct(m.negociables,m.n_leads), efect=pct(m.activos_mes,m.n_leads);
      const pctAtc=pct(m.atc_soporte,m.n_leads), pctBuena=Math.max(0,100-pctAtc);
      const pctVenta=pct(m.venta_subida_bitrix,m.n_leads);
      const cpl=m.n_leads>0&&m.inversion_usd>0?m.inversion_usd/m.n_leads:null;
      const cpActivado=m.activos_mes>0&&m.inversion_usd>0?m.inversion_usd/m.activos_mes:null;
      const ingresoEst=m.activos_mes*TICKET;
      const roas=m.inversion_usd>0?ingresoEst/m.inversion_usd:null;
      const icp=calcICP(m,maxCPL);
      return { ...m, tContacto, efect, pctAtc, pctBuena, pctVenta, cpl, cpActivado, roas, icp, ingresoEst };
    }).sort((a,b)=>b.icp-a.icp);

    const totLeads=metricas.reduce((s,m)=>s+m.n_leads,0);
    const totAct=metricas.reduce((s,m)=>s+m.activos_mes,0);
    const totInv=metricas.reduce((s,m)=>s+m.inversion_usd,0);
    const totAtc=metricas.reduce((s,m)=>s+m.atc_soporte,0);
    const totNeg=metricas.reduce((s,m)=>s+m.negociables,0);
    const totIng=metricas.reduce((s,m)=>s+m.ingresoEst,0);
    const icpProm=metricas.length?metricas.reduce((s,m)=>s+m.icp,0)/metricas.length:0;
    const resumenGlobal={
      totLeads, totAct, totInv, totAtc, totNeg, totIng, icpProm,
      efect:pct(totAct,totLeads), tContacto:pct(totNeg,totLeads), pctAtc:pct(totAtc,totLeads),
      cpl:totLeads>0&&totInv>0?totInv/totLeads:null,
      cpActivado:totAct>0&&totInv>0?totInv/totAct:null,
      roas:totInv>0?totIng/totInv:null,
    };
    return { metricas, canalesActivos:metricas.map(m=>m.canal), resumenGlobal };
  }, [rawData]);

  const maxCPL=useMemo(()=>Math.max(1,...metricas.filter(m=>m.cpl!==null).map(m=>m.cpl)),[metricas]);
  const mejorCanal=metricas[0]||null;

  const SUBTABS=[
    {id:"resumen",   l:"Resumen",    i:"📋"},
    {id:"tabla",     l:"Comparativa",i:"📊"},
    {id:"radar",     l:"Radar",      i:"🕸️"},
    {id:"cuadrante", l:"Cuadrante",  i:"🗺️"},
    {id:"tendencia", l:"Tendencia",  i:"📈"},
  ];

  if (loading) return <Spinner />;

  if (!rawData) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"80px", gap:"16px" }}>
      <div style={{ fontSize:"56px" }}>📡</div>
      <div style={{ fontSize:"14px", fontWeight:900, color:C.slate }}>Sin datos — aplica un rango de fechas</div>
      <div style={{ fontSize:"10px", color:C.muted, textAlign:"center", maxWidth:"360px", lineHeight:1.6 }}>
        Selecciona un período desde el filtro principal para cargar el análisis de pautas.
      </div>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"22px" }}>

      {/* HEADER */}
      <div style={{
        background:"linear-gradient(135deg,#eff6ff 0%,#dbeafe 50%,#ede9fe 100%)",
        borderRadius:"22px", border:`1px solid ${C.primary}25`,
        padding:"20px 26px",
        display:"flex", alignItems:"flex-start", justifyContent:"space-between",
        flexWrap:"wrap", gap:"16px",
        boxShadow:"0 8px 32px rgba(30,58,138,0.10)",
        position:"relative", overflow:"hidden",
      }}>
        <div style={{ position:"absolute", right:"40px", top:"-20px", width:"120px", height:"120px",
          borderRadius:"50%", background:"rgba(99,102,241,0.08)", pointerEvents:"none" }} />
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"6px" }}>
            <div style={{ background:`${C.primary}15`, borderRadius:"10px", padding:"7px 9px", fontSize:"20px" }}>🔬</div>
            <span style={{ fontSize:"15px", fontWeight:900, color:C.primary,
              textTransform:"uppercase", letterSpacing:"0.1em" }}>Análisis de Pautas</span>
            <span style={{ fontSize:"8px", fontWeight:900, padding:"3px 10px", borderRadius:"9999px",
              background:`${C.primary}12`, color:C.primary, textTransform:"uppercase" }}>
              {metricas.length} canales · {desde} → {hasta}
            </span>
          </div>
          <p style={{ fontSize:"9px", color:C.muted, marginLeft:"44px", letterSpacing:"0.04em" }}>
            Tasa contacto · CPL · CP Activado · ROAS · Índice de Calidad de Pauta (ICP 0-100)
          </p>
        </div>
        {mejorCanal && (
          <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"10px 18px",
            background:"rgba(255,255,255,0.85)", border:`1px solid ${C.success}30`,
            borderRadius:"14px", boxShadow:`0 4px 16px ${C.success}15` }}>
            <span style={{ fontSize:"20px" }}>{getCfg(mejorCanal.canal).icon}</span>
            <div>
              <div style={{ fontSize:"7px", color:C.muted, textTransform:"uppercase", fontWeight:900 }}>Mejor pauta (ICP)</div>
              <div style={{ fontSize:"11px", fontWeight:900, color:C.success }}>
                {getCfg(mejorCanal.canal).label} — {mejorCanal.icp.toFixed(0)} pts
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KPIs */}
      {resumenGlobal && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:"12px" }}>
          <KpiCard label="Leads totales"  value={resumenGlobal.totLeads||"—"} icon="👥" color={C.primary}
            sub={`${metricas.length} canales activos`} />
          <KpiCard label="T. Contacto"    value={fmtPct(resumenGlobal.tContacto)} icon="📞"
            color={semaforo(resumenGlobal.tContacto,[50,35])}
            sub="negociables / leads"
            info="Proxy de contactabilidad: leads negociados vs total." />
          <KpiCard label="% ATC Global"   value={fmtPct(resumenGlobal.pctAtc)} icon="⚠️"
            color={semaforo(resumenGlobal.pctAtc,[40,25],true)}
            sub={`${resumenGlobal.totAtc} leads ATC`}
            info="Menor % = mejor calidad de pauta." />
          <KpiCard label="Efectividad"    value={fmtPct(resumenGlobal.efect)} icon="✅"
            color={semaforo(resumenGlobal.efect,[15,8])}
            sub={`${resumenGlobal.totAct} activos`}
            info="Activos del mes / total leads." />
          <KpiCard label="CPL Promedio"   value={resumenGlobal.cpl!==null?fmt2(resumenGlobal.cpl):"—"} icon="💸"
            color={semaforo(resumenGlobal.cpl||999,[4,8],true)}
            sub="inversión / leads"
            info="Costo por lead promedio de todos los canales." />
          <KpiCard label="CP Activado"    value={resumenGlobal.cpActivado!==null?fmt2(resumenGlobal.cpActivado):"—"} icon="🎯"
            color={semaforo(resumenGlobal.cpActivado||999,[20,40],true)}
            sub="inversión / activo"
            info="Costo real por cliente activado. Más relevante que CPL." />
          <KpiCard label="ROAS Estimado"  value={resumenGlobal.roas!==null?`${resumenGlobal.roas.toFixed(1)}x`:"—"} icon="📈"
            color={semaforo(resumenGlobal.roas||0,[3,1.5])}
            sub={`$${TICKET}/cliente activo`}
            info="Return on Ad Spend estimado. Ajustar ticket real según contrato." />
        </div>
      )}

      {/* GAUGES ICP por canal */}
      {metricas.length>0 && (
        <Card title="Índice de Calidad de Pauta (ICP)" accent={C.primary}
          subtitle="Score 0-100 · 40% efectividad + 25% contacto + 20% calidad lead + 15% eficiencia inversión"
          badge={
            <span style={{ fontSize:"8px", fontWeight:600, padding:"3px 10px", borderRadius:"9999px",
              background:`${C.primary}10`, color:C.primary }}>Mayor = mejor pauta</span>
          }>
          <div style={{ display:"flex", flexWrap:"wrap", gap:"24px", justifyContent:"center", marginBottom:"20px" }}>
            {metricas.map(m=>(
              <div key={m.canal} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"6px" }}>
                <GaugePremium valor={m.icp} label={getCfg(m.canal).label}
                  color={semaforo(m.icp,[60,35])} size={90}
                  sublabel={`${getCfg(m.canal).icon}`} />
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:"7.5px", fontWeight:700, color:C.muted }}>
                    EF {m.efect.toFixed(0)}% · ATC {m.pctAtc.toFixed(0)}%
                  </div>
                  {m.cpl!==null && (
                    <div style={{ fontSize:"7.5px", fontWeight:700, color:C.violet }}>CPL ${m.cpl.toFixed(2)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Leyenda */}
          <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"center", gap:"14px",
            paddingTop:"14px", borderTop:`1px solid ${C.border}` }}>
            {[
              {l:"ICP ≥ 60 · Excelente",   c:C.success},
              {l:"ICP 35-59 · Aceptable",   c:C.warning},
              {l:"ICP < 35 · Atención",     c:C.danger},
            ].map(l=>(
              <div key={l.l} style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                <div style={{ width:"10px", height:"10px", borderRadius:"50%", background:l.c }} />
                <span style={{ fontSize:"8px", fontWeight:600, color:C.muted }}>{l.l}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* SUB-TABS */}
      <div style={{ display:"flex", gap:"4px", background:"#fff",
        border:`1px solid ${C.border}`, borderRadius:"14px", padding:"5px",
        width:"fit-content", boxShadow:"0 2px 12px rgba(0,0,0,0.05)" }}>
        {SUBTABS.map(t=>(
          <button key={t.id} onClick={()=>setTabActivo(t.id)} style={{
            display:"flex", alignItems:"center", gap:"6px",
            padding:"8px 16px", borderRadius:"10px", border:"none",
            fontSize:"9px", fontWeight:900, textTransform:"uppercase",
            letterSpacing:"0.07em", cursor:"pointer",
            background:tabActivo===t.id?`linear-gradient(135deg,${C.primary},#1e40af)`:"transparent",
            color:tabActivo===t.id?"#fff":C.muted, transition:"all 0.15s",
            boxShadow:tabActivo===t.id?"0 4px 12px rgba(30,58,138,0.3)":"none",
          }}>
            <span>{t.i}</span><span className="hidden sm:inline">{t.l}</span>
          </button>
        ))}
      </div>

      {/* ══ RESUMEN ══ */}
      {tabActivo==="resumen" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"20px" }}>
          <Card title="Ranking de Pautas" subtitle="Por ICP — de mejor a peor" accent={C.success}>
            <RankingBars metricas={metricas} />
          </Card>
          <div style={{ display:"flex", flexDirection:"column", gap:"20px" }}>
            <Card title="Cuadrante de Pautas" subtitle="CPL vs Efectividad · promedios del período" accent={C.violet}>
              <Cuadrante metricas={metricas} />
            </Card>
            <Card title="Insights Automáticos" subtitle="Detectados del período" accent={C.orange}>
              <Insights metricas={metricas} resumen={resumenGlobal} />
            </Card>
          </div>
        </div>
      )}

      {/* ══ TABLA ══ */}
      {tabActivo==="tabla" && (
        <Card title="Tabla Comparativa" accent={C.primary}
          subtitle="Click en columnas para ordenar · ICP = Índice de Calidad de Pauta"
          badge={<span style={{ fontSize:"8px", padding:"3px 10px", borderRadius:"9999px", fontWeight:700,
            background:`${C.primary}12`, color:C.primary }}>{metricas.length} canales</span>}>
          <TablaComparativa metricas={metricas} />
          <div style={{ padding:"10px 14px", borderTop:`1px solid ${C.border}`, marginTop:"4px",
            fontSize:"7.5px", color:C.muted, display:"flex", flexWrap:"wrap", gap:"10px" }}>
            <span>★ ICP: 0-100 — mayor mejor</span>
            <span>· ROAS asume ${TICKET}/mes por activo</span>
            <span>· CP Activado = inversión / activos mes</span>
          </div>
        </Card>
      )}

      {/* ══ RADAR ══ */}
      {tabActivo==="radar" && (
        <Card title="Radar Multidimensional" accent={C.violet}
          subtitle="5 dimensiones normalizadas (0-100 cada eje)">
          {metricas.length<2 ? (
            <div style={{ textAlign:"center", padding:"40px", color:C.muted, fontSize:"9px" }}>
              Se necesitan al menos 2 canales para el radar
            </div>
          ) : <RadarPautas metricas={metricas} />}
          <div style={{ marginTop:"14px", paddingTop:"12px", borderTop:`1px solid ${C.border}`,
            display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"8px" }}>
            {[["Efectividad","activos/leads"],["Contacto","negociables/leads"],
              ["Sin ATC","leads sin ATC/total"],["V. Subida","ventas/leads"],["ICP","índice pond."]
            ].map(([dim,desc])=>(
              <div key={dim} style={{ textAlign:"center" }}>
                <div style={{ fontSize:"8px", fontWeight:900, color:C.slate }}>{dim}</div>
                <div style={{ fontSize:"7px", color:C.muted }}>{desc}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ══ CUADRANTE ══ */}
      {tabActivo==="cuadrante" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"20px" }}>
          <Card title="Scatter: CPL vs Efectividad" accent={C.violet}
            subtitle="Ideal: arriba-izquierda (CPL bajo + alta efectividad)">
            <ScatterPremium metricas={metricas} />
            <div style={{ marginTop:"12px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", fontSize:"7.5px", color:C.muted }}>
              <div style={{ padding:"8px 10px", borderRadius:"8px", background:"#d1fae580" }}>
                <span style={{ color:C.success }}>▲ Arriba-Izq.</span> Bajo CPL + alta efect.
              </div>
              <div style={{ padding:"8px 10px", borderRadius:"8px", background:"#fee2e280" }}>
                <span style={{ color:C.danger }}>▼ Abajo-Der.</span> Alto CPL + baja efect.
              </div>
            </div>
          </Card>
          <Card title="Clasificación por Cuadrante" accent={C.orange}>
            <Cuadrante metricas={metricas} />
          </Card>
        </div>
      )}

      {/* ══ TENDENCIA ══ */}
      {tabActivo==="tendencia" && (
        <Card title="Evolución Diaria por Canal" accent={C.cyan}
          subtitle="Área con gradiente — selecciona métrica para comparar tendencias">
          {rawData?.data && (
            <TendenciaArea rawFilas={rawData.data} canalesActivos={canalesActivos} />
          )}
        </Card>
      )}
    </div>
  );
}