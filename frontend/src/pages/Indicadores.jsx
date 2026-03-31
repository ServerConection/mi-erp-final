import { useEffect, useState, useMemo, useCallback } from "react";
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, FunnelChart, Funnel, Cell, ReferenceLine, LabelList
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
// TOOLTIP PERSONALIZADO — rico con % y valor absoluto
// ======================================================
const TooltipBarrasDia = ({ active, payload, label, metaDia = 65 }) => {
  if (!active || !payload?.length) return null;
  const real    = payload.find(p => p.dataKey === 'total')?.value || 0;
  const activos = payload.find(p => p.dataKey === 'activos')?.value || 0;
  const pctMeta = metaDia > 0 ? ((real / metaDia) * 100).toFixed(1) : 0;
  const cumple  = real >= metaDia;
  return (
    <div className="bg-slate-950 border border-slate-700 rounded-xl p-3 shadow-2xl text-[10px] min-w-[160px]">
      <p className="font-black text-white mb-2 uppercase tracking-widest border-b border-slate-700 pb-1">DÍA {label}</p>
      <div className="flex justify-between gap-4 mb-1">
        <span className="text-slate-400">INGRESOS JOT</span>
        <span className="font-black text-emerald-400">{real}</span>
      </div>
      <div className="flex justify-between gap-4 mb-1">
        <span className="text-slate-400">ACTIVOS</span>
        <span className="font-black text-blue-400">{activos}</span>
      </div>
      <div className="flex justify-between gap-4 mb-2">
        <span className="text-slate-400">META DÍA</span>
        <span className="font-black text-yellow-400">{metaDia}</span>
      </div>
      <div className={`flex justify-between gap-4 pt-1 border-t border-slate-700`}>
        <span className="text-slate-400">% CUMPLIMIENTO</span>
        <span className={`font-black ${cumple ? 'text-emerald-400' : 'text-red-400'}`}>
          {cumple ? '✓' : '✗'} {pctMeta}%
        </span>
      </div>
    </div>
  );
};

const TooltipAsesores = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const gest = payload.find(p => p.dataKey === 'gestionables')?.value || 0;
  const ing  = payload.find(p => p.dataKey === 'ingresos')?.value || 0;
  const efect = gest > 0 ? ((ing / gest) * 100).toFixed(1) : 0;
  return (
    <div className="bg-slate-950 border border-slate-700 rounded-xl p-3 shadow-2xl text-[10px] min-w-[170px]">
      <p className="font-black text-white mb-2 uppercase tracking-widest border-b border-slate-700 pb-1 truncate">{label}</p>
      <div className="flex justify-between gap-4 mb-1">
        <span className="text-slate-400">GESTIONABLES</span>
        <span className="font-black text-violet-400">{gest}</span>
      </div>
      <div className="flex justify-between gap-4 mb-2">
        <span className="text-slate-400">INGRESOS HOY</span>
        <span className="font-black text-emerald-400">{ing}</span>
      </div>
      <div className="flex justify-between gap-4 pt-1 border-t border-slate-700">
        <span className="text-slate-400">EFECTIVIDAD</span>
        <span className={`font-black ${Number(efect) >= 30 ? 'text-emerald-400' : 'text-amber-400'}`}>{efect}%</span>
      </div>
    </div>
  );
};

const TooltipEmbudo = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-slate-950 border border-slate-700 rounded-xl p-3 shadow-2xl text-[10px] min-w-[150px]">
      <p className="font-black text-white mb-2 uppercase tracking-widest border-b border-slate-700 pb-1">{item.name}</p>
      <div className="flex justify-between gap-4">
        <span className="text-slate-400">TOTAL</span>
        <span className="font-black" style={{ color: item.fill }}>{item.value}</span>
      </div>
    </div>
  );
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-700">
          <span className="text-[11px] font-black text-white uppercase tracking-widest italic">{title}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl font-black transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700">✕</button>
        </div>
        <div className="flex-1 p-6 overflow-auto" style={{ minHeight: 400 }}>
          {children}
        </div>
        <div className="px-6 py-3 border-t border-slate-800 text-center">
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
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 hover:bg-white/20 text-white text-[8px] font-black px-2 py-1 rounded-lg border border-white/20 backdrop-blur-sm pointer-events-none">
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
// BARRA SEMÁFORO — color dinámico según cumplimiento
// ======================================================
const BarraSemaforo = (props) => {
  const { x, y, width, height, total, meta = 65 } = props;
  const cumple = Number(total) >= meta;
  const pct    = meta > 0 ? Math.min(Number(total) / meta, 1) : 0;
  // Verde si cumple, amarillo si >80%, rojo si <80%
  const color  = cumple ? '#10b981' : pct >= 0.8 ? '#f59e0b' : '#ef4444';
  return <rect x={x} y={y} width={width} height={height} fill={color} rx={2} />;
};

export default function ReporteComercialCore() {
  const [tabActiva, setTabActiva]       = useState("GENERAL");
  const [loading, setLoading]           = useState(false);
  const [alertas, setAlertas]           = useState([]);
  const [diaFiltrado, setDiaFiltrado]   = useState(null); // ← NUEVO: click en barra → filtra tabla
  const [data, setData]                 = useState({ supervisores: [], asesores: [], dataCRM: [], dataNetlife: [], estadosNetlife: [], graficoEmbudo: [], graficoBarrasDia: [], etapasCRM: [], porcentajeTerceraEdad: 0, porcentajeTarjeta: 0 });
  const [monitoreoData, setMonitoreoData]     = useState({ supervisores: [], asesores: [] });
  const [reporte180Data, setReporte180Data]   = useState({ kpis: { ingresos_jot: 0, ventas_activas: 0, pct_descarte: 0, pct_efectividad: 0, pct_tercera_edad: 0 }, embudoCRM: [], embudoJotform: [], mapaCalor: [] });
  const [filtros, setFiltros]           = useState({ fechaDesde: getFechaHoyEcuador(), fechaHasta: getFechaHoyEcuador(), asesor: "", supervisor: "", estadoNetlife: "", estadoRegularizacion: "", etapaCRM: "", etapaJotform: "" });
  const [filtros180, setFiltros180]     = useState({ fechaDesde: getFechaHoyEcuador(), fechaHasta: getFechaHoyEcuador(), asesor: "", supervisor: "", estadoNetlife: "", estadoRegularizacion: "", etapaCRM: "", etapaJotform: "" });

  const nombresAsesores = useMemo(
    () => [...(data.asesores || [])].sort((a, b) => (a.nombre_grupo > b.nombre_grupo ? 1 : -1)),
    [data.asesores]
  );

  const mostrarAlertas = (supervisores) => {
    const nuevasAlertas = [];
    const supEficienciaBaja = (supervisores || []).filter(s => Number(s.eficiencia) < 5);
    if (supEficienciaBaja.length > 0) nuevasAlertas.push({ id: 1, mensaje: `⚠️ ATENCIÓN: ${supEficienciaBaja.length} SUPERVISOR(ES) CON EFICIENCIA MENOR AL 5%`, color: "bg-red-600 border-red-400", duracion: 5000 });
    const supVentasBajas = (supervisores || []).filter(s => Number(s.ingresos_reales) < 2);
    if (supVentasBajas.length > 0) nuevasAlertas.push({ id: 2, mensaje: `📉 ${supVentasBajas.length} SUPERVISOR(ES) CON MENOS DE 2 VENTAS JOT: ${supVentasBajas.map(s => s.nombre_grupo).join(", ")}`, color: "bg-amber-600 border-amber-400", duracion: 7000 });
    if (nuevasAlertas.length > 0) { setAlertas(nuevasAlertas); nuevasAlertas.forEach(a => setTimeout(() => setAlertas(prev => prev.filter(x => x.id !== a.id)), a.duracion)); }
  };

  const fetchDashboard = async (filtrosOverride) => {
    setLoading(true);
    try {
      const filtrosActivos = filtrosOverride || filtros;
      const p = new URLSearchParams(Object.fromEntries(Object.entries(filtrosActivos).filter(([_, v]) => v !== "")));
      const res    = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores/dashboard?${p}`);
      const result = await res.json();
      if (result.success) { setData({ ...result, porcentajeTarjeta: Number(result.porcentajeTarjeta ?? 0), porcentajeTerceraEdad: Number(result.porcentajeTerceraEdad ?? 0) }); mostrarAlertas(result.supervisores); }
    } catch (e) { console.error("Error Dashboard:", e); } finally { setLoading(false); }
  };

  const fetchMonitoreo = async () => {
    setLoading(true);
    try { const res = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores/monitoreo-diario`); const result = await res.json(); if (result.success) setMonitoreoData(result); }
    catch (e) { console.error("Error Monitoreo:", e); } finally { setLoading(false); }
  };

  const fetchReporte180 = async (filtrosOverride) => {
    setLoading(true);
    try {
      const filtrosActivos = filtrosOverride || filtros180;
      const p = new URLSearchParams(Object.fromEntries(Object.entries(filtrosActivos).filter(([_, v]) => v !== "")));
      const res    = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores/reporte180?${p}`);
      const result = await res.json();
      if (result.success) setReporte180Data(result);
    } catch (e) { console.error("Error Reporte180:", e); } finally { setLoading(false); }
  };

  const updateFiltro = (campo, valor) => {
    const nuevosFiltros = { ...filtros, [campo]: valor };
    setFiltros(nuevosFiltros);
    fetchDashboard(nuevosFiltros);
  };

  const handleClickTarjetaJotform = (estado) => { const nuevosFiltros = { ...filtros, etapaJotform: estado }; setFiltros(nuevosFiltros); fetchDashboard(nuevosFiltros); };

  // ── NUEVO: click en barra del gráfico → filtrar tabla por ese día ─────────
  const handleClickBarra = (data) => {
    if (!data?.activePayload) return;
    const fecha = data?.activeLabel;
    setDiaFiltrado(prev => prev === fecha ? null : fecha); // toggle
  };

  useEffect(() => {
    if (tabActiva === "GENERAL") fetchDashboard();
    else if (tabActiva === "MONITOREO") fetchMonitoreo();
    else if (tabActiva === "REPORTE180") fetchReporte180();
  }, [tabActiva]);

  const descargarExcel = (tipo) => {
    const list = tipo === "CRM" ? data.dataCRM : data.dataNetlife;
    if (!list || !list.length) return;
    const ws = XLSX.utils.json_to_sheet(list); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, tipo); XLSX.writeFile(wb, `Reporte_${tipo}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const stats = useMemo(() => {
    const s = data.supervisores || []; const n = s.length || 1;
    const totalJotform    = s.reduce((acc, c) => acc + Number(c.ingresos_reales || 0), 0);
    const totalActivos    = s.reduce((acc, c) => acc + Number(c.real_mes || 0) + Number(c.backlog || 0), 0);
    const totalBacklog    = s.reduce((acc, c) => acc + Number(c.backlog || 0), 0);
    const totalGestionables = s.reduce((acc, c) => acc + Number(c.gestionables || 0), 0);
    return {
      ingresosCRM:              s.reduce((acc, c) => acc + Number(c.ventas_crm || 0), 0),
      gestionables:             totalGestionables,
      regularizar:              s.reduce((acc, c) => acc + Number(c.por_regularizar || 0), 0),
      ingresosJotform:          totalJotform,
      descartePorc:             (s.reduce((acc, c) => acc + Number(c.descarte || 0), 0) / n).toFixed(1),
      leadsGestionables:        s.reduce((acc, c) => acc + Number(c.leads_totales || 0), 0),
      efectividad:              totalGestionables > 0 ? ((totalJotform / totalGestionables) * 100).toFixed(1) : "0.0",
      tasaInstalacion:          totalJotform > 0 ? ((totalActivos / totalJotform) * 100).toFixed(1) : "0.0",
      tarjetaCredito:           Number(data.porcentajeTarjeta || 0).toFixed(1),
      terceraEdad:              Number(data.porcentajeTerceraEdad || 0).toFixed(1),
      efectividadActivasPauta:  (s.reduce((acc, c) => acc + Number(c.efectividad_activas_vs_pauta || 0), 0) / n).toFixed(1),
      activas:                  totalActivos,
      backlog:                  totalBacklog,
    };
  }, [data]);

  const META_DIA = 65;
  const ETAPAS_JOTFORM  = ['ACTIVO','ASIGNADO','PREPLANIIFICADO','PLANIIFICADO','RECHAZADO','REPLANIFICADO','DESISTE DEL SERVICIO','PRESERVICIO','FIN DE GESTION','FACTIBLE'];
  const COLORES_EMBUDO  = ['#10b981','#34d399','#6ee7b7','#fbbf24','#f97316','#ef4444'];

  const CustomBarLabel = ({ x, y, width, value }) => !value ? null : <text x={x + width / 2} y={y + 18} fill="#ffffff" textAnchor="middle" fontSize={10} fontWeight="900">{value}</text>;
  const CustomActivosLabel = ({ x, y, width, value }) => !value ? null : <text x={x + width / 2} y={y - 4} fill="#60a5fa" textAnchor="middle" fontSize={9} fontWeight="900">{value}</text>;
  const CustomFaltanteLabel = ({ x, y, width, value }) => !value ? null : <text x={x + width / 2} y={y - 4} fill="#f87171" textAnchor="middle" fontSize={9} fontWeight="900">-{value}</text>;
  const CustomXAxisTickVertical = ({ x, y, payload }) => {
    const nombre = (payload.value || '').length > 14 ? payload.value.substring(0, 14) + '…' : payload.value;
    return <g transform={`translate(${x},${y})`}><text x={0} y={0} dy={4} textAnchor="end" fill="#94a3b8" fontSize={8} fontWeight={700} transform="rotate(-55)">{nombre}</text></g>;
  };

  const totalBaseEmbudo = (data.graficoEmbudo || []).reduce((acc, item) => acc + Number(item.total || 0), 0) || 1;
  const CustomFunnelLabel = ({ x, y, width, height, index }) => {
    if (height < 22) return null;
    const item = (data.graficoEmbudo || [])[index]; if (!item) return null;
    const pct = ((Number(item.total) / totalBaseEmbudo) * 100).toFixed(1);
    return <text x={x + width / 2} y={y + height / 2} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="900">{`${item.etapa} = ${item.total} (${pct}%)`}</text>;
  };

  const dataGraficoAsesores      = (monitoreoData.asesores || []).map(a => ({ nombre: a.nombre_grupo, gestionables: Number(a.real_dia_leads || 0), ingresos: Number(a.v_subida_jot_hoy || 0) }));
  const dataGraficoSupervisores  = (monitoreoData.supervisores || []).map(s => ({ nombre: s.nombre_grupo, gestionables: Number(s.real_dia_leads || 0), ingresos: Number(s.v_subida_jot_hoy || 0) }));
  const totalBarrasDia           = (data.graficoBarrasDia || []).reduce((acc, d) => acc + Number(d.total || 0), 0);

  // ── Datos con semáforo para el gráfico de barras ──────────────────────────
  const dataBarrasConSemaforo = useMemo(() =>
    (data.graficoBarrasDia || []).map(d => ({
      ...d,
      faltante: Math.max(0, META_DIA - Number(d.total)),
      activos:  Number(d.activos || 0),
      _cumple:  Number(d.total) >= META_DIA,
      _pct:     META_DIA > 0 ? Number(d.total) / META_DIA : 0,
    })), [data.graficoBarrasDia]);

  // ── Filtrar dataCRM por día clickeado ─────────────────────────────────────
  const dataCRMFiltrada = useMemo(() => {
    if (!diaFiltrado) return data.dataCRM || [];
    return (data.dataCRM || []).filter(r => {
      const fecha = (r.fecha || r.creado_el_fecha || '');
      return String(fecha).includes(`-${String(diaFiltrado).padStart(2, '0')}`) || String(fecha).endsWith(`/${diaFiltrado}`) || formatFechaCorta(String(fecha)) === String(diaFiltrado);
    });
  }, [data.dataCRM, diaFiltrado]);

  const inputCls  = "bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none focus:border-blue-500 transition-colors uppercase";
  const selectCls = "bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none appearance-none uppercase";

  // ── Gráfico barras con semáforo + click ───────────────────────────────────
  const GraficoBarrasDia = () => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={dataBarrasConSemaforo}
        margin={{ top: 24, right: 10, left: 0, bottom: 50 }}
        barCategoryGap="20%"
        barGap={2}
        onClick={handleClickBarra}
        style={{ cursor: 'pointer' }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
        <XAxis
          dataKey="fecha"
          axisLine={false}
          tickLine={false}
          tickFormatter={formatFechaCorta}
          interval="preserveStartEnd"
          tick={({ x, y, payload }) => {
            const dia   = formatFechaCorta(payload.value);
            const item  = dataBarrasConSemaforo.find(d => formatFechaCorta(String(d.fecha)) === dia);
            const color = item?._cumple ? '#10b981' : item?._pct >= 0.8 ? '#f59e0b' : '#ef4444';
            const sel   = diaFiltrado === dia;
            return (
              <g transform={`translate(${x},${y})`}>
                <text x={0} y={0} dy={12} textAnchor="middle" fill={sel ? '#fff' : color} fontSize={sel ? 11 : 10} fontWeight={sel ? 900 : 700}>
                  {dia}
                </text>
                {sel && <circle cx={0} cy={22} r={3} fill="#fff" />}
              </g>
            );
          }}
        />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 9 }} domain={[0, dataMax => Math.max(dataMax, 70)]} />
        <Tooltip content={<TooltipBarrasDia metaDia={META_DIA} />} />
        <ReferenceLine y={META_DIA} stroke="#facc15" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: `META ${META_DIA}`, fill: '#facc15', fontSize: 8, fontWeight: 900, position: 'insideTopRight' }} />
        <Bar dataKey="total" stackId="a" shape={<BarraSemaforo meta={META_DIA} />} radius={[0,0,0,0]} barSize={22}>
          <LabelList dataKey="total" content={CustomBarLabel} />
        </Bar>
        <Bar dataKey="faltante" stackId="a" fill="rgba(239,68,68,0.25)" radius={[4,4,0,0]} barSize={22}>
          <LabelList dataKey="faltante" content={CustomFaltanteLabel} />
        </Bar>
        <Bar dataKey="activos" fill="#60a5fa" radius={[4,4,0,0]} barSize={12}>
          <LabelList dataKey="activos" content={CustomActivosLabel} />
        </Bar>
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
            <Tooltip content={<TooltipEmbudo />} />
          </FunnelChart>
        </ResponsiveContainer>
      </div>
      <div className="w-[180px] overflow-y-auto flex flex-col gap-1.5 py-1 pr-1">
        {(data.graficoEmbudo || []).slice(0, 12).map((entry, index) => {
          const pct = ((Number(entry.total) / totalBaseEmbudo) * 100).toFixed(1);
          return (
            <div key={index} className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORES_EMBUDO[index % COLORES_EMBUDO.length] }} />
              <span className="text-[8px] text-slate-400 truncate leading-tight flex-1 uppercase">{entry.etapa}</span>
              <span className="text-[8px] font-black text-white shrink-0">{entry.total}</span>
              <span className="text-[8px] font-bold text-slate-400 shrink-0">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Gráfico asesores con tooltip rico y colores semáforo ──────────────────
  const GraficoAsesores = () => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dataGraficoAsesores} margin={{ top: 20, right: 10, left: 0, bottom: 80 }} barCategoryGap="25%" barGap={3}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
        <XAxis dataKey="nombre" axisLine={false} tickLine={false} tick={<CustomXAxisTickVertical />} interval={0} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 9 }} />
        <Tooltip content={<TooltipAsesores />} />
        <Bar dataKey="gestionables" radius={[4,4,0,0]} barSize={16} label={{ position: 'top', fill: '#c4b5fd', fontSize: 9, fontWeight: 900 }}>
          {dataGraficoAsesores.map((entry, index) => {
            const efect = entry.gestionables > 0 ? entry.ingresos / entry.gestionables : 0;
            const color = efect >= 0.3 ? '#8b5cf6' : efect >= 0.15 ? '#a78bfa' : '#c4b5fd';
            return <Cell key={`gest-${index}`} fill={color} />;
          })}
        </Bar>
        <Bar dataKey="ingresos" radius={[4,4,0,0]} barSize={16} label={{ position: 'top', fill: '#6ee7b7', fontSize: 9, fontWeight: 900 }}>
          {dataGraficoAsesores.map((entry, index) => {
            const color = entry.ingresos >= 3 ? '#10b981' : entry.ingresos >= 1 ? '#34d399' : '#6ee7b7';
            return <Cell key={`ing-${index}`} fill={color} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const GraficoSupervisores = () => (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dataGraficoSupervisores} margin={{ top: 20, right: 10, left: 0, bottom: 80 }} barCategoryGap="25%" barGap={3}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
        <XAxis dataKey="nombre" axisLine={false} tickLine={false} tick={<CustomXAxisTickVertical />} interval={0} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 9 }} />
        <Tooltip content={<TooltipAsesores />} />
        <Bar dataKey="gestionables" radius={[4,4,0,0]} barSize={28} label={{ position: 'top', fill: '#67e8f9', fontSize: 9, fontWeight: 900 }}>
          {dataGraficoSupervisores.map((entry, index) => {
            const efect = entry.gestionables > 0 ? entry.ingresos / entry.gestionables : 0;
            const color = efect >= 0.3 ? '#06b6d4' : efect >= 0.15 ? '#22d3ee' : '#67e8f9';
            return <Cell key={`sgest-${index}`} fill={color} />;
          })}
        </Bar>
        <Bar dataKey="ingresos" radius={[4,4,0,0]} barSize={28} label={{ position: 'top', fill: '#6ee7b7', fontSize: 9, fontWeight: 900 }}>
          {dataGraficoSupervisores.map((entry, index) => {
            const color = entry.ingresos >= 5 ? '#10b981' : entry.ingresos >= 2 ? '#34d399' : '#6ee7b7';
            return <Cell key={`sing-${index}`} fill={color} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="min-h-screen bg-slate-100 p-6 font-['Inter',_sans-serif] text-slate-900">

      {/* Alertas flotantes */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2">
        {alertas.map(alerta => (
          <div key={alerta.id} className={`${alerta.color} text-white px-6 py-4 rounded-2xl shadow-2xl text-[11px] font-black tracking-wider animate-in slide-in-from-right-5 duration-300 border max-w-sm uppercase`}>{alerta.mensaje}</div>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2 uppercase">
          <span className="bg-blue-600 text-white px-2 py-1 rounded italic text-xl">REV</span> SISTEMA DE INDICADORES
        </h1>
        <div className="flex gap-2 bg-slate-200 p-1 rounded-xl border border-slate-300 w-full sm:w-auto">
          <button onClick={() => setTabActiva("GENERAL")} className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[10px] font-black rounded-lg transition-all uppercase ${tabActiva === "GENERAL" ? "bg-[#0F172A] text-white shadow-lg" : "text-slate-500 hover:bg-slate-300"}`}>📊 REPORTE GENERAL D-1</button>
          <button onClick={() => setTabActiva("MONITOREO")} className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[10px] font-black rounded-lg transition-all uppercase ${tabActiva === "MONITOREO" ? "bg-emerald-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-300"}`}>⏱️ MONITOREO LEADS</button>
          <button onClick={() => setTabActiva("REPORTE180")} className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[10px] font-black rounded-lg transition-all uppercase ${tabActiva === "REPORTE180" ? "bg-violet-600 text-white shadow-lg" : "text-slate-500 hover:bg-slate-300"}`}>🔭 REPORTE 180°</button>
        </div>
      </div>

      {tabActiva === "GENERAL" ? (
        <div className="animate-in fade-in duration-500">
          {/* Panel de filtros */}
          <div className="bg-[#0F172A] rounded-2xl shadow-2xl mb-8 overflow-hidden border border-slate-800">
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-9 gap-4 items-end">
              <div className="lg:col-span-2 flex flex-col gap-2">
                <label className="text-[9px] font-black text-blue-400 italic tracking-widest uppercase">PERÍODO DE CONSULTA</label>
                <div className="flex bg-slate-900 border border-slate-700 rounded-2xl p-1.5 shadow-inner">
                  <input type="date" className="bg-transparent text-white text-center text-[11px] font-bold outline-none w-full [color-scheme:dark]"
                    value={filtros.fechaDesde} onChange={e => updateFiltro('fechaDesde', e.target.value)} />
                  <div className="text-slate-600 px-2 font-black self-center">-</div>
                  <input type="date" className="bg-transparent text-white text-center text-[11px] font-bold outline-none w-full [color-scheme:dark]"
                    value={filtros.fechaHasta} onChange={e => updateFiltro('fechaHasta', e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-slate-500 italic uppercase">ASESOR</label>
                <select className={selectCls} value={filtros.asesor} onChange={e => updateFiltro('asesor', e.target.value)}>
                  <option value="">TODOS</option>
                  {nombresAsesores.map((a) => (
                    <option key={a.nombre_grupo} value={a.nombre_grupo}>{a.nombre_grupo}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-slate-500 italic uppercase">SUPERVISOR</label>
                <input type="text" placeholder="BUSCAR..." className={inputCls}
                  value={filtros.supervisor} onChange={e => updateFiltro('supervisor', e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-slate-500 italic uppercase">ETAPA CRM</label>
                <select className={selectCls} value={filtros.etapaCRM} onChange={e => updateFiltro('etapaCRM', e.target.value)}>
                  <option value="">TODAS</option>
                  {(data.etapasCRM || []).map((etapa, i) => <option key={i} value={etapa}>{etapa}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-slate-500 italic uppercase">NETLIFE</label>
                <select className={selectCls} value={filtros.estadoNetlife} onChange={e => updateFiltro('estadoNetlife', e.target.value)}>
                  <option value="">TODOS</option>
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="RECHAZADO">RECHAZADO</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-slate-500 italic uppercase">ETAPA JOTFORM</label>
                <select className={selectCls} value={filtros.etapaJotform} onChange={e => updateFiltro('etapaJotform', e.target.value)}>
                  <option value="">TODAS</option>
                  {ETAPAS_JOTFORM.map((etapa, i) => <option key={i} value={etapa}>{etapa}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-slate-500 italic uppercase">REGULARIZACIÓN</label>
                <select className={selectCls} value={filtros.estadoRegularizacion} onChange={e => updateFiltro('estadoRegularizacion', e.target.value)}>
                  <option value="">TODOS</option>
                  <option value="POR REGULARIZAR">POR REGULARIZAR</option>
                  <option value="REGULARIZADO">REGULARIZADO</option>
                </select>
              </div>
              <button onClick={() => fetchDashboard()} className="bg-blue-600 hover:bg-blue-500 text-white h-[42px] rounded-xl text-[10px] font-black shadow-lg shadow-blue-900/20 transition-all active:scale-95 uppercase">{loading ? "CARGANDO..." : "APLICAR FILTROS"}</button>
            </div>
          </div>

          {/* KPIs Mini */}
          <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-3 mb-6">
            <KpiMini label="Leads Totales"   meta={metaDinamica(6122,  filtros.fechaDesde, filtros.fechaHasta)}  real={stats.leadsGestionables}             color="border-l-emerald-500" />
            <KpiMini label="Gestionables"    meta={metaDinamica(3061,  filtros.fechaDesde, filtros.fechaHasta)}  real={stats.gestionables}                  color="border-l-violet-500" />
            <KpiMini label="Ingresos CRM"    meta={metaDinamica(1364,  filtros.fechaDesde, filtros.fechaHasta)}  real={stats.ingresosCRM}                   color="border-l-blue-500" />
            <KpiMini label="Ingresos JOT"    meta={metaDinamica(1050,  filtros.fechaDesde, filtros.fechaHasta)}  real={stats.ingresosJotform}               color="border-l-emerald-500" />
            <KpiMini label="Efectividad"     meta="45%"   real={`${stats.efectividad}%`}             color="border-l-purple-500" />
            <KpiMini label="Tasa Inst."      meta="90%"   real={`${stats.tasaInstalacion}%`}         color="border-l-cyan-500" />
            <KpiMini label="Tarjeta %"       meta="30%"   real={`${stats.tarjetaCredito}%`}          color="border-l-amber-500" />
            <KpiMini label="Descarte %"      meta="30%"   real={`${stats.descartePorc}%`}            color="border-l-rose-500" />
            <KpiMini label="Efic. Pauta"     meta="20%"   real={`${stats.efectividadActivasPauta}%`} color="border-l-indigo-600" />
            <KpiMini label="3ra Edad %"      meta="14.50%"   real={`${stats.terceraEdad}%`}          color="border-l-pink-500" />
            <KpiMini label="Activas Total"     meta={metaDinamica(1156,  filtros.fechaDesde, filtros.fechaHasta)}  real={stats.activas - stats.backlog}       color="border-l-emerald-500" />
            <KpiMini label="Activas Backlog" meta={metaDinamica(70,   filtros.fechaDesde, filtros.fechaHasta)}  real={stats.backlog}                       color="border-l-cyan-500" />
            <KpiMini label="Activas Mes"   meta={metaDinamica(1300,  filtros.fechaDesde, filtros.fechaHasta)}  real={stats.activas}                       color="border-l-teal-500" />
            <KpiMini label="Por Regularizar" value={stats.regularizar}                               color="border-l-pink-500" />
          </div>

          {/* Tarjetas Etapas Jotform */}
          <div className="bg-white border border-slate-200 shadow-sm p-6 mb-6 rounded-2xl">
            <h3 className="text-[10px] font-black text-slate-400 uppercase mb-5 tracking-widest flex items-center gap-2 italic">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              Etapas Jotform
              <span className="ml-1 bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[8px] font-black">
                {(data.estadosNetlife || []).length} ETAPAS
              </span>
              {filtros.etapaJotform && (
                <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[8px] font-black uppercase">
                  FILTRO ACTIVO: {filtros.etapaJotform}
                  <button onClick={() => updateFiltro('etapaJotform', '')} className="ml-1 text-blue-400 hover:text-red-500">✕</button>
                </span>
              )}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {(data.estadosNetlife || []).map((e, i) => (
                <div
                  key={i}
                  onClick={() => handleClickTarjetaJotform(e.estado)}
                  className={`px-3 py-3 rounded-xl flex justify-between items-center shadow-sm cursor-pointer transition-all border hover:scale-105 active:scale-95 ${
                    filtros.etapaJotform === e.estado
                      ? 'bg-blue-50 border-blue-400 shadow-blue-100'
                      : 'bg-white border-slate-100 hover:border-blue-300'
                  }`}
                >
                  <span className="text-[10px] font-bold text-slate-600 uppercase leading-tight pr-2">{e.estado}</span>
                  <span className={`text-sm font-black px-2 py-1 rounded-lg shrink-0 ${
                    filtros.etapaJotform === e.estado ? 'text-white bg-blue-500' : 'text-blue-600 bg-blue-50'
                  }`}>{e.total}</span>
                </div>
              ))}
              {(data.estadosNetlife || []).length === 0 && (
                <div className="col-span-full text-center text-slate-400 text-[10px] py-6 uppercase">SIN DATOS PARA EL PERÍODO SELECCIONADO</div>
              )}
            </div>
          </div>

          {/* Gráficas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <ExpandableChart title={`PRODUCCIÓN POR DÍA (CERRADOS) — TOTAL: ${totalBarrasDia}`} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-2xl" modalHeight={500}>
              <h3 className="text-[10px] font-black text-emerald-400 mb-4 italic tracking-widest flex items-center gap-2 flex-wrap uppercase">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0"></span>
                PRODUCCIÓN POR DÍA (CERRADOS)
                <span className="ml-2 bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBarrasDia}</span>
                <span className="ml-auto flex items-center gap-2 text-[9px] text-slate-400 font-bold not-italic flex-wrap">
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-emerald-500 rounded inline-block"></span> OK</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-amber-500 rounded inline-block"></span> CERCA</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-500 rounded inline-block"></span> BAJO</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-400 rounded inline-block"></span> ACTIVOS</span>
                  <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-yellow-400 inline-block"></span> META {META_DIA}</span>
                </span>
              </h3>
              {/* Leyenda semáforo */}
              <div className="flex gap-3 mb-3 text-[8px] font-black">
                <div className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> {dataBarrasConSemaforo.filter(d => d._cumple).length} DÍAS OK</div>
                <div className="flex items-center gap-1 text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-500"></span> {dataBarrasConSemaforo.filter(d => !d._cumple && d._pct >= 0.8).length} CERCA</div>
                <div className="flex items-center gap-1 text-red-400"><span className="w-2 h-2 rounded-full bg-red-500"></span> {dataBarrasConSemaforo.filter(d => d._pct < 0.8 && Number(d.total) > 0).length} BAJO META</div>
                {diaFiltrado && (
                  <button onClick={() => setDiaFiltrado(null)} className="ml-auto text-white bg-blue-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                    DÍA {diaFiltrado} ✕
                  </button>
                )}
              </div>
              <div className="h-[260px]"><GraficoBarrasDia /></div>
            </ExpandableChart>

            <ExpandableChart title={`EMBUDO DE CONVERSIÓN — TOTAL: ${totalBaseEmbudo}`} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-2xl" modalHeight={500}>
              <h3 className="text-[10px] font-black text-emerald-400 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                EMBUDO DE CONVERSIÓN
                <span className="ml-2 bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBaseEmbudo}</span>
              </h3>
              <div className="h-[300px]"><GraficoEmbudo /></div>
            </ExpandableChart>
          </div>

          {/* Tablas */}
          <div className="mb-8"><HorizontalTable title="KPI POR SUPERVISOR" data={data.supervisores} /></div>
          <div className="mb-8"><HorizontalTable title="KPI POR ASESOR" data={data.asesores} hasScroll={true} /></div>

          {/* DataVisor con indicador de filtro activo */}
          <div className="grid grid-cols-1 gap-4">
            <DataVisor
              title={diaFiltrado ? `DETALLE BASE CRM — DÍA ${diaFiltrado} FILTRADO (${dataCRMFiltrada.length} registros)` : "DETALLE BASE CRM"}
              data={dataCRMFiltrada}
              onDownload={() => descargarExcel("CRM")}
              color="bg-slate-800"
              filtroBadge={diaFiltrado ? <button onClick={() => setDiaFiltrado(null)} className="text-[8px] bg-white/20 px-2 py-0.5 rounded-full font-black ml-2">DÍA {diaFiltrado} ✕ LIMPIAR</button> : null}
            />
            <DataVisor title="DETALLE BASE JOTFORM (NETLIFE)" data={data.dataNetlife} onDownload={() => descargarExcel("JOTFORM")} color="bg-blue-900" />
          </div>
        </div>

      ) : tabActiva === "MONITOREO" ? (
        <div className="animate-in slide-in-from-right-5 duration-500 space-y-6">
          <div className="bg-emerald-900 text-white p-5 rounded-2xl flex justify-between items-center shadow-xl border-b-4 border-emerald-700">
            <div>
              <h2 className="text-lg font-black italic tracking-tighter flex items-center gap-2 uppercase">
                <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>
                MONITOREO DE GESTIÓN EN VIVO
              </h2>
              <p className="text-[9px] font-bold text-emerald-300 tracking-[0.2em] uppercase">DATOS ACUMULADOS DEL MES Y DÍA ACTUAL</p>
            </div>
            <button onClick={fetchMonitoreo} className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-xl text-[10px] font-black backdrop-blur-sm transition-all border border-white/20 uppercase">{loading ? "ACTUALIZANDO..." : "FORZAR RECARGA"}</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ExpandableChart title="ASESORES — GESTIONABLES VS INGRESOS HOY" className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-2xl" modalHeight={500}>
              <h3 className="text-[10px] font-black text-violet-400 mb-2 italic tracking-widest flex items-center gap-2 flex-wrap uppercase">
                <span className="w-2 h-2 bg-violet-500 rounded-full animate-pulse shrink-0"></span>
                ASESORES — GESTIONABLES VS INGRESOS HOY
              </h3>
              {/* Leyenda semáforo asesores */}
              <div className="flex gap-3 mb-3 text-[8px] font-black">
                <span className="flex items-center gap-1 text-violet-400"><span className="w-2 h-2 rounded-sm bg-violet-500"></span> GESTIONABLES</span>
                <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-sm bg-emerald-500"></span> INGRESOS (más oscuro = mejor)</span>
              </div>
              <div className="h-[300px]"><GraficoAsesores /></div>
            </ExpandableChart>

            <ExpandableChart title="SUPERVISORES — GESTIONABLES VS INGRESOS HOY" className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-2xl" modalHeight={500}>
              <h3 className="text-[10px] font-black text-cyan-400 mb-2 italic tracking-widest flex items-center gap-2 flex-wrap uppercase">
                <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse shrink-0"></span>
                SUPERVISORES — GESTIONABLES VS INGRESOS HOY
              </h3>
              <div className="flex gap-3 mb-3 text-[8px] font-black">
                <span className="flex items-center gap-1 text-cyan-400"><span className="w-2 h-2 rounded-sm bg-cyan-500"></span> GESTIONABLES</span>
                <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-sm bg-emerald-500"></span> INGRESOS (más oscuro = mejor)</span>
              </div>
              <div className="h-[300px]"><GraficoSupervisores /></div>
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
  const COLORES_EMBUDO_CRM = ['#1d4ed8','#2563eb','#3b82f6','#60a5fa','#93c5fd','#bfdbfe'];
  const COLORES_EMBUDO_JOT = ['#065f46','#047857','#059669','#10b981','#34d399','#6ee7b7'];

  const fechas   = [...new Set((mapaCalor || []).map(r => r.fecha))].sort();
  const ciudades = [...new Set((mapaCalor || []).map(r => r.ciudad))];
  const mapaIndex = {};
  (mapaCalor || []).forEach(r => { mapaIndex[`${r.ciudad}__${r.fecha}`] = r.total; });
  const maxCalor = Math.max(...(mapaCalor || []).map(r => r.total), 1);
  const heatColor = (val) => { if (!val) return '#1e293b'; const r = val / maxCalor; if (r < 0.25) return '#164e63'; if (r < 0.5) return '#0e7490'; if (r < 0.75) return '#06b6d4'; return '#22d3ee'; };

  const totalBaseEmbudoCRM = (embudoCRM || []).reduce((acc, item) => acc + Number(item.total || 0), 0) || 1;
  const totalBaseEmbudoJOT = (embudoJotform || []).reduce((acc, item) => acc + Number(item.total || 0), 0) || 1;

  const CustomFunnelLabelCRM = ({ x, y, width, height, index }) => { if (height < 22) return null; const item = (embudoCRM || [])[index]; if (!item) return null; const pct = ((Number(item.total) / totalBaseEmbudoCRM) * 100).toFixed(1); return <text x={x + width / 2} y={y + height / 2} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="900">{`${item.etapa} = ${item.total} (${pct}%)`}</text>; };
  const CustomFunnelLabelJOT = ({ x, y, width, height, index }) => { if (height < 22) return null; const item = (embudoJotform || [])[index]; if (!item) return null; const pct = ((Number(item.total) / totalBaseEmbudoJOT) * 100).toFixed(1); return <text x={x + width / 2} y={y + height / 2} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="900">{`${item.etapa} = ${item.total} (${pct}%)`}</text>; };

  const updateFiltro180 = (campo, valor) => {
    const nuevos = { ...filtros, [campo]: valor };
    setFiltros(nuevos);
    onFetch(nuevos);
  };

  const inputCls  = "bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none focus:border-violet-500 transition-colors uppercase";
  const selectCls = "bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white outline-none appearance-none uppercase";

  const GraficoEmbudoCRM = () => (
    <div className="flex gap-4 h-full">
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <FunnelChart>
            <Funnel data={embudoCRM || []} dataKey="total" nameKey="etapa" isAnimationActive={false} label={CustomFunnelLabelCRM}>
              {(embudoCRM || []).map((_, index) => <Cell key={`crm-${index}`} fill={COLORES_EMBUDO_CRM[index % COLORES_EMBUDO_CRM.length]} />)}
            </Funnel>
            <Tooltip content={<TooltipEmbudo />} />
          </FunnelChart>
        </ResponsiveContainer>
      </div>
      <div className="w-[180px] overflow-y-auto flex flex-col gap-1.5 py-1 pr-1">
        {(embudoCRM || []).slice(0, 15).map((entry, index) => {
          const pct = ((Number(entry.total) / totalBaseEmbudoCRM) * 100).toFixed(1);
          return <div key={index} className="flex items-center gap-2 min-w-0"><div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORES_EMBUDO_CRM[index % COLORES_EMBUDO_CRM.length] }} /><span className="text-[8px] text-slate-400 truncate leading-tight flex-1 uppercase">{entry.etapa}</span><span className="text-[8px] font-black text-white shrink-0">{entry.total}</span><span className="text-[8px] font-bold text-slate-400 shrink-0">({pct}%)</span></div>;
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
            <Tooltip content={<TooltipEmbudo />} />
          </FunnelChart>
        </ResponsiveContainer>
      </div>
      <div className="w-[180px] overflow-y-auto flex flex-col gap-1.5 py-1 pr-1">
        {(embudoJotform || []).slice(0, 15).map((entry, index) => {
          const pct = ((Number(entry.total) / totalBaseEmbudoJOT) * 100).toFixed(1);
          return <div key={index} className="flex items-center gap-2 min-w-0"><div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORES_EMBUDO_JOT[index % COLORES_EMBUDO_JOT.length] }} /><span className="text-[8px] text-slate-400 truncate leading-tight flex-1 uppercase">{entry.etapa}</span><span className="text-[8px] font-black text-white shrink-0">{entry.total}</span><span className="text-[8px] font-bold text-slate-400 shrink-0">({pct}%)</span></div>;
        })}
      </div>
    </div>
  );

  return (
    <div className="animate-in slide-in-from-right-5 duration-500 space-y-6">
      <div className="bg-violet-900 text-white p-5 rounded-2xl flex justify-between items-center shadow-xl border-b-4 border-violet-700">
        <div>
          <h2 className="text-lg font-black italic tracking-tighter flex items-center gap-2 uppercase">🔭 REPORTE 180° — VISIÓN ANALÍTICA</h2>
          <p className="text-[9px] font-bold text-violet-300 tracking-[0.2em] uppercase">
            KPIs · EMBUDOS · MAPA DE CALOR
            <span className="ml-3 bg-violet-700 px-2 py-0.5 rounded-full text-violet-200 not-italic">
              📅 {calcularDiasFiltro(filtros.fechaDesde, filtros.fechaHasta)} DÍA(S) DE {diasDelMes(filtros.fechaDesde)}
            </span>
          </p>
        </div>
        <button onClick={() => onFetch(filtros)} className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-xl text-[10px] font-black backdrop-blur-sm transition-all border border-white/20 uppercase">{loading ? "CARGANDO..." : "APLICAR"}</button>
      </div>

      <div className="bg-[#0F172A] rounded-2xl shadow-2xl overflow-hidden border border-slate-800">
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4 items-end">
          <div className="lg:col-span-2 flex flex-col gap-2">
            <label className="text-[9px] font-black text-violet-400 italic tracking-widest uppercase">PERÍODO</label>
            <div className="flex bg-slate-900 border border-slate-700 rounded-2xl p-1.5 shadow-inner">
              <input type="date" className="bg-transparent text-white text-center text-[11px] font-bold outline-none w-full [color-scheme:dark]"
                value={filtros.fechaDesde} onChange={e => updateFiltro180('fechaDesde', e.target.value)} />
              <div className="text-slate-600 px-2 font-black self-center">-</div>
              <input type="date" className="bg-transparent text-white text-center text-[11px] font-bold outline-none w-full [color-scheme:dark]"
                value={filtros.fechaHasta} onChange={e => updateFiltro180('fechaHasta', e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-2"><label className="text-[9px] font-black text-slate-500 italic uppercase">ASESOR</label>
            <input type="text" placeholder="BUSCAR..." className={inputCls} value={filtros.asesor} onChange={e => updateFiltro180('asesor', e.target.value)} />
          </div>
          <div className="flex flex-col gap-2"><label className="text-[9px] font-black text-slate-500 italic uppercase">SUPERVISOR</label>
            <input type="text" placeholder="BUSCAR..." className={inputCls} value={filtros.supervisor} onChange={e => updateFiltro180('supervisor', e.target.value)} />
          </div>
          <div className="flex flex-col gap-2"><label className="text-[9px] font-black text-slate-500 italic uppercase">ETAPA CRM</label>
            <select className={selectCls} value={filtros.etapaCRM} onChange={e => updateFiltro180('etapaCRM', e.target.value)}>
              <option value="">TODAS</option>
              {(etapasCRM || []).map((etapa, i) => <option key={i} value={etapa}>{etapa}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-2"><label className="text-[9px] font-black text-slate-500 italic uppercase">NETLIFE</label>
            <select className={selectCls} value={filtros.estadoNetlife} onChange={e => updateFiltro180('estadoNetlife', e.target.value)}>
              <option value="">TODOS</option><option value="ACTIVO">ACTIVO</option><option value="RECHAZADO">RECHAZADO</option>
            </select>
          </div>
          <div className="flex flex-col gap-2"><label className="text-[9px] font-black text-slate-500 italic uppercase">ETAPA JOT</label>
            <select className={selectCls} value={filtros.etapaJotform} onChange={e => updateFiltro180('etapaJotform', e.target.value)}>
              <option value="">TODAS</option>
              {(ETAPAS_JOTFORM || []).map((etapa, i) => <option key={i} value={etapa}>{etapa}</option>)}
            </select>
          </div>
          <button onClick={() => onFetch(filtros)} className="bg-violet-600 hover:bg-violet-500 text-white h-[42px] rounded-xl text-[10px] font-black shadow-lg transition-all active:scale-95 uppercase">APLICAR FILTROS</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard180 label="VENTAS INGRESOS JOT" meta={METAS.ingresos_jot}     real={kpis.ingresos_jot}             tipo="numero"     color="indigo" />
        <KpiCard180 label="VENTAS ACTIVAS"       meta={METAS.ventas_activas}   real={kpis.ventas_activas}           tipo="numero"     color="teal" />
        <KpiCard180 label="DESCARTE"             meta={METAS.pct_descarte}     real={Number(kpis.pct_descarte)}     tipo="porcentaje" color="amber"  invertido={true} />
        <KpiCard180 label="EFECTIVIDAD"          meta={METAS.pct_efectividad}  real={Number(kpis.pct_efectividad)}  tipo="porcentaje" color="sky" />
        <KpiCard180 label="TERCERA EDAD"         meta={METAS.pct_tercera_edad} real={Number(kpis.pct_tercera_edad)} tipo="porcentaje" color="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExpandableChart title={`EMBUDO CRM — ETAPAS DE NEGOCIACIÓN — TOTAL: ${totalBaseEmbudoCRM}`} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-2xl" modalHeight={550}>
          <h3 className="text-[10px] font-black text-blue-400 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
            EMBUDO CRM — ETAPAS DE NEGOCIACIÓN
            <span className="ml-2 bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBaseEmbudoCRM}</span>
          </h3>
          <div className="h-[340px]"><GraficoEmbudoCRM /></div>
        </ExpandableChart>

        <ExpandableChart title={`EMBUDO JOTFORM — ESTADOS NETLIFE — TOTAL: ${totalBaseEmbudoJOT}`} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-2xl" modalHeight={550}>
          <h3 className="text-[10px] font-black text-emerald-400 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            EMBUDO JOTFORM — ESTADOS NETLIFE
            <span className="ml-2 bg-emerald-900 text-emerald-300 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBaseEmbudoJOT}</span>
          </h3>
          <div className="h-[340px]"><GraficoEmbudoJOT /></div>
        </ExpandableChart>
      </div>

      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-2xl">
        <h3 className="text-[10px] font-black text-cyan-400 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
          <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></span>
          MAPA DE CALOR — INGRESOS JOT POR CIUDAD Y FECHA
          <span className="ml-auto flex items-center gap-3 text-[8px] not-italic font-bold text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{backgroundColor:'#164e63'}}></span> BAJO</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{backgroundColor:'#0e7490'}}></span> MEDIO</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{backgroundColor:'#22d3ee'}}></span> ALTO</span>
          </span>
        </h3>
        {fechas.length === 0 ? (
          <div className="text-center text-slate-500 text-[10px] py-12 uppercase">SIN DATOS PARA EL PERÍODO SELECCIONADO</div>
        ) : (
          <div className="overflow-auto max-h-[500px]">
            <table className="text-[8px] font-mono border-collapse w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-slate-800 text-slate-400 p-2 text-left font-black sticky left-0 z-20 border-r border-slate-700 min-w-[120px] uppercase">CIUDAD</th>
                  {fechas.map(f => <th key={f} className="bg-slate-800 text-slate-400 p-1 font-black min-w-[36px] text-center border-l border-slate-700">{f ? f.split('-').slice(1).join('/') : f}</th>)}
                </tr>
              </thead>
              <tbody>
                {ciudades.map((ciudad, ci) => (
                  <tr key={ci} className="hover:bg-slate-800/50 transition-colors">
                    <td className="sticky left-0 bg-slate-900 border-r border-slate-700 p-2 font-black text-slate-300 uppercase truncate max-w-[120px]">{ciudad}</td>
                    {fechas.map(f => { const val = mapaIndex[`${ciudad}__${f}`] || 0; return <td key={f} className="p-0.5 text-center border-l border-slate-800"><div className="rounded flex items-center justify-center font-black transition-all hover:scale-110 cursor-default" style={{ backgroundColor: heatColor(val), width: 32, height: 24, margin: '0 auto', color: val ? '#fff' : 'transparent', fontSize: 8 }} title={`${ciudad} | ${f} | ${val}`}>{val || ''}</div></td>; })}
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
    indigo: { accent: '#4f46e5', accentBg: '#eef2ff', accentText: '#4338ca', bar: '#4f46e5', icon: '📥' },
    teal:   { accent: '#0d9488', accentBg: '#f0fdfa', accentText: '#0f766e', bar: '#0d9488', icon: '✅' },
    amber:  { accent: '#d97706', accentBg: '#fffbeb', accentText: '#b45309', bar: '#d97706', icon: '⚠️' },
    sky:    { accent: '#0284c7', accentBg: '#f0f9ff', accentText: '#0369a1', bar: '#0284c7', icon: '🎯' },
    rose:   { accent: '#e11d48', accentBg: '#fff1f2', accentText: '#be123c', bar: '#e11d48', icon: '👴' },
  };
  const c        = colores[color] || colores.indigo;
  const barColor = cumple ? c.bar : '#94a3b8';
  const pctLabel = cumple ? `✓ ${pct.toFixed(1)}%` : `✗ ${pct.toFixed(1)}%`;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col" style={{ borderTop: `3px solid ${c.accent}` }}>
      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        <span className="text-[10px] font-black tracking-widest uppercase flex-1 leading-tight" style={{ color: c.accentText }}>{label}</span>
        <span className="text-[18px] w-8 h-8 flex items-center justify-center rounded-lg shrink-0" style={{ backgroundColor: c.accentBg }}>{c.icon}</span>
      </div>
      <div className="px-4 pb-3 flex justify-between items-end gap-2">
        <div>
          <p className="text-[8px] font-bold text-slate-400 mb-0.5 uppercase">REAL</p>
          <p className="text-3xl font-black text-slate-900 leading-none">{tipo === 'porcentaje' ? `${real}%` : real.toLocaleString()}</p>
        </div>
        <div className="text-right">
          <p className="text-[8px] font-bold text-slate-400 mb-0.5 uppercase">META</p>
          <p className="text-base font-black text-slate-400">{tipo === 'porcentaje' ? `${meta}%` : meta.toLocaleString()}</p>
        </div>
      </div>
      <div className="px-4 pb-2">
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: barColor }} />
        </div>
      </div>
      <div className="px-4 py-2 flex justify-between items-center mt-auto" style={{ backgroundColor: c.accentBg }}>
        <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">AVANCE</span>
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
      <span className="text-[9px] font-black text-slate-400 tracking-wider leading-tight uppercase">{label}</span>
      {meta !== undefined ? (
        <>
          <div className="mt-2 grid grid-cols-2 border-t border-slate-100 pt-2 gap-2">
            <div className="flex flex-col">
              <span className="text-[8px] font-bold text-slate-400 uppercase">META</span>
              <span className="text-[12px] font-black text-slate-500">{meta}</span>
            </div>
            <div className="flex flex-col border-l border-slate-100 pl-2">
              <span className="text-[8px] font-bold text-slate-400 uppercase">REAL</span>
              <span className="text-[12px] font-black" style={{ color: realColor }}>{real}</span>
            </div>
          </div>
          <div className="mt-1.5 w-full bg-slate-100 rounded-full h-1 overflow-hidden">
            <div className="h-1 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor }} />
          </div>
        </>
      ) : (
        <span className="text-xl font-black text-slate-800 mt-1">{value}</span>
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

  const tdD  = "text-center px-3 py-2 border-r border-slate-100 w-16 whitespace-nowrap";
  const tdDB = "text-center px-3 py-2 border-r border-slate-400 w-16 whitespace-nowrap font-black";
  const thD  = "px-3 py-2 border-r border-slate-100 w-16 text-center whitespace-nowrap";
  const thDB = "px-3 py-2 border-r border-slate-400 w-16 text-center whitespace-nowrap";
  const NW   = 110;

  return (
    <div className="bg-white border border-slate-300 shadow-2xl rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-700 flex justify-between items-center">
        <h2 className="text-[10px] font-black uppercase italic tracking-[0.2em] text-white flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block"></span>
          {title} <span className="text-slate-400 font-mono normal-case">({safeData.length} registros)</span>
        </h2>
        <button onClick={descargarExcel} className="text-[9px] bg-white/10 hover:bg-white/20 px-4 py-1.5 rounded-full font-black backdrop-blur-sm transition-all border border-white/10 flex items-center gap-2 text-white uppercase">⬇️ EXCEL</button>
      </div>
      <div className={`overflow-auto ${hasScroll ? 'max-h-[380px]' : ''}`}>
        <table className="text-[9px] border-collapse uppercase" style={{ minWidth: '100%', tableLayout: 'auto' }}>
          <thead>
            <tr className="bg-slate-200 border-b border-slate-400 font-black text-[8px]">
              <th className="p-2 border-r border-slate-400 sticky left-0 bg-slate-200 z-10 text-left whitespace-nowrap" style={{ width: NW, minWidth: NW, maxWidth: NW }}>ENTIDAD</th>
              <th colSpan="4" className="border-r border-slate-400 text-center bg-slate-100 py-1">PRES. VENTAS ACTIVAS</th>
              <th className="border-r border-slate-400 text-center px-3">GEST.</th>
              <th colSpan="2" className="border-r border-slate-400 text-center bg-slate-100">VENTAS SUBIDAS</th>
              <th className="border-r border-slate-400 text-center px-3">EFECT. %</th>
              <th className="border-r border-slate-400 text-center px-3">DESC. %</th>
              <th className="border-r border-slate-400 text-center px-3">INST. %</th>
              <th className="border-r border-slate-400 text-center px-3 bg-slate-50">EFIC. %</th>
              <th className="border-r border-slate-400 text-center px-3">TJC. %</th>
              <th className="border-r border-slate-400 text-center px-3">3ED. %</th>
              <th className="text-center px-3">REGU.</th>
            </tr>
            <tr className="bg-white border-b border-slate-400 text-[8px] text-slate-500 font-black">
              <th className="p-2 border-r border-slate-400 sticky left-0 bg-white z-10 text-left" style={{ width: NW, minWidth: NW, maxWidth: NW }}>NOMBRE</th>
              <th className={thD}>REAL</th><th className={thD}>BACK</th>
              <th className="px-3 py-2 border-r border-slate-100 w-16 text-center bg-slate-50 font-bold whitespace-nowrap">TOT</th>
              <th className={thDB}>CREC</th><th className={thDB}>TOT</th><th className={thD}>CRM</th><th className={thDB}>JOTF</th>
              <th className={thDB}>REAL</th><th className={thDB}>REAL</th><th className={thDB}>REAL</th>
              <th className="px-3 py-2 border-r border-slate-400 w-16 text-center bg-slate-50 font-bold whitespace-nowrap">REAL</th>
              <th className={thDB}>REAL</th><th className={thDB}>REAL</th>
              <th className="px-3 py-2 w-16 text-center whitespace-nowrap">REAL</th>
            </tr>
            <tr className="bg-slate-800 text-white text-[8px] font-black border-b-2 border-slate-600">
              <td className="px-2 py-1.5 border-r border-slate-600 sticky left-0 bg-slate-800 z-10 whitespace-nowrap" style={{ width: NW, minWidth: NW, maxWidth: NW }}>▶ TOTAL</td>
              <td className="text-center border-r border-slate-700 px-3 py-1.5">{totals.real_mes}</td>
              <td className="text-center border-r border-slate-700 px-3">{totals.backlog}</td>
              <td className="text-center border-r border-slate-700 px-3 bg-slate-700">{totals.total_activas_calculada}</td>
              <td className="text-center border-r border-slate-600 px-3 text-slate-400">—</td>
              <td className="text-center border-r border-slate-600 px-3">{totals.gestionables}</td>
              <td className="text-center border-r border-slate-700 px-3">{totals.ventas_crm}</td>
              <td className="text-center border-r border-slate-600 px-3">{totals.ingresos_reales}</td>
              <td className="text-center border-r border-slate-600 px-3 text-emerald-300">{totals.efectividad_real}%</td>
              <td className="text-center border-r border-slate-600 px-3 text-rose-300">{totals.descarte}%</td>
              <td className="text-center border-r border-slate-600 px-3 text-cyan-300">{totals.tasa_instalacion}%</td>
              <td className="text-center border-r border-slate-600 px-3 bg-slate-700 text-yellow-300">{totals.eficiencia}%</td>
              <td className="text-center border-r border-slate-600 px-3 text-amber-300">{tarjetaPct}%</td>
              <td className="text-center border-r border-slate-600 px-3 text-pink-300">{terceraEdadPct}%</td>
              <td className="text-center px-3">{totals.regularizacion}</td>
            </tr>
          </thead>
          <tbody className="font-mono leading-none">
            {safeData.map((row, idx) => (
              <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                <td className="px-2 py-2 border-r border-slate-400 sticky left-0 bg-white font-bold text-[8px] truncate uppercase" style={{ width: NW, minWidth: NW, maxWidth: NW }} title={row.nombre_grupo}>{row.nombre_grupo}</td>
                <td className={tdD}>{row.real_mes}</td>
                <td className={tdD}>{row.backlog}</td>
                <td className="text-center px-3 py-2 border-r border-slate-100 w-16 font-bold bg-slate-50 whitespace-nowrap">{row.total_activas_calculada}</td>
                <td className={`${tdDB} text-slate-400`}>{row.crec_vs_ma}</td>
                <td className={tdDB}>{row.gestionables}</td>
                <td className={tdD}>{row.ventas_crm}</td>
                <td className={tdDB}>{row.ingresos_reales}</td>
                <td className={`${tdDB} font-bold`}>{row.efectividad_real}%</td>
                <td className={tdDB}>{row.descarte}%</td>
                <td className={tdDB}>{row.tasa_instalacion}%</td>
                <td className="text-center px-3 py-2 border-r border-slate-400 w-16 font-bold bg-slate-50 whitespace-nowrap">{row.eficiencia}%</td>
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
    <div className="bg-white border border-slate-300 shadow-2xl rounded-xl overflow-hidden uppercase">
      <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-700 flex justify-between items-center text-white">
        <span className="text-[10px] font-black italic tracking-[0.2em] flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
          {title} <span className="text-slate-400 font-mono normal-case">({safeData.length} registros)</span>
        </span>
        <button onClick={descargarExcel} className="text-[9px] bg-white/10 hover:bg-white/20 px-4 py-1.5 rounded-full font-black backdrop-blur-sm transition-all border border-white/10 flex items-center gap-2 uppercase">⬇️ EXCEL</button>
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
            <tr className="bg-slate-800 text-white text-[8px] font-black border-b-2 border-slate-600">
              <td className="p-2 border-r border-slate-600 sticky left-0 bg-slate-800 z-10">▶ TOTAL</td>
              <td className="p-2 text-center text-slate-400">—</td>
              <td className="p-2 text-center">{totals.real_mes_leads}</td>
              <td className="p-2 text-center text-red-300">{(2000 * safeData.length - totals.real_mes_leads).toLocaleString()}</td>
              <td className="p-2 text-center text-slate-400">—</td>
              <td className="p-2 text-center text-indigo-300">{totals.real_dia_leads}</td>
              <td className="p-2 text-center text-red-300">{Math.max(0, 70 * safeData.length - totals.real_dia_leads)}</td>
              <td className="p-2 text-center">{totals.crm_acumulado}</td>
              <td className="p-2 text-center">{totals.crm_dia}</td>
              <td className="p-2 text-center">{totals.v_subida_crm_hoy}</td>
              <td className="p-2 text-center text-emerald-300">{totals.v_subida_jot_hoy}</td>
              <td className={`p-2 text-center ${Number(totals.real_efectividad) < 80 ? 'text-red-300' : 'text-emerald-300'}`}>{totals.real_efectividad}%</td>
              <td className={`p-2 text-center ${Number(totals.real_descarte) > 20 ? 'text-red-300' : 'text-slate-300'}`}>{totals.real_descarte}%</td>
              <td className="p-2 text-center text-amber-300">{totals.real_tarjeta}%</td>
            </tr>
          </thead>
          <tbody className="font-mono divide-y divide-slate-100">
            {safeData.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                <td className="p-3 font-black text-slate-800 sticky left-0 bg-white border-r border-slate-200 z-10 uppercase">{row.nombre_grupo}</td>
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

// ======================================================
// DATA VISOR — ahora acepta filtroBadge
// ======================================================
function DataVisor({ title, data, onDownload, color, filtroBadge }) {
  if (!data || !data.length) return null;
  return (
    <div className="bg-white border border-slate-300 shadow-lg rounded-2xl overflow-hidden mb-4">
      <div className={`${color} text-white px-6 py-3 flex justify-between items-center`}>
        <div className="flex flex-col">
          <h3 className="text-[10px] font-black tracking-[0.2em] uppercase flex items-center gap-1">
            {title}
            {filtroBadge}
          </h3>
          <span className="text-[8px] font-bold opacity-60 italic uppercase">MOSTRANDO ÚLTIMOS {Math.min(data.length, 30)} DE {data.length} REGISTROS</span>
        </div>
        <button onClick={onDownload} className="text-[9px] bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded-full font-black backdrop-blur-sm transition-all border border-white/10 flex items-center gap-2 uppercase">⬇️ DESCARGAR EXCEL</button>
      </div>
      <div className="max-h-56 overflow-auto text-[9px] font-bold text-slate-600 font-mono">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-100 sticky top-0 border-b border-slate-300 z-10 shadow-sm">
            <tr>{Object.keys(data[0]).map(h => <th key={h} className="px-4 py-2 border-r border-slate-200 text-[8px] text-slate-400 font-black uppercase">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.slice(0, 30).map((row, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                {Object.values(row).map((v, j) => <td key={j} className="px-4 py-2 border-r border-slate-50 truncate max-w-[150px]">{v ?? "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}