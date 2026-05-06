import { useEffect, useState, useMemo, Component } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LabelList,
  ReferenceLine,
} from "recharts";

const API = import.meta.env.VITE_API_URL;

// ── Error Boundary ────────────────────────────────────────────────────────────
class ChartBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, msg: "" }; }
  static getDerivedStateFromError(e) { return { hasError: true, msg: e?.message || "Error" }; }
  render() {
    if (this.state.hasError)
      return <div className="flex items-center justify-center h-24 text-slate-400 text-xs">No se pudo cargar la gráfica</div>;
    return this.props.children;
  }
}

// ── Paleta VELSA pastel ───────────────────────────────────────────────────────
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
const gc = (map,key,i) => map[key] || PASTEL[i % PASTEL.length];
// BUGFIX: siempre retorna Number, no el string original
const safe = v => { const n = Number(v); return isNaN(n) ? 0 : n; };

// ── UI helpers ────────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, color, bg, icon }) => (
  <div className={`rounded-2xl p-5 border flex flex-col gap-1 shadow-sm ${bg||"bg-white border-slate-200"}`}>
    <div className="flex items-center gap-2 mb-1">
      {icon && <span className="text-lg">{icon}</span>}
      <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{label}</span>
    </div>
    <span className={`text-3xl font-black ${color||"text-purple-500"}`}>{value ?? "—"}</span>
    {sub && <span className="text-[11px] text-slate-400 mt-0.5">{sub}</span>}
  </div>
);

const Card = ({ title, icon, children, className="" }) => (
  <div className={`bg-white rounded-2xl p-5 border border-slate-200 shadow-sm ${className}`}>
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xl">{icon}</span>
      <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">{title}</h2>
    </div>
    {children}
  </div>
);

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-lg text-[11px] min-w-[130px]">
      {label && <p className="font-bold text-slate-700 mb-1 border-b pb-1">{label}</p>}
      {payload.map((p,i) => (
        <div key={i} className="flex justify-between gap-3 mt-0.5">
          <span style={{color:p.color||p.fill}} className="font-medium">{p.name}</span>
          <span className="font-bold text-slate-800">{p.value}</span>
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
    <div className="bg-white border border-purple-200 rounded-xl p-3 shadow-lg text-[11px] min-w-[160px]">
      <p className="font-black text-purple-700 mb-1 border-b pb-1">{d.asesor}</p>
      <div className="flex justify-between gap-3"><span className="text-slate-500">Total ventas</span><span className="font-bold">{d.x}</span></div>
      <div className="flex justify-between gap-3"><span className="text-slate-500">% Activos</span><span className="font-bold text-green-600">{d.y}%</span></div>
      <div className="flex justify-between gap-3"><span className="text-slate-500">Activos</span><span className="font-bold">{d.activos}</span></div>
    </div>
  );
};

const EmptyChart = ({ msg="Sin datos para este período" }) => (
  <div className="flex items-center justify-center h-32 text-slate-400 text-xs">{msg}</div>
);

// ── Helpers fecha ─────────────────────────────────────────────────────────────
const hoyEC = () => new Date().toLocaleDateString("en-CA",{timeZone:"America/Guayaquil"});
const addDays = (base, n) => {
  const d = new Date(base+"T00:00:00"); d.setDate(d.getDate()+n);
  return d.toLocaleDateString("en-CA",{timeZone:"America/Guayaquil"});
};
const primerDiaMes = (base) => base.substring(0,8)+"01";
const primerDiaMesAnt = (base) => {
  const d = new Date(base+"T00:00:00"); d.setDate(1); d.setMonth(d.getMonth()-1);
  return d.toLocaleDateString("en-CA",{timeZone:"America/Guayaquil"}).substring(0,8)+"01";
};
const ultimoDiaMesAnt = (base) => {
  const d = new Date(base+"T00:00:00"); d.setDate(0);
  return d.toLocaleDateString("en-CA",{timeZone:"America/Guayaquil"});
};

// ── Página principal ──────────────────────────────────────────────────────────
export default function ResumenVelsa() {
  const hoy = hoyEC();
  const [desde,setDesde] = useState(primerDiaMes(hoy));
  const [hasta,setHasta] = useState(hoy);
  const [data,setData]   = useState(null);
  const [loading,setLoading] = useState(false);
  const [error,setError]   = useState(null);

  // ── Interactividad ──────────────────────────────────────────────────────────
  const [tab,setTab]           = useState("general");       // general | rendimiento | geografia | crm
  const [seriesOn,setSeriesOn] = useState({total:true,activos:true});
  const [sortRank,setSortRank] = useState("total");         // total | pctActivo
  const [rankDesc,setRankDesc] = useState(true);

  // ── CRM Bitrix ──────────────────────────────────────────────────────────────
  const [crm,setCrm]         = useState(null);
  const [crmLoad,setCrmLoad] = useState(false);
  const [crmErr,setCrmErr]   = useState(null);
  const [sortCrm,setSortCrm] = useState("total");
  const [crmDesc,setCrmDesc] = useState(true);
  const [crmSeries,setCrmSeries] = useState({total:true,ganados:true});
  const toggleCrmSerie = k => setCrmSeries(s=>({...s,[k]:!s[k]}));

  const fetchCrm = async (d=desde, h=hasta) => {
    setCrmLoad(true); setCrmErr(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/api/bitrix/velsa?desde=${d}&hasta=${h}`,
        { headers:{Authorization:`Bearer ${token}`} });
      const json = await res.json();
      if (!json.success) throw new Error(json.error||"Error CRM");
      setCrm({
        ...json,
        embudo:   Array.isArray(json.embudo)   ? json.embudo.map(r=>({...r,total:safe(r.total),value:safe(r.value)})) : [],
        tendencia:Array.isArray(json.tendencia) ? json.tendencia.map(r=>({...r,total:safe(r.total),ganados:safe(r.ganados)})) : [],
        asesores: Array.isArray(json.asesores)  ? json.asesores.map(a=>({...a,total:safe(a.total),ganados:safe(a.ganados),pctConversion:safe(a.pctConversion)})) : [],
        fuentes:  Array.isArray(json.fuentes)   ? json.fuentes.map(r=>({...r,value:safe(r.value)})) : [],
        total: safe(json.total),
      });
    } catch(err) { setCrmErr(err.message); }
    finally { setCrmLoad(false); }
  };

  const rankCrmOrdenado = useMemo(()=>{
    if (!crm?.asesores) return [];
    return [...crm.asesores].sort((a,b)=> crmDesc
      ? safe(b[sortCrm]) - safe(a[sortCrm])
      : safe(a[sortCrm]) - safe(b[sortCrm])
    );
  },[crm,sortCrm,crmDesc]);

  const toggleSerie = k => setSeriesOn(s => ({...s,[k]:!s[k]}));

  const applyPreset = (label) => {
    const h = hoyEC();
    if (label==="7D")       { setDesde(addDays(h,-6)); setHasta(h); }
    else if(label==="15D")  { setDesde(addDays(h,-14)); setHasta(h); }
    else if(label==="MES")  { setDesde(primerDiaMes(h)); setHasta(h); }
    else if(label==="MANT") { setDesde(primerDiaMesAnt(h)); setHasta(ultimoDiaMesAnt(h)); }
  };

  const fetchData = async (d=desde, h=hasta) => {
    setLoading(true); setError(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/api/analista/velsa?desde=${d}&hasta=${h}`,
        { headers:{Authorization:`Bearer ${token}`} });
      const json = await res.json();
      if (!json.success) throw new Error(json.error||"Error en respuesta");
      setData({
        ...json,
        calidadVenta:        Array.isArray(json.calidadVenta)        ? json.calidadVenta.map(r=>({...r,value:safe(r.value)}))        : [],
        estadoRegularizacion:Array.isArray(json.estadoRegularizacion)? json.estadoRegularizacion.map(r=>({...r,value:safe(r.value)})) : [],
        formasPago:          Array.isArray(json.formasPago)          ? json.formasPago.map(r=>({...r,value:safe(r.value)}))          : [],
        planes:              Array.isArray(json.planes)              ? json.planes.map(r=>({...r,value:safe(r.value)}))              : [],
        asesores:            Array.isArray(json.asesores)            ? json.asesores.map(a=>({...a,total:safe(a.total),activos:safe(a.activos),pctActivo:safe(a.pctActivo)})) : [],
        tendencia:           Array.isArray(json.tendencia)           ? json.tendencia.map(r=>({...r,total:safe(r.total),activos:safe(r.activos)})) : [],
        provincias:          Array.isArray(json.provincias)          ? json.provincias.map(r=>({...r,value:safe(r.value)}))          : [],
        total: safe(json.total),
      });
    } catch(err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ fetchData(); },[]);

  const kpis = useMemo(()=>{
    if (!data) return {};
    const activos      = safe(data.calidadVenta?.find(c=>c.name==="ACTIVO")?.value);
    const regularizados= safe(data.estadoRegularizacion?.find(c=>c.name==="REGULARIZADO")?.value);
    const porReg       = safe(data.estadoRegularizacion?.find(c=>c.name==="POR REGULARIZAR")?.value);
    const pctActivos   = data.total>0 ? ((activos/data.total)*100).toFixed(1) : "0.0";
    const pctReg       = data.total>0 ? ((regularizados/data.total)*100).toFixed(1) : "0.0";
    return {activos,regularizados,porReg,pctActivos,pctReg};
  },[data]);

  const scatter = useMemo(()=>{
    if (!data?.asesores?.length) return {points:[],medX:0,medY:0};
    const points = data.asesores
      .map(a=>({...a, x:safe(a.total), y:safe(a.pctActivo)}))
      .filter(a=>a.x>0);
    if (!points.length) return {points:[],medX:0,medY:0};
    const medX = Math.round(points.reduce((s,p)=>s+p.x,0)/points.length);
    const medY = parseFloat((points.reduce((s,p)=>s+p.y,0)/points.length).toFixed(1));
    return {points,medX,medY};
  },[data]);

  const rankOrdenado = useMemo(()=>{
    if (!data?.asesores) return [];
    return [...data.asesores].sort((a,b)=> rankDesc
      ? safe(b[sortRank]) - safe(a[sortRank])
      : safe(a[sortRank]) - safe(b[sortRank])
    );
  },[data,sortRank,rankDesc]);

  const rankH = Math.max(260, rankOrdenado.length*30);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6 space-y-6">

      {/* Header */}
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-xl">🟣</div>
          <div>
            <h1 className="text-2xl font-black text-slate-800">Resumen VELSA</h1>
            <p className="text-slate-500 text-sm">Análisis de calidad de ventas · Jotform Netlife</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {/* Presets */}
          <div className="flex gap-1 flex-wrap">
            {[["7D","7 días"],["15D","15 días"],["MES","Este mes"],["MANT","Mes ant"]].map(([k,lbl])=>(
              <button key={k} onClick={()=>{ applyPreset(k); setTimeout(()=>fetchData(),50); }}
                className="text-[10px] font-bold px-3 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-200 transition-colors">
                {lbl}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2 bg-white rounded-2xl p-3 border border-slate-200 shadow-sm">
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-slate-400 uppercase font-bold">Desde</span>
              <input type="date" value={desde} onChange={e=>setDesde(e.target.value)}
                className="text-sm rounded-lg px-3 py-1.5 border border-slate-200 focus:outline-none focus:border-purple-400 bg-slate-50"/>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[9px] text-slate-400 uppercase font-bold">Hasta</span>
              <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}
                className="text-sm rounded-lg px-3 py-1.5 border border-slate-200 focus:outline-none focus:border-purple-400 bg-slate-50"/>
            </div>
            <button onClick={()=>fetchData()}
              className="bg-purple-500 hover:bg-purple-400 text-white text-sm font-bold px-5 py-2 rounded-xl transition-colors shadow-sm">
              Aplicar
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-purple-400 border-t-transparent rounded-full animate-spin"/>
          <span className="ml-3 text-slate-500 text-sm">Cargando datos…</span>
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-600 text-sm">⚠️ {error}</div>}

      {data && !loading && (<>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard icon="📋" label="Total Ventas"    value={data.total}             color="text-slate-800"/>
          <KpiCard icon="✅" label="Activos"         value={kpis.activos}           color="text-green-500"
            sub={`${kpis.pctActivos}% del total`} bg="bg-green-50 border-green-200"/>
          <KpiCard icon="📁" label="Regularizados"   value={kpis.regularizados}     color="text-purple-500"
            sub={`${kpis.pctReg}% del total`} bg="bg-purple-50 border-purple-200"/>
          <KpiCard icon="⏳" label="Por Regularizar" value={kpis.porReg}            color="text-amber-500"
            bg="bg-amber-50 border-amber-200"/>
          <KpiCard icon="👤" label="Asesores activos" value={data.asesores.length} color="text-pink-500"
            bg="bg-pink-50 border-pink-200"/>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-white rounded-2xl p-1 border border-slate-200 shadow-sm w-fit flex-wrap">
          {[["general","🗂️ General"],["rendimiento","🎯 Rendimiento"],["geografia","🗺️ Geografía"],["crm","🔵 CRM Bitrix"]].map(([k,lbl])=>(
            <button key={k} onClick={()=>{ setTab(k); if(k==="crm"&&!crm&&!crmLoad) fetchCrm(); }}
              className={`text-[11px] font-bold px-4 py-2 rounded-xl transition-all ${tab===k?"bg-purple-500 text-white shadow":"text-slate-500 hover:bg-slate-50"}`}>
              {lbl}
            </button>
          ))}
        </div>

        {/* ══ TAB GENERAL ══ */}
        {tab==="general" && (<>

          {/* Tendencia diaria — área con toggles */}
          <Card icon="📈" title="Tendencia Diaria — Ingresos Jotform">
            <div className="flex gap-2 mb-3 flex-wrap">
              {[["total","Total JOT",P.purple],["activos","Activos",P.green]].map(([k,lbl,col])=>(
                <button key={k} onClick={()=>toggleSerie(k)}
                  className={`flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded-lg border transition-all ${seriesOn[k]?"text-white shadow-sm":"bg-white text-slate-400 border-slate-200"}`}
                  style={seriesOn[k]?{background:col,borderColor:col}:{}}>
                  <span className="w-2 h-2 rounded-full inline-block" style={{background:seriesOn[k]?'white':col}}/>
                  {lbl}
                </button>
              ))}
            </div>
            {data.tendencia.length === 0 ? <EmptyChart/> : (
              <ChartBoundary>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={data.tendencia} margin={{top:5,right:10,left:0,bottom:0}}>
                    <defs>
                      <linearGradient id="gTV" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={P.purple} stopOpacity={0.25}/>
                        <stop offset="95%" stopColor={P.purple} stopOpacity={0.02}/>
                      </linearGradient>
                      <linearGradient id="gAV" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={P.green} stopOpacity={0.30}/>
                        <stop offset="95%" stopColor={P.green} stopOpacity={0.02}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="fecha" tick={{fill:"#94a3b8",fontSize:10}}/>
                    <YAxis tick={{fill:"#94a3b8",fontSize:10}}/>
                    <Tooltip content={<Tip/>}/>
                    {seriesOn.total   && <Area type="monotone" dataKey="total"   name="Total JOT" stroke={P.purple} fill="url(#gTV)"  strokeWidth={2.5} dot={false} animationDuration={500}/>}
                    {seriesOn.activos && <Area type="monotone" dataKey="activos" name="Activos"   stroke={P.green}  fill="url(#gAV)" strokeWidth={2.5} dot={false} animationDuration={500}/>}
                  </AreaChart>
                </ResponsiveContainer>
              </ChartBoundary>
            )}
          </Card>

          {/* Estatus + Regularización */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card icon="🏷️" title="Estado Venta Netlife">
              {data.calidadVenta.length === 0 ? <EmptyChart/> : (
                <ChartBoundary>
                  <ResponsiveContainer width="100%" height={270}>
                    <PieChart>
                      <Pie data={data.calidadVenta} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={3}
                        label={({name,percent})=>percent>0.05?`${(percent*100).toFixed(0)}%`:""}>
                        {data.calidadVenta.map((e,i)=>(<Cell key={i} fill={gc(COLORES_STATUS,e.name,i)}/>))}
                      </Pie>
                      <Tooltip content={<Tip/>}/>
                      <Legend wrapperStyle={{fontSize:10,color:"#64748b"}}/>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartBoundary>
              )}
            </Card>

            <Card icon="📋" title="Estado de Regularización">
              {data.estadoRegularizacion.length === 0 ? <EmptyChart/> : (
                <ChartBoundary>
                  <ResponsiveContainer width="100%" height={270}>
                    <PieChart>
                      <Pie data={data.estadoRegularizacion} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={3}
                        label={({percent})=>percent>0.05?`${(percent*100).toFixed(0)}%`:""}>
                        {data.estadoRegularizacion.map((e,i)=>(<Cell key={i} fill={gc(COLORES_REG,e.name,i)}/>))}
                      </Pie>
                      <Tooltip content={<Tip/>}/>
                      <Legend wrapperStyle={{fontSize:10,color:"#64748b"}}/>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartBoundary>
              )}
            </Card>
          </div>

          {/* Planes + Formas de pago */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card icon="📦" title="Distribución de Planes">
              {data.planes.length === 0 ? <EmptyChart/> : (
                <ChartBoundary>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.planes} margin={{top:5,right:10,left:0,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                      <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:10}}/>
                      <YAxis tick={{fill:"#94a3b8",fontSize:10}}/>
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

            <Card icon="💳" title="Formas de Pago">
              {data.formasPago.length === 0 ? <EmptyChart/> : (
                <ChartBoundary>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={data.formasPago} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" outerRadius={82} innerRadius={42} paddingAngle={4}
                        label={({percent})=>percent>0.05?`${(percent*100).toFixed(0)}%`:""}>
                        {data.formasPago.map((_,i)=><Cell key={i} fill={PASTEL[i%PASTEL.length]}/>)}
                      </Pie>
                      <Tooltip content={<Tip/>}/>
                      <Legend wrapperStyle={{fontSize:10,color:"#64748b"}}/>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartBoundary>
              )}
            </Card>
          </div>
        </>)}

        {/* ══ TAB RENDIMIENTO ══ */}
        {tab==="rendimiento" && (<>

          {/* Scatter — Matriz de Rendimiento */}
          <Card icon="🎯" title="Matriz de Rendimiento — Volumen vs. % Activos por Asesor">
            <p className="text-xs text-slate-400 mb-2">
              Las líneas representan los promedios del grupo · Haz hover sobre cada punto para ver el asesor
            </p>
            <div className="grid grid-cols-2 gap-1 text-[9px] mb-3 text-center">
              <div className="bg-amber-50 rounded-lg py-1.5 border border-amber-100 text-amber-600 font-semibold">⬆️⬅️ Alta efectividad, bajo volumen</div>
              <div className="bg-green-50  rounded-lg py-1.5 border border-green-100 text-green-600 font-semibold">⬆️➡️ 🌟 Top performers</div>
              <div className="bg-red-50    rounded-lg py-1.5 border border-red-100 text-red-500 font-semibold">⬇️⬅️ Reforzar capacitación</div>
              <div className="bg-purple-50 rounded-lg py-1.5 border border-purple-100 text-purple-600 font-semibold">⬇️➡️ Alto volumen, mejorar calidad</div>
            </div>
            {scatter.points.length === 0 ? <EmptyChart/> : (
              <ChartBoundary>
                <ResponsiveContainer width="100%" height={340}>
                  <ScatterChart margin={{top:10,right:30,left:0,bottom:20}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="x" name="Total ventas" type="number"
                      label={{value:"Total ventas",position:"insideBottom",offset:-10,fill:"#94a3b8",fontSize:10}}
                      tick={{fill:"#94a3b8",fontSize:10}}/>
                    <YAxis dataKey="y" name="% Activos" type="number" domain={[0,100]}
                      label={{value:"% Activos",angle:-90,position:"insideLeft",fill:"#94a3b8",fontSize:10}}
                      tick={{fill:"#94a3b8",fontSize:10}}/>
                    <Tooltip content={<ScatterTip/>}/>
                    {scatter.medX>0 && <ReferenceLine x={scatter.medX} stroke={P.slate} strokeDasharray="4 3"
                      label={{value:`x̄ ${scatter.medX}`,fill:"#94a3b8",fontSize:9,position:"insideTopRight"}}/>}
                    {scatter.medY>0 && <ReferenceLine y={scatter.medY} stroke={P.slate} strokeDasharray="4 3"
                      label={{value:`ȳ ${scatter.medY}%`,fill:"#94a3b8",fontSize:9,position:"insideTopLeft"}}/>}
                    <Scatter name="Asesores" data={scatter.points}
                      fill={P.purple} fillOpacity={0.8} stroke="white" strokeWidth={1.5}/>
                  </ScatterChart>
                </ResponsiveContainer>
              </ChartBoundary>
            )}
          </Card>

          {/* Ranking con controles */}
          <Card icon="🏆" title="Ranking de Asesores">
            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Ordenar por:</span>
              {[["total","Volumen total"],["pctActivo","% Efectividad"]].map(([k,lbl])=>(
                <button key={k} onClick={()=>setSortRank(k)}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${sortRank===k?"bg-purple-500 text-white border-purple-500":"bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
                  {lbl}
                </button>
              ))}
              <button onClick={()=>setRankDesc(d=>!d)}
                className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-white text-slate-500 border-slate-200 hover:bg-slate-50 transition-all">
                {rankDesc?"↓ Mayor a menor":"↑ Menor a mayor"}
              </button>
            </div>
            {rankOrdenado.length === 0 ? <EmptyChart/> : (
              <ChartBoundary>
                <ResponsiveContainer width="100%" height={rankH}>
                  <BarChart data={rankOrdenado} layout="vertical" margin={{top:0,right:70,left:10,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                    <XAxis type="number" tick={{fill:"#94a3b8",fontSize:10}}/>
                    <YAxis type="category" dataKey="asesor" width={95}
                      tick={{fill:"#64748b",fontSize:9}}
                      tickFormatter={v=>v.length>13?v.substring(0,12)+"…":v}/>
                    <Tooltip content={<Tip/>}/>
                    <Legend wrapperStyle={{fontSize:10,color:"#64748b"}}/>
                    <Bar dataKey="total"   name="Total"   fill={P.purple} radius={[0,5,5,0]} isAnimationActive>
                      <LabelList dataKey="total" position="right" style={{fill:"#64748b",fontSize:9,fontWeight:700}}/>
                    </Bar>
                    <Bar dataKey="activos" name="Activos" fill={P.green}  radius={[0,5,5,0]} isAnimationActive/>
                  </BarChart>
                </ResponsiveContainer>
              </ChartBoundary>
            )}
          </Card>
        </>)}

        {/* ══ TAB CRM BITRIX ══ */}
        {tab==="crm" && (<>
          {crmLoad && (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-purple-400 border-t-transparent rounded-full animate-spin"/>
              <span className="ml-3 text-slate-500 text-sm">Cargando CRM Bitrix…</span>
            </div>
          )}
          {crmErr && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-600 text-sm">⚠️ {crmErr}</div>}

          {!crm && !crmLoad && !crmErr && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
              <p className="text-blue-600 font-bold text-sm mb-2">🔵 CRM Bitrix — VELSA VENTAS NETLIFE</p>
              <p className="text-slate-500 text-xs mb-4">Primero ejecuta una sincronización para traer los datos del CRM.</p>
              <button onClick={()=>fetchCrm()}
                className="bg-purple-500 hover:bg-purple-400 text-white text-sm font-bold px-6 py-2 rounded-xl transition-colors">
                Cargar datos CRM
              </button>
            </div>
          )}

          {crm && !crmLoad && (<>

            {/* KPIs CRM */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[10px] text-slate-400">
                {crm.ultimaSync
                  ? `Última sync: ${new Date(crm.ultimaSync).toLocaleString('es-EC',{timeZone:'America/Guayaquil'})}`
                  : 'Sin sincronización registrada — ejecuta /api/bitrix/sync'}
              </div>
              <button onClick={()=>fetchCrm()}
                className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-200 transition-colors">
                🔄 Recargar
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard icon="📋" label="Total CRM"       value={crm.total}                color="text-slate-800"/>
              <KpiCard icon="✅" label="Ventas Subidas"  value={crm.kpi.ventas_subidas}   color="text-green-500"
                sub={`${crm.kpi.pct_conversion}% conversión`} bg="bg-green-50 border-green-200"/>
              <KpiCard icon="❌" label="Descartes"       value={crm.kpi.descartes}        color="text-red-500"
                bg="bg-red-50 border-red-200"/>
              <KpiCard icon="⏳" label="En Proceso"      value={crm.kpi.en_proceso}       color="text-purple-500"
                bg="bg-purple-50 border-purple-200"/>
            </div>

            {/* Embudo CRM — barras verticales */}
            <Card icon="🔵" title="Embudo CRM — VELSA VENTAS NETLIFE (Cat:8)">
              <p className="text-xs text-slate-400 mb-3">Distribución de deals por etapa en el período seleccionado</p>
              {crm.embudo.length === 0 ? <EmptyChart msg="Sin datos en DB — ejecuta la sincronización"/> : (
                <ChartBoundary>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={crm.embudo} margin={{top:24,right:10,left:0,bottom:70}} barCategoryGap="18%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                      <XAxis dataKey="etapa" axisLine={false} tickLine={false}
                        tick={{fill:'#94a3b8',fontSize:8,fontWeight:700}}
                        interval={0} angle={-38} textAnchor="end"/>
                      <YAxis axisLine={false} tickLine={false} tick={{fill:'#94a3b8',fontSize:9}}/>
                      <Tooltip content={<Tip/>}/>
                      <Bar dataKey="total" name="Deals" radius={[6,6,0,0]} isAnimationActive>
                        {crm.embudo.map((e,i)=>(
                          <Cell key={i} fill={
                            e.es_ganado ? P.green :
                            e.es_perdido ? P.red :
                            PASTEL[i % PASTEL.length]
                          }/>
                        ))}
                        <LabelList dataKey="total" position="top" style={{fill:'#475569',fontSize:9,fontWeight:900}}/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartBoundary>
              )}
            </Card>

            {/* Tendencia CRM */}
            <Card icon="📈" title="Tendencia Diaria — Ingresos CRM">
              <div className="flex gap-2 mb-3 flex-wrap">
                {[["total","Total CRM",P.purple],["ganados","Ventas Subidas",P.green]].map(([k,lbl,col])=>(
                  <button key={k} onClick={()=>toggleCrmSerie(k)}
                    className={`flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded-lg border transition-all ${crmSeries[k]?"text-white shadow-sm":"bg-white text-slate-400 border-slate-200"}`}
                    style={crmSeries[k]?{background:col,borderColor:col}:{}}>
                    <span className="w-2 h-2 rounded-full inline-block" style={{background:crmSeries[k]?'white':col}}/>
                    {lbl}
                  </button>
                ))}
              </div>
              {crm.tendencia.length === 0 ? <EmptyChart/> : (
                <ChartBoundary>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={crm.tendencia} margin={{top:5,right:10,left:0,bottom:0}}>
                      <defs>
                        <linearGradient id="gTC" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={P.purple} stopOpacity={0.25}/>
                          <stop offset="95%" stopColor={P.purple} stopOpacity={0.02}/>
                        </linearGradient>
                        <linearGradient id="gGC" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={P.green} stopOpacity={0.30}/>
                          <stop offset="95%" stopColor={P.green} stopOpacity={0.02}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                      <XAxis dataKey="fecha" tick={{fill:"#94a3b8",fontSize:10}}/>
                      <YAxis tick={{fill:"#94a3b8",fontSize:10}}/>
                      <Tooltip content={<Tip/>}/>
                      {crmSeries.total   && <Area type="monotone" dataKey="total"   name="Total CRM"     stroke={P.purple} fill="url(#gTC)" strokeWidth={2.5} dot={false} animationDuration={500}/>}
                      {crmSeries.ganados && <Area type="monotone" dataKey="ganados" name="Ventas Subidas" stroke={P.green}  fill="url(#gGC)" strokeWidth={2.5} dot={false} animationDuration={500}/>}
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartBoundary>
              )}
            </Card>

            {/* Ranking asesores CRM */}
            <Card icon="🏆" title="Ranking Asesores — CRM Bitrix">
              <div className="flex flex-wrap gap-2 mb-4 items-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Ordenar por:</span>
                {[["total","Total CRM"],["ganados","Ventas Subidas"],["pctConversion","% Conversión"]].map(([k,lbl])=>(
                  <button key={k} onClick={()=>setSortCrm(k)}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${sortCrm===k?"bg-purple-500 text-white border-purple-500":"bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>
                    {lbl}
                  </button>
                ))}
                <button onClick={()=>setCrmDesc(d=>!d)}
                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-white text-slate-500 border-slate-200 hover:bg-slate-50 transition-all">
                  {crmDesc?"↓ Mayor a menor":"↑ Menor a mayor"}
                </button>
              </div>
              {rankCrmOrdenado.length === 0 ? <EmptyChart/> : (
                <ChartBoundary>
                  <ResponsiveContainer width="100%" height={Math.max(260,rankCrmOrdenado.length*30)}>
                    <BarChart data={rankCrmOrdenado} layout="vertical" margin={{top:0,right:70,left:10,bottom:0}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
                      <XAxis type="number" tick={{fill:"#94a3b8",fontSize:10}}/>
                      <YAxis type="category" dataKey="asesor" width={110}
                        tick={{fill:"#64748b",fontSize:9}}
                        tickFormatter={v=>v.length>15?v.substring(0,14)+"…":v}/>
                      <Tooltip content={<Tip/>}/>
                      <Legend wrapperStyle={{fontSize:10,color:"#64748b"}}/>
                      <Bar dataKey="total"   name="Total CRM"      fill={P.purple} radius={[0,5,5,0]} isAnimationActive>
                        <LabelList dataKey="total" position="right" style={{fill:"#64748b",fontSize:9,fontWeight:700}}/>
                      </Bar>
                      <Bar dataKey="ganados" name="Ventas Subidas" fill={P.green}  radius={[0,5,5,0]} isAnimationActive/>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartBoundary>
              )}
            </Card>

            {/* Fuentes */}
            {crm.fuentes.length > 0 && (
              <Card icon="📡" title="Fuente de Leads — CRM Bitrix">
                <ChartBoundary>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={crm.fuentes} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={4}
                        label={({percent})=>percent>0.04?`${(percent*100).toFixed(0)}%`:""}>
                        {crm.fuentes.map((_,i)=><Cell key={i} fill={PASTEL[i%PASTEL.length]}/>)}
                      </Pie>
                      <Tooltip content={<Tip/>}/>
                      <Legend wrapperStyle={{fontSize:10,color:"#64748b"}}/>
                    </PieChart>
                  </ResponsiveContainer>
                </ChartBoundary>
              </Card>
            )}
          </>)}
        </>)}

        {/* ══ TAB GEOGRAFÍA ══ */}
        {tab==="geografia" && (<>
          <Card icon="🗺️" title="Distribución por Provincia">
            {(!data.provincias || data.provincias.length===0) ? <EmptyChart msg="Sin datos geográficos en este período"/> : (
              <ChartBoundary>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.provincias} margin={{top:10,right:20,left:0,bottom:40}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="name" tick={{fill:"#94a3b8",fontSize:10,angle:-25,textAnchor:"end"}} interval={0}/>
                    <YAxis tick={{fill:"#94a3b8",fontSize:10}}/>
                    <Tooltip content={<Tip/>}/>
                    <Bar dataKey="value" name="Ventas" radius={[8,8,0,0]} isAnimationActive>
                      {data.provincias.map((_,i)=><Cell key={i} fill={PASTEL[i%PASTEL.length]}/>)}
                      <LabelList dataKey="value" position="top" style={{fill:"#64748b",fontSize:10,fontWeight:700}}/>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartBoundary>
            )}
          </Card>
        </>)}

      </>)}
    </div>
  );
}
