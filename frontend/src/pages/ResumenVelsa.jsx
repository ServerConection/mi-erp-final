import { useEffect, useState, useMemo, useCallback, Component } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LabelList, ReferenceLine,
} from "recharts";

const API = import.meta.env.VITE_API_URL;

// ── Persistencia en sesion ────────────────────────────────────────────────────
function useSessionState(key, def) {
  const [val, setVal] = useState(() => {
    try {
      const s = sessionStorage.getItem(key);
      return s !== null ? JSON.parse(s) : def;
    } catch { return def; }
  });
  const set = useCallback(v => {
    setVal(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      try { sessionStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);
  return [val, set];
}

// ── Error Boundary ────────────────────────────────────────────────────────────
class ChartBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError)
      return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:80,color:"#94a3b8",fontSize:11 }}>No se pudo cargar la grafica</div>;
    return this.props.children;
  }
}

// ── Paleta VELSA ──────────────────────────────────────────────────────────────
const P = {
  purple:"#a78bfa", pink:"#f472b6", blue:"#60a5fa", green:"#34d399",
  amber:"#fbbf24", teal:"#2dd4bf", orange:"#fb923c", red:"#f87171", slate:"#94a3b8",
};
const PASTEL = [P.purple,P.pink,P.blue,P.green,P.amber,P.teal,P.orange,P.red];

const COLORES_STATUS = {
  "ACTIVO":P.green,"PREPLANIFICADO":P.purple,"PRESERVICIO":P.blue,
  "REPLANIFICADO":P.amber,"FACTIBLE":P.teal,"ASIGNADO":P.orange,
  "RECHAZADO":P.red,"DESISTE DEL SERVICIO":P.pink,"SIN DATO":P.slate,
};
const COLORES_REG = {
  "REGULARIZADO":P.green,"POR REGULARIZAR":P.amber,
  "NO REQUIERE REGULARIZAR":P.purple,"SIN DATO":P.slate,
};
const gc   = (map, key, i) => map[key] || PASTEL[i % PASTEL.length];
const safe = v => { const n = Number(v); return isNaN(n) ? 0 : n; };

// ── Helpers fecha ─────────────────────────────────────────────────────────────
const hoyEC       = () => new Date().toLocaleDateString("en-CA",{timeZone:"America/Guayaquil"});
const addDays     = (base, n) => { const d=new Date(base+"T00:00:00"); d.setDate(d.getDate()+n); return d.toLocaleDateString("en-CA",{timeZone:"America/Guayaquil"}); };
const primerDiaMes    = b => b.substring(0,8)+"01";
const primerDiaMesAnt = b => { const d=new Date(b+"T00:00:00"); d.setDate(1); d.setMonth(d.getMonth()-1); return d.toLocaleDateString("en-CA",{timeZone:"America/Guayaquil"}).substring(0,8)+"01"; };
const ultimoDiaMesAnt = b => { const d=new Date(b+"T00:00:00"); d.setDate(0); return d.toLocaleDateString("en-CA",{timeZone:"America/Guayaquil"}); };

// ── Tooltip generico ──────────────────────────────────────────────────────────
const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"white",border:"1px solid #e2e8f0",borderRadius:12,padding:"10px 14px",boxShadow:"0 8px 24px rgba(0,0,0,0.12)",fontSize:11,minWidth:130 }}>
      {label && <p style={{ fontWeight:700,color:"#475569",marginBottom:6,paddingBottom:6,borderBottom:"1px solid #f1f5f9" }}>{label}</p>}
      {payload.map((p,i) => (
        <div key={i} style={{ display:"flex",justifyContent:"space-between",gap:12,marginTop:3 }}>
          <span style={{ color:p.color||p.fill,fontWeight:600 }}>{p.name}</span>
          <span style={{ fontWeight:800,color:"#1e293b" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const ScatterTip = ({ active, payload }) => {
  if (!active||!payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{ background:"white",border:"1px solid #e9d5ff",borderRadius:12,padding:"10px 14px",boxShadow:"0 8px 24px rgba(0,0,0,0.12)",fontSize:11,minWidth:160 }}>
      <p style={{ fontWeight:900,color:"#7c3aed",marginBottom:6,paddingBottom:6,borderBottom:"1px solid #f5f3ff" }}>{d.asesor}</p>
      {[["Total ventas",d.x],["% Activos",`${d.y}%`],["Activos",d.activos]].map(([k,v],i)=>(
        <div key={i} style={{ display:"flex",justifyContent:"space-between",gap:12,marginTop:3 }}>
          <span style={{ color:"#64748b" }}>{k}</span>
          <span style={{ fontWeight:700 }}>{v}</span>
        </div>
      ))}
    </div>
  );
};

const EmptyChart = ({ msg="Sin datos para este periodo" }) => (
  <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:100,color:"#cbd5e1",fontSize:12,fontStyle:"italic" }}>{msg}</div>
);

// ── KPI card ligero ───────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, color="#1e293b", accent="#e2e8f0", icon }) => (
  <div style={{ background:"white",borderRadius:16,padding:"16px 18px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)",borderTop:`3px solid ${accent}` }}>
    <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6 }}>
      <span style={{ fontSize:9,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700 }}>{label}</span>
      {icon && <span style={{ fontSize:17,opacity:0.75 }}>{icon}</span>}
    </div>
    <div style={{ fontSize:30,fontWeight:900,color,lineHeight:1 }}>{value ?? "—"}</div>
    {sub && <div style={{ fontSize:11,color:"#94a3b8",marginTop:4 }}>{sub}</div>}
  </div>
);

// ── Card con boton de expansion ───────────────────────────────────────────────
const Card = ({ title, icon, children, onExpand, className="" }) => (
  <div className={`bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow ${className}`}>
    <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
      <div style={{ display:"flex",alignItems:"center",gap:8 }}>
        <span style={{ fontSize:18 }}>{icon}</span>
        <h2 style={{ fontSize:11,fontWeight:900,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.07em",margin:0 }}>{title}</h2>
      </div>
      {onExpand && (
        <button onClick={onExpand} title="Expandir grafica"
          style={{ background:"none",border:"none",cursor:"pointer",color:"#cbd5e1",fontSize:15,padding:"4px 6px",borderRadius:8,transition:"all 0.15s" }}
          onMouseEnter={e=>{ e.target.style.color="#64748b"; e.target.style.background="#f1f5f9"; }}
          onMouseLeave={e=>{ e.target.style.color="#cbd5e1"; e.target.style.background="none"; }}>
          ⛶
        </button>
      )}
    </div>
    {children}
  </div>
);

// ── Modal expandido ───────────────────────────────────────────────────────────
function ChartModal({ title, icon, children, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div
      style={{ position:"fixed",inset:0,zIndex:50,background:"rgba(15,23,42,0.55)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}
      onClick={onClose}
    >
      <div
        style={{ background:"white",borderRadius:24,padding:28,width:"100%",maxWidth:720,boxShadow:"0 32px 64px rgba(0,0,0,0.25)",animation:"fadeUp 0.2s ease" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <span style={{ fontSize:22 }}>{icon}</span>
            <span style={{ fontWeight:900,fontSize:13,color:"#1e293b",textTransform:"uppercase",letterSpacing:"0.06em" }}>{title}</span>
          </div>
          <button onClick={onClose}
            style={{ background:"#f1f5f9",border:"none",cursor:"pointer",color:"#64748b",fontSize:13,fontWeight:700,padding:"6px 14px",borderRadius:10 }}>
            ✕ Cerrar
          </button>
        </div>
        <div style={{ height:440 }}>{children}</div>
      </div>
    </div>
  );
}

// ── Donut con valor + % en centro al hacer hover ──────────────────────────────
function DonutCenter({ data, colorMap, outerR=100, innerR=55 }) {
  const [activeIdx, setActiveIdx] = useState(null);
  const total  = data.reduce((s, d) => s + safe(d.value), 0);
  const active = activeIdx !== null ? data[activeIdx] : null;
  const colors = data.map((e, i) => gc(colorMap, e.name, i));
  const pct    = active && total > 0 ? ((safe(active.value) / total) * 100).toFixed(1) : null;

  return (
    <div style={{ position:"relative", width:"100%", height:"100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data} dataKey="value" nameKey="name"
            cx="50%" cy="44%"
            outerRadius={outerR} innerRadius={innerR}
            paddingAngle={3} strokeWidth={2}
            onMouseEnter={(_, idx) => setActiveIdx(idx)}
            onMouseLeave={() => setActiveIdx(null)}
          >
            {data.map((e, i) => (
              <Cell key={i} fill={colors[i]}
                opacity={activeIdx === null || activeIdx === i ? 1 : 0.28}
                stroke="white" strokeWidth={activeIdx === i ? 3 : 1.5}
                style={{ cursor:"pointer",transition:"opacity 0.2s" }}
              />
            ))}
          </Pie>
          <Tooltip content={<Tip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:10,color:"#64748b",paddingTop:6 }} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ position:"absolute",top:"44%",left:"50%",transform:"translate(-50%, -50%)",textAlign:"center",pointerEvents:"none" }}>
        <div style={{ fontSize:active?30:26,fontWeight:900,color:active?colors[activeIdx]:"#1e293b",lineHeight:1,transition:"all 0.2s" }}>
          {active ? safe(active.value) : total}
        </div>
        <div style={{ fontSize:10,fontWeight:700,marginTop:4,color:active?colors[activeIdx]:"#94a3b8",transition:"all 0.2s" }}>
          {active ? `${pct}%` : "total"}
        </div>
        {active && (
          <div style={{ fontSize:9,color:"#94a3b8",marginTop:3,maxWidth:72,lineHeight:1.2 }}>
            {active.name.length>14 ? active.name.substring(0,13)+"…" : active.name}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pagina principal ──────────────────────────────────────────────────────────
export default function ResumenVelsa() {
  const hoy = hoyEC();

  // Estado persistente
  const [desde,     setDesde]     = useSessionState("VLS_desde",     primerDiaMes(hoy));
  const [hasta,     setHasta]     = useSessionState("VLS_hasta",     hoy);
  const [tab,       setTab]       = useSessionState("VLS_tab",       "general");
  const [seriesOn,  setSeriesOn]  = useSessionState("VLS_series",    {total:true,activos:true});
  const [sortRank,  setSortRank]  = useSessionState("VLS_sort",      "total");
  const [rankDesc,  setRankDesc]  = useSessionState("VLS_sortDesc",  true);
  const [sortCrm,   setSortCrm]   = useSessionState("VLS_crmSort",   "total");
  const [crmDesc,   setCrmDesc]   = useSessionState("VLS_crmDesc",   true);
  const [crmSeries, setCrmSeries] = useSessionState("VLS_crmSeries", {total:true,ganados:true});

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [crm,     setCrm]     = useState(null);
  const [crmLoad, setCrmLoad] = useState(false);
  const [crmErr,  setCrmErr]  = useState(null);
  const [modal,   setModal]   = useState(null);

  const toggleSerie    = k => setSeriesOn(s => ({...s,[k]:!s[k]}));
  const toggleCrmSerie = k => setCrmSeries(s => ({...s,[k]:!s[k]}));

  const applyPreset = label => {
    const h = hoyEC();
    if (label==="7D")   { setDesde(addDays(h,-6));      setHasta(h); }
    if (label==="15D")  { setDesde(addDays(h,-14));     setHasta(h); }
    if (label==="MES")  { setDesde(primerDiaMes(h));    setHasta(h); }
    if (label==="MANT") { setDesde(primerDiaMesAnt(h)); setHasta(ultimoDiaMesAnt(h)); }
  };

  const fetchData = useCallback(async (d=desde, h=hasta) => {
    setLoading(true); setError(null);
    try {
      const token = localStorage.getItem("token");
      const res   = await fetch(`${API}/api/analista/velsa?desde=${d}&hasta=${h}`,
        { headers:{ Authorization:`Bearer ${token}` } });
      const json  = await res.json();
      if (!json.success) throw new Error(json.error||"Error en respuesta");
      setData({
        ...json,
        calidadVenta:         (json.calidadVenta        ||[]).map(r=>({...r,value:safe(r.value)})),
        estadoRegularizacion: (json.estadoRegularizacion||[]).map(r=>({...r,value:safe(r.value)})),
        formasPago:           (json.formasPago           ||[]).map(r=>({...r,value:safe(r.value)})),
        planes:               (json.planes               ||[]).map(r=>({...r,value:safe(r.value)})),
        asesores:             (json.asesores             ||[]).map(a=>({...a,total:safe(a.total),activos:safe(a.activos),pctActivo:safe(a.pctActivo)})),
        tendencia:            (json.tendencia            ||[]).map(r=>({...r,total:safe(r.total),activos:safe(r.activos)})),
        provincias:           (json.provincias           ||[]).map(r=>({...r,value:safe(r.value)})),
        total: safe(json.total),
      });
    } catch(err) { setError(err.message); }
    finally { setLoading(false); }
  }, [desde, hasta]);

  const fetchCrm = useCallback(async (d=desde, h=hasta) => {
    setCrmLoad(true); setCrmErr(null);
    try {
      const token = localStorage.getItem("token");
      const res   = await fetch(`${API}/api/bitrix/velsa?desde=${d}&hasta=${h}`,
        { headers:{ Authorization:`Bearer ${token}` } });
      const json  = await res.json();
      if (!json.success) throw new Error(json.error||"Error CRM");
      setCrm({
        ...json,
        embudo:   (json.embudo   ||[]).map(r=>({...r,total:safe(r.total),value:safe(r.value)})),
        tendencia:(json.tendencia||[]).map(r=>({...r,total:safe(r.total),ganados:safe(r.ganados)})),
        asesores: (json.asesores ||[]).map(a=>({...a,total:safe(a.total),ganados:safe(a.ganados),pctConversion:safe(a.pctConversion)})),
        fuentes:  (json.fuentes  ||[]).map(r=>({...r,value:safe(r.value)})),
        total: safe(json.total),
      });
    } catch(err) { setCrmErr(err.message); }
    finally { setCrmLoad(false); }
  }, [desde, hasta]);

  useEffect(() => { fetchData(); }, []);

  const kpis = useMemo(() => {
    if (!data) return {};
    const activos       = safe(data.calidadVenta?.find(c=>c.name==="ACTIVO")?.value);
    const regularizados = safe(data.estadoRegularizacion?.find(c=>c.name==="REGULARIZADO")?.value);
    const porReg        = safe(data.estadoRegularizacion?.find(c=>c.name==="POR REGULARIZAR")?.value);
    const pctActivos    = data.total>0 ? ((activos/data.total)*100).toFixed(1) : "0.0";
    const pctReg        = data.total>0 ? ((regularizados/data.total)*100).toFixed(1) : "0.0";
    const ventaServicio = safe(data.totalVentaServicio);
    const pctVentaServicio = data.total>0 ? ((ventaServicio/data.total)*100).toFixed(1) : "0.0";
    return {activos,regularizados,porReg,pctActivos,pctReg,ventaServicio,pctVentaServicio};
  },[data]);

  const scatter = useMemo(() => {
    if (!data?.asesores?.length) return {points:[],medX:0,medY:0};
    const points = data.asesores.map(a=>({...a,x:safe(a.total),y:safe(a.pctActivo)})).filter(a=>a.x>0);
    if (!points.length) return {points:[],medX:0,medY:0};
    const medX = Math.round(points.reduce((s,p)=>s+p.x,0)/points.length);
    const medY = parseFloat((points.reduce((s,p)=>s+p.y,0)/points.length).toFixed(1));
    return {points,medX,medY};
  },[data]);

  const rankOrdenado = useMemo(() => {
    if (!data?.asesores) return [];
    return [...data.asesores].sort((a,b) => rankDesc
      ? safe(b[sortRank]) - safe(a[sortRank])
      : safe(a[sortRank]) - safe(b[sortRank])
    );
  },[data,sortRank,rankDesc]);

  const rankCrmOrdenado = useMemo(() => {
    if (!crm?.asesores) return [];
    return [...crm.asesores].sort((a,b) => crmDesc
      ? safe(b[sortCrm]) - safe(a[sortCrm])
      : safe(a[sortCrm]) - safe(b[sortCrm])
    );
  },[crm,sortCrm,crmDesc]);

  const rankH    = Math.max(260, rankOrdenado.length * 30);
  const crmRankH = Math.max(260, rankCrmOrdenado.length * 30);

  const openModal  = (title, icon, fn) => setModal({title,icon,fn});
  const closeModal = useCallback(() => setModal(null), []);

  const btnPreset = "text-[10px] font-bold px-3 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-100 transition-colors";
  const btnTab = active => `text-[11px] font-bold px-4 py-2 rounded-xl transition-all ${active?"bg-purple-500 text-white shadow-sm":"text-slate-500 hover:bg-slate-50"}`;

  return (
    <div style={{ minHeight:"100vh",background:"#f8fafc",padding:24 }} className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div style={{ width:42,height:42,borderRadius:14,background:"linear-gradient(135deg,#8b5cf6,#6d28d9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:"0 4px 12px rgba(139,92,246,0.35)" }}>🟣</div>
          <div>
            <h1 style={{ fontSize:22,fontWeight:900,color:"#0f172a",margin:0 }}>Resumen VELSA</h1>
            <p style={{ fontSize:11,color:"#94a3b8",margin:0,marginTop:2 }}>Calidad de ventas · Jotform Netlife</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-1 flex-wrap">
            {[["7D","7 dias"],["15D","15 dias"],["MES","Este mes"],["MANT","Mes ant"]].map(([k,lbl])=>(
              <button key={k} className={btnPreset} onClick={()=>{ applyPreset(k); setTimeout(()=>{ fetchData(); if(crm) fetchCrm(); },30); }}>{lbl}</button>
            ))}
          </div>
          <div className="flex items-end gap-2 bg-white rounded-2xl p-3 border border-slate-100 shadow-sm">
            {[["Desde",desde,setDesde],["Hasta",hasta,setHasta]].map(([lbl,val,set])=>(
              <div key={lbl} className="flex flex-col gap-1">
                <span style={{ fontSize:9,color:"#94a3b8",textTransform:"uppercase",fontWeight:700 }}>{lbl}</span>
                <input type="date" value={val} onChange={e=>set(e.target.value)}
                  style={{ fontSize:13,borderRadius:10,padding:"6px 10px",border:"1px solid #e2e8f0",background:"#f8fafc",outline:"none" }}/>
              </div>
            ))}
            <button
              onClick={()=>{ fetchData(desde,hasta); if(crm) fetchCrm(desde,hasta); }}
              style={{ background:"linear-gradient(135deg,#8b5cf6,#6d28d9)",color:"white",border:"none",borderRadius:12,padding:"8px 20px",fontWeight:700,fontSize:13,cursor:"pointer",boxShadow:"0 2px 8px rgba(139,92,246,0.3)",transition:"opacity 0.15s" }}
            >
              {loading ? "..." : "Aplicar"}
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40">
          <div style={{ width:28,height:28,border:"3px solid #e9d5ff",borderTopColor:"#8b5cf6",borderRadius:"50%",animation:"spin 0.8s linear infinite" }}/>
          <span style={{ marginLeft:12,color:"#94a3b8",fontSize:13 }}>Cargando datos…</span>
        </div>
      )}
      {error && <div style={{ background:"#fff1f2",border:"1px solid #fecdd3",borderRadius:16,padding:"14px 18px",color:"#e11d48",fontSize:13 }}>⚠️ {error}</div>}

      {data && !loading && (<>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard icon="📋" label="Total Ventas"      value={data.total}           color="#0f172a"  accent="#e2e8f0" />
          <KpiCard icon="✅" label="Activos"            value={kpis.activos}         color="#10b981"  accent="#10b981" sub={`${kpis.pctActivos}% del total`} />
          <KpiCard icon="🛠️" label="Venta Servicio"   value={kpis.ventaServicio}   color="#14b8a6"  accent="#14b8a6" sub={`${kpis.pctVentaServicio}% del total`} />
          <KpiCard icon="📁" label="Regularizados"     value={kpis.regularizados}   color="#8b5cf6"  accent="#8b5cf6" sub={`${kpis.pctReg}% del total`} />
          <KpiCard icon="⏳" label="Por Regularizar"   value={kpis.porReg}          color="#f59e0b"  accent="#f59e0b" />
          <KpiCard icon="👤" label="Asesores activos"  value={data.asesores.length} color="#ec4899"  accent="#ec4899" />
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-white rounded-2xl p-1 border border-slate-100 shadow-sm w-fit flex-wrap">
          {[["general","🗂 General"],["rendimiento","🎯 Rendimiento"],["geografia","🗺 Geografia"],["crm","🔵 CRM Bitrix"]].map(([k,lbl])=>(
            <button key={k} onClick={()=>{ setTab(k); if(k==="crm"&&!crm&&!crmLoad) fetchCrm(); }} className={btnTab(tab===k)}>{lbl}</button>
          ))}
        </div>

        {/* ══ TAB GENERAL ══ */}
        {tab==="general" && (<>

          <Card icon="📈" title="Tendencia Diaria — Ingresos Jotform"
            onExpand={()=>openModal("Tendencia Diaria","📈",()=>(
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.tendencia} margin={{top:10,right:20,left:0,bottom:0}}>
                  <defs>
                    <linearGradient id="gTVe" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={P.purple} stopOpacity={0.25}/><stop offset="95%" stopColor={P.purple} stopOpacity={0.02}/></linearGradient>
                    <linearGradient id="gAVe" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={P.green} stopOpacity={0.3}/><stop offset="95%" stopColor={P.green} stopOpacity={0.02}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis dataKey="fecha" tick={{fill:"#94a3b8",fontSize:10}}/><YAxis tick={{fill:"#94a3b8",fontSize:10}}/>
                  <Tooltip content={<Tip/>}/>
                  {seriesOn.total   && <Area type="monotone" dataKey="total"   name="Total JOT" stroke={P.purple} fill="url(#gTVe)" strokeWidth={2.5} dot={false}/>}
                  {seriesOn.activos && <Area type="monotone" dataKey="activos" name="Activos"   stroke={P.green}  fill="url(#gAVe)" strokeWidth={2.5} dot={false}/>}
                </AreaChart>
              </ResponsiveContainer>
            ))}>
            <div className="flex gap-2 mb-3 flex-wrap">
              {[["total","Total JOT",P.purple],["activos","Activos",P.green]].map(([k,lbl,col])=>(
                <button key={k} onClick={()=>toggleSerie(k)}
                  style={{ display:"flex",alignItems:"center",gap:6,fontSize:10,fontWeight:700,padding:"5px 12px",borderRadius:8,border:`1px solid ${seriesOn[k]?col:"#e2e8f0"}`,background:seriesOn[k]?col:"white",color:seriesOn[k]?"white":"#94a3b8",cursor:"pointer",transition:"all 0.15s" }}>
                  <span style={{ width:8,height:8,borderRadius:"50%",background:seriesOn[k]?"white":col,display:"inline-block" }}/>{lbl}
                </button>
              ))}
            </div>
            {data.tendencia.length===0 ? <EmptyChart/> : (
              <ChartBoundary>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={data.tendencia} margin={{top:5,right:10,left:0,bottom:0}}>
                    <defs>
                      <linearGradient id="gTV" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={P.purple} stopOpacity={0.25}/><stop offset="95%" stopColor={P.purple} stopOpacity={0.02}/></linearGradient>
                      <linearGradient id="gAV" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={P.green} stopOpacity={0.3}/><stop offset="95%" stopColor={P.green} stopOpacity={0.02}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="fecha" tick={{fill:"#94a3b8",fontSize:10}}/><YAxis tick={{fill:"#94a3b8",fontSize:10}}/>
                    <Tooltip content={<Tip/>}/>
                    {seriesOn.total   && <Area type="monotone" dataKey="total"   name="Total JOT" stroke={P.purple} fill="url(#gTV)"  strokeWidth={2.5} dot={false} animationDuration={500}/>}
                    {seriesOn.activos && <Area type="monotone" dataKey="activos" name="Activos"   stroke={P.green}  fill="url(#gAV)" strokeWidth={2.5} dot={false} animationDuration={500}/>}
                  </AreaChart>
                </ResponsiveContainer>
              </ChartBoundary>
            )}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card icon="🏷" title="Estado Venta Netlife"
              onExpand={()=>openModal("Estado Venta Netlife","🏷",()=>(<DonutCenter data={data.calidadVenta} colorMap={COLORES_STATUS} outerR={160} innerR={88}/>))}>
              {data.calidadVenta.length===0 ? <EmptyChart/> : (
                <ChartBoundary><div style={{ height:280 }}><DonutCenter data={data.calidadVenta} colorMap={COLORES_STATUS} outerR={100} innerR={55}/></div></ChartBoundary>
              )}
            </Card>

            <Card icon="📋" title="Estado de Regularizacion"
              onExpand={()=>openModal("Estado de Regularizacion","📋",()=>(<DonutCenter data={data.estadoRegularizacion} colorMap={COLORES_REG} outerR={160} innerR={88}/>))}>
              {data.estadoRegularizacion.length===0 ? <EmptyChart/> : (
                <ChartBoundary><div style={{ height:280 }}><DonutCenter data={data.estadoRegularizacion} colorMap={COLORES_REG} outerR={100} innerR={55}/></div></ChartBoundary>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card icon="📦" title="Distribucion de Planes"
              onExpand={()=>openModal("Distribucion de Planes","📦",()=>(
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.planes} margin={{top:10,right:20,left:0,bottom:10}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:11}}/><YAxis tick={{fill:"#94a3b8",fontSize:11}}/>
                    <Tooltip content={<Tip/>}/>
                    <Bar dataKey="value" name="Ventas" radius={[8,8,0,0]}>
                      {data.planes.map((_,i)=><Cell key={i} fill={PASTEL[i%PASTEL.length]}/>)}
                      <LabelList dataKey="value" position="top" style={{fill:"#64748b",fontSize:12,fontWeight:700}}/>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ))}>
              {data.planes.length===0 ? <EmptyChart/> : (
                <ChartBoundary>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.planes} margin={{top:5,right:10,left:0,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                      <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:10}}/><YAxis tick={{fill:"#94a3b8",fontSize:10}}/>
                      <Tooltip content={<Tip/>}/>
                      <Bar dataKey="value" name="Ventas" radius={[8,8,0,0]} isAnimationActive>
                        {data.planes.map((_,i)=><Cell key={i} fill={PASTEL[i%PASTEL.length]}/>)}
                        <LabelList dataKey="value" position="top" style={{fill:"#64748b",fontSize:10,fontWeight:700}}/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartBoundary>
              )}
            </Card>

            <Card icon="💳" title="Formas de Pago"
              onExpand={()=>openModal("Formas de Pago","💳",()=>(<DonutCenter data={data.formasPago} colorMap={{}} outerR={160} innerR={88}/>))}>
              {data.formasPago.length===0 ? <EmptyChart/> : (
                <ChartBoundary><div style={{ height:220 }}><DonutCenter data={data.formasPago} colorMap={{}} outerR={82} innerR={44}/></div></ChartBoundary>
              )}
            </Card>
          </div>
        </>)}

        {/* ══ TAB RENDIMIENTO ══ */}
        {tab==="rendimiento" && (<>
          <Card icon="🎯" title="Matriz de Rendimiento"
            onExpand={()=>openModal("Matriz de Rendimiento","🎯",()=>(
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{top:10,right:30,left:0,bottom:20}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis dataKey="x" type="number" tick={{fill:"#94a3b8",fontSize:10}} label={{value:"Total ventas",position:"insideBottom",offset:-10,fill:"#94a3b8",fontSize:10}}/>
                  <YAxis dataKey="y" type="number" domain={[0,100]} tick={{fill:"#94a3b8",fontSize:10}} label={{value:"% Activos",angle:-90,position:"insideLeft",fill:"#94a3b8",fontSize:10}}/>
                  <Tooltip content={<ScatterTip/>}/>
                  {scatter.medX>0 && <ReferenceLine x={scatter.medX} stroke={P.slate} strokeDasharray="4 3" label={{value:`x ${scatter.medX}`,fill:"#94a3b8",fontSize:9,position:"insideTopRight"}}/>}
                  {scatter.medY>0 && <ReferenceLine y={scatter.medY} stroke={P.slate} strokeDasharray="4 3" label={{value:`y ${scatter.medY}%`,fill:"#94a3b8",fontSize:9,position:"insideTopLeft"}}/>}
                  <Scatter data={scatter.points} fill={P.purple} fillOpacity={0.8} stroke="white" strokeWidth={1.5}/>
                </ScatterChart>
              </ResponsiveContainer>
            ))}>
            <div className="grid grid-cols-2 gap-1 text-[9px] mb-3 text-center">
              {[["bg-amber-50 border-amber-100 text-amber-600","Alta efectividad, bajo volumen"],["bg-green-50 border-green-100 text-green-600","Top performers"],["bg-red-50 border-red-100 text-red-500","Reforzar capacitacion"],["bg-purple-50 border-purple-100 text-purple-600","Alto volumen, mejorar calidad"]].map(([cls,txt])=>(
                <div key={txt} className={`rounded-lg py-1.5 border font-semibold ${cls}`}>{txt}</div>
              ))}
            </div>
            {scatter.points.length===0 ? <EmptyChart/> : (
              <ChartBoundary>
                <ResponsiveContainer width="100%" height={340}>
                  <ScatterChart margin={{top:10,right:30,left:0,bottom:20}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="x" type="number" tick={{fill:"#94a3b8",fontSize:10}} label={{value:"Total ventas",position:"insideBottom",offset:-10,fill:"#94a3b8",fontSize:10}}/>
                    <YAxis dataKey="y" type="number" domain={[0,100]} tick={{fill:"#94a3b8",fontSize:10}} label={{value:"% Activos",angle:-90,position:"insideLeft",fill:"#94a3b8",fontSize:10}}/>
                    <Tooltip content={<ScatterTip/>}/>
                    {scatter.medX>0 && <ReferenceLine x={scatter.medX} stroke={P.slate} strokeDasharray="4 3" label={{value:`x ${scatter.medX}`,fill:"#94a3b8",fontSize:9,position:"insideTopRight"}}/>}
                    {scatter.medY>0 && <ReferenceLine y={scatter.medY} stroke={P.slate} strokeDasharray="4 3" label={{value:`y ${scatter.medY}%`,fill:"#94a3b8",fontSize:9,position:"insideTopLeft"}}/>}
                    <Scatter name="Asesores" data={scatter.points} fill={P.purple} fillOpacity={0.8} stroke="white" strokeWidth={1.5}/>
                  </ScatterChart>
                </ResponsiveContainer>
              </ChartBoundary>
            )}
          </Card>

          <Card icon="🏆" title="Ranking de Asesores"
            onExpand={()=>openModal("Ranking de Asesores","🏆",()=>(
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankOrdenado} layout="vertical" margin={{top:0,right:70,left:10,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                  <XAxis type="number" tick={{fill:"#94a3b8",fontSize:10}}/>
                  <YAxis type="category" dataKey="asesor" width={100} tick={{fill:"#64748b",fontSize:9}} tickFormatter={v=>v.length>14?v.substring(0,13)+"…":v}/>
                  <Tooltip content={<Tip/>}/>
                  <Bar dataKey="total" name="Total" fill={P.purple} radius={[0,5,5,0]}><LabelList dataKey="total" position="right" style={{fill:"#64748b",fontSize:9,fontWeight:700}}/></Bar>
                  <Bar dataKey="activos" name="Activos" fill={P.green} radius={[0,5,5,0]}/>
                </BarChart>
              </ResponsiveContainer>
            ))}>
            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <span style={{ fontSize:10,color:"#94a3b8",fontWeight:700,textTransform:"uppercase" }}>Ordenar por:</span>
              {[["total","Volumen"],["pctActivo","% Efectividad"]].map(([k,lbl])=>(
                <button key={k} onClick={()=>setSortRank(k)}
                  style={{ fontSize:10,fontWeight:700,padding:"5px 12px",borderRadius:9,border:`1px solid ${sortRank===k?"#8b5cf6":"#e2e8f0"}`,background:sortRank===k?"#8b5cf6":"white",color:sortRank===k?"white":"#64748b",cursor:"pointer",transition:"all 0.15s" }}>
                  {lbl}
                </button>
              ))}
              <button onClick={()=>setRankDesc(d=>!d)}
                style={{ fontSize:10,fontWeight:700,padding:"5px 12px",borderRadius:9,border:"1px solid #e2e8f0",background:"white",color:"#64748b",cursor:"pointer" }}>
                {rankDesc?"↓ Mayor":"↑ Menor"}
              </button>
            </div>
            {rankOrdenado.length===0 ? <EmptyChart/> : (
              <ChartBoundary>
                <ResponsiveContainer width="100%" height={rankH}>
                  <BarChart data={rankOrdenado} layout="vertical" margin={{top:0,right:70,left:10,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                    <XAxis type="number" tick={{fill:"#94a3b8",fontSize:10}}/>
                    <YAxis type="category" dataKey="asesor" width={95} tick={{fill:"#64748b",fontSize:9}} tickFormatter={v=>v.length>13?v.substring(0,12)+"…":v}/>
                    <Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:10,color:"#64748b"}}/>
                    <Bar dataKey="total"   name="Total"   fill={P.purple} radius={[0,5,5,0]} isAnimationActive><LabelList dataKey="total" position="right" style={{fill:"#64748b",fontSize:9,fontWeight:700}}/></Bar>
                    <Bar dataKey="activos" name="Activos" fill={P.green}  radius={[0,5,5,0]} isAnimationActive/>
                  </BarChart>
                </ResponsiveContainer>
              </ChartBoundary>
            )}
          </Card>
        </>)}

        {/* ══ TAB GEOGRAFIA ══ */}
        {tab==="geografia" && (
          <Card icon="🗺" title="Distribucion por Provincia"
            onExpand={()=>openModal("Distribucion por Provincia","🗺",()=>(
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.provincias} margin={{top:10,right:20,left:0,bottom:50}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                  <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:10,angle:-30,textAnchor:"end"}} interval={0}/>
                  <YAxis tick={{fill:"#94a3b8",fontSize:10}}/>
                  <Tooltip content={<Tip/>}/>
                  <Bar dataKey="value" name="Ventas" radius={[8,8,0,0]}>
                    {data.provincias.map((_,i)=><Cell key={i} fill={PASTEL[i%PASTEL.length]}/>)}
                    <LabelList dataKey="value" position="top" style={{fill:"#64748b",fontSize:11,fontWeight:700}}/>
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ))}>
            {(!data.provincias||data.provincias.length===0) ? <EmptyChart msg="Sin datos geograficos"/> : (
              <ChartBoundary>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.provincias} margin={{top:10,right:20,left:0,bottom:40}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:10,angle:-25,textAnchor:"end"}} interval={0}/>
                    <YAxis tick={{fill:"#94a3b8",fontSize:10}}/><Tooltip content={<Tip/>}/>
                    <Bar dataKey="value" name="Ventas" radius={[8,8,0,0]} isAnimationActive>
                      {data.provincias.map((_,i)=><Cell key={i} fill={PASTEL[i%PASTEL.length]}/>)}
                      <LabelList dataKey="value" position="top" style={{fill:"#64748b",fontSize:10,fontWeight:700}}/>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartBoundary>
            )}
          </Card>
        )}

        {/* ══ TAB CRM BITRIX ══ */}
        {tab==="crm" && (<>
          {crmLoad && (
            <div className="flex items-center justify-center h-40">
              <div style={{ width:28,height:28,border:"3px solid #e9d5ff",borderTopColor:"#8b5cf6",borderRadius:"50%",animation:"spin 0.8s linear infinite" }}/>
              <span style={{ marginLeft:12,color:"#94a3b8",fontSize:13 }}>Cargando CRM Bitrix…</span>
            </div>
          )}
          {crmErr && <div style={{ background:"#fff1f2",border:"1px solid #fecdd3",borderRadius:16,padding:"14px 18px",color:"#e11d48",fontSize:13 }}>⚠️ {crmErr}</div>}

          {crm && !crmLoad && (<>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard icon="📊" label="Total Deals"    value={crm.total}               color="#8b5cf6" accent="#8b5cf6"/>
              <KpiCard icon="✅" label="Ventas Subidas" value={crm.kpi?.ventas_subidas} color="#10b981" accent="#10b981" sub={`${crm.kpi?.pct_conversion}% conversion`}/>
              <KpiCard icon="🔄" label="En Proceso"     value={crm.kpi?.en_proceso}     color="#3b82f6" accent="#3b82f6"/>
              <KpiCard icon="❌" label="Descartes"       value={crm.kpi?.descartes}      color="#f87171" accent="#f87171"/>
            </div>

            {crm.tendencia?.length > 0 && (
              <Card icon="📈" title="Tendencia CRM — Deals por dia"
                onExpand={()=>openModal("Tendencia CRM","📈",()=>(
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={crm.tendencia} margin={{top:10,right:20,left:0,bottom:0}}>
                      <defs>
                        <linearGradient id="gCTe" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={P.purple} stopOpacity={0.25}/><stop offset="95%" stopColor={P.purple} stopOpacity={0.02}/></linearGradient>
                        <linearGradient id="gCGe" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={P.green} stopOpacity={0.3}/><stop offset="95%" stopColor={P.green} stopOpacity={0.02}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                      <XAxis dataKey="fecha" tick={{fill:"#94a3b8",fontSize:10}}/><YAxis tick={{fill:"#94a3b8",fontSize:10}}/>
                      <Tooltip content={<Tip/>}/>
                      {crmSeries.total   && <Area type="monotone" dataKey="total"   name="Total"   stroke={P.purple} fill="url(#gCTe)" strokeWidth={2.5} dot={false}/>}
                      {crmSeries.ganados && <Area type="monotone" dataKey="ganados" name="Ganados" stroke={P.green}  fill="url(#gCGe)" strokeWidth={2.5} dot={false}/>}
                    </AreaChart>
                  </ResponsiveContainer>
                ))}>
                <div className="flex gap-2 mb-3">
                  {[["total","Total",P.purple],["ganados","Ganados",P.green]].map(([k,lbl,col])=>(
                    <button key={k} onClick={()=>toggleCrmSerie(k)}
                      style={{ display:"flex",alignItems:"center",gap:6,fontSize:10,fontWeight:700,padding:"5px 12px",borderRadius:8,border:`1px solid ${crmSeries[k]?col:"#e2e8f0"}`,background:crmSeries[k]?col:"white",color:crmSeries[k]?"white":"#94a3b8",cursor:"pointer",transition:"all 0.15s" }}>
                      <span style={{ width:8,height:8,borderRadius:"50%",background:crmSeries[k]?"white":col,display:"inline-block" }}/>{lbl}
                    </button>
                  ))}
                </div>
                <ChartBoundary>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={crm.tendencia} margin={{top:5,right:10,left:0,bottom:0}}>
                      <defs>
                        <linearGradient id="gCT" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={P.purple} stopOpacity={0.25}/><stop offset="95%" stopColor={P.purple} stopOpacity={0.02}/></linearGradient>
                        <linearGradient id="gCG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={P.green} stopOpacity={0.3}/><stop offset="95%" stopColor={P.green} stopOpacity={0.02}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                      <XAxis dataKey="fecha" tick={{fill:"#94a3b8",fontSize:10}}/><YAxis tick={{fill:"#94a3b8",fontSize:10}}/>
                      <Tooltip content={<Tip/>}/>
                      {crmSeries.total   && <Area type="monotone" dataKey="total"   name="Total"   stroke={P.purple} fill="url(#gCT)" strokeWidth={2.5} dot={false} animationDuration={500}/>}
                      {crmSeries.ganados && <Area type="monotone" dataKey="ganados" name="Ganados" stroke={P.green}  fill="url(#gCG)" strokeWidth={2.5} dot={false} animationDuration={500}/>}
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartBoundary>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {crm.embudo?.length > 0 && (
                <Card icon="🔽" title="Embudo de Ventas"
                  onExpand={()=>openModal("Embudo de Ventas","🔽",()=>(
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={crm.embudo} layout="vertical" margin={{top:0,right:60,left:10,bottom:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                        <XAxis type="number" tick={{fill:"#94a3b8",fontSize:10}}/><YAxis type="category" dataKey="etapa" width={120} tick={{fill:"#64748b",fontSize:9}} tickFormatter={v=>v.length>16?v.substring(0,15)+"…":v}/>
                        <Tooltip content={<Tip/>}/>
                        <Bar dataKey="total" name="Deals" radius={[0,6,6,0]}>
                          {crm.embudo.map((_,i)=><Cell key={i} fill={PASTEL[i%PASTEL.length]}/>)}
                          <LabelList dataKey="total" position="right" style={{fill:"#64748b",fontSize:9,fontWeight:700}}/>
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ))}>
                  <ChartBoundary>
                    <ResponsiveContainer width="100%" height={Math.max(200,crm.embudo.length*28)}>
                      <BarChart data={crm.embudo} layout="vertical" margin={{top:0,right:50,left:10,bottom:0}}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                        <XAxis type="number" tick={{fill:"#94a3b8",fontSize:10}}/><YAxis type="category" dataKey="etapa" width={110} tick={{fill:"#64748b",fontSize:9}} tickFormatter={v=>v.length>14?v.substring(0,13)+"…":v}/>
                        <Tooltip content={<Tip/>}/>
                        <Bar dataKey="total" name="Deals" radius={[0,6,6,0]} isAnimationActive>
                          {crm.embudo.map((_,i)=><Cell key={i} fill={PASTEL[i%PASTEL.length]}/>)}
                          <LabelList dataKey="total" position="right" style={{fill:"#64748b",fontSize:9,fontWeight:700}}/>
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartBoundary>
                </Card>
              )}

              {crm.fuentes?.length > 0 && (
                <Card icon="📡" title="Fuentes de Leads"
                  onExpand={()=>openModal("Fuentes de Leads","📡",()=>(<DonutCenter data={crm.fuentes} colorMap={{}} outerR={160} innerR={88}/>))}>
                  <ChartBoundary>
                    <div style={{ height:240 }}>
                      <DonutCenter data={crm.fuentes} colorMap={{}} outerR={85} innerR={46}/>
                    </div>
                  </ChartBoundary>
                </Card>
              )}
            </div>

            {crm.asesores?.length > 0 && (
              <Card icon="🏆" title="Ranking CRM — Asesores Bitrix"
                onExpand={()=>openModal("Ranking CRM","🏆",()=>(
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rankCrmOrdenado} layout="vertical" margin={{top:0,right:70,left:10,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                      <XAxis type="number" tick={{fill:"#94a3b8",fontSize:10}}/><YAxis type="category" dataKey="asesor" width={100} tick={{fill:"#64748b",fontSize:9}} tickFormatter={v=>v.length>14?v.substring(0,13)+"…":v}/>
                      <Tooltip content={<Tip/>}/>
                      <Bar dataKey="total"   name="Total"   fill={P.purple} radius={[0,5,5,0]}><LabelList dataKey="total" position="right" style={{fill:"#64748b",fontSize:9,fontWeight:700}}/></Bar>
                      <Bar dataKey="ganados" name="Ganados" fill={P.green}  radius={[0,5,5,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                ))}>
                <div className="flex flex-wrap gap-2 mb-4 items-center">
                  <span style={{ fontSize:10,color:"#94a3b8",fontWeight:700,textTransform:"uppercase" }}>Ordenar por:</span>
                  {[["total","Total"],["ganados","Ganados"],["pctConversion","% Conversion"]].map(([k,lbl])=>(
                    <button key={k} onClick={()=>setSortCrm(k)}
                      style={{ fontSize:10,fontWeight:700,padding:"5px 12px",borderRadius:9,border:`1px solid ${sortCrm===k?"#8b5cf6":"#e2e8f0"}`,background:sortCrm===k?"#8b5cf6":"white",color:sortCrm===k?"white":"#64748b",cursor:"pointer",transition:"all 0.15s" }}>
                      {lbl}
                    </button>
                  ))}
                  <button onClick={()=>setCrmDesc(d=>!d)}
                    style={{ fontSize:10,fontWeight:700,padding:"5px 12px",borderRadius:9,border:"1px solid #e2e8f0",background:"white",color:"#64748b",cursor:"pointer" }}>
                    {crmDesc?"↓ Mayor":"↑ Menor"}
                  </button>
                </div>
                <ChartBoundary>
                  <ResponsiveContainer width="100%" height={crmRankH}>
                    <BarChart data={rankCrmOrdenado} layout="vertical" margin={{top:0,right:70,left:10,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                      <XAxis type="number" tick={{fill:"#94a3b8",fontSize:10}}/><YAxis type="category" dataKey="asesor" width={95} tick={{fill:"#64748b",fontSize:9}} tickFormatter={v=>v.length>13?v.substring(0,12)+"…":v}/>
                      <Tooltip content={<Tip/>}/><Legend wrapperStyle={{fontSize:10,color:"#64748b"}}/>
                      <Bar dataKey="total"   name="Total"   fill={P.purple} radius={[0,5,5,0]} isAnimationActive><LabelList dataKey="total" position="right" style={{fill:"#64748b",fontSize:9,fontWeight:700}}/></Bar>
                      <Bar dataKey="ganados" name="Ganados" fill={P.green}  radius={[0,5,5,0]} isAnimationActive/>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartBoundary>
              </Card>
            )}
          </>)}
        </>)}

      </>)}

      {/* ── Modal expandido ── */}
      {modal && (
        <ChartModal title={modal.title} icon={modal.icon} onClose={closeModal}>
          <ChartBoundary>{modal.fn()}</ChartBoundary>
        </ChartModal>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
}
