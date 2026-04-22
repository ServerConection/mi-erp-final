import { useEffect, useState, useMemo, useCallback } from "react";
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, FunnelChart, Funnel, Cell, ReferenceLine, LabelList, Legend
} from 'recharts';

const formatFechaCorta = (fechaStr) => {
  if (!fechaStr || typeof fechaStr !== 'string') return fechaStr;
  const partes = fechaStr.split('T')[0].split('-');
  return `${partes[2]}`; 
};

const getFechaHoyEcuador = () => {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
};

const calcularDiasFiltro = (fechaDesde, fechaHasta) => {
  if (!fechaDesde || !fechaHasta) return 30;
  const desde = new Date(fechaDesde + 'T00:00:00');
  const hasta  = new Date(fechaHasta  + 'T00:00:00');
  const diff   = Math.round((hasta - desde) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
};

const diasDelMes = (fechaDesde) => {
  if (!fechaDesde) return 30;
  const d = new Date(fechaDesde + 'T00:00:00');
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};

const metaDinamica = (metaMensual, fechaDesde, fechaHasta) => {
  const dias  = calcularDiasFiltro(fechaDesde, fechaHasta);
  const total = diasDelMes(fechaDesde);
  return Math.floor((metaMensual * dias) / total);
};

// ======================================================
// MODAL FULLSCREEN PARA GRÁFICAS
// ======================================================
function ChartModal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      style={{ animation: 'fadeIn 0.2s ease' }}
      onClick={onClose}
    >
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
      <div
        className="rounded-2xl border border-orange-900/50 shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ backgroundColor: '#0d0d0d', animation: 'slideUp 0.25s ease' }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity:0 } to { transform: translateY(0); opacity:1 } }`}</style>
        <div className="flex justify-between items-center px-6 py-4 border-b border-orange-900/30">
          <span className="text-[11px] font-black text-orange-400 uppercase tracking-widest italic">{title}</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl font-black transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-orange-900/40"
          >✕</button>
        </div>
        <div className="flex-1 p-6 overflow-auto" style={{ minHeight: 400 }}>
          {children}
        </div>
        <div className="px-6 py-3 border-t border-orange-900/20 text-center">
          <span className="text-[9px] text-slate-600 uppercase tracking-widest">PRESIONA ESC O CLICK FUERA PARA CERRAR</span>
        </div>
      </div>
    </div>
  );
}

// ======================================================
// WRAPPER CLICKEABLE PARA GRÁFICAS
// ======================================================
function ExpandableChart({ title, className = "", modalHeight = 500, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={`${className} cursor-zoom-in relative group`} onClick={() => setOpen(true)}>
        {children}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 text-[8px] font-black px-2 py-1 rounded-lg border border-orange-500/30 backdrop-blur-sm pointer-events-none">
          ⛶ EXPANDIR
        </div>
      </div>
      <ChartModal open={open} onClose={() => setOpen(false)} title={title}>
        <div style={{ height: modalHeight }}>
          {children}
        </div>
      </ChartModal>
    </>
  );
}

// ======================================================
// COMPONENTE PRINCIPAL
// ======================================================
export default function ReporteVelsa() {
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
    porcentajeTarjeta: 0,
  });
  
  const [monitoreoData, setMonitoreoData] = useState({ 
    supervisores: [], 
    asesores: [] 
  });

  const [reporte180Data, setReporte180Data] = useState({
    kpis: { ingresos_jot: 0, ventas_activas: 0, pct_descarte: 0, pct_efectividad: 0, pct_tercera_edad: 0 },
    embudoCRM: [],
    embudoJotform: [],
    mapaCalor: [],
  });

  const [filtros, setFiltros] = useState({
    fechaDesde: getFechaHoyEcuador(),
    fechaHasta: getFechaHoyEcuador(),
    asesor: "",
    supervisor: "",
    estadoNetlife: "",
    estadoRegularizacion: "",
    etapaCRM: "",
    etapaJotform: "",
    canal: "",
  });

  const [filtros180, setFiltros180] = useState({
    fechaDesde: getFechaHoyEcuador(),
    fechaHasta: getFechaHoyEcuador(),
    asesor: "",
    supervisor: "",
    estadoNetlife: "",
    estadoRegularizacion: "",
    etapaCRM: "",
    etapaJotform: "",
  });

  // ── Nombres de asesores para el dropdown ─────────────────────────────────
  const nombresAsesores = useMemo(
    () => [...(data.asesores || [])].sort((a, b) => (a.nombre_grupo > b.nombre_grupo ? 1 : -1)),
    [data.asesores]
  );

  // ── ETAPAS_JOTFORM derivado dinámicamente de los datos reales del backend ─
  const ETAPAS_JOTFORM = useMemo(() => {
    return (data.estadosNetlife || []).map(e => e.estado).filter(Boolean);
  }, [data.estadosNetlife]);

  const mostrarAlertas = (supervisores) => {
    const nuevasAlertas = [];
    const supEficienciaBaja = (supervisores || []).filter(s => Number(s.eficiencia) < 5);
    if (supEficienciaBaja.length > 0) {
      nuevasAlertas.push({ id: 1, mensaje: `⚠️ ATENCIÓN: ${supEficienciaBaja.length} SUPERVISOR(ES) CON EFICIENCIA MENOR AL 5%`, color: "bg-red-900 border-red-700", duracion: 5000 });
    }
    const supVentasBajas = (supervisores || []).filter(s => Number(s.ingresos_reales) < 2);
    if (supVentasBajas.length > 0) {
      nuevasAlertas.push({ id: 2, mensaje: `📉 ${supVentasBajas.length} SUPERVISOR(ES) CON MENOS DE 2 VENTAS JOT: ${supVentasBajas.map(s => s.nombre_grupo).join(", ")}`, color: "bg-orange-900 border-orange-700", duracion: 7000 });
    }
    if (nuevasAlertas.length > 0) {
      setAlertas(nuevasAlertas);
      nuevasAlertas.forEach(a => setTimeout(() => setAlertas(prev => prev.filter(x => x.id !== a.id)), a.duracion));
    }
  };

  const fetchDashboard = async (filtrosOverride) => {
    setLoading(true);
    try {
      const filtrosActivos = filtrosOverride || filtros;
      const p = new URLSearchParams(Object.fromEntries(Object.entries(filtrosActivos).filter(([_, v]) => v !== "")));
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores-velsa/dashboard?${p}`);
      const result = await res.json();
      if (result.success) {
        setData({ ...result, porcentajeTarjeta: Number(result.porcentajeTarjeta ?? 0), porcentajeTerceraEdad: Number(result.porcentajeTerceraEdad ?? 0) });
        mostrarAlertas(result.supervisores);
      }
    } catch (e) { console.error("Error Dashboard:", e); } finally { setLoading(false); }
  };

  const fetchMonitoreo = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores-velsa/monitoreo-diario`);
      const result = await res.json();
      if (result.success) setMonitoreoData(result);
    } catch (e) { console.error("Error Monitoreo:", e); } finally { setLoading(false); }
  };

  const fetchReporte180 = async (filtrosOverride) => {
    setLoading(true);
    try {
      const filtrosActivos = filtrosOverride || filtros180;
      const p = new URLSearchParams(Object.fromEntries(Object.entries(filtrosActivos).filter(([_, v]) => v !== "")));
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores-velsa/reporte180?${p}`);
      const result = await res.json();
      if (result.success) setReporte180Data(result);
    } catch (e) { console.error("Error Reporte180:", e); } finally { setLoading(false); }
  };

  // ── Helper: actualiza filtro y dispara fetch inmediatamente ───────────────
  const updateFiltro = (campo, valor) => {
    const nuevosFiltros = { ...filtros, [campo]: valor };
    setFiltros(nuevosFiltros);
    fetchDashboard(nuevosFiltros);
  };

  const handleClickTarjetaJotform = (estado) => {
    const nuevosFiltros = { ...filtros, etapaJotform: estado };
    setFiltros(nuevosFiltros);
    fetchDashboard(nuevosFiltros);
  };

  useEffect(() => { 
    if (tabActiva === "GENERAL") fetchDashboard();
    else if (tabActiva === "MONITOREO") fetchMonitoreo();
    else if (tabActiva === "REPORTE180") fetchReporte180();
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
    const totalJotform = s.reduce((acc, c) => acc + Number(c.ingresos_reales || 0), 0);
    const totalBacklog = s.reduce((acc, c) => acc + Number(c.backlog || 0), 0);
    const totalActivos = s.reduce((acc, c) => acc + Number(c.real_mes || 0) + Number(c.backlog || 0), 0);
    const totalGestionables = s.reduce((acc, c) => acc + Number(c.gestionables || 0), 0);
    return {
      ingresosCRM: s.reduce((acc, c) => acc + Number(c.ventas_crm || 0), 0),
      gestionables: totalGestionables,
      regularizar: s.reduce((acc, c) => acc + Number(c.por_regularizar || 0), 0),
      ingresosJotform: totalJotform,
      descartePorc: (s.reduce((acc, c) => acc + Number(c.descarte || 0), 0) / n).toFixed(1),
      leadsGestionables: s.reduce((acc, c) => acc + Number(c.leads_totales || 0), 0),
      efectividad: totalGestionables > 0 ? ((totalJotform / totalGestionables) * 100).toFixed(1) : "0.0",
      tasaInstalacion: totalJotform > 0 ? ((totalActivos / totalJotform) * 100).toFixed(1) : "0.0",
      tarjetaCredito: Number(data.porcentajeTarjeta || 0).toFixed(1),
      terceraEdad: Number(data.porcentajeTerceraEdad || 0).toFixed(1),
      efectividadActivasPauta: (s.reduce((acc, c) => acc + Number(c.efectividad_activas_vs_pauta || 0), 0) / n).toFixed(1),
      activas: totalActivos,
      backlog: totalBacklog,
    };
  }, [data]);

  const COLORES_EMBUDO = ['#f97316','#fb923c','#fdba74','#fbbf24','#34d399','#10b981'];

  const CustomBarLabel = ({ x, y, width, value }) => !value ? null : <text x={x + width / 2} y={y + 18} fill="#ffffff" textAnchor="middle" fontSize={10} fontWeight="900">{value}</text>;
  const CustomActivosLabel = ({ x, y, width, value }) => !value ? null : <text x={x + width / 2} y={y - 4} fill="#fb923c" textAnchor="middle" fontSize={9} fontWeight="900">{value}</text>;
  const CustomFaltanteLabel = ({ x, y, width, value }) => !value ? null : <text x={x + width / 2} y={y - 4} fill="#f87171" textAnchor="middle" fontSize={9} fontWeight="900">-{value}</text>;
  const CustomXAxisTickVertical = ({ x, y, payload }) => {
    const nombre = (payload.value || '').length > 14 ? payload.value.substring(0, 14) + '…' : payload.value;
    return <g transform={`translate(${x},${y})`}><text x={0} y={0} dy={4} textAnchor="end" fill="#78716c" fontSize={8} fontWeight={700} transform="rotate(-55)">{nombre}</text></g>;
  };

  const totalBaseEmbudo = (data.graficoEmbudo || []).reduce((acc, item) => acc + Number(item.total || 0), 0) || 1;
  const CustomFunnelLabel = ({ x, y, width, height, index }) => {
    if (height < 22) return null;
    const item = (data.graficoEmbudo || [])[index];
    if (!item) return null;
    const pct = ((Number(item.total) / totalBaseEmbudo) * 100).toFixed(1);
    return <text x={x + width / 2} y={y + height / 2} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="900">{`${item.etapa} = ${item.total} (${pct}%)`}</text>;
  };

  const dataGraficoAsesores = (monitoreoData.asesores || []).map(a => {
    const g = Number(a.real_dia_leads || 0); const j = Number(a.v_subida_jot_hoy || 0);
    return { nombre: a.nombre_grupo, gestionables: g, ingresos: j, efectividad: g > 0 ? parseFloat(((j / g) * 100).toFixed(1)) : 0 };
  });
  const dataGraficoSupervisores = (monitoreoData.supervisores || []).map(s => {
    const g = Number(s.real_dia_leads || 0); const j = Number(s.v_subida_jot_hoy || 0);
    return { nombre: s.nombre_grupo, gestionables: g, ingresos: j, efectividad: g > 0 ? parseFloat(((j / g) * 100).toFixed(1)) : 0 };
  });
  const totalBarrasDia = (data.graficoBarrasDia || []).reduce((acc, d) => acc + Number(d.total || 0), 0);

  const inputCls = "bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none focus:border-orange-500 transition-colors uppercase";
  const selectCls = "bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none appearance-none uppercase";

  const GraficoBarrasDia = () => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={(data.graficoBarrasDia || []).map(d => ({ ...d, faltante: Math.max(0, 65 - Number(d.total)), activos: Number(d.activos || 0) }))}
        margin={{ top: 24, right: 10, left: 0, bottom: 50 }} barCategoryGap="20%" barGap={2}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1c1917" />
        <XAxis dataKey="fecha" axisLine={false} tickLine={false} tickFormatter={formatFechaCorta} interval="preserveStartEnd" tick={{ fill: '#57534e', fontSize: 10 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#57534e', fontSize: 9 }} domain={[0, dataMax => Math.max(dataMax, 70)]} />
        <Tooltip cursor={{ fill: '#1c1917' }} contentStyle={{ backgroundColor: '#0c0a09', border: '1px solid #44403c', borderRadius: '8px', fontSize: '10px' }}
          formatter={(value, name) => { if (name === 'total') return [value, 'REAL']; if (name === 'activos') return [value, 'ACTIVOS']; if (name === 'faltante') return [value, 'FALTANTE']; return [value, name]; }} />
        <ReferenceLine y={65} stroke="#f97316" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: 'META 65', fill: '#f97316', fontSize: 8, fontWeight: 900, position: 'insideTopRight' }} />
        <Bar dataKey="total" stackId="a" fill="#f97316" radius={[0,0,0,0]} barSize={22}><LabelList dataKey="total" content={CustomBarLabel} /></Bar>
        <Bar dataKey="faltante" stackId="a" fill="rgba(239,68,68,0.35)" radius={[4,4,0,0]} barSize={22}><LabelList dataKey="faltante" content={CustomFaltanteLabel} /></Bar>
        <Bar dataKey="activos" fill="#fb923c" radius={[4,4,0,0]} barSize={12}><LabelList dataKey="activos" content={CustomActivosLabel} /></Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const GraficoEmbudo = () => (
    <div className="flex gap-4 h-full">
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <FunnelChart>
            <Funnel data={data.graficoEmbudo || []} dataKey="total" nameKey="etapa" isAnimationActive={false} label={CustomFunnelLabel}>
              {(data.graficoEmbudo || []).map((entry, index) => <Cell key={`cell-${index}`} fill={COLORES_EMBUDO[index % COLORES_EMBUDO.length]} />)}
            </Funnel>
            <Tooltip contentStyle={{ backgroundColor: '#0c0a09', border: 'none', borderRadius: '8px', fontSize: '10px' }} />
          </FunnelChart>
        </ResponsiveContainer>
      </div>
      <div className="w-[180px] overflow-y-auto flex flex-col gap-1.5 py-1 pr-1">
        {(data.graficoEmbudo || []).slice(0, 12).map((entry, index) => {
          const pct = ((Number(entry.total) / totalBaseEmbudo) * 100).toFixed(1);
          return (
            <div key={index} className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORES_EMBUDO[index % COLORES_EMBUDO.length] }} />
              <span className="text-[8px] text-stone-400 truncate leading-tight flex-1 uppercase">{entry.etapa}</span>
              <span className="text-[8px] font-black text-white shrink-0">{entry.total}</span>
              <span className="text-[8px] font-bold text-stone-500 shrink-0">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const GraficoAsesores = () => (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={dataGraficoAsesores} margin={{ top: 20, right: 40, left: 0, bottom: 80 }} barCategoryGap="25%" barGap={3}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1c1917" />
        <XAxis dataKey="nombre" axisLine={false} tickLine={false} tick={<CustomXAxisTickVertical />} interval={0} />
        <YAxis yAxisId="vol" axisLine={false} tickLine={false} tick={{ fill: '#57534e', fontSize: 9 }} />
        <YAxis yAxisId="pct" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#fbbf24', fontSize: 9 }} unit="%" domain={[0, 100]} width={36} />
        <Tooltip cursor={{ fill: '#1c1917' }} contentStyle={{ backgroundColor: '#0c0a09', border: '1px solid #44403c', borderRadius: '8px', fontSize: '10px' }}
          formatter={(v, n) => n === 'gestionables' ? [v, 'GESTIONABLES HOY'] : n === 'ingresos' ? [v, 'INGRESOS JOT HOY'] : n === 'efectividad' ? [`${v}%`, '% EFECT. (JOT/GEST)'] : [v, n]} />
        <Legend wrapperStyle={{ fontSize: 8, paddingTop: 4 }} formatter={v => v === 'efectividad' ? '% Efect. (JOT/Gest)' : v} />
        <Bar yAxisId="vol" dataKey="gestionables" fill="#f97316" radius={[4,4,0,0]} barSize={16} label={{ position: 'top', fill: '#fdba74', fontSize: 9, fontWeight: 900 }} />
        <Bar yAxisId="vol" dataKey="ingresos" fill="#10b981" radius={[4,4,0,0]} barSize={16} label={{ position: 'top', fill: '#6ee7b7', fontSize: 9, fontWeight: 900 }} />
        <Line yAxisId="pct" type="monotone" dataKey="efectividad" stroke="#fbbf24" strokeWidth={2.5}
          dot={{ fill: '#fbbf24', r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }}>
          <LabelList dataKey="efectividad" position="top" style={{ fontSize: 8, fill: '#fbbf24', fontWeight: 800 }} formatter={v => v > 0 ? `${v}%` : ''} />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );

  const GraficoSupervisores = () => (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={dataGraficoSupervisores} margin={{ top: 20, right: 40, left: 0, bottom: 80 }} barCategoryGap="25%" barGap={3}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1c1917" />
        <XAxis dataKey="nombre" axisLine={false} tickLine={false} tick={<CustomXAxisTickVertical />} interval={0} />
        <YAxis yAxisId="vol" axisLine={false} tickLine={false} tick={{ fill: '#57534e', fontSize: 9 }} />
        <YAxis yAxisId="pct" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#fbbf24', fontSize: 9 }} unit="%" domain={[0, 100]} width={36} />
        <Tooltip cursor={{ fill: '#1c1917' }} contentStyle={{ backgroundColor: '#0c0a09', border: '1px solid #44403c', borderRadius: '8px', fontSize: '10px' }}
          formatter={(v, n) => n === 'gestionables' ? [v, 'GESTIONABLES HOY'] : n === 'ingresos' ? [v, 'INGRESOS JOT HOY'] : n === 'efectividad' ? [`${v}%`, '% EFECT. (JOT/GEST)'] : [v, n]} />
        <Legend wrapperStyle={{ fontSize: 8, paddingTop: 4 }} formatter={v => v === 'efectividad' ? '% Efect. (JOT/Gest)' : v} />
        <Bar yAxisId="vol" dataKey="gestionables" fill="#ea580c" radius={[4,4,0,0]} barSize={28} label={{ position: 'top', fill: '#fb923c', fontSize: 9, fontWeight: 900 }} />
        <Bar yAxisId="vol" dataKey="ingresos" fill="#10b981" radius={[4,4,0,0]} barSize={28} label={{ position: 'top', fill: '#6ee7b7', fontSize: 9, fontWeight: 900 }} />
        <Line yAxisId="pct" type="monotone" dataKey="efectividad" stroke="#fbbf24" strokeWidth={2.5}
          dot={{ fill: '#fbbf24', r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }}>
          <LabelList dataKey="efectividad" position="top" style={{ fontSize: 8, fill: '#fbbf24', fontWeight: 800 }} formatter={v => v > 0 ? `${v}%` : ''} />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );

  return (
    <div className="min-h-screen bg-stone-100 p-6 font-['Inter',_sans-serif] text-stone-900">

      {/* Alertas flotantes */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2">
        {alertas.map(alerta => (
          <div key={alerta.id} className={`${alerta.color} text-white px-6 py-4 rounded-2xl shadow-2xl text-[11px] font-black tracking-wider border max-w-sm uppercase`}>{alerta.mensaje}</div>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <h1 className="text-2xl font-black text-stone-800 tracking-tight flex items-center gap-2 uppercase">
          <span className="bg-orange-600 text-white px-2 py-1 rounded italic text-xl">VLS</span>
          SISTEMA DE INDICADORES
        </h1>
        <div className="flex gap-2 bg-stone-200 p-1 rounded-xl border border-stone-300 w-full sm:w-auto">
          <button onClick={() => setTabActiva("GENERAL")} className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[10px] font-black rounded-lg transition-all uppercase ${tabActiva === "GENERAL" ? "bg-stone-900 text-white shadow-lg" : "text-stone-500 hover:bg-stone-300"}`}>
            📊 REPORTE GENERAL D-1
          </button>
          <button onClick={() => setTabActiva("MONITOREO")} className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[10px] font-black rounded-lg transition-all uppercase ${tabActiva === "MONITOREO" ? "bg-orange-600 text-white shadow-lg" : "text-stone-500 hover:bg-stone-300"}`}>
            ⏱️ MONITOREO LEADS
          </button>
          <button onClick={() => setTabActiva("REPORTE180")} className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[10px] font-black rounded-lg transition-all uppercase ${tabActiva === "REPORTE180" ? "bg-amber-600 text-white shadow-lg" : "text-stone-500 hover:bg-stone-300"}`}>
            🔭 REPORTE 180°
          </button>
        </div>
      </div>

      {tabActiva === "GENERAL" ? (
        <div className="animate-in fade-in duration-500">

          {/* Panel de filtros */}
          <div className="bg-stone-950 rounded-2xl shadow-2xl mb-8 overflow-hidden border border-stone-800">
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-9 gap-4 items-end">
              {/* Período — solo actualiza al cambiar fecha (no hace fetch por tecla) */}
              <div className="lg:col-span-2 flex flex-col gap-2">
                <label className="text-[9px] font-black text-orange-400 italic tracking-widest uppercase">PERÍODO DE CONSULTA</label>
                <div className="flex bg-stone-900 border border-stone-700 rounded-2xl p-1.5 shadow-inner">
                  <input type="date" className="bg-transparent text-white text-center text-[11px] font-bold outline-none w-full [color-scheme:dark]"
                    value={filtros.fechaDesde}
                    onChange={e => updateFiltro('fechaDesde', e.target.value)} />
                  <div className="text-stone-600 px-2 font-black self-center">-</div>
                  <input type="date" className="bg-transparent text-white text-center text-[11px] font-bold outline-none w-full [color-scheme:dark]"
                    value={filtros.fechaHasta}
                    onChange={e => updateFiltro('fechaHasta', e.target.value)} />
                </div>
              </div>

              {/* ASESOR — dropdown con nombres reales del backend */}
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-stone-500 italic uppercase">ASESOR</label>
                <select className={selectCls} value={filtros.asesor}
                  onChange={e => updateFiltro('asesor', e.target.value)}>
                  <option value="">TODOS</option>
                  {nombresAsesores.map((a) => (
                    <option key={a.nombre_grupo} value={a.nombre_grupo}>{a.nombre_grupo}</option>
                  ))}
                </select>
              </div>

              {/* SUPERVISOR */}
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-stone-500 italic uppercase">SUPERVISOR</label>
                <input type="text" placeholder="BUSCAR..." className={inputCls}
                  value={filtros.supervisor}
                  onChange={e => updateFiltro('supervisor', e.target.value)} />
              </div>

              {/* ETAPA CRM */}
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-stone-500 italic uppercase">ETAPA CRM</label>
                <select className={selectCls} value={filtros.etapaCRM}
                  onChange={e => updateFiltro('etapaCRM', e.target.value)}>
                  <option value="">TODAS</option>
                  {(data.etapasCRM || []).map((etapa, i) => <option key={i} value={etapa}>{etapa}</option>)}
                </select>
              </div>

              {/* NETLIFE */}
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-stone-500 italic uppercase">NETLIFE</label>
                <select className={selectCls} value={filtros.estadoNetlife}
                  onChange={e => updateFiltro('estadoNetlife', e.target.value)}>
                  <option value="">TODOS</option>
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="RECHAZADO">RECHAZADO</option>
                </select>
              </div>

              {/* ETAPA JOTFORM — dinámico */}
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-stone-500 italic uppercase">ETAPA JOTFORM</label>
                <select className={selectCls} value={filtros.etapaJotform}
                  onChange={e => updateFiltro('etapaJotform', e.target.value)}>
                  <option value="">TODAS</option>
                  {ETAPAS_JOTFORM.map((etapa, i) => <option key={i} value={etapa}>{etapa}</option>)}
                </select>
              </div>

              {/* REGULARIZACIÓN */}
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-stone-500 italic uppercase">REGULARIZACIÓN</label>
                <select className={selectCls} value={filtros.estadoRegularizacion}
                  onChange={e => updateFiltro('estadoRegularizacion', e.target.value)}>
                  <option value="">TODOS</option>
                  <option value="POR REGULARIZAR">POR REGULARIZAR</option>
                  <option value="REGULARIZADO">REGULARIZADO</option>
                </select>
              </div>

              {/* CAMPAÑA / ORIGEN */}
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-orange-400 italic uppercase">📡 CAMPAÑA/ORIGEN</label>
                <select className={selectCls} value={filtros.canal}
                  onChange={e => updateFiltro('canal', e.target.value)}>
                  <option value="">TODAS LAS CAMPAÑAS</option>
                  {(data.canales || []).map((c, i) => (
                    <option key={i} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <button onClick={() => fetchDashboard()} className="bg-orange-600 hover:bg-orange-500 text-white h-[42px] rounded-xl text-[10px] font-black shadow-lg shadow-orange-900/20 transition-all active:scale-95 uppercase">
                {loading ? "CARGANDO..." : "APLICAR FILTROS"}
              </button>
            </div>
          </div>

          {/* KPIs Mini */}
          <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-3 mb-6">
            <KpiMini label="Leads Totales"   meta={metaDinamica(7050,  filtros.fechaDesde, filtros.fechaHasta)} real={stats.leadsGestionables}          color="border-l-orange-500" />
            <KpiMini label="Gestionables"    meta={metaDinamica(4230,  filtros.fechaDesde, filtros.fechaHasta)} real={stats.gestionables}               color="border-l-amber-500" />
            <KpiMini label="Ingresos CRM"    meta={metaDinamica(1200,  filtros.fechaDesde, filtros.fechaHasta)} real={stats.ingresosCRM}                color="border-l-orange-600" />
            <KpiMini label="Ingresos JOT"    meta={metaDinamica(1050,  filtros.fechaDesde, filtros.fechaHasta)} real={stats.ingresosJotform}            color="border-l-amber-600" />
            <KpiMini label="Efectividad"     meta="90%"  real={`${stats.efectividad}%`}             color="border-l-orange-400" />
            <KpiMini label="Tasa Inst."      meta="80%"  real={`${stats.tasaInstalacion}%`}         color="border-l-yellow-500" />
            <KpiMini label="Tarjeta %"       meta="30%"  real={`${stats.tarjetaCredito}%`}          color="border-l-amber-400" />
            <KpiMini label="Descarte %"      meta="25%"  real={`${stats.descartePorc}%`}            color="border-l-red-500" />
            <KpiMini label="Efic. Pauta"     meta="20%"  real={`${stats.efectividadActivasPauta}%`} color="border-l-orange-700" />
            <KpiMini label="3ra Edad %"      meta="15%"  real={`${stats.terceraEdad}%`}             color="border-l-rose-500" />
            <KpiMini label="Activas Mes"     meta={metaDinamica(1000,  filtros.fechaDesde, filtros.fechaHasta)} real={stats.activas - stats.backlog}    color="border-l-orange-500" />
            <KpiMini label="Activas Backlog" meta={metaDinamica(200,   filtros.fechaDesde, filtros.fechaHasta)} real={stats.backlog}                    color="border-l-amber-500" />
            <KpiMini label="Activas Total"   meta={metaDinamica(1000,  filtros.fechaDesde, filtros.fechaHasta)} real={stats.activas}                    color="border-l-yellow-600" />
            <KpiMini label="Por Regularizar" value={stats.regularizar}                                          color="border-l-rose-500" />
          </div>

          {/* Tarjetas Etapas Jotform */}
          <div className="bg-white border border-stone-200 shadow-sm p-6 mb-6 rounded-2xl">
            <h3 className="text-[10px] font-black text-stone-400 uppercase mb-5 tracking-widest flex items-center gap-2 italic">
              <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
              Etapas Jotform
              {filtros.etapaJotform && (
                <span className="ml-2 bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-[8px] font-black uppercase">
                  FILTRO ACTIVO: {filtros.etapaJotform}
                  <button onClick={() => updateFiltro('etapaJotform', '')} className="ml-1 text-orange-400 hover:text-red-500">✕</button>
                </span>
              )}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {(data.estadosNetlife || []).map((e, i) => (
                <div
                  key={i}
                  onClick={() => handleClickTarjetaJotform(e.estado)}
                  className={`px-3 py-3 rounded-xl flex justify-between items-center shadow-sm cursor-pointer transition-all border hover:scale-105 active:scale-95 ${filtros.etapaJotform === e.estado ? 'bg-orange-50 border-orange-400 shadow-orange-100' : 'bg-white border-stone-100 hover:border-orange-300'}`}
                >
                  <span className="text-[10px] font-bold text-stone-600 uppercase leading-tight pr-2">{e.estado}</span>
                  <span className={`text-sm font-black px-2 py-1 rounded-lg shrink-0 ${filtros.etapaJotform === e.estado ? 'text-white bg-orange-500' : 'text-orange-600 bg-orange-50'}`}>{e.total}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Gráficas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <ExpandableChart title={`PRODUCCIÓN POR DÍA (CERRADOS) — TOTAL: ${totalBarrasDia}`} className="bg-stone-950 p-6 rounded-2xl border border-stone-800 shadow-2xl" modalHeight={500}>
              <h3 className="text-[10px] font-black text-orange-400 mb-8 italic tracking-widest flex items-center gap-2 flex-wrap uppercase">
                <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse shrink-0"></span>
                PRODUCCIÓN POR DÍA (CERRADOS)
                <span className="ml-2 bg-orange-900/60 text-orange-300 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBarrasDia}</span>
                <span className="ml-auto flex items-center gap-2 text-[9px] text-stone-400 font-bold not-italic">
                  <span className="w-3 h-2 bg-orange-500 rounded inline-block"></span> REAL
                  <span className="w-3 h-2 bg-amber-400 rounded inline-block"></span> ACTIVOS
                  <span className="w-3 h-2 bg-red-500/50 rounded inline-block"></span> FALTA
                  <span className="w-4 border-t-2 border-dashed border-orange-400 inline-block"></span> META 65
                </span>
              </h3>
              <div className="h-[300px]"><GraficoBarrasDia /></div>
            </ExpandableChart>

            <ExpandableChart title={`EMBUDO DE CONVERSIÓN — TOTAL: ${totalBaseEmbudo}`} className="bg-stone-950 p-6 rounded-2xl border border-stone-800 shadow-2xl" modalHeight={500}>
              <h3 className="text-[10px] font-black text-orange-400 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
                <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
                EMBUDO DE CONVERSIÓN
                <span className="ml-2 bg-orange-900/60 text-orange-300 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBaseEmbudo}</span>
              </h3>
              <div className="h-[300px]"><GraficoEmbudo /></div>
            </ExpandableChart>
          </div>

          {/* Tablas */}
          <div className="mb-8"><HorizontalTable title="KPI POR SUPERVISOR" data={data.supervisores} /></div>
          <div className="mb-8"><HorizontalTable title="KPI POR ASESOR" data={data.asesores} hasScroll={true} /></div>
          <div className="grid grid-cols-1 gap-4">
            <DataVisor title="DETALLE BASE CRM" data={data.dataCRM} onDownload={() => descargarExcel("CRM")} color="bg-stone-800" />
            <DataVisor title="DETALLE BASE JOTFORM (NETLIFE)" data={data.dataNetlife} onDownload={() => descargarExcel("JOTFORM")} color="bg-orange-900" />
          </div>
        </div>

      ) : tabActiva === "MONITOREO" ? (
        <div className="animate-in slide-in-from-right-5 duration-500 space-y-6">
          <div className="bg-orange-950 text-white p-5 rounded-2xl flex justify-between items-center shadow-xl border-b-4 border-orange-800">
            <div>
              <h2 className="text-lg font-black italic tracking-tighter flex items-center gap-2 uppercase">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                </span>
                MONITOREO DE GESTIÓN EN VIVO
              </h2>
              <p className="text-[9px] font-bold text-orange-300 tracking-[0.2em] uppercase">DATOS ACUMULADOS DEL MES Y DÍA ACTUAL</p>
            </div>
            <button onClick={fetchMonitoreo} className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-xl text-[10px] font-black backdrop-blur-sm transition-all border border-white/20 uppercase">
              {loading ? "ACTUALIZANDO..." : "FORZAR RECARGA"}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ExpandableChart title="ASESORES — GESTIONABLES VS INGRESOS HOY" className="bg-stone-950 p-5 rounded-2xl border border-stone-800 shadow-2xl" modalHeight={500}>
              <h3 className="text-[10px] font-black text-amber-400 mb-4 italic tracking-widest flex items-center gap-2 flex-wrap uppercase">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shrink-0"></span>
                ASESORES — GESTIONABLES VS INGRESOS HOY
                <span className="ml-auto flex items-center gap-2 text-[9px] not-italic font-bold text-stone-400">
                  <span className="w-3 h-2 bg-orange-500 rounded inline-block"></span> GEST.
                  <span className="w-3 h-2 bg-emerald-500 rounded inline-block"></span> ING.
                </span>
              </h3>
              <div className="h-[320px]"><GraficoAsesores /></div>
            </ExpandableChart>

            <ExpandableChart title="SUPERVISORES — GESTIONABLES VS INGRESOS HOY" className="bg-stone-950 p-5 rounded-2xl border border-stone-800 shadow-2xl" modalHeight={500}>
              <h3 className="text-[10px] font-black text-orange-400 mb-4 italic tracking-widest flex items-center gap-2 flex-wrap uppercase">
                <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse shrink-0"></span>
                SUPERVISORES — GESTIONABLES VS INGRESOS HOY
                <span className="ml-auto flex items-center gap-2 text-[9px] not-italic font-bold text-stone-400">
                  <span className="w-3 h-2 bg-orange-600 rounded inline-block"></span> GEST.
                  <span className="w-3 h-2 bg-emerald-500 rounded inline-block"></span> ING.
                </span>
              </h3>
              <div className="h-[320px]"><GraficoSupervisores /></div>
            </ExpandableChart>
          </div>

          <DailyMonitoringTable title="CONTROL OPERATIVO: SUPERVISORES" data={monitoreoData.supervisores} />
          <DailyMonitoringTable title="CONTROL OPERATIVO: ASESORES" data={monitoreoData.asesores} hasScroll={true} />
        </div>

      ) : (
        <Reporte180
          data={reporte180Data}
          filtros={filtros180}
          setFiltros={setFiltros180}
          onFetch={fetchReporte180}
          loading={loading}
          etapasCRM={data.etapasCRM}
          ETAPAS_JOTFORM={ETAPAS_JOTFORM}
        />
      )}
    </div>
  );
}

// ======================================================
// REPORTE 180°
// ======================================================
function Reporte180({ data, filtros, setFiltros, onFetch, loading, etapasCRM, ETAPAS_JOTFORM }) {
  const { kpis, embudoCRM, embudoJotform, mapaCalor } = data;
  const METAS_BASE = { ingresos_jot: 1100, ventas_activas: 1000, pct_descarte: 23, pct_efectividad: 90, pct_tercera_edad: 15 };
  const METAS = {
    ingresos_jot:     metaDinamica(METAS_BASE.ingresos_jot,     filtros.fechaDesde, filtros.fechaHasta),
    ventas_activas:   metaDinamica(METAS_BASE.ventas_activas,   filtros.fechaDesde, filtros.fechaHasta),
    pct_descarte:     METAS_BASE.pct_descarte,
    pct_efectividad:  METAS_BASE.pct_efectividad,
    pct_tercera_edad: METAS_BASE.pct_tercera_edad,
  };
  const COLORES_EMBUDO_CRM = ['#92400e','#b45309','#d97706','#f59e0b','#fbbf24','#fde68a'];
  const COLORES_EMBUDO_JOT = ['#065f46','#047857','#059669','#10b981','#34d399','#6ee7b7'];

  const fechas   = [...new Set((mapaCalor || []).map(r => r.fecha))].sort();
  const ciudades = [...new Set((mapaCalor || []).map(r => r.ciudad))];
  const mapaIndex = {};
  (mapaCalor || []).forEach(r => { mapaIndex[`${r.ciudad}__${r.fecha}`] = r.total; });
  const maxCalor = Math.max(...(mapaCalor || []).map(r => r.total), 1);
  const heatColor = (val) => { if (!val) return '#1c1917'; const r = val / maxCalor; if (r < 0.25) return '#431407'; if (r < 0.5) return '#9a3412'; if (r < 0.75) return '#ea580c'; return '#f97316'; };

  const totalBaseEmbudoCRM = (embudoCRM || []).reduce((acc, item) => acc + Number(item.total || 0), 0) || 1;
  const totalBaseEmbudoJOT = (embudoJotform || []).reduce((acc, item) => acc + Number(item.total || 0), 0) || 1;

  const CustomFunnelLabelCRM = ({ x, y, width, height, index }) => { if (height < 22) return null; const item = (embudoCRM || [])[index]; if (!item) return null; const pct = ((Number(item.total) / totalBaseEmbudoCRM) * 100).toFixed(1); return <text x={x + width / 2} y={y + height / 2} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="900">{`${item.etapa} = ${item.total} (${pct}%)`}</text>; };
  const CustomFunnelLabelJOT = ({ x, y, width, height, index }) => { if (height < 22) return null; const item = (embudoJotform || [])[index]; if (!item) return null; const pct = ((Number(item.total) / totalBaseEmbudoJOT) * 100).toFixed(1); return <text x={x + width / 2} y={y + height / 2} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="900">{`${item.etapa} = ${item.total} (${pct}%)`}</text>; };

  // ── Helper: actualiza filtro 180 y dispara fetch ──────────────────────────
  const updateFiltro180 = (campo, valor) => {
    const nuevos = { ...filtros, [campo]: valor };
    setFiltros(nuevos);
    onFetch(nuevos);
  };

  const inputCls = "bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none focus:border-amber-500 transition-colors uppercase";
  const selectCls = "bg-stone-950 border border-stone-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none appearance-none uppercase";

  const GraficoEmbudoCRM = () => (
    <div className="flex gap-4 h-full">
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <FunnelChart>
            <Funnel data={embudoCRM || []} dataKey="total" nameKey="etapa" isAnimationActive={false} label={CustomFunnelLabelCRM}>
              {(embudoCRM || []).map((_, index) => <Cell key={`crm-${index}`} fill={COLORES_EMBUDO_CRM[index % COLORES_EMBUDO_CRM.length]} />)}
            </Funnel>
            <Tooltip contentStyle={{ backgroundColor: '#0c0a09', border: 'none', borderRadius: '8px', fontSize: '10px' }} />
          </FunnelChart>
        </ResponsiveContainer>
      </div>
      <div className="w-[180px] overflow-y-auto flex flex-col gap-1.5 py-1 pr-1">
        {(embudoCRM || []).slice(0, 15).map((entry, index) => {
          const pct = ((Number(entry.total) / totalBaseEmbudoCRM) * 100).toFixed(1);
          return <div key={index} className="flex items-center gap-2 min-w-0"><div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORES_EMBUDO_CRM[index % COLORES_EMBUDO_CRM.length] }} /><span className="text-[8px] text-stone-400 truncate leading-tight flex-1 uppercase">{entry.etapa}</span><span className="text-[8px] font-black text-white shrink-0">{entry.total}</span><span className="text-[8px] font-bold text-stone-500 shrink-0">({pct}%)</span></div>;
        })}
      </div>
    </div>
  );

  const GraficoEmbudoJOT = () => (
    <div className="flex gap-4 h-full">
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <FunnelChart>
            <Funnel data={embudoJotform || []} dataKey="total" nameKey="etapa" isAnimationActive={false} label={CustomFunnelLabelJOT}>
              {(embudoJotform || []).map((_, index) => <Cell key={`jot-${index}`} fill={COLORES_EMBUDO_JOT[index % COLORES_EMBUDO_JOT.length]} />)}
            </Funnel>
            <Tooltip contentStyle={{ backgroundColor: '#0c0a09', border: 'none', borderRadius: '8px', fontSize: '10px' }} />
          </FunnelChart>
        </ResponsiveContainer>
      </div>
      <div className="w-[180px] overflow-y-auto flex flex-col gap-1.5 py-1 pr-1">
        {(embudoJotform || []).slice(0, 15).map((entry, index) => {
          const pct = ((Number(entry.total) / totalBaseEmbudoJOT) * 100).toFixed(1);
          return <div key={index} className="flex items-center gap-2 min-w-0"><div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORES_EMBUDO_JOT[index % COLORES_EMBUDO_JOT.length] }} /><span className="text-[8px] text-stone-400 truncate leading-tight flex-1 uppercase">{entry.etapa}</span><span className="text-[8px] font-black text-white shrink-0">{entry.total}</span><span className="text-[8px] font-bold text-stone-500 shrink-0">({pct}%)</span></div>;
        })}
      </div>
    </div>
  );

  return (
    <div className="animate-in slide-in-from-right-5 duration-500 space-y-6">
      <div className="bg-amber-950 text-white p-5 rounded-2xl flex justify-between items-center shadow-xl border-b-4 border-amber-800">
        <div>
          <h2 className="text-lg font-black italic tracking-tighter flex items-center gap-2 uppercase">🔭 REPORTE 180° — VISIÓN ANALÍTICA</h2>
          <p className="text-[9px] font-bold text-amber-300 tracking-[0.2em] uppercase">
            KPIs · EMBUDOS · MAPA DE CALOR
            <span className="ml-3 bg-amber-900/60 px-2 py-0.5 rounded-full text-amber-200 not-italic">
              📅 {calcularDiasFiltro(filtros.fechaDesde, filtros.fechaHasta)} DÍA(S) DE {diasDelMes(filtros.fechaDesde)}
            </span>
          </p>
        </div>
        <button onClick={() => onFetch(filtros)} className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-xl text-[10px] font-black backdrop-blur-sm transition-all border border-white/20 uppercase">{loading ? "CARGANDO..." : "APLICAR"}</button>
      </div>

      <div className="bg-stone-950 rounded-2xl shadow-2xl overflow-hidden border border-stone-800">
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4 items-end">
          <div className="lg:col-span-2 flex flex-col gap-2">
            <label className="text-[9px] font-black text-amber-400 italic tracking-widest uppercase">PERÍODO</label>
            <div className="flex bg-stone-900 border border-stone-700 rounded-2xl p-1.5 shadow-inner">
              <input type="date" className="bg-transparent text-white text-center text-[11px] font-bold outline-none w-full [color-scheme:dark]"
                value={filtros.fechaDesde} onChange={e => updateFiltro180('fechaDesde', e.target.value)} />
              <div className="text-stone-600 px-2 font-black self-center">-</div>
              <input type="date" className="bg-transparent text-white text-center text-[11px] font-bold outline-none w-full [color-scheme:dark]"
                value={filtros.fechaHasta} onChange={e => updateFiltro180('fechaHasta', e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-2"><label className="text-[9px] font-black text-stone-500 italic uppercase">ASESOR</label>
            <input type="text" placeholder="BUSCAR..." className={inputCls}
              value={filtros.asesor} onChange={e => updateFiltro180('asesor', e.target.value)} />
          </div>
          <div className="flex flex-col gap-2"><label className="text-[9px] font-black text-stone-500 italic uppercase">SUPERVISOR</label>
            <input type="text" placeholder="BUSCAR..." className={inputCls}
              value={filtros.supervisor} onChange={e => updateFiltro180('supervisor', e.target.value)} />
          </div>
          <div className="flex flex-col gap-2"><label className="text-[9px] font-black text-stone-500 italic uppercase">ETAPA CRM</label>
            <select className={selectCls} value={filtros.etapaCRM} onChange={e => updateFiltro180('etapaCRM', e.target.value)}>
              <option value="">TODAS</option>
              {(etapasCRM || []).map((etapa, i) => <option key={i} value={etapa}>{etapa}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2"><label className="text-[9px] font-black text-stone-500 italic uppercase">NETLIFE</label>
            <select className={selectCls} value={filtros.estadoNetlife} onChange={e => updateFiltro180('estadoNetlife', e.target.value)}>
              <option value="">TODOS</option><option value="ACTIVO">ACTIVO</option><option value="RECHAZADO">RECHAZADO</option>
            </select>
          </div>
          <div className="flex flex-col gap-2"><label className="text-[9px] font-black text-stone-500 italic uppercase">ETAPA JOT</label>
            <select className={selectCls} value={filtros.etapaJotform} onChange={e => updateFiltro180('etapaJotform', e.target.value)}>
              <option value="">TODAS</option>
              {(ETAPAS_JOTFORM || []).map((etapa, i) => <option key={i} value={etapa}>{etapa}</option>)}
            </select>
          </div>
          <button onClick={() => onFetch(filtros)} className="bg-amber-600 hover:bg-amber-500 text-white h-[42px] rounded-xl text-[10px] font-black shadow-lg transition-all active:scale-95 uppercase">APLICAR FILTROS</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard180 label="VENTAS INGRESOS JOT" meta={METAS.ingresos_jot}     real={kpis.ingresos_jot}             tipo="numero"     color="orange" />
        <KpiCard180 label="VENTAS ACTIVAS"       meta={METAS.ventas_activas}   real={kpis.ventas_activas}           tipo="numero"     color="amber" />
        <KpiCard180 label="DESCARTE"             meta={METAS.pct_descarte}     real={Number(kpis.pct_descarte)}     tipo="porcentaje" color="red"   invertido={true} />
        <KpiCard180 label="EFECTIVIDAD"          meta={METAS.pct_efectividad}  real={Number(kpis.pct_efectividad)}  tipo="porcentaje" color="yellow" />
        <KpiCard180 label="TERCERA EDAD"         meta={METAS.pct_tercera_edad} real={Number(kpis.pct_tercera_edad)} tipo="porcentaje" color="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExpandableChart title={`EMBUDO CRM — ETAPAS DE NEGOCIACIÓN — TOTAL: ${totalBaseEmbudoCRM}`} className="bg-stone-950 p-6 rounded-2xl border border-stone-800 shadow-2xl" modalHeight={550}>
          <h3 className="text-[10px] font-black text-amber-400 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
            EMBUDO CRM — ETAPAS DE NEGOCIACIÓN
            <span className="ml-2 bg-amber-900/60 text-amber-300 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBaseEmbudoCRM}</span>
          </h3>
          <div className="h-[340px]"><GraficoEmbudoCRM /></div>
        </ExpandableChart>

        <ExpandableChart title={`EMBUDO JOTFORM — ESTADOS NETLIFE — TOTAL: ${totalBaseEmbudoJOT}`} className="bg-stone-950 p-6 rounded-2xl border border-stone-800 shadow-2xl" modalHeight={550}>
          <h3 className="text-[10px] font-black text-emerald-400 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            EMBUDO JOTFORM — ESTADOS NETLIFE
            <span className="ml-2 bg-emerald-900/60 text-emerald-300 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBaseEmbudoJOT}</span>
          </h3>
          <div className="h-[340px]"><GraficoEmbudoJOT /></div>
        </ExpandableChart>
      </div>

      <div className="bg-stone-950 p-6 rounded-2xl border border-stone-800 shadow-2xl">
        <h3 className="text-[10px] font-black text-orange-400 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
          <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
          MAPA DE CALOR — INGRESOS JOT POR CIUDAD Y FECHA
          <span className="ml-auto flex items-center gap-3 text-[8px] not-italic font-bold text-stone-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{backgroundColor:'#431407'}}></span> BAJO</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{backgroundColor:'#9a3412'}}></span> MEDIO</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{backgroundColor:'#f97316'}}></span> ALTO</span>
          </span>
        </h3>
        {fechas.length === 0 ? (
          <div className="text-center text-stone-500 text-[10px] py-12 uppercase">SIN DATOS PARA EL PERÍODO SELECCIONADO</div>
        ) : (
          <div className="overflow-auto max-h-[500px]">
            <table className="text-[8px] font-mono border-collapse w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-stone-800 text-stone-400 p-2 text-left font-black sticky left-0 z-20 border-r border-stone-700 min-w-[120px] uppercase">CIUDAD</th>
                  {fechas.map(f => <th key={f} className="bg-stone-800 text-stone-400 p-1 font-black min-w-[36px] text-center border-l border-stone-700">{f ? f.split('-').slice(1).join('/') : f}</th>)}
                </tr>
              </thead>
              <tbody>
                {ciudades.map((ciudad, ci) => (
                  <tr key={ci} className="hover:bg-stone-800/50 transition-colors">
                    <td className="sticky left-0 bg-stone-950 border-r border-stone-700 p-2 font-black text-stone-300 uppercase truncate max-w-[120px]">{ciudad}</td>
                    {fechas.map(f => { const val = mapaIndex[`${ciudad}__${f}`] || 0; return <td key={f} className="p-0.5 text-center border-l border-stone-800"><div className="rounded flex items-center justify-center font-black transition-all hover:scale-110 cursor-default" style={{ backgroundColor: heatColor(val), width: 32, height: 24, margin: '0 auto', color: val ? '#fff' : 'transparent', fontSize: 8 }} title={`${ciudad} | ${f} | ${val}`}>{val || ''}</div></td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ======================================================
// KPI CARD 180°
// ======================================================
function KpiCard180({ label, meta, real, tipo, color, invertido }) {
  const pct    = meta > 0 ? Math.min((real / meta) * 100, 100) : 0;
  const cumple = invertido ? real <= meta : real >= meta;
  const colores = {
    orange: { accent: '#ea580c', accentBg: '#fff7ed', accentText: '#c2410c', bar: '#f97316', icon: '📥' },
    amber:  { accent: '#d97706', accentBg: '#fffbeb', accentText: '#b45309', bar: '#f59e0b', icon: '✅' },
    red:    { accent: '#dc2626', accentBg: '#fef2f2', accentText: '#b91c1c', bar: '#ef4444', icon: '⚠️' },
    yellow: { accent: '#ca8a04', accentBg: '#fefce8', accentText: '#a16207', bar: '#eab308', icon: '🎯' },
    rose:   { accent: '#e11d48', accentBg: '#fff1f2', accentText: '#be123c', bar: '#f43f5e', icon: '👴' },
  };
  const c        = colores[color] || colores.orange;
  const barColor = cumple ? c.bar : '#94a3b8';
  const pctLabel = cumple ? `✓ ${pct.toFixed(1)}%` : `✗ ${pct.toFixed(1)}%`;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden flex flex-col" style={{ borderTop: `3px solid ${c.accent}` }}>
      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        <span className="text-[10px] font-black tracking-widest uppercase flex-1 leading-tight" style={{ color: c.accentText }}>{label}</span>
        <span className="text-[18px] w-8 h-8 flex items-center justify-center rounded-lg shrink-0" style={{ backgroundColor: c.accentBg }}>{c.icon}</span>
      </div>
      <div className="px-4 pb-3 flex justify-between items-end gap-2">
        <div>
          <p className="text-[8px] font-bold text-stone-400 mb-0.5 uppercase">REAL</p>
          <p className="text-3xl font-black text-stone-900 leading-none">{tipo === 'porcentaje' ? `${real}%` : real.toLocaleString()}</p>
        </div>
        <div className="text-right">
          <p className="text-[8px] font-bold text-stone-400 mb-0.5 uppercase">META</p>
          <p className="text-base font-black text-stone-400">{tipo === 'porcentaje' ? `${meta}%` : meta.toLocaleString()}</p>
        </div>
      </div>
      <div className="px-4 pb-2">
        <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
          <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: barColor }} />
        </div>
      </div>
      <div className="px-4 py-2 flex justify-between items-center mt-auto" style={{ backgroundColor: c.accentBg }}>
        <span className="text-[8px] font-black text-stone-500 uppercase tracking-wider">AVANCE</span>
        <span className="text-[9px] font-black" style={{ color: cumple ? c.accent : '#94a3b8' }}>{pctLabel} DE META</span>
      </div>
    </div>
  );
}

// ======================================================
// KPI MINI
// ======================================================
const KpiMini = ({ label, value, meta, real, color }) => {
  const metaNum = meta !== undefined ? parseFloat(String(meta).replace('%', '')) : null;
  const realNum = real !== undefined ? parseFloat(String(real).replace('%', '')) : null;
  const pct     = metaNum > 0 && realNum !== null ? Math.min((realNum / metaNum) * 100, 100) : 0;
  const cumple  = metaNum !== null && realNum !== null && pct >= 97;
  const realColor = cumple ? '#059669' : '#f59e0b';
  const barColor  = cumple ? '#10b981' : '#fbbf24';
  return (
    <div className={`bg-white p-3 rounded-xl border-l-4 ${color} shadow-sm flex flex-col justify-between min-h-[80px]`}>
      <span className="text-[9px] font-black text-stone-400 tracking-wider leading-tight uppercase">{label}</span>
      {meta !== undefined ? (
        <>
          <div className="mt-2 grid grid-cols-2 border-t border-stone-100 pt-2 gap-2">
            <div className="flex flex-col">
              <span className="text-[8px] font-bold text-stone-400 uppercase">META</span>
              <span className="text-[12px] font-black text-stone-500">{meta}</span>
            </div>
            <div className="flex flex-col border-l border-stone-100 pl-2">
              <span className="text-[8px] font-bold text-stone-400 uppercase">REAL</span>
              <span className="text-[12px] font-black" style={{ color: realColor }}>{real}</span>
            </div>
          </div>
          <div className="mt-1.5 w-full bg-stone-100 rounded-full h-1 overflow-hidden">
            <div className="h-1 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor }} />
          </div>
        </>
      ) : (
        <span className="text-xl font-black text-stone-800 mt-1">{value}</span>
      )}
    </div>
  );
};

// ======================================================
// HORIZONTAL TABLE
// ======================================================
function HorizontalTable({ title, data, hasScroll }) {
  const safeData = data || [];
  const n = safeData.length || 1;

  const descargarExcel = () => {
    if (!safeData.length) return;
    const ws = XLSX.utils.json_to_sheet(safeData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const totals = {
    real_mes: safeData.reduce((a, r) => a + Number(r.real_mes || 0), 0),
    backlog: safeData.reduce((a, r) => a + Number(r.backlog || 0), 0),
    total_activas_calculada: safeData.reduce((a, r) => a + Number(r.total_activas_calculada || 0), 0),
    gestionables: safeData.reduce((a, r) => a + Number(r.gestionables || 0), 0),
    ventas_crm: safeData.reduce((a, r) => a + Number(r.ventas_crm || 0), 0),
    ingresos_reales: safeData.reduce((a, r) => a + Number(r.ingresos_reales || 0), 0),
    regularizacion: safeData.reduce((a, r) => a + Number(r.regularizacion || 0), 0),
    efectividad_real: (safeData.reduce((a, r) => a + Number(r.efectividad_real || 0), 0) / n).toFixed(1),
    descarte: (safeData.reduce((a, r) => a + Number(r.descarte || 0), 0) / n).toFixed(1),
    tasa_instalacion: (safeData.reduce((a, r) => a + Number(r.tasa_instalacion || 0), 0) / n).toFixed(1),
    eficiencia: (safeData.reduce((a, r) => a + Number(r.eficiencia || 0), 0) / n).toFixed(1),
  };
  const totalTarjetaCredito = safeData.reduce((a, r) => a + Number(r.tarjeta_credito || 0), 0);
  const totalTerceraEdad    = safeData.reduce((a, r) => a + Number(r.tercera_edad || 0), 0);
  const tarjetaPct     = totals.ingresos_reales > 0 ? ((totalTarjetaCredito / totals.ingresos_reales) * 100).toFixed(1) : '0.0';
  const terceraEdadPct = totals.real_mes > 0 ? ((totalTerceraEdad / totals.real_mes) * 100).toFixed(1) : '0.0';

  const tdD  = "text-center px-3 py-2 border-r border-stone-100 w-16 whitespace-nowrap";
  const tdDB = "text-center px-3 py-2 border-r border-stone-400 w-16 whitespace-nowrap font-black";
  const thD  = "px-3 py-2 border-r border-stone-100 w-16 text-center whitespace-nowrap";
  const thDB = "px-3 py-2 border-r border-stone-400 w-16 text-center whitespace-nowrap";
  const NW   = 110;

  return (
    <div className="bg-white border border-stone-300 shadow-2xl rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-stone-900 border-b border-stone-700 flex justify-between items-center">
        <h2 className="text-[10px] font-black uppercase italic tracking-[0.2em] text-white flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block"></span>
          {title} <span className="text-stone-400 font-mono normal-case">({safeData.length} registros)</span>
        </h2>
        <button onClick={descargarExcel} className="text-[9px] bg-white/10 hover:bg-white/20 px-4 py-1.5 rounded-full font-black backdrop-blur-sm transition-all border border-white/10 flex items-center gap-2 text-white uppercase">⬇️ EXCEL</button>
      </div>
      <div className={`overflow-auto ${hasScroll ? 'max-h-[380px]' : ''}`}>
        <table className="text-[9px] border-collapse uppercase" style={{ minWidth: '100%', tableLayout: 'auto' }}>
          <thead>
            <tr className="bg-stone-200 border-b border-stone-400 font-black text-[8px]">
              <th className="p-2 border-r border-stone-400 sticky left-0 bg-stone-200 z-10 text-left whitespace-nowrap" style={{ width: NW, minWidth: NW, maxWidth: NW }}>ENTIDAD</th>
              <th colSpan="4" className="border-r border-stone-400 text-center bg-stone-100 py-1">PRES. VENTAS ACTIVAS</th>
              <th className="border-r border-stone-400 text-center px-3">GEST.</th>
              <th colSpan="2" className="border-r border-stone-400 text-center bg-stone-100">VENTAS SUBIDAS</th>
              <th className="border-r border-stone-400 text-center px-3">EFECT. %</th>
              <th className="border-r border-stone-400 text-center px-3">DESC. %</th>
              <th className="border-r border-stone-400 text-center px-3">INST. %</th>
              <th className="border-r border-stone-400 text-center px-3 bg-stone-50">EFIC. %</th>
              <th className="border-r border-stone-400 text-center px-3">TJC. %</th>
              <th className="border-r border-stone-400 text-center px-3">3ED. %</th>
              <th className="text-center px-3">REGU.</th>
            </tr>
            <tr className="bg-white border-b border-stone-400 text-[8px] text-stone-500 font-black">
              <th className="p-2 border-r border-stone-400 sticky left-0 bg-white z-10 text-left" style={{ width: NW, minWidth: NW, maxWidth: NW }}>NOMBRE</th>
              <th className={thD}>REAL</th><th className={thD}>BACK</th>
              <th className="px-3 py-2 border-r border-stone-100 w-16 text-center bg-stone-50 font-bold whitespace-nowrap">TOT</th>
              <th className={thDB}>CREC</th><th className={thDB}>TOT</th><th className={thD}>CRM</th><th className={thDB}>JOTF</th>
              <th className={thDB}>REAL</th><th className={thDB}>REAL</th><th className={thDB}>REAL</th>
              <th className="px-3 py-2 border-r border-stone-400 w-16 text-center bg-stone-50 font-bold whitespace-nowrap">REAL</th>
              <th className={thDB}>REAL</th><th className={thDB}>REAL</th>
              <th className="px-3 py-2 w-16 text-center whitespace-nowrap">REAL</th>
            </tr>
            <tr className="bg-stone-800 text-white text-[8px] font-black border-b-2 border-stone-600">
              <td className="px-2 py-1.5 border-r border-stone-600 sticky left-0 bg-stone-800 z-10 whitespace-nowrap" style={{ width: NW, minWidth: NW, maxWidth: NW }}>▶ TOTAL</td>
              <td className="text-center border-r border-stone-700 px-3 py-1.5">{totals.real_mes}</td>
              <td className="text-center border-r border-stone-700 px-3">{totals.backlog}</td>
              <td className="text-center border-r border-stone-700 px-3 bg-stone-700">{totals.total_activas_calculada}</td>
              <td className="text-center border-r border-stone-600 px-3 text-stone-400">—</td>
              <td className="text-center border-r border-stone-600 px-3">{totals.gestionables}</td>
              <td className="text-center border-r border-stone-700 px-3">{totals.ventas_crm}</td>
              <td className="text-center border-r border-stone-600 px-3">{totals.ingresos_reales}</td>
              <td className="text-center border-r border-stone-600 px-3 text-emerald-300">{totals.efectividad_real}%</td>
              <td className="text-center border-r border-stone-600 px-3 text-rose-300">{totals.descarte}%</td>
              <td className="text-center border-r border-stone-600 px-3 text-cyan-300">{totals.tasa_instalacion}%</td>
              <td className="text-center border-r border-stone-600 px-3 bg-stone-700 text-yellow-300">{totals.eficiencia}%</td>
              <td className="text-center border-r border-stone-600 px-3 text-amber-300">{tarjetaPct}%</td>
              <td className="text-center border-r border-stone-600 px-3 text-pink-300">{terceraEdadPct}%</td>
              <td className="text-center px-3">{totals.regularizacion}</td>
            </tr>
          </thead>
          <tbody className="font-mono leading-none">
            {safeData.map((row, idx) => (
              <tr key={idx} className="border-b border-stone-200 hover:bg-stone-50 transition-colors">
                <td className="px-2 py-2 border-r border-stone-400 sticky left-0 bg-white font-bold text-[8px] truncate uppercase" style={{ width: NW, minWidth: NW, maxWidth: NW }} title={row.nombre_grupo}>{row.nombre_grupo}</td>
                <td className={tdD}>{row.real_mes}</td>
                <td className={tdD}>{row.backlog}</td>
                <td className="text-center px-3 py-2 border-r border-stone-100 w-16 font-bold bg-stone-50 whitespace-nowrap">{row.total_activas_calculada}</td>
                <td className={`${tdDB} text-stone-400`}>{row.crec_vs_ma}</td>
                <td className={tdDB}>{row.gestionables}</td>
                <td className={tdD}>{row.ventas_crm}</td>
                <td className={tdDB}>{row.ingresos_reales}</td>
                <td className={`${tdDB} font-bold`}>{row.efectividad_real}%</td>
                <td className={tdDB}>{row.descarte}%</td>
                <td className={tdDB}>{row.tasa_instalacion}%</td>
                <td className="text-center px-3 py-2 border-r border-stone-400 w-16 font-bold bg-stone-50 whitespace-nowrap">{row.eficiencia}%</td>
                <td className={`${tdDB} text-amber-600`}>{row.ingresos_reales > 0 ? ((Number(row.tarjeta_credito) / Number(row.ingresos_reales)) * 100).toFixed(1) : 0}%</td>
                <td className={`${tdDB} text-pink-600`}>{row.real_mes > 0 ? ((Number(row.tercera_edad) / Number(row.real_mes)) * 100).toFixed(1) : 0}%</td>
                <td className="text-center px-3 py-2 w-16 font-bold whitespace-nowrap">{row.regularizacion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ======================================================
// DAILY MONITORING TABLE
// ======================================================
function DailyMonitoringTable({ title, data, hasScroll }) {
  const safeData = data || [];
  const n = safeData.length || 1;

  const descargarExcel = () => {
    if (!safeData.length) return;
    const ws = XLSX.utils.json_to_sheet(safeData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const totals = {
    real_mes_leads:   safeData.reduce((a, r) => a + Number(r.real_mes_leads || 0), 0),
    real_dia_leads:   safeData.reduce((a, r) => a + Number(r.real_dia_leads || 0), 0),
    crm_acumulado:    safeData.reduce((a, r) => a + Number(r.crm_acumulado || 0), 0),
    crm_dia:          safeData.reduce((a, r) => a + Number(r.crm_dia || 0), 0),
    v_subida_crm_hoy: safeData.reduce((a, r) => a + Number(r.v_subida_crm_hoy || 0), 0),
    v_subida_jot_hoy: safeData.reduce((a, r) => a + Number(r.v_subida_jot_hoy || 0), 0),
    real_efectividad: (safeData.reduce((a, r) => a + Number(r.real_efectividad || 0), 0) / n).toFixed(1),
    real_descarte:    (safeData.reduce((a, r) => a + Number(r.real_descarte || 0), 0) / n).toFixed(1),
    real_tarjeta:     (safeData.reduce((a, r) => a + Number(r.real_tarjeta || 0), 0) / n).toFixed(1),
  };

  return (
    <div className="bg-white border border-stone-300 shadow-2xl rounded-xl overflow-hidden uppercase">
      <div className="px-4 py-2.5 bg-stone-900 border-b border-stone-700 flex justify-between items-center text-white">
        <span className="text-[10px] font-black italic tracking-[0.2em] flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block animate-pulse"></span>
          {title} <span className="text-stone-400 font-mono normal-case">({safeData.length} registros)</span>
        </span>
        <button onClick={descargarExcel} className="text-[9px] bg-white/10 hover:bg-white/20 px-4 py-1.5 rounded-full font-black backdrop-blur-sm transition-all border border-white/10 flex items-center gap-2 uppercase">⬇️ EXCEL</button>
      </div>
      <div className={`overflow-auto ${hasScroll ? 'max-h-[500px]' : ''}`}>
        <table className="w-full text-[10px] border-collapse whitespace-nowrap">
          <thead className="sticky top-0 z-20">
            <tr className="bg-stone-200 text-stone-700 font-black italic text-[9px]">
              <th className="p-3 text-left sticky left-0 bg-stone-200 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.1)]">NOMBRE</th>
              <th colSpan="3" className="border-l-2 border-stone-300 text-center bg-orange-100/50">LEADS MES</th>
              <th colSpan="3" className="border-l-2 border-stone-300 text-center bg-amber-100/50">LEADS HOY</th>
              <th colSpan="2" className="border-l-2 border-stone-300 text-center bg-stone-50">CRM</th>
              <th colSpan="2" className="border-l-2 border-stone-300 text-center bg-emerald-100/50">VENTAS</th>
              <th colSpan="3" className="border-l-2 border-stone-300 text-center bg-yellow-50">EFECTIVIDAD</th>
            </tr>
            <tr className="bg-white border-b border-stone-300 text-[8px] font-black text-stone-500">
              <th className="p-2 border-r border-stone-200 sticky left-0 bg-white">ENTIDAD</th>
              <th className="p-2 border-r border-stone-100 w-12 text-stone-400">OBJ</th>
              <th className="p-2 border-r border-stone-100 w-12">REAL</th>
              <th className="p-2 border-l-2 border-stone-300 w-12 bg-red-50 text-red-600">FALTA</th>
              <th className="p-2 border-r border-stone-100 w-12 text-stone-400">OBJ</th>
              <th className="p-2 border-r border-stone-100 w-12 text-orange-600">REAL</th>
              <th className="p-2 border-l-2 border-stone-300 w-12 bg-red-50 text-red-600">FALTA</th>
              <th className="p-2 border-r border-stone-100 w-12">ACUM</th>
              <th className="p-2 border-l-2 border-stone-300 w-12">DIA</th>
              <th className="p-2 border-r border-stone-100 w-12">CRM</th>
              <th className="p-2 border-l-2 border-stone-300 w-12 text-emerald-600 font-black">JOTF</th>
              <th className="p-2 border-r border-stone-100 w-14 italic text-orange-600">EFECT %</th>
              <th className="p-2 border-r border-stone-100 w-14 italic text-rose-600">DESC %</th>
              <th className="p-2 w-14 italic text-amber-600">TJC %</th>
            </tr>
            <tr className="bg-stone-800 text-white text-[8px] font-black border-b-2 border-stone-600">
              <td className="p-2 border-r border-stone-600 sticky left-0 bg-stone-800 z-10">▶ TOTAL</td>
              <td className="p-2 text-center text-stone-400">—</td>
              <td className="p-2 text-center">{totals.real_mes_leads}</td>
              <td className="p-2 text-center text-red-300">{(2000 * safeData.length - totals.real_mes_leads).toLocaleString()}</td>
              <td className="p-2 text-center text-stone-400">—</td>
              <td className="p-2 text-center text-orange-300">{totals.real_dia_leads}</td>
              <td className="p-2 text-center text-red-300">{Math.max(0, 70 * safeData.length - totals.real_dia_leads)}</td>
              <td className="p-2 text-center">{totals.crm_acumulado}</td>
              <td className="p-2 text-center">{totals.crm_dia}</td>
              <td className="p-2 text-center">{totals.v_subida_crm_hoy}</td>
              <td className="p-2 text-center text-emerald-300">{totals.v_subida_jot_hoy}</td>
              <td className={`p-2 text-center ${Number(totals.real_efectividad) < 80 ? 'text-red-300' : 'text-emerald-300'}`}>{totals.real_efectividad}%</td>
              <td className={`p-2 text-center ${Number(totals.real_descarte) > 20 ? 'text-red-300' : 'text-stone-300'}`}>{totals.real_descarte}%</td>
              <td className="p-2 text-center text-amber-300">{totals.real_tarjeta}%</td>
            </tr>
          </thead>
          <tbody className="font-mono divide-y divide-stone-100">
            {safeData.map((row, idx) => (
              <tr key={idx} className="hover:bg-stone-50 transition-colors">
                <td className="p-3 font-black text-stone-800 sticky left-0 bg-white border-r border-stone-200 z-10 uppercase">{row.nombre_grupo}</td>
                <td className="p-3 text-center text-stone-400">2000</td>
                <td className="p-3 text-center font-black">{row.real_mes_leads}</td>
                <td className="p-3 text-center bg-red-50/50 font-black text-red-600 italic">{(2000 - Number(row.real_mes_leads)).toLocaleString()}</td>
                <td className="p-3 text-center text-stone-400">70</td>
                <td className="p-3 text-center font-black text-orange-700">{row.real_dia_leads}</td>
                <td className="p-3 text-center bg-red-50/50 font-black text-red-600 italic">{Math.max(0, 70 - Number(row.real_dia_leads))}</td>
                <td className="p-3 text-center font-bold text-stone-600">{row.crm_acumulado}</td>
                <td className="p-3 text-center font-black text-stone-900">{row.crm_dia}</td>
                <td className="p-3 text-center font-bold text-stone-600">{row.v_subida_crm_hoy}</td>
                <td className="p-3 text-center font-black text-emerald-700 bg-emerald-50/30">{row.v_subida_jot_hoy}</td>
                <td className={`p-3 text-center font-black ${Number(row.real_efectividad) < 80 ? 'text-red-500' : 'text-emerald-600'}`}>{row.real_efectividad}%</td>
                <td className={`p-3 text-center font-black ${Number(row.real_descarte) > 20 ? 'text-red-500' : 'text-stone-600'}`}>{row.real_descarte}%</td>
                <td className="p-3 text-center font-black text-amber-600">{row.real_tarjeta}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ======================================================
// DATA VISOR
// ======================================================
function DataVisor({ title, data, onDownload, color }) {
  if (!data || !data.length) return null;
  return (
    <div className="bg-white border border-stone-300 shadow-lg rounded-2xl overflow-hidden mb-4">
      <div className={`${color} text-white px-6 py-3 flex justify-between items-center`}>
        <div className="flex flex-col">
          <h3 className="text-[10px] font-black tracking-[0.2em] uppercase">{title}</h3>
          <span className="text-[8px] font-bold opacity-60 italic uppercase">MOSTRANDO ÚLTIMOS {Math.min(data.length, 30)} DE {data.length} REGISTROS</span>
        </div>
        <button onClick={onDownload} className="text-[9px] bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded-full font-black backdrop-blur-sm transition-all border border-white/10 flex items-center gap-2 uppercase">⬇️ DESCARGAR EXCEL</button>
      </div>
      <div className="max-h-56 overflow-auto text-[9px] font-bold text-stone-600 font-mono">
        <table className="w-full text-left border-collapse">
          <thead className="bg-stone-100 sticky top-0 border-b border-stone-300 z-10 shadow-sm">
            <tr>{Object.keys(data[0]).map(h => <th key={h} className="px-4 py-2 border-r border-stone-200 text-[8px] text-stone-400 font-black uppercase">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.slice(0, 30).map((row, i) => (
              <tr key={i} className="hover:bg-stone-50 transition-colors">
                {Object.values(row).map((v, j) => <td key={j} className="px-4 py-2 border-r border-stone-50 truncate max-w-[150px]">{v ?? "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}