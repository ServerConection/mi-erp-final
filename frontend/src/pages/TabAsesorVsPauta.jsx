// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  TabAsesorVsPauta.jsx — Asesores vs Campaña VELSA NETLIFE               ║
// ║  ✅ Bubble Chart: Costo total/lead vs Efectividad                        ║
// ║  ✅ Scatter: Inversión canal vs JOT logrado                              ║
// ║  ✅ Barras apiladas: CPL canal + costo asesor = costo real               ║
// ║  ✅ Area chart: Score vs CPL por canal                                   ║
// ║  ✅ Heatmap multimétrica con toggle                                      ║
// ║  ✅ Gauges score + tabla ranking con CPA                                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝
import { useEffect, useState, useMemo, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line,
  AreaChart, Area,
  ScatterChart, Scatter,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LabelList, ReferenceLine,
  ComposedChart, ZAxis,
} from "recharts";
import { CanalSelector, getCanalCfg, buildFiltroParams } from "./GlobalFilters";

const API = import.meta.env.VITE_API_URL;
const n   = (v) => Number(v || 0);
const pct = (a, b) => b > 0 ? (a / b) * 100 : 0;

const TICKET_MENSUAL_EST  = 25;   // USD ingreso por cliente activo

const C = {
  primary: "#0f172a", accent: "#3b82f6", success: "#10b981",
  warning: "#f59e0b", danger: "#ef4444", violet: "#8b5cf6",
  cyan: "#06b6d4", muted: "#94a3b8", border: "#e2e8f0",
  slate: "#334155", light: "#f8fafc", orange: "#f97316",
};

const PAL = [
  "#3b82f6","#10b981","#f59e0b","#8b5cf6","#06b6d4",
  "#ef4444","#0ea5e9","#84cc16","#ec4899","#f97316",
  "#14b8a6","#a855f7","#eab308","#6366f1","#22c55e",
];

// ─────────────────────────────────────────────────────────────────────────────
// UI ATOMS
// ─────────────────────────────────────────────────────────────────────────────
const DarkTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"linear-gradient(135deg,#0f172a,#1e293b)", border:"1px solid #334155",
      borderRadius:"14px", padding:"12px 16px", fontSize:"10px", minWidth:"170px",
      boxShadow:"0 20px 50px rgba(0,0,0,0.6)" }}>
      <div style={{ color:"#f1f5f9", fontWeight:900, marginBottom:"8px",
        borderBottom:"1px solid #334155", paddingBottom:"5px",
        textTransform:"uppercase", letterSpacing:"0.08em", fontSize:"9px" }}>{label}</div>
      {payload.map((p, i) => (
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

function Card({ children, title, subtitle, accent=C.accent, badge, noPad=false }) {
  return (
    <div style={{ background:"#fff", borderRadius:"20px", border:`1px solid ${C.border}`,
      overflow:"hidden", boxShadow:"0 4px 24px rgba(0,0,0,0.07)" }}>
      {title && (
        <div style={{ padding:"16px 22px", borderBottom:`1px solid ${C.border}`,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          flexWrap:"wrap", gap:"10px",
          background:`linear-gradient(135deg,${accent}08 0%,#fff 70%)` }}>
          <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
            <div style={{ width:"4px", height:"30px", borderRadius:"9999px",
              background:`linear-gradient(180deg,${accent},${accent}55)`, flexShrink:0 }} />
            <div>
              <div style={{ fontSize:"10px", fontWeight:900, textTransform:"uppercase",
                letterSpacing:"0.15em", color:accent }}>{title}</div>
              {subtitle && <div style={{ fontSize:"8px", color:C.muted, marginTop:"2px" }}>{subtitle}</div>}
            </div>
          </div>
          {badge}
        </div>
      )}
      <div style={noPad ? {} : { padding:"20px" }}>{children}</div>
    </div>
  );
}

function Kpi({ label, value, sub, color, icon }) {
  return (
    <div style={{ background:`linear-gradient(135deg,${color}12,${color}04)`,
      borderRadius:"16px", border:`1px solid ${color}25`, padding:"16px 18px",
      boxShadow:`0 4px 20px ${color}10`, position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", right:"-8px", top:"-8px", width:"54px", height:"54px",
        borderRadius:"50%", background:`${color}08`, pointerEvents:"none" }} />
      <div style={{ width:"34px", height:"34px", borderRadius:"10px", background:`${color}20`,
        display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px", marginBottom:"8px" }}>{icon}</div>
      <div style={{ fontSize:"8px", fontWeight:900, color:`${color}90`, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"2px" }}>{label}</div>
      <div style={{ fontSize:"22px", fontWeight:900, color, lineHeight:1.1 }}>{value}</div>
      {sub && <div style={{ fontSize:"8px", color:C.muted, marginTop:"4px" }}>{sub}</div>}
    </div>
  );
}

function Gauge({ valor, label, color, size=74 }) {
  const r=size/2-7, circ=2*Math.PI*r, d=Math.min(valor/100,1)*circ*0.75;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"4px" }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={`gg${label.replace(/\s/g,"")}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`${color}18`} strokeWidth={7}
          strokeDasharray={`${circ*0.75} ${circ*0.25}`} strokeLinecap="round"
          transform={`rotate(-225 ${size/2} ${size/2})`} />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={`url(#gg${label.replace(/\s/g,"")})`} strokeWidth={7}
          strokeDasharray={`${d} ${circ-d+circ*0.25}`} strokeLinecap="round"
          transform={`rotate(-225 ${size/2} ${size/2})`}
          style={{ transition:"stroke-dasharray 0.8s ease" }} />
        <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="central"
          fontSize={11} fontWeight={900} fill={color}>{valor.toFixed(0)}</text>
      </svg>
      <div style={{ fontSize:"7px", fontWeight:900, color:C.muted, textTransform:"uppercase",
        textAlign:"center", maxWidth:size+10, lineHeight:1.3 }}>{label}</div>
    </div>
  );
}

function AsesorDropdown({ asesores, value, onChange }) {
  const [open,setOpen]=useState(false); const [q,setQ]=useState(""); const ref=useRef(null);
  useEffect(()=>{
    const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h);
  },[]);
  const list=asesores.filter(a=>!q||a.nombre.toLowerCase().includes(q.toLowerCase()));
  const sel=asesores.find(a=>a.nombre===value);
  return (
    <div ref={ref} style={{ position:"relative", minWidth:"220px" }}>
      <button onClick={()=>setOpen(!open)} style={{
        width:"100%", padding:"9px 14px", borderRadius:"12px",
        border:`1.5px solid ${open?C.accent:C.border}`,
        background:"#fff", cursor:"pointer",
        display:"flex", alignItems:"center", justifyContent:"space-between", gap:"8px",
        fontSize:"9px", fontWeight:700, color:C.slate,
        boxShadow:open?`0 0 0 4px ${C.accent}15`:"0 1px 4px rgba(0,0,0,0.06)",
        transition:"all 0.15s",
      }}>
        <span style={{ fontWeight:900, color:value?C.slate:C.muted }}>
          {sel?sel.nombre:"Todos los asesores"}
        </span>
        <span style={{ color:C.muted, transform:open?"rotate(180deg)":"none", transition:"0.2s" }}>▼</span>
      </button>
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 6px)", left:0, right:0, zIndex:50,
          background:"#fff", border:`1px solid ${C.border}`, borderRadius:"14px",
          boxShadow:"0 12px 40px rgba(0,0,0,0.18)", overflow:"hidden",
          maxHeight:"300px", display:"flex", flexDirection:"column" }}>
          <div style={{ padding:"8px" }}>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar..."
              style={{ width:"100%", padding:"6px 10px", borderRadius:"8px",
                border:`1px solid ${C.border}`, fontSize:"9px", outline:"none",
                background:C.light, color:C.slate, boxSizing:"border-box" }} />
          </div>
          <div style={{ overflowY:"auto", maxHeight:"230px" }}>
            <div onClick={()=>{onChange("");setOpen(false);setQ("");}}
              style={{ padding:"8px 14px", cursor:"pointer", fontSize:"9px", fontWeight:900,
                color:!value?C.accent:C.slate, background:!value?`${C.accent}10`:"transparent",
                borderBottom:`1px solid ${C.border}` }}>Todos los asesores</div>
            {list.map(a=>(
              <div key={a.nombre} onClick={()=>{onChange(a.nombre);setOpen(false);setQ("");}}
                style={{ padding:"8px 14px", cursor:"pointer",
                  background:value===a.nombre?`${C.accent}10`:"transparent",
                  borderBottom:`1px solid ${C.border}55`, transition:"background 0.1s",
                  display:"flex", flexDirection:"column", gap:"2px" }}>
                <div style={{ fontSize:"9px", fontWeight:900, color:value===a.nombre?C.accent:C.slate }}>{a.nombre}</div>
                <div style={{ fontSize:"8px", color:C.muted, display:"flex", gap:"10px" }}>
                  {a.supervisor && <span>👤 {a.supervisor}</span>}
                  <span>📊 {a.leads} leads</span>
                  <span style={{ color:a.efect>=15?C.success:a.efect>=8?C.warning:C.danger }}>⚡{a.efect.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────────────────────
const calcScore = a => {
  const ef=pct(n(a.jot),n(a.leads)), tN=pct(n(a.negoc),n(a.leads));
  const tB=Math.max(0,100-pct(n(a.atc),n(a.leads))), tV=pct(n(a.ventas),n(a.leads));
  return Math.min(100, ef*0.40+tN*0.25+tB*0.20+tV*0.15);
};
const efCol   = v => n(v)>=15?C.success:n(v)>=8?C.warning:C.danger;
const scCol   = v => n(v)>=60?C.success:n(v)>=35?C.warning:C.danger;
const atcCol  = v => n(v)>40?C.danger:n(v)>20?C.warning:C.success;

// ─────────────────────────────────────────────────────────────────────────────
// GRÁFICOS
// ─────────────────────────────────────────────────────────────────────────────

/** BUBBLE: CPA real (x) vs Efectividad (y), tamaño = leads */
function BubbleCostoEfect({ asesores, canalMap }) {
  const data = asesores.map((a,i) => {
    const invAs = n(a.inv_asignada);
    const cpa   = a.jot>0 && invAs>0 ? parseFloat((invAs/a.jot).toFixed(2)) : 0;
    const cpl   = a.leads>0 && invAs>0 ? parseFloat((invAs/a.leads).toFixed(2)) : 0;
    const roi   = invAs>0 ? parseFloat(((a.jot*TICKET_MENSUAL_EST)/invAs).toFixed(2)) : 0;
    return {
      x: cpa,
      y: parseFloat(a.efect.toFixed(1)),
      z: Math.max(30, a.leads*4),
      ...a, cpa, cpl, invAs, roi,
      col: PAL[i%PAL.length],
    };
  }).filter(d=>d.leads>0 && d.x>0);

  const avgX = data.length ? data.reduce((s,d)=>s+d.x,0)/data.length : 0;
  const avgY = data.length ? data.reduce((s,d)=>s+d.y,0)/data.length : 0;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ScatterChart margin={{ top:30, right:40, bottom:50, left:20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis type="number" dataKey="x" name="CPA Real $" tick={{ fontSize:9, fill:C.muted }}
          tickFormatter={v=>`$${v.toFixed(0)}`}
          label={{ value:"← CPA (Inversión / JOT) — menor es mejor →", position:"insideBottom", offset:-35, fontSize:8, fill:C.muted }} />
        <YAxis type="number" dataKey="y" name="Efectividad %" tick={{ fontSize:9, fill:C.muted }} unit="%"
          label={{ value:"Efectividad %", angle:-90, position:"insideLeft", fontSize:8, fill:C.muted, dy:50 }} />
        <ZAxis type="number" dataKey="z" range={[50,500]} />
        <ReferenceLine x={avgX} stroke={`${C.muted}55`} strokeDasharray="5 3"
          label={{ value:`Avg $${avgX.toFixed(0)}`, fontSize:7, fill:C.muted, position:"top" }} />
        <ReferenceLine y={avgY} stroke={`${C.muted}55`} strokeDasharray="5 3"
          label={{ value:`Avg ${avgY.toFixed(1)}%`, fontSize:7, fill:C.muted, position:"right" }} />
        <Tooltip content={({ active, payload }) => {
          if(!active||!payload?.length) return null;
          const d=payload[0]?.payload;
          return (
            <div style={{ background:"linear-gradient(135deg,#0f172a,#1e293b)", border:"1px solid #334155",
              borderRadius:"14px", padding:"14px 18px", fontSize:"9px", minWidth:"210px" }}>
              <div style={{ color:"#f1f5f9", fontWeight:900, marginBottom:"8px", fontSize:"11px" }}>{d?.nombre}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"7px" }}>
                {[
                  ["Leads",d?.leads,C.accent],["JOT",d?.jot,C.success],
                  ["Inv. Asignada",`$${n(d?.invAs).toFixed(0)}`,C.violet],["CPL Real",`$${n(d?.cpl).toFixed(2)}`,C.cyan],
                  ["CPA Real",`$${n(d?.cpa).toFixed(2)}`,C.danger],["Efectividad",`${d?.y}%`,C.success],
                  ["Score",d?.score?.toFixed(0),scCol(d?.score)],["ROI est.",`${n(d?.roi).toFixed(2)}x`,n(d?.roi)>=1?C.success:C.danger],
                ].map(([l,v,c])=>(
                  <div key={l}>
                    <div style={{ fontSize:"7px", color:"#64748b" }}>{l}</div>
                    <div style={{ fontSize:"9px", fontWeight:900, color:c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        }} />
        <Scatter data={data}>
          {data.map((d,i)=><Cell key={i} fill={d.col} opacity={0.82} />)}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** SCATTER: Inversión asignada (x) vs JOT logrado (y) */
function ScatterInvJOT({ asesores, canalMap }) {
  const totLeads = asesores.reduce((s,a)=>s+a.leads,0);
  const data = asesores.map((a,i)=>{
    const inf = canalMap[a.canal];
    const inv = inf ? (inf.inversion*(a.leads/Math.max(1,totLeads))) : 0;
    return {
      x: parseFloat(inv.toFixed(2)), y: a.jot,
      ...a, inv,
      roi: inv>0 ? ((a.jot*TICKET_MENSUAL_EST)/inv) : 0,
      col: PAL[i%PAL.length],
    };
  }).filter(d=>d.leads>0);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ScatterChart margin={{ top:20, right:30, bottom:50, left:10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis type="number" dataKey="x" tick={{ fontSize:9, fill:C.muted }} tickFormatter={v=>`$${v.toFixed(0)}`}
          label={{ value:"Inversión pauta asignada →", position:"insideBottom", offset:-30, fontSize:8, fill:C.muted }} />
        <YAxis type="number" dataKey="y" tick={{ fontSize:9, fill:C.muted }}
          label={{ value:"JOT logrados", angle:-90, position:"insideLeft", fontSize:8, fill:C.muted, dy:45 }} />
        <ZAxis range={[50,50]} />
        <Tooltip content={({ active, payload }) => {
          if(!active||!payload?.length) return null;
          const d=payload[0]?.payload;
          return (
            <div style={{ background:"#0f172a", border:"1px solid #334155", borderRadius:"12px", padding:"12px 16px", fontSize:"9px" }}>
              <div style={{ color:"#f1f5f9", fontWeight:900, marginBottom:"6px" }}>{d?.nombre}</div>
              <div style={{ color:"#64748b" }}>Inv. asignada: <b style={{ color:C.violet }}>${d?.x?.toFixed(2)}</b></div>
              <div style={{ color:"#64748b" }}>JOT: <b style={{ color:C.success }}>{d?.y}</b></div>
              <div style={{ color:"#64748b" }}>Leads: <b style={{ color:C.accent }}>{d?.leads}</b></div>
              <div style={{ color:"#64748b" }}>Efectividad: <b style={{ color:C.warning }}>{d?.efect?.toFixed(1)}%</b></div>
              <div style={{ color:"#64748b" }}>ROI est.: <b style={{ color:d?.roi>=1?C.success:C.danger }}>{d?.roi?.toFixed(2)}x</b></div>
            </div>
          );
        }} />
        <Scatter data={data}>
          {data.map((d,i)=><Cell key={i} fill={d.col} opacity={0.85} />)}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** BARRAS: Inversión asignada por asesor + CPA real */
function BarrasCostoApilado({ asesores, canalMap }) {
  const data = [...asesores]
    .filter(a=>a.leads>0 && n(a.inv_asignada)>0)
    .map((a,i)=>{
      const invAs = n(a.inv_asignada);
      const cpl   = a.leads>0 ? parseFloat((invAs/a.leads).toFixed(2)) : 0;
      const cpa   = a.jot>0  ? parseFloat((invAs/a.jot).toFixed(2))   : null;
      return {
        nombre: a.nombre.length>16 ? a.nombre.slice(0,16)+"…" : a.nombre,
        full: a.nombre,
        inv: parseFloat(invAs.toFixed(0)),
        cpl, cpa, jot: a.jot, leads: a.leads, efect: a.efect,
      };
    })
    .sort((a,b)=>b.inv-a.inv);

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length*36)}>
      <BarChart data={data} layout="vertical" margin={{ top:5, right:130, left:10, bottom:5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize:9, fill:C.muted }} tickFormatter={v=>`$${v}`} />
        <YAxis type="category" dataKey="nombre" tick={{ fontSize:8, fill:C.muted, fontWeight:700 }} width={130} />
        <Tooltip content={({ active, payload }) => {
          if(!active||!payload?.length) return null;
          const d=payload[0]?.payload;
          return (
            <div style={{ background:"#0f172a", border:"1px solid #334155", borderRadius:"12px", padding:"12px 16px", fontSize:"9px" }}>
              <div style={{ color:"#f1f5f9", fontWeight:900, marginBottom:"7px" }}>{d?.full}</div>
              <div style={{ color:"#64748b" }}>Inversión asignada: <b style={{ color:C.violet }}>${d?.inv}</b></div>
              <div style={{ color:"#64748b" }}>CPL real: <b style={{ color:C.cyan }}>${d?.cpl?.toFixed(2)}</b></div>
              {d?.cpa && <div style={{ color:"#64748b" }}>CPA real: <b style={{ color:C.danger }}>${d?.cpa}</b></div>}
              <div style={{ color:"#64748b" }}>Leads: <b style={{ color:C.accent }}>{d?.leads}</b></div>
              <div style={{ color:"#64748b" }}>JOT: <b style={{ color:C.success }}>{d?.jot}</b></div>
              <div style={{ color:"#64748b" }}>Efect.: <b style={{ color:efCol(d?.efect) }}>{d?.efect?.toFixed(1)}%</b></div>
            </div>
          );
        }} />
        <Bar dataKey="inv" name="Inversión asignada $" fill={C.violet} opacity={0.88} radius={[0,4,4,0]}>
          <LabelList dataKey="inv" position="right"
            content={({ x, y, width, height, value, index }) => {
              if(!value) return null;
              const cpa=data[index]?.cpa;
              return (
                <g>
                  <text x={x+width+6} y={y+height/2-3} fontSize={8} fontWeight={900} fill={C.violet}>${value}</text>
                  {cpa && <text x={x+width+6} y={y+height/2+9} fontSize={7} fill={C.danger}>CPA ${cpa}</text>}
                </g>
              );
            }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** AREA + LINE: Score asesores vs CPL canal */
function AreaScoreCPL({ asesores, canalList }) {
  const data = canalList.map(c=>{
    const lista=asesores.filter(a=>a.canal===c.canal);
    const avgScore=lista.length ? lista.reduce((s,a)=>s+a.score,0)/lista.length : 0;
    const avgEfect=lista.length ? lista.reduce((s,a)=>s+a.efect,0)/lista.length : 0;
    const cfg=getCanalCfg(c.canal);
    return {
      canal:cfg.label,
      "Score Asesores": parseFloat(avgScore.toFixed(1)),
      "Efectividad %":  parseFloat(avgEfect.toFixed(1)),
      "CPL Canal $":    c.cpl ? parseFloat(c.cpl.toFixed(2)) : 0,
    };
  }).filter(d=>d["Score Asesores"]>0||d["CPL Canal $"]>0);

  if(!data.length) return <div style={{ textAlign:"center", padding:"40px", color:C.muted, fontSize:"9px" }}>Sin datos</div>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top:20, right:30, bottom:10, left:0 }}>
        <defs>
          <linearGradient id="areaScoreG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={C.accent} stopOpacity={0.35} />
            <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="areaEfG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={C.success} stopOpacity={0.3} />
            <stop offset="95%" stopColor={C.success} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="canal" tick={{ fontSize:9, fill:C.muted, fontWeight:700 }} />
        <YAxis yAxisId="l" tick={{ fontSize:9, fill:C.muted }} width={38} />
        <YAxis yAxisId="r" orientation="right" tick={{ fontSize:9, fill:C.muted }} width={35} tickFormatter={v=>`$${v}`} />
        <Tooltip content={<DarkTip />} />
        <Legend wrapperStyle={{ fontSize:9 }} />
        <Area yAxisId="l" type="monotone" dataKey="Score Asesores" fill="url(#areaScoreG)"
          stroke={C.accent} strokeWidth={2.5} dot={{ r:5, fill:C.accent, strokeWidth:0 }}>
          <LabelList dataKey="Score Asesores" position="top"
            style={{ fontSize:8, fill:C.accent, fontWeight:900 }} formatter={v=>v>0?v:""} />
        </Area>
        <Area yAxisId="l" type="monotone" dataKey="Efectividad %" fill="url(#areaEfG)"
          stroke={C.success} strokeWidth={2} strokeDasharray="5 3"
          dot={{ r:4, fill:C.success, strokeWidth:0 }}>
          <LabelList dataKey="Efectividad %" position="top"
            style={{ fontSize:8, fill:C.success, fontWeight:800 }} formatter={v=>v>0?`${v}%`:""} />
        </Area>
        <Line yAxisId="r" type="monotone" dataKey="CPL Canal $" stroke={C.violet} strokeWidth={2.5}
          dot={{ r:5, fill:C.violet, stroke:"#fff", strokeWidth:2 }}>
          <LabelList dataKey="CPL Canal $" position="bottom"
            style={{ fontSize:8, fill:C.violet, fontWeight:900 }} formatter={v=>v>0?`$${v}`:""} />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** HEATMAP multimétrica con toggle */
function Heatmap({ asesoresXCanal, canales }) {
  const [modo,setModo]=useState("efect");
  const modos=[
    {v:"efect",l:"Efect%"},{v:"score",l:"Score"},
    {v:"pct_atc",l:"%ATC"},{v:"jot",l:"JOT"},{v:"leads",l:"Leads"},
  ];
  const asesores=[...new Set(Object.values(asesoresXCanal).flat().map(a=>a.nombre))];

  const getVal=(nm,c)=>{
    const a=(asesoresXCanal[c]||[]).find(x=>x.nombre===nm);
    if(!a) return null;
    if(modo==="pct_atc") return a.pct_atc!=null ? parseFloat(n(a.pct_atc).toFixed(1)) : null;
    if(modo==="jot") return a.jot;
    return a[modo] ?? null;
  };
  const hc=(v)=>{
    if(v===null) return "#f1f5f9";
    if(modo==="leads"){const t=Math.min(v/30,1);return t>0.7?"#1e3a8a":t>0.4?"#3b82f6":t>0.2?"#93c5fd":"#dbeafe";}
    if(modo==="jot"){const t=Math.min(v/10,1);return t>0.7?"#059669":t>0.4?"#10b981":t>0.1?"#34d399":"#d1fae5";}
    // %ATC: menor es mejor (rojo = alto ATC)
    if(modo==="pct_atc") return v>40?"#ef4444":v>20?"#f59e0b":v>5?"#10b981":"#d1fae5";
    return v>=20?"#059669":v>=15?"#10b981":v>=10?"#34d399":v>=5?"#f59e0b":"#ef4444";
  };

  return (
    <div>
      <div style={{ display:"flex", gap:"6px", marginBottom:"14px", flexWrap:"wrap" }}>
        {modos.map(m=>(
          <button key={m.v} onClick={()=>setModo(m.v)} style={{
            padding:"5px 14px", borderRadius:"9999px", border:"none",
            fontSize:"8px", fontWeight:900, cursor:"pointer",
            background:modo===m.v?C.primary:C.light,
            color:modo===m.v?"#fff":C.muted, transition:"all 0.15s",
          }}>{m.l}</button>
        ))}
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ fontSize:"8px", fontFamily:"monospace", borderCollapse:"collapse", width:"100%" }}>
          <thead>
            <tr>
              <th style={{ padding:"8px 14px", borderRight:`1px solid ${C.border}`, textAlign:"left",
                fontWeight:900, color:C.muted, textTransform:"uppercase", minWidth:"150px",
                position:"sticky", left:0, background:C.light, zIndex:2 }}>ASESOR</th>
              {canales.map(c=>{const cfg=getCanalCfg(c); return (
                <th key={c} style={{ padding:"8px 12px", borderRight:`1px solid ${C.border}`,
                  textAlign:"center", fontWeight:900, color:cfg.color, fontSize:"8px",
                  minWidth:"88px", background:cfg.bg }}>
                  <div>{cfg.icon}</div><div style={{ marginTop:"2px" }}>{cfg.label}</div>
                </th>
              );})}
            </tr>
          </thead>
          <tbody>
            {asesores.map((nm,i)=>(
              <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                <td style={{ padding:"8px 14px", borderRight:`1px solid ${C.border}`,
                  fontWeight:700, color:C.slate, whiteSpace:"nowrap",
                  position:"sticky", left:0, background:"#fff", zIndex:1 }}>{nm}</td>
                {canales.map(c=>{
                  const v=getVal(nm,c); const bg=hc(v);
                  const lightText=bg==="#059669"||bg==="#10b981"||bg==="#1e3a8a"||bg==="#3b82f6"||bg==="#ef4444";
                  return (
                    <td key={c} style={{ padding:"5px 10px", borderRight:`1px solid ${C.border}`, textAlign:"center" }}>
                      <div style={{ width:"60px", height:"28px", margin:"0 auto", borderRadius:"8px",
                        background:bg, display:"flex", alignItems:"center", justifyContent:"center",
                        color:lightText?"#fff":(v!==null?C.slate:C.muted), fontSize:"9px", fontWeight:900,
                        boxShadow:v!==null?`0 2px 8px ${bg}50`:"none" }}>
                        {v!==null ? (modo==="leads"||modo==="jot" ? v : (v.toFixed(0)+"%")) : "—"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Por campaña: ranking visual por canal */
function PorCampana({ canal, asesores, totalCanal, pautaInfo }) {
  const cfg=getCanalCfg(canal);
  if(!asesores?.length) return null;
  const sorted=[...asesores].sort((a,b)=>b.efect-a.efect);
  const top=sorted[0];

  return (
    <div style={{ background:"#fff", borderRadius:"20px",
      border:`1px solid ${cfg.color}30`, overflow:"hidden",
      boxShadow:`0 6px 30px ${cfg.color}12` }}>
      {/* Header canal */}
      <div style={{ padding:"16px 22px",
        background:`linear-gradient(135deg,${cfg.bg},${cfg.color}12)`,
        borderBottom:`1px solid ${cfg.color}25`,
        display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"12px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
          <span style={{ fontSize:"24px" }}>{cfg.icon}</span>
          <div>
            <div style={{ fontSize:"12px", fontWeight:900, color:cfg.color, textTransform:"uppercase", letterSpacing:"0.12em" }}>{cfg.label}</div>
            <div style={{ fontSize:"8px", color:C.muted }}>{asesores.length} asesores · {totalCanal} leads del canal</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:"16px", alignItems:"center", flexWrap:"wrap" }}>
          {pautaInfo && pautaInfo.cpl && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:"7px", color:C.muted }}>CPL Canal</div>
              <div style={{ fontSize:"12px", fontWeight:900, color:C.violet }}>${pautaInfo.cpl.toFixed(2)}</div>
            </div>
          )}
          {pautaInfo && pautaInfo.inversion>0 && (
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:"7px", color:C.muted }}>Inversión</div>
              <div style={{ fontSize:"12px", fontWeight:900, color:C.violet }}>${pautaInfo.inversion.toFixed(0)}</div>
            </div>
          )}
          {top && (
            <div style={{ display:"flex", alignItems:"center", gap:"8px", padding:"8px 14px",
              background:`${C.success}12`, border:`1px solid ${C.success}30`, borderRadius:"10px" }}>
              <span>🏆</span>
              <div>
                <div style={{ fontSize:"7px", color:C.muted, fontWeight:900 }}>Mejor</div>
                <div style={{ fontSize:"10px", fontWeight:900, color:C.success }}>{top.nombre.split(" ")[0]} — {top.efect.toFixed(1)}%</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding:"16px 22px" }}>
        {/* Barras horizontales efectividad */}
        <ResponsiveContainer width="100%" height={Math.max(120, sorted.length*34)}>
          <ComposedChart
            data={sorted.map(a=>({
              nombre: a.nombre.length>20?a.nombre.slice(0,20)+"…":a.nombre,
              full: a.nombre,
              efect: parseFloat(a.efect.toFixed(1)),
              leads:a.leads, jot:a.jot, ventas:a.ventas,
              score:parseFloat(a.score.toFixed(0)),
              pct_atc:parseFloat(pct(a.atc,a.leads).toFixed(1)),
              costoLead: n(a.inv_asignada)>0&&a.leads>0 ? parseFloat((n(a.inv_asignada)/a.leads).toFixed(2)) : (pautaInfo?.cpl||0),
            }))}
            layout="vertical"
            margin={{ top:5, right:80, left:130, bottom:5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize:8, fill:C.muted }} domain={[0,100]} unit="%" />
            <YAxis type="category" dataKey="nombre" tick={{ fontSize:8, fill:C.muted, fontWeight:700 }} width={130} />
            <Tooltip content={({ active, payload }) => {
              if(!active||!payload?.length) return null;
              const d=payload[0]?.payload;
              return (
                <div style={{ background:"#0f172a", border:"1px solid #334155", borderRadius:"12px", padding:"12px 16px", fontSize:"9px" }}>
                  <div style={{ color:cfg.color, fontWeight:900, marginBottom:"6px" }}>{d?.full}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"6px" }}>
                    {[
                      ["Leads",d?.leads,C.accent],["JOT",d?.jot,C.success],
                      ["Ventas",d?.ventas,C.cyan],["% ATC",`${d?.pct_atc}%`,d?.pct_atc>40?C.danger:C.muted],
                      ["Efect.",`${d?.efect}%`,efCol(d?.efect)],["Score",d?.score,scCol(d?.score)],
                      ["Costo/Lead",`$${d?.costoLead}`,C.orange],
                    ].map(([l,v,c])=>(
                      <div key={l}><div style={{ fontSize:"7px", color:"#64748b" }}>{l}</div>
                      <div style={{ fontSize:"9px", fontWeight:900, color:c }}>{v}</div></div>
                    ))}
                  </div>
                </div>
              );
            }} />
            <Bar dataKey="efect" name="Efectividad %" radius={[0,6,6,0]}>
              {sorted.map((a,i)=><Cell key={i} fill={efCol(a.efect)} opacity={i===0?1:0.65} />)}
              <LabelList dataKey="efect" position="right"
                content={({ x, y, width, height, value, index }) => {
                  const color=efCol(sorted[index]?.efect||0);
                  return value>0 ? <text x={x+width+6} y={y+height/2+4} fontSize={9} fontWeight={900} fill={color}>{value}%</text> : null;
                }} />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>

        {/* Tabla mini */}
        <div style={{ overflowX:"auto", marginTop:"12px" }}>
          <table style={{ fontSize:"8px", fontFamily:"monospace", borderCollapse:"collapse", width:"100%" }}>
            <thead style={{ background:cfg.bg, borderBottom:`1px solid ${cfg.color}20` }}>
              <tr>
                {["#","ASESOR","LEADS","JOT","VENTAS","%EFECT","%ATC","COSTO/LEAD","SCORE"].map(h=>(
                  <th key={h} style={{ padding:"6px 10px", borderRight:`1px solid ${cfg.color}20`,
                    fontWeight:900, textTransform:"uppercase", color:cfg.color, textAlign:"center" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((a,i)=>{
                const cL = n(a.inv_asignada)>0&&a.leads>0 ? parseFloat((n(a.inv_asignada)/a.leads).toFixed(2)) : (pautaInfo?.cpl||0);
                return (
                  <tr key={i} style={{ borderBottom:`1px solid ${C.border}`, background:i===0?`${C.success}05`:"#fff" }}>
                    <td style={{ padding:"7px 10px", borderRight:`1px solid ${C.border}`, textAlign:"center",
                      color:i===0?C.success:C.muted, fontWeight:i===0?900:500 }}>{i===0?"🏆":i+1}</td>
                    <td style={{ padding:"7px 10px", borderRight:`1px solid ${C.border}`, fontWeight:700, color:C.slate, whiteSpace:"nowrap" }}>{a.nombre}</td>
                    <td style={{ padding:"7px 10px", borderRight:`1px solid ${C.border}`, textAlign:"center", color:C.accent, fontWeight:700 }}>{a.leads}</td>
                    <td style={{ padding:"7px 10px", borderRight:`1px solid ${C.border}`, textAlign:"center", color:C.success, fontWeight:900 }}>{a.jot}</td>
                    <td style={{ padding:"7px 10px", borderRight:`1px solid ${C.border}`, textAlign:"center", color:C.cyan }}>{a.ventas}</td>
                    <td style={{ padding:"7px 10px", borderRight:`1px solid ${C.border}`, textAlign:"center", fontWeight:900, color:efCol(a.efect) }}>{a.efect.toFixed(1)}%</td>
                    <td style={{ padding:"7px 10px", borderRight:`1px solid ${C.border}`, textAlign:"center", color:pct(a.atc,a.leads)>40?C.danger:C.muted }}>{pct(a.atc,a.leads).toFixed(1)}%</td>
                    <td style={{ padding:"7px 10px", borderRight:`1px solid ${C.border}`, textAlign:"center", color:C.orange, fontWeight:700 }}>${cL}</td>
                    <td style={{ padding:"7px 10px", textAlign:"center", fontWeight:900, color:scCol(a.score) }}>{a.score.toFixed(0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Tabla ranking global con inversión real */
function TablaRanking({ data, canalMap }) {
  const [ord,setOrd]=useState({ col:"score", dir:"desc" });
  const toggle=col=>setOrd(p=>p.col===col?{col,dir:p.dir==="desc"?"asc":"desc"}:{col,dir:"desc"});

  const rows=data.map(a=>{
    const invAs = n(a.inv_asignada);
    const cpl   = a.leads>0 && invAs>0 ? parseFloat((invAs/a.leads).toFixed(2)) : 0;
    const cpa   = a.jot>0  && invAs>0  ? parseFloat((invAs/a.jot).toFixed(2))   : null;
    return { ...a, inv_asignada: invAs, cpl_real: cpl, cpa_real: cpa };
  });

  const sorted=[...rows].sort((a,b)=>{
    const va=n(a[ord.col]??-1), vb=n(b[ord.col]??-1);
    return ord.dir==="desc"?vb-va:va-vb;
  });

  const cols=[
    {k:"_i",l:"#"},{k:"nombre",l:"ASESOR"},{k:"canal",l:"CANAL"},
    {k:"leads",l:"LEADS"},{k:"negoc",l:"NEGOC."},{k:"atc",l:"ATC"},
    {k:"pct_atc",l:"%ATC",fmt:v=>`${n(v).toFixed(1)}%`,cf:atcCol},
    {k:"ventas",l:"VENTAS"},{k:"jot",l:"JOT"},
    {k:"efect",l:"EFECT%",fmt:v=>`${n(v).toFixed(1)}%`,cf:efCol},
    {k:"inv_asignada",l:"INV. ASIGNADA",fmt:v=>v>0?`$${n(v).toFixed(0)}`:"—"},
    {k:"cpl_real",l:"CPL REAL",fmt:v=>v>0?`$${n(v).toFixed(2)}`:"—"},
    {k:"cpa_real",l:"CPA REAL",fmt:v=>v?`$${n(v).toFixed(2)}`:"—",cf:v=>v?n(v)<50?C.success:n(v)<150?C.warning:C.danger:C.muted},
    {k:"score",l:"SCORE ★",cf:scCol},
  ];

  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ fontSize:"9px", fontFamily:"monospace", borderCollapse:"collapse", width:"100%", whiteSpace:"nowrap" }}>
        <thead style={{ position:"sticky", top:0, background:C.light, borderBottom:`2px solid ${C.border}`, zIndex:10 }}>
          <tr>
            {cols.map(c=>(
              <th key={c.k} onClick={()=>!["_i","nombre","canal"].includes(c.k)&&toggle(c.k)}
                style={{ padding:"9px 12px", borderRight:`1px solid ${C.border}`,
                  textAlign:"center", fontWeight:900, fontSize:"8px",
                  textTransform:"uppercase", letterSpacing:"0.05em",
                  color:ord.col===c.k?C.accent:C.muted,
                  cursor:!["_i","nombre","canal"].includes(c.k)?"pointer":"default",
                  background:ord.col===c.k?`${C.accent}08`:"transparent" }}>
                {c.l}{ord.col===c.k?(ord.dir==="desc"?" ▼":" ▲"):""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row,idx)=>{
            const cfg=getCanalCfg(row.canal);
            return (
              <tr key={idx} style={{ borderBottom:`1px solid ${C.border}`, background:idx===0&&ord.col==="score"?`${C.success}05`:"#fff" }}>
                <td style={{ padding:"9px 12px", borderRight:`1px solid ${C.border}`, textAlign:"center",
                  color:idx===0?C.success:C.muted, fontWeight:idx===0?900:500 }}>
                  {idx===0&&ord.col==="score"?"🏆":idx+1}</td>
                <td style={{ padding:"9px 12px", borderRight:`1px solid ${C.border}`, fontWeight:700, color:C.slate }}>{row.nombre}</td>
                <td style={{ padding:"9px 12px", borderRight:`1px solid ${C.border}`, textAlign:"center" }}>
                  <span style={{ padding:"2px 7px", borderRadius:"9999px", background:cfg.bg,
                    color:cfg.color, fontWeight:900, fontSize:"7px", border:`1px solid ${cfg.color}30` }}>
                    {cfg.icon} {cfg.label}</span>
                </td>
                {cols.slice(3).map(c=>{
                  const val=row[c.k]; const color=c.cf?c.cf(val):C.slate;
                  const disp=c.fmt?c.fmt(val):(val??'—');
                  return (
                    <td key={c.k} style={{ padding:"9px 12px", borderRight:`1px solid ${C.border}`,
                      textAlign:"center", color, fontWeight:c.k==="score"?900:500 }}>
                      {c.k==="score"?(
                        <div><div style={{ fontWeight:900, color }}>{n(val).toFixed(0)}</div>
                        <div style={{ height:"3px", borderRadius:"9999px", marginTop:"3px", background:`${color}20` }}>
                          <div style={{ width:`${Math.min(n(val),100)}%`, height:"100%", background:color, borderRadius:"9999px" }} /></div></div>
                      ):disp}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function TabAsesorVsPauta({ filtro, canalesSel, onCanalesSel }) {
  const { desde, hasta } = filtro;
  const [rawA, setRawA] = useState(null);
  const [rawR, setRawR] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sub, setSub] = useState("campanas");
  const [asel, setAsel] = useState("");

  useEffect(() => {
    if(!desde||!hasta) return;
    setLoading(true);
    const p=buildFiltroParams({ desde, hasta, canalesSel });
    Promise.all([
      fetch(`${API}/api/indicadores/dashboard?fechaDesde=${desde}&fechaHasta=${hasta}`).then(r=>r.json()).catch(()=>null),
      fetch(`${API}/api/redes/monitoreo-redes?${p}`).then(r=>r.json()).catch(()=>null),
    ]).then(([a,r])=>{
      if(a?.success) setRawA(a);
      if(r?.success) setRawR(r);
    }).finally(()=>setLoading(false));
  }, [desde, hasta, JSON.stringify(canalesSel)]);

  const asesores = useMemo(() => {
    if(!rawA) return [];
    return (rawA.asesores||[]).map(a=>{
      const leads=n(a.leads_totales||a.real_mes_leads||0);
      const ventas=n(a.ventas_crm||a.v_subida_crm_hoy||0);
      const jot=n(a.ingresos_reales||a.v_subida_jot_hoy||0);
      const atc=n(a.atc_soporte||a.sac||0);
      const negoc=Math.max(0,leads-atc);
      const efect=pct(jot,leads);
      const score=calcScore({leads,ventas,jot,atc,negoc});
      return { nombre:a.nombre_grupo||"Sin nombre", supervisor:a.supervisor||"",
        canal:"GENERAL", leads, ventas, jot, atc, negoc, efect, score, pct_atc:pct(atc,leads) };
    }).filter(a=>a.leads>0);
  }, [rawA]);

  const pauta = useMemo(() => {
    if(!rawR?.data) return { canales:[], totalInv:0, map:{} };
    const filas=rawR.data; const map={}, inv={};
    filas.forEach(row=>{
      const c=row.canal_inversion||row.canal_publicidad||"SIN MAPEO";
      if(c==="MAL INGRESO"||c==="SIN MAPEO") return;
      if(!map[c]) map[c]={ canal:c, leads:0, activos:0, jot:0, inversion:0, atc:0 };
      map[c].leads  += n(row.n_leads);
      map[c].activos+= n(row.activos_mes);
      map[c].jot    += n(row.ingreso_jot);
      // ATC del canal desde redes (atc_soporte en mv_monitoreo_publicidad)
      map[c].atc    += n(row.atc_soporte||0);
      const k=`${String(row.fecha).split("T")[0]}|${c}`;
      if(!inv[k]&&n(row.inversion_usd)>0){ map[c].inversion+=n(row.inversion_usd); inv[k]=true; }
    });
    const canales=Object.values(map).map(c=>({
      ...c, cpl:c.leads>0&&c.inversion>0?c.inversion/c.leads:null,
      efect:pct(c.activos,c.leads),
      roas:c.inversion>0?(c.activos*TICKET_MENSUAL_EST)/c.inversion:null,
    }));
    const cmap={};
    canales.forEach(c=>{ cmap[c.canal]=c; });
    return { canales, totalInv:canales.reduce((s,c)=>s+c.inversion,0), map:cmap };
  }, [rawR]);

  const canales=pauta.canales.map(c=>c.canal);
  const totLeads=pauta.canales.reduce((s,c)=>s+c.leads,0);

  const asesXCanal = useMemo(()=>{
    if(!asesores.length||!pauta.canales.length) return {};
    const r={};
    const totLeadsAses = asesores.reduce((s,a)=>s+a.leads,0);
    pauta.canales.forEach(c=>{
      const prop       = totLeads>0 ? c.leads/totLeads : 0;
      const canalAtc   = c.atc||0;
      const canalInv   = c.inversion||0;
      const canalLeads = Math.max(1, c.leads||1);
      r[c.canal]=asesores
        .map(a=>{
          const aLeads = Math.round(a.leads*prop);
          const aAtc   = totLeadsAses>0 ? Math.round(canalAtc*(a.leads/totLeadsAses)) : 0;
          // Inversión proporcional: cuánto del presupuesto del canal le "corresponde" a este asesor
          const aInv   = parseFloat((canalInv * (aLeads / canalLeads)).toFixed(2));
          return { ...a, canal:c.canal,
            leads:aLeads, jot:Math.round(a.jot*prop),
            ventas:Math.round(a.ventas*prop), atc:aAtc,
            negoc:Math.round(a.negoc*prop), inv_asignada:aInv };
        })
        .map(a=>({
          ...a,
          efect:   pct(a.jot,a.leads),
          pct_atc: pct(a.atc,a.leads),
          score:   calcScore(a),
          cpa_real: a.inv_asignada>0 && a.jot>0 ? parseFloat((a.inv_asignada/a.jot).toFixed(2)) : null,
        }))
        .filter(a=>a.leads>0)
        .sort((a,b)=>b.efect-a.efect);
    });
    return r;
  }, [asesores, pauta]);

  const canalPpal = pauta.canales.length>0 ? pauta.canales.sort((a,b)=>b.leads-a.leads)[0] : null;

  // Cuando hay 1 canal filtrado, usar los datos proporcionales de asesXCanal
  // así las burbujas y scatter reflejan exactamente ese canal
  const asesConCanal = useMemo(() => {
    if (canalesSel.length === 1 && asesXCanal[canalesSel[0]]?.length) {
      return asesXCanal[canalesSel[0]];
    }
    // Vista global: distribución proporcional de inversión total entre asesores
    return asesores.map(a=>{
      const aInv = pauta.totalInv>0 && glob.totL>0
        ? parseFloat((pauta.totalInv * (a.leads / Math.max(1, glob.totL))).toFixed(2))
        : 0;
      return {
        ...a,
        canal: canalPpal?.canal||"GENERAL",
        inv_asignada: aInv,
        cpa_real: aInv>0 && a.jot>0 ? parseFloat((aInv/a.jot).toFixed(2)) : null,
      };
    });
  }, [canalesSel, asesXCanal, asesores, canalPpal, pauta.totalInv, glob.totL]);

  const asesFilt = asel ? asesConCanal.filter(a=>a.nombre===asel) : asesConCanal;

  const glob = useMemo(()=>{
    const totL=asesores.reduce((s,a)=>s+a.leads,0);
    const totJ=asesores.reduce((s,a)=>s+a.jot,0);
    const totA=asesores.reduce((s,a)=>s+a.atc,0);
    const sa=asesores.length>0?asesores.reduce((s,a)=>s+a.score,0)/asesores.length:0;
    const top=[...asesores].sort((a,b)=>b.score-a.score)[0];
    return { totL, totJ, totA, efect:pct(totJ,totL), pctAtc:pct(totA,totL), scoreAvg:sa, top };
  }, [asesores]);

  const TABS=[
    {id:"campanas",l:"Por Campaña",i:"📡"},{id:"burbujas",l:"Costo vs Efect.",i:"🫧"},
    {id:"inversion",l:"Inv. vs JOT",i:"💸"},{id:"costo",l:"Costo Total",i:"🧮"},
    {id:"cruce",l:"Score vs CPL",i:"📊"},{id:"ranking",l:"Ranking",i:"🏆"},
    {id:"radar",l:"Radar",i:"🕸️"},{id:"heatmap",l:"Mapa Calor",i:"🌡️"},
  ];

  if(loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"80px", gap:"12px" }}>
      <div style={{ width:"36px", height:"36px", border:`3px solid ${C.accent}30`, borderTopColor:C.accent,
        borderRadius:"9999px", animation:"spin 0.8s linear infinite" }} />
      <span style={{ fontSize:"12px", color:C.muted, fontWeight:700 }}>Cargando análisis...</span>
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"22px" }}>

      {/* HEADER */}
      <div style={{
        background:"linear-gradient(135deg,#0f172a 0%,#1e3a8a 55%,#312e81 100%)",
        borderRadius:"22px", padding:"22px 28px",
        display:"flex", alignItems:"flex-start", justifyContent:"space-between",
        flexWrap:"wrap", gap:"16px", boxShadow:"0 12px 40px rgba(15,23,42,0.35)",
        position:"relative", overflow:"hidden",
      }}>
        <div style={{ position:"absolute", right:"70px", top:"-30px", width:"160px", height:"160px",
          borderRadius:"50%", background:"rgba(99,102,241,0.1)", pointerEvents:"none" }} />
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"8px" }}>
            <div style={{ background:"rgba(59,130,246,0.25)", borderRadius:"10px", padding:"6px 8px", fontSize:"20px" }}>⚡</div>
            <span style={{ fontSize:"15px", fontWeight:900, color:"#f8fafc", textTransform:"uppercase", letterSpacing:"0.1em" }}>
              Asesores vs Campaña
            </span>
            <span style={{ fontSize:"8px", fontWeight:900, padding:"3px 10px", borderRadius:"9999px",
              background:"rgba(59,130,246,0.25)", color:"#93c5fd", textTransform:"uppercase" }}>
              {asesores.length} asesores · {canales.length} canales
            </span>
          </div>
          <p style={{ fontSize:"9px", color:"#64748b", marginLeft:"44px" }}>
            CPA real · Inversión asignada por asesor · Score vs CPL · Heatmap multi-métrica
          </p>
          <p style={{ fontSize:"8px", color:"#475569", marginLeft:"44px", marginTop:"3px" }}>
            💡 Inversión proporcional según leads por canal · Ticket est. ${TICKET_MENSUAL_EST}/cliente activo
          </p>
        </div>
        {glob.top && (
          <div style={{ background:"rgba(16,185,129,0.15)", border:"1px solid rgba(16,185,129,0.3)",
            borderRadius:"14px", padding:"12px 18px", display:"flex", alignItems:"center", gap:"10px" }}>
            <span style={{ fontSize:"24px" }}>🏆</span>
            <div>
              <div style={{ fontSize:"7px", color:"#64748b", textTransform:"uppercase", fontWeight:900 }}>Mejor Score</div>
              <div style={{ fontSize:"12px", fontWeight:900, color:C.success }}>
                {glob.top.nombre} — {glob.top.score.toFixed(0)} pts
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FILTROS — solo asesor (canal ya está en el panel global superior) */}
      <div style={{ background:"#fff", borderRadius:"16px", border:`1px solid ${C.border}`, padding:"14px 22px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"12px", flexWrap:"wrap" }}>
          <span style={{ fontSize:"8px", fontWeight:900, color:C.muted, textTransform:"uppercase" }}>👤 Asesor:</span>
          <AsesorDropdown asesores={asesores} value={asel} onChange={setAsel} />
          {asel && (
            <button onClick={()=>setAsel("")} style={{ fontSize:"8px", color:C.danger, fontWeight:900,
              background:`${C.danger}10`, border:`1px solid ${C.danger}30`,
              borderRadius:"9999px", padding:"4px 12px", cursor:"pointer" }}>✕ Limpiar</button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:"14px" }}>
        <Kpi label="Total Leads" value={glob.totL||"—"} icon="👥" color={C.accent} sub={`${asesores.length} asesores activos`} />
        <Kpi label="JOT Logrados" value={glob.totJ||"—"} icon="✅" color={C.success} sub={`${glob.efect.toFixed(1)}% efectividad`} />
        <Kpi label="% ATC Promedio" value={`${glob.pctAtc.toFixed(1)}%`} icon="⚠️"
          color={glob.pctAtc>40?C.danger:glob.pctAtc>20?C.warning:C.success}
          sub={`${glob.totA} leads ATC`} />
        <Kpi label="Score Promedio" value={glob.scoreAvg.toFixed(0)} icon="⭐"
          color={glob.scoreAvg>=60?C.success:glob.scoreAvg>=35?C.warning:C.danger} sub="0-100" />
        <Kpi label="Inversión Pauta" value={pauta.totalInv>0?`$${pauta.totalInv.toFixed(0)}`:"—"} icon="💰"
          color={C.violet} sub={`${pauta.canales.length} canales`} />
        <Kpi label="CPA Promedio" icon="🧮" color={C.orange}
          value={(() => {
            const conJot = asesConCanal.filter(a=>a.jot>0&&n(a.inv_asignada)>0);
            if(!conJot.length) return "—";
            const avg = conJot.reduce((s,a)=>s+n(a.inv_asignada)/a.jot,0)/conJot.length;
            return `$${avg.toFixed(0)}`;
          })()}
          sub="Inversión real / JOT por asesor" />
      </div>

      {/* SUB-TABS */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:"4px", background:"#fff",
        border:`1px solid ${C.border}`, borderRadius:"16px", padding:"5px", width:"fit-content",
        boxShadow:"0 2px 12px rgba(0,0,0,0.05)" }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setSub(t.id)} style={{
            display:"flex", alignItems:"center", gap:"6px", padding:"8px 16px",
            borderRadius:"11px", border:"none", fontSize:"9px", fontWeight:900,
            textTransform:"uppercase", letterSpacing:"0.07em", cursor:"pointer",
            background:sub===t.id?"linear-gradient(135deg,#0f172a,#1e3a8a)":"transparent",
            color:sub===t.id?"#fff":C.muted, transition:"all 0.15s",
            boxShadow:sub===t.id?"0 4px 12px rgba(15,23,42,0.3)":"none",
          }}>
            <span>{t.i}</span><span>{t.l}</span>
          </button>
        ))}
      </div>

      {/* ══ CAMPANAS ══ */}
      {sub==="campanas" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"20px" }}>
          {canales.length===0 ? (
            <div style={{ textAlign:"center", padding:"60px", color:C.muted }}>
              <div style={{ fontSize:"48px", marginBottom:"12px" }}>📡</div>
              <div style={{ fontSize:"12px", fontWeight:700 }}>Sin datos de campañas para el período</div>
            </div>
          ) : canales.map(c=>(
            <PorCampana key={c} canal={c}
              asesores={asesXCanal[c]||[]}
              totalCanal={pauta.map[c]?.leads||0}
              pautaInfo={pauta.map[c]} />
          ))}
          {canales.length>1 && (
            <Card title="Comparativa Efectividad Promedio por Campaña" accent={C.accent}
              subtitle="Promedio de asesores por canal · línea de referencia = promedio global">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={canales.map(c=>{
                    const lista=asesXCanal[c]||[];
                    const avg=lista.length?lista.reduce((s,a)=>s+a.efect,0)/lista.length:0;
                    const cfg=getCanalCfg(c);
                    return { canal:cfg.label, avg:parseFloat(avg.toFixed(1)), _c:cfg.color };
                  })}
                  margin={{ top:30, right:10, left:0, bottom:10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="canal" axisLine={false} tickLine={false} tick={{ fontSize:9, fill:C.muted, fontWeight:700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize:9, fill:C.muted }} unit="%" />
                  <Tooltip content={<DarkTip />} formatter={v=>`${v}%`} />
                  <ReferenceLine y={glob.efect} stroke={`${C.muted}80`} strokeDasharray="4 3"
                    label={{ value:`Prom ${glob.efect.toFixed(1)}%`, fontSize:8, fill:C.muted, position:"insideTopRight" }} />
                  <Bar dataKey="avg" name="Efect. promedio" radius={[8,8,0,0]} barSize={44}>
                    {canales.map((c,i)=><Cell key={i} fill={getCanalCfg(c).color} />)}
                    <LabelList dataKey="avg" position="top"
                      content={({ x, y, width, value, index })=>{
                        const col=getCanalCfg(canales[index]||"").color||C.accent;
                        return value>0?<text x={x+width/2} y={y-5} textAnchor="middle" fontSize={12} fontWeight={900} fill={col}>{value}%</text>:null;
                      }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      )}

      {/* ══ BURBUJAS ══ */}
      {sub==="burbujas" && (
        <Card title="Burbujas: Costo Total/Lead vs Efectividad"
          subtitle="Tamaño = leads · X = CPL canal + costo asesor · Y = efectividad % · Ideal: arriba-izquierda"
          accent={C.violet}>
          <BubbleCostoEfect asesores={asel ? asesFilt : asesConCanal} canalMap={pauta.map} />
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"10px", marginTop:"16px" }}>
            {[
              {l:"⭐ Arriba-Izq.",c:C.success,bg:"#d1fae5",d:"Bajo costo + alta efect. = óptimo"},
              {l:"🔄 Arriba-Der.",c:C.warning,bg:"#fef3c7",d:"Alta efect., optimizar inversión"},
              {l:"🔍 Abajo-Izq.", c:C.cyan,  bg:"#e0f2fe",d:"Costo bajo, mejorar gestión"},
              {l:"⛔ Abajo-Der.", c:C.danger, bg:"#fee2e2",d:"Alto costo + baja efect. — revisar"},
            ].map(q=>(
              <div key={q.l} style={{ padding:"10px 14px", borderRadius:"10px", background:q.bg, border:`1px solid ${q.c}20` }}>
                <div style={{ fontSize:"9px", fontWeight:900, color:q.c }}>{q.l}</div>
                <div style={{ fontSize:"8px", color:C.muted, marginTop:"2px" }}>{q.d}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ══ INVERSIÓN vs JOT ══ */}
      {sub==="inversion" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"20px" }}>
          <Card title="Scatter: Inversión de Pauta Asignada vs JOT Logrado"
            subtitle="Cada punto = asesor · ROI en tooltip · Ideal: parte superior"
            accent={C.success}>
            <ScatterInvJOT asesores={asel ? asesFilt : asesConCanal} canalMap={pauta.map} />
          </Card>
          {/* JOT vs Leads apilado */}
          <Card title="JOT Logrado vs Gap de Conversión — Todos los Asesores"
            subtitle="Barra verde = JOT activados · Gris = no convertidos aún"
            accent={C.success}>
            <ResponsiveContainer width="100%" height={Math.max(200, asesores.length*28)}>
              <BarChart layout="vertical"
                data={[...asesores].sort((a,b)=>b.jot-a.jot).map(a=>({
                  nombre: a.nombre.length>22?a.nombre.slice(0,22)+"…":a.nombre,
                  JOT: a.jot, Gap: Math.max(0,a.leads-a.jot),
                }))}
                margin={{ top:5, right:60, left:10, bottom:5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize:9, fill:C.muted }} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize:8, fill:C.muted }} width={155} />
                <Tooltip content={<DarkTip />} />
                <Legend wrapperStyle={{ fontSize:9 }} />
                <Bar dataKey="JOT" name="JOT (Activados)" fill={C.success} stackId="a">
                  <LabelList dataKey="JOT" position="insideLeft"
                    style={{ fontSize:8, fill:"#fff", fontWeight:900 }} formatter={v=>v>0?v:""} />
                </Bar>
                <Bar dataKey="Gap" name="No convertidos" fill={`${C.muted}30`} stackId="a" radius={[0,4,4,0]}>
                  <LabelList dataKey="Gap" position="right" style={{ fontSize:8, fill:C.muted }} formatter={v=>v>0?v:""} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* ══ COSTO TOTAL ══ */}
      {sub==="costo" && (
        <Card title="Inversión Asignada por Asesor y CPA Real"
          subtitle="Inversión proporcional por leads del canal · CPA = Inversión / JOT logrado · Menor CPA = más eficiente"
          accent={C.orange}
          badge={
            <div style={{ display:"flex", gap:"8px" }}>
              <span style={{ fontSize:"8px", padding:"3px 10px", borderRadius:"9999px",
                background:`${C.violet}15`, color:C.violet, fontWeight:900 }}>■ Inv. Asignada</span>
              <span style={{ fontSize:"8px", padding:"3px 10px", borderRadius:"9999px",
                background:`${C.danger}15`, color:C.danger, fontWeight:900 }}>● CPA Real</span>
            </div>
          }>
          <BarrasCostoApilado asesores={asel?asesFilt:asesConCanal} canalMap={pauta.map} />
          <div style={{ marginTop:"16px", padding:"12px 16px", borderRadius:"12px",
            background:"#f8fafc", border:`1px solid ${C.border}`, fontSize:"8px", color:C.muted }}>
            💡 <b style={{ color:C.slate }}>Cómo leer:</b> Morado = pauta digital (CPL).
            Naranja = parte del salario del asesor proporcional a leads atendidos.
            Total = costo real por lead captado. CPA = costo por cliente activado (JOT).
          </div>
        </Card>
      )}

      {/* ══ SCORE vs CPL ══ */}
      {sub==="cruce" && (
        <Card title="Score Asesores + Efectividad vs CPL Canal"
          subtitle="Área azul = score promedio asesores · Área verde = efectividad · Línea violeta = CPL de la pauta"
          accent={C.cyan}>
          <AreaScoreCPL asesores={asesores} canalList={pauta.canales} />
          <div style={{ marginTop:"14px", padding:"12px 16px", borderRadius:"12px",
            background:"#f0f9ff", border:"1px solid #bae6fd", fontSize:"8px", color:C.muted }}>
            💡 <b style={{ color:C.slate }}>Análisis clave:</b> Si el Score/Efectividad sube mientras el CPL también sube,
            la pauta atrae leads de mayor calidad aunque más caros. Si el CPL baja pero el score también baja,
            la pauta genera más volumen pero de menor calidad.
          </div>
        </Card>
      )}

      {/* ══ RANKING ══ */}
      {sub==="ranking" && (
        <Card title="Ranking Global con Costo Completo" accent={C.violet}
          subtitle="Inversión real por canal · CPA = Inversión / JOT · Click en columnas para ordenar">
          <div style={{ display:"flex", flexWrap:"wrap", gap:"16px", marginBottom:"18px", justifyContent:"center" }}>
            {[...asesores].sort((a,b)=>b.score-a.score).slice(0,12).map((a,i)=>{
              const col=scCol(a.score);
              return <Gauge key={i} valor={a.score} label={a.nombre.split(" ")[0]} color={col} size={68} />;
            })}
          </div>
          <TablaRanking data={asel?asesFilt:asesConCanal} canalMap={pauta.map} />
        </Card>
      )}

      {/* ══ RADAR ══ */}
      {sub==="radar" && (
        <div style={{ display:"flex", flexDirection:"column", gap:"20px" }}>
          <Card title="Radar Multidimensional — Top Asesores" accent={C.violet}
            subtitle="Efectividad · Sin ATC · Ventas · Score · Negociación — normalizados 0-100">
            <ResponsiveContainer width="100%" height={340}>
              <RadarChart data={(() => {
                const top=[...asesores].sort((a,b)=>b.score-a.score).slice(0,8);
                return [
                  { dim:"Efectividad" }, { dim:"Sin ATC" }, { dim:"Ventas" },
                  { dim:"Score" }, { dim:"Negociación" },
                ].map(({ dim })=>{
                  const e={ dim };
                  top.forEach(a=>{
                    if(dim==="Efectividad") e[a.nombre]=a.efect;
                    else if(dim==="Sin ATC") e[a.nombre]=Math.max(0,100-a.pct_atc);
                    else if(dim==="Ventas") e[a.nombre]=pct(a.ventas,a.leads);
                    else if(dim==="Score") e[a.nombre]=a.score;
                    else e[a.nombre]=pct(a.negoc,a.leads);
                  });
                  return e;
                });
              })()} margin={{ top:10, right:40, bottom:10, left:40 }}>
                <PolarGrid stroke={C.border} />
                <PolarAngleAxis dataKey="dim" tick={{ fontSize:9, fill:C.muted, fontWeight:700 }} />
                <PolarRadiusAxis domain={[0,100]} tick={{ fontSize:7, fill:C.muted }} tickCount={4} />
                {[...asesores].sort((a,b)=>b.score-a.score).slice(0,8).map((a,i)=>(
                  <Radar key={a.nombre} name={a.nombre.split(" ")[0]} dataKey={a.nombre}
                    stroke={PAL[i%PAL.length]} fill={PAL[i%PAL.length]}
                    fillOpacity={0.07} strokeWidth={2.5} dot={{ r:4 }} />
                ))}
                <Legend wrapperStyle={{ fontSize:"8px" }} />
                <Tooltip content={<DarkTip />} />
              </RadarChart>
            </ResponsiveContainer>
          </Card>
          {/* ATC ranking */}
          <Card title="% ATC por Asesor" accent={C.danger} subtitle=">40% = alerta calidad leads · Menor es mejor">
            <ResponsiveContainer width="100%" height={Math.max(200, asesores.length*28)}>
              <BarChart layout="vertical"
                data={[...asesores].sort((a,b)=>b.pct_atc-a.pct_atc).map(a=>({
                  nombre:a.nombre.length>22?a.nombre.slice(0,22)+"…":a.nombre,
                  pct_atc:parseFloat(a.pct_atc.toFixed(1)),
                }))}
                margin={{ top:5, right:70, left:5, bottom:5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize:9, fill:C.muted }} unit="%" />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize:8, fill:C.muted }} width={140} />
                <Tooltip content={<DarkTip />} formatter={v=>`${v}%`} />
                <ReferenceLine x={40} stroke={C.danger} strokeDasharray="4 2"
                  label={{ value:"40%", fontSize:8, fill:C.danger, position:"top" }} />
                <ReferenceLine x={20} stroke={C.warning} strokeDasharray="4 2"
                  label={{ value:"20%", fontSize:8, fill:C.warning, position:"top" }} />
                <Bar dataKey="pct_atc" name="% ATC" radius={[0,6,6,0]}>
                  {[...asesores].sort((a,b)=>b.pct_atc-a.pct_atc).map((a,i)=>(
                    <Cell key={i} fill={a.pct_atc>40?C.danger:a.pct_atc>20?C.warning:C.success} />
                  ))}
                  <LabelList dataKey="pct_atc" position="right"
                    content={({ x,y,width,height,value,index })=>{
                      const s=[...asesores].sort((a,b)=>b.pct_atc-a.pct_atc);
                      const col=s[index]?.pct_atc>40?C.danger:s[index]?.pct_atc>20?C.warning:C.success;
                      return value>0?<text x={x+width+6} y={y+height/2+4} fontSize={9} fontWeight={900} fill={col}>{value}%</text>:null;
                    }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* ══ HEATMAP ══ */}
      {sub==="heatmap" && (
        canales.length>0 ? (
          <Card title="Mapa de Calor — Asesor × Canal" accent={C.primary}
            subtitle="Toggle: Efect% · Score · %ATC (rojo = alto, verde = bajo) · JOT · Leads — ATC distribuido desde datos de pauta">
            <Heatmap asesoresXCanal={asesXCanal} canales={canales} />
          </Card>
        ) : (
          <div style={{ textAlign:"center", padding:"60px", color:C.muted }}>
            <div style={{ fontSize:"48px", marginBottom:"12px" }}>🌡️</div>
            <div>Aplica un rango de fechas con datos de pauta</div>
          </div>
        )
      )}
    </div>
  );
}