import { useEffect, useState, useMemo } from "react";
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, FunnelChart, Funnel, LabelList, Cell 
} from 'recharts';

export default function ReporteComercialCore() {
  const [tabActiva, setTabActiva] = useState("GENERAL");
  const [loading, setLoading] = useState(false);
  const [alertas, setAlertas] = useState([]);
  
  const [data, setData] = useState({ 
    supervisores: [], 
    asesores: [], 
    dataCRM: [], 
    dataNetlife: [], 
    estadosNetlife: [],
    graficoEmbudo: [],   
    graficoBarrasDia: [],
    etapasCRM: [],
    porcentajeTerceraEdad: 0,
  });
  
  const [monitoreoData, setMonitoreoData] = useState({ 
    supervisores: [], 
    asesores: [] 
  });

  const [filtros, setFiltros] = useState({
    fechaDesde: new Date().toISOString().split("T")[0],
    fechaHasta: new Date().toISOString().split("T")[0],
    asesor: "",
    supervisor: "",
    estadoNetlife: "",
    estadoRegularizacion: "",
    etapaCRM: "",
    etapaJotform: "",
  });

  const mostrarAlertas = (supervisores) => {
    const nuevasAlertas = [];

    const supEficienciaBaja = (supervisores || []).filter(s => Number(s.eficiencia) < 5);
    if (supEficienciaBaja.length > 0) {
      nuevasAlertas.push({
        id: 1,
        mensaje: `⚠️ ATENCIÓN: ${supEficienciaBaja.length} SUPERVISOR(ES) CON EFICIENCIA MENOR AL 5%`,
        color: "bg-red-600 border-red-400",
        duracion: 5000,
      });
    }

    const supVentasBajas = (supervisores || []).filter(s => Number(s.ingresos_reales) < 2);
    if (supVentasBajas.length > 0) {
      const nombres = supVentasBajas.map(s => s.nombre_grupo).join(", ");
      nuevasAlertas.push({
        id: 2,
        mensaje: `📉 ${supVentasBajas.length} SUPERVISOR(ES) CON MENOS DE 2 VENTAS JOT: ${nombres}`,
        color: "bg-amber-600 border-amber-400",
        duracion: 7000,
      });
    }

    if (nuevasAlertas.length > 0) {
      setAlertas(nuevasAlertas);
      nuevasAlertas.forEach(alerta => {
        setTimeout(() => {
          setAlertas(prev => prev.filter(a => a.id !== alerta.id));
        }, alerta.duracion);
      });
    }
  };

  const fetchDashboard = async (filtrosOverride) => {
    setLoading(true);
    try {
      const filtrosActivos = filtrosOverride || filtros;
      const params = Object.fromEntries(Object.entries(filtrosActivos).filter(([_, v]) => v !== ""));
      const p = new URLSearchParams(params);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores/dashboard?${p}`);
      const result = await res.json();
      if (result.success) {
        setData(result);
        mostrarAlertas(result.supervisores);
      }
    } catch (e) {
      console.error("Error Dashboard:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMonitoreo = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores/monitoreo-diario`);
      const result = await res.json();
      if (result.success) setMonitoreoData(result);
    } catch (e) {
      console.error("Error Monitoreo:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleClickTarjetaJotform = (estado) => {
    const nuevosFiltros = { ...filtros, etapaJotform: estado };
    setFiltros(nuevosFiltros);
    fetchDashboard(nuevosFiltros);
  };

  useEffect(() => { 
    if(tabActiva === "GENERAL") {
      fetchDashboard();
    } else {
      fetchMonitoreo();
    }
  }, [tabActiva]);

  const descargarExcel = (tipo) => {
    const list = tipo === "CRM" ? data.dataCRM : data.dataNetlife;
    if (!list || !list.length) return;
    const ws = XLSX.utils.json_to_sheet(list);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tipo);
    XLSX.writeFile(wb, `Reporte_${tipo}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const stats = useMemo(() => {
    const s = data.supervisores || [];
    const n = s.length || 1;
    return {
      ingresosCRM: s.reduce((acc, c) => acc + Number(c.ventas_crm || 0), 0),
      gestionables: s.reduce((acc, c) => acc + Number(c.gestionables || 0), 0),
      ingresosJotform: s.reduce((acc, c) => acc + Number(c.ingresos_reales || 0), 0),
      descartePorc: (s.reduce((acc, c) => acc + Number(c.descarte || 0), 0) / n).toFixed(1),
      leadsGestionables: s.reduce((acc, c) => acc + Number(c.leads_totales || 0), 0),
      efectividad: (s.reduce((acc, c) => acc + Number(c.eficiencia || 0), 0) / n).toFixed(1),
      tasaInstalacion: (s.reduce((acc, c) => acc + Number(c.tasa_instalacion || 0), 0) / n).toFixed(1),
      tarjetaCredito: 65, 
      efectividadActivasPauta: (s.reduce((acc, c) => acc + Number(c.efectividad_activas_vs_pauta || 0), 0) / n).toFixed(1),
      terceraEdad: Number(data.porcentajeTerceraEdad || 0).toFixed(1),
    };
  }, [data]);

  const ETAPAS_JOTFORM = [
    'ACTIVO', 'ASIGNADO', 'PREPLANIIFICADO', 'PLANIIFICADO', 'RECHAZADO',
    'REPLANIFICADO', 'DESISTE DEL SERVICIO', 'PRESERVICIO', 'FIN DE GESTION', 'FACTIBLE'
  ];

  const COLORES_EMBUDO = ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];

  const CustomBarLabel = (props) => {
    const { x, y, width, value } = props;
    if (!value) return null;
    return (
      <text x={x + width / 2} y={y + 18} fill="#ffffff" textAnchor="middle" fontSize={10} fontWeight="900">
        {value}
      </text>
    );
  };

  const CustomXAxisTick = (props) => {
    const { x, y, payload } = props;
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={10} textAnchor="end" fill="#64748b" fontSize={9} fontWeight={700} transform="rotate(-45)">
          {payload.value}
        </text>
      </g>
    );
  };

  const CustomFunnelLabel = (props) => {
    const { x, y, width, height, index } = props;
    if (height < 22) return null;
    const item = (data.graficoEmbudo || [])[index];
    if (!item) return null;
    return (
      <text x={x + width / 2} y={y + height / 2} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="900">
        {`${item.etapa} = ${item.total}`}
      </text>
    );
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] p-6 font-['Inter',_sans-serif] text-slate-900 uppercase">

      {/* ALERTAS APILADAS */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2">
        {alertas.map(alerta => (
          <div key={alerta.id} className={`${alerta.color} text-white px-6 py-4 rounded-2xl shadow-2xl text-[11px] font-black tracking-wider animate-in slide-in-from-right-5 duration-300 border max-w-sm`}>
            {alerta.mensaje}
          </div>
        ))}
      </div>
      
      {/* HEADER Y TABS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <span className="bg-blue-600 text-white px-2 py-1 rounded italic text-xl">REV</span> 
          SISTEMA DE INDICADORES
        </h1>

        <div className="flex gap-2 bg-slate-200 p-1 rounded-xl border border-slate-300 w-full sm:w-auto">
          <button 
            onClick={() => setTabActiva("GENERAL")} 
            className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[10px] font-black rounded-lg transition-all ${tabActiva === "GENERAL" ? "bg-[#0F172A] text-white shadow-lg" : "text-slate-500 hover:bg-slate-300"}`}
          >
            📊 REPORTE GENERAL D-1
          </button>
          <button 
            onClick={() => setTabActiva("MONITOREO")} 
            className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[10px] font-black rounded-lg transition-all ${tabActiva === "MONITOREO" ? "bg-emerald-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-300"}`}
          >
            ⏱️ MONITOREO LEADS
          </button>
        </div>
      </div>

      {tabActiva === "GENERAL" ? (
        <div className="animate-in fade-in duration-500">

          {/* FILTROS */}
          <div className="bg-[#0F172A] rounded-2xl shadow-2xl mb-8 overflow-hidden border border-slate-800">
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-9 gap-4 items-end">

                <div className="lg:col-span-2 flex flex-col gap-2">
                  <label className="text-[9px] font-black text-blue-400 italic tracking-widest">PERÍODO DE CONSULTA</label>
                  <div className="flex bg-slate-900 border border-slate-700 rounded-2xl p-1.5 shadow-inner">
                    <input type="date" className="bg-transparent text-white text-center text-[11px] font-bold outline-none w-full [color-scheme:dark]" value={filtros.fechaDesde} onChange={e => setFiltros({...filtros, fechaDesde: e.target.value})} />
                    <div className="text-slate-600 px-2 font-black self-center">-</div>
                    <input type="date" className="bg-transparent text-white text-center text-[11px] font-bold outline-none w-full [color-scheme:dark]" value={filtros.fechaHasta} onChange={e => setFiltros({...filtros, fechaHasta: e.target.value})} />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-slate-500 italic">ASESOR</label>
                  <input type="text" placeholder="BUSCAR..." className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none focus:border-blue-500 transition-colors" value={filtros.asesor} onChange={e => setFiltros({...filtros, asesor: e.target.value})} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-slate-500 italic">SUPERVISOR</label>
                  <input type="text" placeholder="BUSCAR..." className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none focus:border-blue-500 transition-colors" value={filtros.supervisor} onChange={e => setFiltros({...filtros, supervisor: e.target.value})} />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-slate-500 italic">ETAPA CRM</label>
                  <select className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none appearance-none" value={filtros.etapaCRM} onChange={e => setFiltros({...filtros, etapaCRM: e.target.value})}>
                    <option value="">TODAS</option>
                    {(data.etapasCRM || []).map((etapa, i) => (
                      <option key={i} value={etapa}>{etapa}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-slate-500 italic">NETLIFE</label>
                  <select className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none appearance-none" value={filtros.estadoNetlife} onChange={e => setFiltros({...filtros, estadoNetlife: e.target.value})}>
                    <option value="">TODOS</option>
                    <option value="ACTIVO">ACTIVO</option>
                    <option value="RECHAZADO">RECHAZADO</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-slate-500 italic">ETAPA JOTFORM</label>
                  <select className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none appearance-none" value={filtros.etapaJotform} onChange={e => setFiltros({...filtros, etapaJotform: e.target.value})}>
                    <option value="">TODAS</option>
                    {ETAPAS_JOTFORM.map((etapa, i) => (
                      <option key={i} value={etapa}>{etapa}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black text-slate-500 italic">REGULARIZACIÓN</label>
                  <select className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none appearance-none" value={filtros.estadoRegularizacion} onChange={e => setFiltros({...filtros, estadoRegularizacion: e.target.value})}>
                    <option value="">TODOS</option>
                    <option value="POR REGULARIZAR">POR REGULARIZAR</option>
                    <option value="REGULARIZADO">REGULARIZADO</option>
                  </select>
                </div>

                <button 
                  onClick={() => fetchDashboard()} 
                  className="bg-blue-600 hover:bg-blue-500 text-white h-[42px] rounded-xl text-[10px] font-black shadow-lg shadow-blue-900/20 transition-all active:scale-95"
                >
                  {loading ? "CARGANDO..." : "APLICAR FILTROS"}
                </button>

            </div>
          </div>

          {/* KPI CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-3 mb-6">
            <KpiMini label="Leads Totales" value={stats.leadsGestionables} color="border-l-emerald-500" />    
            <KpiMini label="Gestionables" value={stats.gestionables} color="border-l-violet-500" />
            <KpiMini label="Ingresos CRM" value={stats.ingresosCRM} color="border-l-blue-500" />
            <KpiMini label="Ingresos JOT" value={stats.ingresosJotform} color="border-l-emerald-500" />
            <KpiMini label="Efectividad" value={`${stats.efectividad}%`} color="border-l-purple-500" />
            <KpiMini label="Tasa Inst." value={`${stats.tasaInstalacion}%`} color="border-l-cyan-500" />
            <KpiMini label="Tarjeta %" value={`${stats.tarjetaCredito}%`} color="border-l-amber-500" />
            <KpiMini label="Descarte %" value={`${stats.descartePorc}%`} color="border-l-rose-500" />
            <KpiMini label="Efic. Pauta" value={`${stats.efectividadActivasPauta}%`} color="border-l-indigo-600" />
            <KpiMini label="3ra Edad %" value={`${stats.terceraEdad}%`} color="border-l-pink-500" />
            <KpiMini label="Activas Mes" value={stats.activas} color="border-l-emerald-500" />
            <KpiMini label="Activas 2" value={stats.total_activas_calculada} color="border-l-pink-500" />
          </div>

          {/* ETAPAS JOTFORM - TARJETAS CLICKEABLES */}
          <div className="bg-white border border-slate-200 shadow-sm p-6 mb-6 rounded-2xl">
            <h3 className="text-[10px] font-black text-slate-400 uppercase mb-5 tracking-widest flex items-center gap-2 italic">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              Etapas Jotform
              {filtros.etapaJotform && (
                <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[8px] font-black normal-case">
                  FILTRO ACTIVO: {filtros.etapaJotform}
                  <button onClick={() => { const f = {...filtros, etapaJotform: ""}; setFiltros(f); fetchDashboard(f); }} className="ml-1 text-blue-400 hover:text-red-500">✕</button>
                </span>
              )}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {(data.estadosNetlife || []).map((e, i) => (
                <div
                  key={i}
                  onClick={() => handleClickTarjetaJotform(e.estado)}
                  className={`px-3 py-3 rounded-xl flex justify-between items-center shadow-sm cursor-pointer transition-all border hover:scale-105 active:scale-95 ${filtros.etapaJotform === e.estado ? 'bg-blue-50 border-blue-400 shadow-blue-100' : 'bg-white border-slate-100 hover:border-blue-300'}`}
                >
                  <span className="text-[10px] font-bold text-slate-600 uppercase leading-tight pr-2">{e.estado}</span>
                  <span className={`text-sm font-black px-2 py-1 rounded-lg shrink-0 ${filtros.etapaJotform === e.estado ? 'text-white bg-blue-500' : 'text-blue-600 bg-blue-50'}`}>{e.total}</span>
                </div>  
              ))}
            </div>
          </div>

          {/* GRÁFICOS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

            {/* GRÁFICO DE BARRAS POR DÍA - PRODUCCION POR DIA (b_cerrado) */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-2xl">
              <h3 className="text-[10px] font-black text-emerald-400 mb-8 italic tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                PRODUCCIÓN POR DÍA (CERRADOS)
              </h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.graficoBarrasDia} margin={{ top: 10, right: 10, left: 0, bottom: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                    <XAxis dataKey="fecha" axisLine={false} tickLine={false} tick={<CustomXAxisTick />} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 9 }} />
                    <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '10px' }} />
                    <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} label={<CustomBarLabel />} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* EMBUDO DE CONVERSIÓN */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-2xl">
              <h3 className="text-[10px] font-black text-blue-400 mb-4 italic tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                EMBUDO DE CONVERSIÓN
              </h3>
              <div className="flex gap-4 h-[300px]">
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <FunnelChart>
                      <Funnel
                        data={data.graficoEmbudo || []}
                        dataKey="total"
                        nameKey="etapa"
                        isAnimationActive={false}
                        label={CustomFunnelLabel}
                      >
                        {(data.graficoEmbudo || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORES_EMBUDO[index % COLORES_EMBUDO.length]} />
                        ))}
                      </Funnel>
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', fontSize: '10px' }} />
                    </FunnelChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-[180px] overflow-y-auto flex flex-col gap-1.5 py-1 pr-1">
                  {(data.graficoEmbudo || []).slice(0, 12).map((entry, index) => (
                    <div key={index} className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORES_EMBUDO[index % COLORES_EMBUDO.length] }} />
                      <span className="text-[8px] text-slate-400 truncate leading-tight flex-1">{entry.etapa}</span>
                      <span className="text-[8px] font-black text-white shrink-0">{entry.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* TABLAS GENERALES */}
          <div className="mb-8">
            <HorizontalTable title="KPI POR SUPERVISOR" data={data.supervisores} />
          </div>
          <div className="mb-8">
            <HorizontalTable title="KPI POR ASESOR" data={data.asesores} hasScroll={true} />
          </div>

          {/* VISUALIZADORES DE DATA */}
          <div className="grid grid-cols-1 gap-4">
            <DataVisor 
              title="DETALLE BASE CRM" 
              data={data.dataCRM} 
              onDownload={() => descargarExcel("CRM")} 
              color="bg-slate-800" 
            />
            <DataVisor 
              title="DETALLE BASE JOTFORM (NETLIFE)" 
              data={data.dataNetlife} 
              onDownload={() => descargarExcel("JOTFORM")} 
              color="bg-blue-900" 
            />
          </div>
        </div>
      ) : (
        <div className="animate-in slide-in-from-right-5 duration-500 space-y-6">
          <div className="bg-emerald-900 text-white p-5 rounded-2xl flex justify-between items-center shadow-xl border-b-4 border-emerald-700">
             <div>
               <h2 className="text-lg font-black italic tracking-tighter flex items-center gap-2">
                 <span className="relative flex h-3 w-3">
                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                   <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                 </span>
                 MONITOREO DE GESTIÓN EN VIVO
               </h2>
               <p className="text-[9px] font-bold text-emerald-300 tracking-[0.2em]">DATOS ACUMULADOS DEL MES Y DÍA ACTUAL</p>
             </div>
             <button 
               onClick={fetchMonitoreo} 
               className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-xl text-[10px] font-black backdrop-blur-sm transition-all border border-white/20"
             >
               {loading ? "ACTUALIZANDO..." : "FORZAR RECARGA"}
             </button>
          </div>
          
          <DailyMonitoringTable title="CONTROL OPERATIVO: SUPERVISORES" data={monitoreoData.supervisores} />
          <DailyMonitoringTable title="CONTROL OPERATIVO: ASESORES" data={monitoreoData.asesores} hasScroll={true} />
        </div>
      )}
    </div>
  );
}

function KpiMini({ label, value, color }) {
  return (
    <div className={`bg-white border-l-4 ${color} p-4 shadow-md rounded-xl hover:translate-y-[-2px] transition-transform`}>
      <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-tighter">{label}</p>
      <p className="text-xl font-black text-slate-800 tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function HorizontalTable({ title, data, hasScroll }) {
  const safeData = data || [];
  return (
    <div className="bg-white border border-slate-400 shadow-sm rounded-sm overflow-hidden">
      <div className="px-2 py-1 bg-slate-50 border-b border-slate-400 flex justify-between items-center">
        <h2 className="text-[9px] font-black uppercase">{title}</h2>
        <span className="text-[8px] text-slate-400 font-mono">V2.0_ENGINE</span>
      </div>
      <div className={`overflow-auto ${hasScroll ? 'max-h-[350px]' : ''}`}>
        <table className="w-full text-[9px] border-collapse">
          <thead>
            <tr className="bg-slate-200 border-b border-slate-400 font-black">
              <th className="p-1 border-r border-slate-400 sticky left-0 bg-slate-200 z-10 text-left">ENTIDAD</th>
              <th colSpan="4" className="border-r border-slate-400 text-center bg-slate-200/50">PRES. VENTAS ACTIVAS</th>
              <th className="border-r border-slate-400 text-center">LEADS</th>
              <th colSpan="2" className="border-r border-slate-400 text-center bg-slate-200/50">VENTAS SUBIDAS</th>
              <th className="border-r border-slate-400 text-center">EFECT. %</th>
              <th className="border-r border-slate-400 text-center">DESC. %</th>
              <th className="border-r border-slate-400 text-center">INST. %</th>
              <th className="border-r border-slate-400 text-center bg-slate-50">EFIC. %</th>
              <th>REGU.</th>
            </tr>
            <tr className="bg-white border-b border-slate-400 text-[8px] text-slate-500">
              <th className="p-1 border-r border-slate-400 sticky left-0 bg-white z-10">NOMBRE</th>
              <th className="border-r border-slate-100 w-10">REAL</th>
              <th className="border-r border-slate-100 w-10">BACK</th>
              <th className="border-r border-slate-100 w-10 bg-slate-50 font-bold">TOT</th>
              <th className="border-r border-slate-400 w-10">CREC</th>
              <th className="border-r border-slate-400 w-12">TOT</th>
              <th className="border-r border-slate-100 w-10">CRM</th>
              <th className="border-r border-slate-400 w-10">JOTF</th>
              <th className="border-r border-slate-400 w-12">REAL</th>
              <th className="border-r border-slate-400 w-12">REAL</th>
              <th className="border-r border-slate-400 w-12">REAL</th>
              <th className="border-r border-slate-400 w-12 bg-slate-50 font-bold">REAL</th>
              <th className="w-12">REAL</th>
            </tr>
          </thead>
          <tbody className="font-mono leading-none">
            {safeData.map((row, idx) => (
              <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                <td className="p-1 border-r border-slate-400 sticky left-0 bg-white font-bold truncate max-w-[150px]">{row.nombre_grupo}</td>
                <td className="text-center border-r border-slate-100 py-1">{row.real_mes}</td>
                <td className="text-center border-r border-slate-100">{row.backlog}</td>
                <td className="text-center border-r border-slate-100 font-bold bg-slate-50">{row.total_activas_calculada}</td>
                <td className="text-center border-r border-slate-400 text-slate-400">{row.crec_vs_ma}</td>
                <td className="text-center border-r border-slate-400 font-bold">{row.leads_totales}</td>
                <td className="text-center border-r border-slate-100">{row.ventas_crm}</td>
                <td className="text-center border-r border-slate-400">{row.ingresos_reales}</td>
                <td className="text-center border-r border-slate-400 font-bold">{row.efectividad_activas_vs_pauta}%</td>
                <td className="text-center border-r border-slate-400">{row.descarte}%</td>
                <td className="text-center border-r border-slate-400">{row.tasa_instalacion}%</td>
                <td className="text-center border-r border-slate-400 font-bold bg-slate-50">{row.eficiencia}%</td>
                <td className="text-center font-bold">{row.regularizacion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DailyMonitoringTable({ title, data, hasScroll }) {
  const safeData = data || [];
  return (
    <div className="bg-white border border-slate-300 shadow-2xl rounded-xl overflow-hidden uppercase">
      <div className="px-4 py-2 bg-slate-900 border-b border-slate-700 flex justify-between items-center text-white">
        <span className="text-[10px] font-black italic tracking-[0.2em]">{title}</span>
      </div>
      <div className={`overflow-auto ${hasScroll ? 'max-h-[500px]' : ''}`}>
        <table className="w-full text-[10px] border-collapse whitespace-nowrap">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-200 text-slate-700 font-black italic text-[9px]">
              <th className="p-3 text-left sticky left-0 bg-slate-200 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.1)]">NOMBRE</th>
              <th colSpan="3" className="border-l-2 border-slate-300 text-center bg-blue-100/50">LEADS MES</th>
              <th colSpan="3" className="border-l-2 border-slate-300 text-center bg-indigo-100/50">LEADS HOY</th>
              <th colSpan="2" className="border-l-2 border-slate-300 text-center bg-slate-50">CRM</th>
              <th colSpan="2" className="border-l-2 border-slate-300 text-center bg-emerald-100/50">VENTAS</th>
              <th colSpan="3" className="border-l-2 border-slate-300 text-center bg-amber-50">EFECTIVIDAD</th>
            </tr>
            <tr className="bg-white border-b border-slate-300 text-[8px] font-black text-slate-500">
              <th className="p-2 border-r border-slate-200 sticky left-0 bg-white">ENTIDAD</th>
              <th className="p-2 border-r border-slate-100 w-12 text-slate-400">OBJ</th>
              <th className="p-2 border-r border-slate-100 w-12">REAL</th>
              <th className="p-2 border-l-2 border-slate-300 w-12 bg-red-50 text-red-600">FALTA</th>
              <th className="p-2 border-r border-slate-100 w-12 text-slate-400">OBJ</th>
              <th className="p-2 border-r border-slate-100 w-12 text-indigo-600">REAL</th>
              <th className="p-2 border-l-2 border-slate-300 w-12 bg-red-50 text-red-600">FALTA</th>
              <th className="p-2 border-r border-slate-100 w-12">ACUM</th>
              <th className="p-2 border-l-2 border-slate-300 w-12">DIA</th>
              <th className="p-2 border-r border-slate-100 w-12">CRM</th>
              <th className="p-2 border-l-2 border-slate-300 w-12 text-emerald-600 font-black">JOTF</th>
              <th className="p-2 border-r border-slate-100 w-14 italic text-blue-600">EFECT %</th>
              <th className="p-2 border-r border-slate-100 w-14 italic text-rose-600">DESC %</th>
              <th className="p-2 w-14 italic text-amber-600">TJC %</th>
            </tr>
          </thead>
          <tbody className="font-mono divide-y divide-slate-100">
            {safeData.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                <td className="p-3 font-black text-slate-800 sticky left-0 bg-white border-r border-slate-200 z-10">{row.nombre_grupo}</td>
                <td className="p-3 text-center text-slate-400">2000</td>
                <td className="p-3 text-center font-black">{row.real_mes_leads}</td>
                <td className="p-3 text-center bg-red-50/50 font-black text-red-600 italic">{(2000 - Number(row.real_mes_leads)).toLocaleString()}</td>
                <td className="p-3 text-center text-slate-400">70</td>
                <td className="p-3 text-center font-black text-indigo-700">{row.real_dia_leads}</td>
                <td className="p-3 text-center bg-red-50/50 font-black text-red-600 italic">{Math.max(0, 70 - Number(row.real_dia_leads))}</td>
                <td className="p-3 text-center font-bold text-slate-600">{row.crm_acumulado}</td>
                <td className="p-3 text-center font-black text-slate-900">{row.crm_dia}</td>
                <td className="p-3 text-center font-bold text-slate-600">{row.v_subida_crm_hoy}</td>
                <td className="p-3 text-center font-black text-emerald-700 bg-emerald-50/30">{row.v_subida_jot_hoy}</td>
                <td className={`p-3 text-center font-black ${Number(row.real_efectividad) < 80 ? 'text-red-500' : 'text-emerald-600'}`}>{row.real_efectividad}%</td>
                <td className={`p-3 text-center font-black ${Number(row.real_descarte) > 20 ? 'text-red-500' : 'text-slate-600'}`}>{row.real_descarte}%</td>
                <td className="p-3 text-center font-black text-amber-600">{row.real_tarjeta}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DataVisor({ title, data, onDownload, color }) {
  if (!data || !data.length) return null;
  return (
    <div className="bg-white border border-slate-300 shadow-lg rounded-2xl overflow-hidden mb-4">
      <div className={`${color} text-white px-6 py-3 flex justify-between items-center`}>
        <div className="flex flex-col">
          <h3 className="text-[10px] font-black tracking-[0.2em]">{title}</h3>
          <span className="text-[8px] font-bold opacity-60 italic">MOSTRANDO ÚLTIMOS {Math.min(data.length, 30)} DE {data.length} REGISTROS</span>
        </div>
        <button 
          onClick={onDownload} 
          className="text-[9px] bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded-full font-black backdrop-blur-sm transition-all border border-white/10 flex items-center gap-2"
        >
          ⬇️ DESCARGAR EXCEL
        </button>
      </div>
      <div className="max-h-56 overflow-auto text-[9px] font-bold text-slate-600 font-mono">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-100 sticky top-0 border-b border-slate-300 z-10 shadow-sm">
            <tr>
              {Object.keys(data[0]).map(h => (
                <th key={h} className="px-4 py-2 border-r border-slate-200 text-[8px] text-slate-400 font-black">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.slice(0, 30).map((row, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                {Object.values(row).map((v, j) => (
                  <td key={j} className="px-4 py-2 border-r border-slate-50 truncate max-w-[150px]">{v ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}