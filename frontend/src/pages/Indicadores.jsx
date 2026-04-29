import { useEffect, useState, useMemo, useCallback, useRef, useContext, createContext } from "react";
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, FunnelChart, Funnel, Cell, ReferenceLine, LabelList, Legend
} from 'recharts';

// Contexto para saber si un gráfico está en modo expandido (modal)
const ExpandedCtx = createContext({ isExpanded: false, modalHeight: 500 });

const formatFechaCorta = (fechaStr) => {
  if (!fechaStr) return fechaStr;
  // FIX: maneja tanto "2026-04-01T00:00:00.000Z" como "2026-04-01"
  const str = typeof fechaStr === 'string' ? fechaStr : String(fechaStr);
  const partes = str.split('T')[0].split('-');
  return partes[2] ? String(parseInt(partes[2], 10)) : str;
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
  // FIX: el payload de FunnelChart trae los datos del item directamente
  const nombre = item.payload?.etapa || item.payload?.name || item.name || '';
  const valor  = item.payload?.total ?? item.value ?? 0;
  return (
    <div className="bg-slate-950 border border-slate-700 rounded-xl p-3 shadow-2xl text-[10px] min-w-[150px]">
      <p className="font-black text-white mb-2 uppercase tracking-widest border-b border-slate-700 pb-1">{nombre}</p>
      <div className="flex justify-between gap-4">
        <span className="text-slate-400">TOTAL</span>
        <span className="font-black" style={{ color: item.fill }}>{valor}</span>
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
          <span className="text-[11px] font-black text-slate-800 uppercase tracking-widest italic">{title}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-black transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100">✕</button>
        </div>
        <div className="flex-1 p-6 overflow-auto flex flex-col" style={{ minHeight: 400 }}>
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
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800/80 text-white text-[7px] font-black px-2 py-0.5 rounded-md pointer-events-none">
          ⛶ EXPANDIR
        </div>
      </div>
      <ChartModal open={open} onClose={() => setOpen(false)} title={title}>
        <ExpandedCtx.Provider value={{ isExpanded: true, modalHeight }}>
          {children}
        </ExpandedCtx.Provider>
      </ChartModal>
    </>
  );
}

// Wrapper de área de gráfica:
// - Vista normal  → altura fija h px
// - Modal expandido → altura modalHeight (explícita en px para que ResponsiveContainer funcione)
function ChartArea({ h = 300, children }) {
  const { isExpanded, modalHeight } = useContext(ExpandedCtx);
  return <div style={{ height: isExpanded ? modalHeight : h }}>{children}</div>;
}

// ======================================================
// BARRA SEMÁFORO — color dinámico según cumplimiento
// ======================================================
const BarraSemaforo = (props) => {
  const { x, y, width, height, total, meta = 65 } = props;
  const cumple = Number(total) >= meta;
  const pct    = meta > 0 ? Math.min(Number(total) / meta, 1) : 0;
  const color  = cumple ? '#10b981' : pct >= 0.8 ? '#f59e0b' : '#ef4444';
  return <rect x={x} y={y} width={width} height={height} fill={color} rx={2} />;
};

/** Multi-select dropdown para Campaña/Origen */
function MultiSelectCanal({ value = [], onChange, options = [], accentColor = "blue" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const toggle = (opt) => {
    if (value.includes(opt)) onChange(value.filter(v => v !== opt));
    else onChange([...value, opt]);
  };
  const btnCls = `w-full text-left bg-slate-50 border border-slate-200 rounded-lg px-3 py-[9px] text-[9px] font-bold text-slate-600 flex justify-between items-center gap-1 hover:border-${accentColor}-300 transition-colors`;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className={btnCls}>
        <span className="truncate">{value.length === 0 ? 'TODAS LAS CAMPAÑAS' : value.length === 1 ? value[0] : `${value.length} SELECCIONADAS`}</span>
        <span className={`text-${accentColor}-400 text-[8px] shrink-0`}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
          {value.length > 0 && (
            <button onClick={() => onChange([])} className="w-full text-left px-3 py-2 text-[8px] font-black text-red-500 hover:bg-red-50 border-b border-slate-100 uppercase">
              ✕ Limpiar selección
            </button>
          )}
          {options.map((opt, i) => (
            <label key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-[9px] font-bold text-slate-700 border-b border-slate-50 last:border-0">
              <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)}
                className={`accent-${accentColor}-500 w-3 h-3 shrink-0`} />
              <span className="truncate">{opt}</span>
            </label>
          ))}
          {options.length === 0 && <div className="px-3 py-3 text-[9px] text-slate-400 uppercase">Sin opciones</div>}
        </div>
      )}
    </div>
  );
}

export default function ReporteComercialCore() {
  const [tabActiva, setTabActiva]       = useState("GENERAL");
  const [loading, setLoading]           = useState(false);
  const [alertas, setAlertas]           = useState([]);
  const [diaFiltrado, setDiaFiltrado]   = useState(null);
  const [data, setData]                 = useState({ supervisores: [], asesores: [], dataCRM: [], dataNetlife: [], estadosNetlife: [], graficoEmbudo: [], graficoBarrasDia: [], etapasCRM: [], etapasJotform: [], porcentajeTerceraEdad: 0, porcentajeTarjeta: 0 });
  const [monitoreoData, setMonitoreoData]     = useState({ supervisores: [], asesores: [] });
  const [reporte180Data, setReporte180Data]   = useState({ kpis: { ingresos_jot: 0, ventas_activas: 0, pct_descarte: 0, pct_efectividad: 0, pct_tercera_edad: 0 }, embudoCRM: [], embudoJotform: [], mapaCalor: [] });
  const [filtros, setFiltros]           = useState({ fechaDesde: getFechaHoyEcuador(), fechaHasta: getFechaHoyEcuador(), asesor: "", supervisor: "", estadoNetlife: "", estadoRegularizacion: "", etapaCRM: "", etapaJotform: "", canal: [] });
  // filtrosAplicados = los que realmente usa la consulta; solo se actualizan al presionar "APLICAR FILTROS"
  const [filtrosAplicados, setFiltrosAplicados] = useState({ fechaDesde: getFechaHoyEcuador(), fechaHasta: getFechaHoyEcuador(), asesor: "", supervisor: "", estadoNetlife: "", estadoRegularizacion: "", etapaCRM: "", etapaJotform: "", canal: [] });
  const [filtros180, setFiltros180]     = useState({ fechaDesde: getFechaHoyEcuador(), fechaHasta: getFechaHoyEcuador(), asesor: "", supervisor: "", estadoNetlife: "", estadoRegularizacion: "", etapaCRM: "", etapaJotform: "" });

  // Ref para cancelar fetches anteriores (evita loading stuck y race conditions)
  const abortRef = useRef(null);
  // Ref para el pre-fetch en background (no bloquea UI)
  const prefetchRef = useRef(null);

  // Listas estables para los dropdowns — nunca se borran al filtrar
  const [allSupervisores, setAllSupervisores] = useState([]);
  const [allAsesores,     setAllAsesores]     = useState([]);

  const nombresAsesores = useMemo(
    () => [...allAsesores].sort((a, b) => (a.nombre_grupo > b.nombre_grupo ? 1 : -1)),
    [allAsesores]
  );

  const mostrarAlertas = (supervisores) => {
    const nuevasAlertas = [];
    const supEficienciaBaja = (supervisores || []).filter(s => Number(s.eficiencia) < 5);
    if (supEficienciaBaja.length > 0) nuevasAlertas.push({ id: 1, mensaje: `⚠️ ATENCIÓN: ${supEficienciaBaja.length} SUPERVISOR(ES) CON EFICIENCIA MENOR AL 5%`, color: "bg-red-600 border-red-400", duracion: 5000 });
    const supVentasBajas = (supervisores || []).filter(s => Number(s.ingresos_reales) < 2);
    if (supVentasBajas.length > 0) nuevasAlertas.push({ id: 2, mensaje: `📉 ${supVentasBajas.length} SUPERVISOR(ES) CON MENOS DE 2 VENTAS JOT: ${supVentasBajas.map(s => s.nombre_grupo).join(", ")}`, color: "bg-amber-600 border-amber-400", duracion: 7000 });
    if (nuevasAlertas.length > 0) { setAlertas(nuevasAlertas); nuevasAlertas.forEach(a => setTimeout(() => setAlertas(prev => prev.filter(x => x.id !== a.id)), a.duracion)); }
  };

  // ── Pre-fetch silencioso ─────────────────────────────────────────────────
  // Dispara las otras 2 tabs en background una vez que el dashboard cargó.
  // No actualiza estado de loading — el usuario no lo nota. Sólo "calienta"
  // el caché del servidor (2 min TTL). Si el usuario cambia de tab mientras
  // sigue corriendo, el fetch activo se cancela y la tab carga desde caché.
  const prefetchBackground = useCallback((filtrosActivos) => {
    if (prefetchRef.current) prefetchRef.current.abort();
    const ctrl = new AbortController();
    prefetchRef.current = ctrl;
    const pMon = new URLSearchParams(
      Object.fromEntries(
        Object.entries({ asesor: filtrosActivos.asesor, supervisor: filtrosActivos.supervisor })
          .filter(([_, v]) => v !== "")
      )
    );
    const p180 = new URLSearchParams(Object.fromEntries(Object.entries(filtrosActivos).filter(([_, v]) => v !== "")));
    // Fire-and-forget: no await, no setLoading
    Promise.allSettled([
      fetch(`${import.meta.env.VITE_API_URL}/api/indicadores/monitoreo-diario?${pMon}`, { signal: ctrl.signal }),
      fetch(`${import.meta.env.VITE_API_URL}/api/indicadores/reporte180?${p180}`, { signal: ctrl.signal }),
    ]).catch(() => {});
  }, []);

  const fetchDashboard = async (filtrosOverride) => {
    // Cancela fetch anterior para evitar race conditions / loading stuck
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const filtrosActivos = filtrosOverride || filtrosAplicados;
      const p = new URLSearchParams(Object.fromEntries(
        Object.entries(filtrosActivos)
          .filter(([_, v]) => Array.isArray(v) ? v.length > 0 : v !== "")
          .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])
      ));
      const res    = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores/dashboard?${p}`, { signal: ctrl.signal });
      const result = await res.json();
      if (result.success) {
        setData({
          ...result,
          porcentajeTarjeta:     Number(result.porcentajeTarjeta ?? 0),
          porcentajeTerceraEdad: Number(result.porcentajeTerceraEdad ?? 0),
        });
        if (!filtrosActivos.supervisor && !filtrosActivos.asesor) {
          if (result.supervisores?.length) setAllSupervisores(result.supervisores);
          if (result.asesores?.length)     setAllAsesores(result.asesores);
        }
        mostrarAlertas(result.supervisores);
        // Pre-calentar las otras tabs en background (sin bloquear UI)
        prefetchBackground(filtrosActivos);
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.error("Error Dashboard:", e);
    } finally { if (!ctrl.signal.aborted) setLoading(false); }
  };

  const fetchMonitoreo = async (filtrosOverride) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const filtrosActivos = filtrosOverride || filtrosAplicados;
      const p = new URLSearchParams(
        Object.fromEntries(
          Object.entries({ asesor: filtrosActivos.asesor, supervisor: filtrosActivos.supervisor })
            .filter(([_, v]) => v !== "")
        )
      );
      const res    = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores/monitoreo-diario?${p}`, { signal: ctrl.signal });
      const result = await res.json();
      if (result.success) setMonitoreoData(result);
    } catch (e) {
      if (e.name !== 'AbortError') console.error("Error Monitoreo:", e);
    } finally { if (!ctrl.signal.aborted) setLoading(false); }
  };

  const fetchReporte180 = async (filtrosOverride) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const filtrosActivos = filtrosOverride || filtros180;
      const p = new URLSearchParams(Object.fromEntries(
        Object.entries(filtrosActivos)
          .filter(([_, v]) => Array.isArray(v) ? v.length > 0 : v !== "")
          .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])
      ));
      const res    = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores/reporte180?${p}`, { signal: ctrl.signal });
      const result = await res.json();
      if (result.success) setReporte180Data(result);
    } catch (e) {
      if (e.name !== 'AbortError') console.error("Error Reporte180:", e);
    } finally { if (!ctrl.signal.aborted) setLoading(false); }
  };

  // updateFiltro solo actualiza el estado visual; la consulta se ejecuta al presionar "APLICAR FILTROS"
  const updateFiltro = (campo, valor) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
  };

  // Click en tarjeta de JotForm: aplica el filtro inmediatamente (acción interactiva intencional)
  const handleClickTarjetaJotform = (estado) => {
    const nuevosFiltros = { ...filtros, etapaJotform: estado };
    setFiltros(nuevosFiltros);
    setFiltrosAplicados(nuevosFiltros);
    fetchDashboard(nuevosFiltros);
  };

  const handleClickBarra = (data) => {
    if (!data?.activePayload) return;
    const fecha = data?.activeLabel;
    setDiaFiltrado(prev => prev === fecha ? null : fecha);
  };

  // ─── Informe Gerencial 360° ────────────────────────────────────────────────
  const generarInforme360 = () => {
    const hoy = new Date();
    const DIAS  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const diaActual   = DIAS[hoy.getDay()];
    const fechaStr    = `${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}`;
    const horaStr     = hoy.toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'});
    const esFinDeSemana = hoy.getDay()===0||hoy.getDay()===6;
    const esSabado      = hoy.getDay()===6;
    const manana        = new Date(hoy); manana.setDate(hoy.getDate()+1);
    const diaManana     = DIAS[manana.getDay()];
    const mananaEsFDS   = manana.getDay()===0||manana.getDay()===6;
    const mananaEsSabado= manana.getDay()===6;
    const esPrevioFDS   = hoy.getDay()===5;

    // ── Métricas de tiempo para proyección ───────────────────────────────────
    const horaActual = hoy.getHours()+hoy.getMinutes()/60;
    const INICIO=8, FIN=18;
    const pctDia  = Math.min(1,Math.max(0.05,(horaActual-INICIO)/(FIN-INICIO)));
    const META_DIA = 65;
    const factorFDS = esSabado?0.60:0.28;
    const factorHoy = esFinDeSemana?factorFDS:1.0;
    const factorManana = mananaEsFDS?(mananaEsSabado?0.60:0.28):1.0;
    const metaAjustadaHoy  = Math.round(META_DIA*factorHoy);
    const metaAHora        = Math.round(metaAjustadaHoy*pctDia);
    const proyeccionCierre = pctDia>0?Math.round(Number(stats.ingresosJotform||0)/pctDia):Number(stats.ingresosJotform||0);
    const proyeccionManana = Math.round(META_DIA*factorManana);

    // ── KPIs macro ───────────────────────────────────────────────────────────
    const totLeads     = Number(stats.leadsGestionables||0);
    const totGest      = Number(stats.gestionables||0);
    const totVentasCRM = Number(stats.ingresosCRM||0);
    const totJOT       = Number(stats.ingresosJotform||0);
    const totActivos   = Number(stats.activas||0);
    const totBacklog   = Number(stats.backlog||0);
    const pctEfect     = Number(stats.efectividad||0);
    const pctInst      = Number(stats.tasaInstalacion||0);
    const pctDesc      = Number(stats.descartePorc||0);
    const pctEfic      = Number(stats.efectividadActivasPauta||0);
    const pctTjt       = Number(stats.tarjetaCredito||0);
    const pct3ed       = Number(stats.terceraEdad||0);
    const totReg       = Number(stats.regularizar||0);
    const convCRM_JOT  = totVentasCRM>0?((totJOT/totVentasCRM)*100).toFixed(1):'—';
    const convLead_JOT = totLeads>0?((totJOT/totLeads)*100).toFixed(1):'—';
    const brechaJOT    = totJOT - metaAHora;
    const estadoDia    = brechaJOT>=0?'🟢 EN META':brechaJOT>=-8?'🟡 EN RIESGO':'🔴 BAJO META';
    const colorEstado  = brechaJOT>=0?'#059669':brechaJOT>=-8?'#d97706':'#dc2626';
    const bgEstado     = brechaJOT>=0?'#f0fdf4':brechaJOT>=-8?'#fffbeb':'#fef2f2';
    const borderEstado = brechaJOT>=0?'#10b981':brechaJOT>=-8?'#f59e0b':'#ef4444';

    const sf = (v,g,w)=>v>=g?'#059669':v>=w?'#d97706':'#dc2626';
    const f1 = v=>isNaN(Number(v))?'—':Number(v).toFixed(1);
    const f0 = v=>isNaN(Number(v))?'—':Number(v).toFixed(0);

    // ── Supervisores ─────────────────────────────────────────────────────────
    const sups = [...(data.supervisores||[])].filter(s=>s.nombre_grupo);
    const supsOrd = [...sups].sort((a,b)=>Number(b.ingresos_reales)-Number(a.ingresos_reales));
    const top3 = supsOrd.slice(0,3);
    const bot3 = [...supsOrd].reverse().slice(0,3).filter(s=>Number(s.ingresos_reales||0)<Number(supsOrd[0]?.ingresos_reales||99));

    // ── Asesores (top 25 por JOT) ────────────────────────────────────────────
    const asesoresPDF = [...(data.asesores||[])].filter(a=>a.nombre_grupo)
      .sort((a,b)=>Number(b.ingresos_reales)-Number(a.ingresos_reales)).slice(0,25);

    // ── Embudo CRM (top 8 etapas) ────────────────────────────────────────────
    const embudo = [...(data.graficoEmbudo||[])].sort((a,b)=>Number(b.total)-Number(a.total)).slice(0,8);
    const totEmbudo = embudo.reduce((s,e)=>s+Number(e.total||0),0)||1;

    // ── Estados JOT ──────────────────────────────────────────────────────────
    const estadosJOT = (data.estadosNetlife||[]).slice(0,6);
    const totEstJOT  = estadosJOT.reduce((s,e)=>s+Number(e.total||0),0)||1;

    // ── Plan de acción ───────────────────────────────────────────────────────
    const acciones = [];
    if(brechaJOT<-8)  acciones.push({i:'🔴',t:'Activar recuperación urgente',d:`Brecha de ${Math.abs(brechaJOT)} JOT vs meta horaria. Asignar leads sin gestión a equipo de refuerzo inmediatamente.`});
    if(pctEfect<30)   acciones.push({i:'🎯',t:'Efectividad crítica (<30%)',d:`Efectividad en ${f1(pctEfect)}%. Convocar sesión de roleplay con supervisores. Revisar script de cierre y objeciones frecuentes.`});
    else if(pctEfect<38) acciones.push({i:'⚠️',t:'Efectividad baja (<38%)',d:`Efectividad en ${f1(pctEfect)}%. Analizar leads no contactados y razones de descarte con supervisores.`});
    if(pctDesc>40)    acciones.push({i:'🔍',t:'Descarte elevado (>40%)',d:`Descarte en ${f1(pctDesc)}%. Ajustar segmentación de campaña y criterios de calificación de leads entrantes.`});
    if(pctInst<80)    acciones.push({i:'🔧',t:'Tasa instalación baja (<80%)',d:`Tasa en ${f1(pctInst)}%. Coordinar urgente con equipo técnico. Revisar agenda de instalaciones pendientes.`});
    if(totReg>5)      acciones.push({i:'📝',t:`${totReg} casos por regularizar`,d:`Priorizar resolución antes del mediodía. Asignar responsable por caso y dar seguimiento en el día.`});
    if(totBacklog>0)  acciones.push({i:'📦',t:`Backlog activo: ${totBacklog} instalaciones`,d:`Instalaciones pendientes de períodos anteriores. Coordinar con técnicos para cierre esta semana.`});
    if(top3[0])       acciones.push({i:'🏆',t:`Replicar metodología de ${top3[0].nombre_grupo}`,d:`Líder con ${Number(top3[0].ingresos_reales||0)} JOT y ${f1(top3[0].efectividad_real)}% efectividad. Organizar sesión de best-practice con el equipo completo.`});
    if(mananaEsFDS)   acciones.push({i:'📅',t:`${diaManana} es fin de semana`,d:`Meta ajustada a ${proyeccionManana} JOT. Activar solo equipo rotativo. Enviar resumen semanal a gerencia hoy antes del cierre.`});
    else if(esPrevioFDS) acciones.push({i:'📊',t:'Cierre semanal hoy',d:`Consolidar métricas CRM+JOT de la semana y enviar reporte a gerencia antes de las 17h. Revisar backlog para el lunes.`});
    else acciones.push({i:'📋',t:`Briefing ${diaManana} 07:45`,d:`Compartir focos del día con supervisores: meta ${proyeccionManana} JOT, asignaciones y leads prioritarios del día.`});
    if(acciones.length<4) acciones.push({i:'✅',t:'Operación estable',d:'Equipo en ritmo adecuado. Mantener cadencia de cierres y supervisar regularizaciones en curso.'});

    const estrategiaTop = (s,i) => {
      const ef=Number(s.efectividad_real||0), jot=Number(s.ingresos_reales||0);
      const inst=Number(s.tasa_instalacion||0), desc=Number(s.descarte||0);
      if(ef>=45) return `Efectividad ${f1(ef)}% — compartir script y proceso de calificación de leads con el equipo.`;
      if(inst>=90) return `Tasa instalación ${f1(inst)}% — excelente seguimiento técnico post-cierre. Documentar proceso.`;
      if(desc<=20) return `Descarte ${f1(desc)}% — alta calidad en contactabilidad. Revisar filtros para replicar en otros equipos.`;
      return `${jot} JOT con efectividad ${f1(ef)}% — replicar timing de contacto y metodología de seguimiento.`;
    };

    const colorEmb = ['#1d4ed8','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#0369a1','#65a30d'];
    const colorJOT = {'ACTIVO':'#059669','PRESERVICIO':'#0891b2','PLANIIFICADO':'#2563eb','RECHAZADO':'#dc2626','DESISTE DEL SERVICIO':'#ef4444'};
    const getColorJOT = e => colorJOT[e]||'#64748b';

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Informe Gerencial 360° · NOVONET · ${fechaStr}</title>
<style>
@page{size:A4;margin:0mm 13mm 10mm;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:8.5pt;color:#0f172a;background:#fff;}
.pb{page-break-before:always;}
.topbar{height:7px;background:linear-gradient(90deg,#1A3A6E 0%,#2563eb 50%,#38bdf8 100%);print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #1A3A6E;padding:8px 0 8px;margin-bottom:10px;}
.hdr-logo{display:flex;align-items:center;gap:9px;}
.hdr-badge{background:#1A3A6E;color:#fff;font-size:10pt;font-weight:900;padding:5px 11px;border-radius:5px;letter-spacing:1px;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.hdr h1{font-size:12.5pt;font-weight:900;color:#1A3A6E;margin:0;}
.hdr p{font-size:6.8pt;color:#64748b;margin-top:2px;}
.hdr-r{text-align:right;font-size:6.8pt;color:#64748b;line-height:1.7;}
.hdr-r .dia{font-size:9pt;font-weight:900;color:#1A3A6E;}
.sec{font-size:7pt;font-weight:900;text-transform:uppercase;letter-spacing:.9px;color:#1A3A6E;border-left:3px solid #2563eb;padding:3px 8px;margin:10px 0 5px;background:#eef4fc;border-radius:0 4px 4px 0;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.sec.warn{color:#92400e;border-color:#f59e0b;background:#fffbeb;}
.sec.danger{color:#991b1b;border-color:#ef4444;background:#fef2f2;}
.sec.green{color:#065f46;border-color:#10b981;background:#ecfdf5;}
.banner{border-radius:7px;padding:7px 12px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:center;gap:10px;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.banner .est{font-size:11pt;font-weight:900;}
.banner .det{font-size:6.8pt;color:#334155;text-align:right;line-height:1.7;}
/* KPI grid 4 columns wide */
.kg4{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:9px;}
.kg6{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-bottom:9px;}
.kc{border-radius:6px;padding:7px 5px;border-width:1px;border-style:solid;text-align:center;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.kc .lbl{font-size:5.3pt;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:2px;letter-spacing:.3px;}
.kc .val{font-size:15pt;font-weight:900;line-height:1.1;}
.kc .sub{font-size:5.3pt;color:#94a3b8;margin-top:2px;}
/* Funnel */
.funnel{display:flex;flex-direction:column;gap:3px;margin-bottom:8px;}
.fstep{display:flex;align-items:center;gap:6px;}
.fbar-wrap{flex:1;background:#e2e8f0;border-radius:3px;height:16px;overflow:hidden;}
.fbar{height:100%;border-radius:3px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
/* Tables */
table{width:100%;border-collapse:collapse;margin-bottom:8px;font-size:7pt;}
th{background:#1A3A6E;color:#fff;font-size:6pt;font-weight:700;padding:5px 3px;text-align:center;text-transform:uppercase;letter-spacing:.3px;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
td{padding:4px 3px;border-bottom:1px solid #dbe8f8;text-align:center;font-size:6.8pt;}
tr:nth-child(even) td{background:#f0f6ff;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.tdn{text-align:left;font-weight:700;color:#0f172a;padding-left:6px;font-size:6.8pt;}
.tot td{background:#1A3A6E!important;color:#fff;font-weight:900;font-size:6.5pt;}
/* Cards sup */
.pgrid2{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:9px;}
.pgrid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:9px;}
.pcard{border-radius:7px;padding:8px 10px;border-width:1px;border-style:solid;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.pcard .pname{font-size:8.5pt;font-weight:900;color:#0f172a;}
.pcard .pmeta{display:flex;gap:8px;margin-top:3px;font-size:6.5pt;color:#475569;flex-wrap:wrap;}
.pcard .ptip{margin-top:5px;font-size:6.5pt;color:#334155;background:#f0f6ff;border-radius:4px;padding:4px 7px;border-left:2px solid #2563eb;}
/* Acción */
.aitem{display:flex;gap:7px;padding:5px 6px;border-bottom:1px solid #e2e8f0;font-size:7.5pt;align-items:flex-start;border-radius:3px;margin-bottom:2px;}
.aitem .ai{min-width:18px;font-size:9pt;}
.aitem .at{font-weight:900;color:#1A3A6E;display:block;font-size:7pt;}
.aitem .ad{color:#475569;font-size:6.8pt;}
/* Proyección */
.pcrd{border-radius:8px;padding:9px 12px;border-width:1px;border-style:solid;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.pcrd .pl{font-size:5.8pt;font-weight:900;text-transform:uppercase;margin-bottom:3px;letter-spacing:.4px;}
.pcrd .pv{font-size:20pt;font-weight:900;line-height:1.05;}
.pcrd .pd{font-size:6.2pt;margin-top:3px;color:#475569;line-height:1.5;}
/* Footer */
.ftr{margin-top:10px;padding-top:5px;border-top:2px solid #1A3A6E;font-size:6.3pt;color:#64748b;display:flex;justify-content:space-between;align-items:center;}
.ftr-logo{font-weight:900;color:#1A3A6E;letter-spacing:.5px;font-size:6.8pt;}
/* Pill badge */
.pill{display:inline-block;padding:1px 5px;border-radius:20px;font-size:5.5pt;font-weight:700;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
</style></head><body>

<!-- ═══════════ PÁGINA 1 — DASHBOARD EJECUTIVO ═══════════ -->
<div class="topbar"></div>
<div class="hdr">
  <div class="hdr-logo">
    <span class="hdr-badge">NOVO ERP</span>
    <div><h1>INFORME GERENCIAL 360°</h1><p>Gestión Comercial · CRM + JOT · Novonet · Uso Confidencial</p></div>
  </div>
  <div class="hdr-r">
    <div class="dia">${diaActual.toUpperCase()}, ${fechaStr}</div>
    <div>Generado: ${horaStr} &nbsp;·&nbsp; Período: ${filtros.fechaDesde} → ${filtros.fechaHasta}</div>
    <div>Responsable: Gerencia Comercial &nbsp;·&nbsp; Clasificación: CONFIDENCIAL</div>
  </div>
</div>

<div class="banner" style="background:${bgEstado};border:1.5px solid ${borderEstado};">
  <div>
    <div class="est" style="color:${colorEstado}">${estadoDia}</div>
    <div style="font-size:6.5pt;color:#334155;margin-top:2px">${esFinDeSemana?`⚠️ ${diaActual} — meta ajustada al ${Math.round(factorHoy*100)}% por fin de semana`:'Jornada laboral en curso'}</div>
  </div>
  <div style="text-align:center">
    <div style="font-size:16pt;font-weight:900;color:${colorEstado}">${totJOT}</div>
    <div style="font-size:6pt;color:#475569;font-weight:700">INGRESOS JOT</div>
  </div>
  <div style="text-align:center">
    <div style="font-size:16pt;font-weight:900;color:#2563eb">${metaAHora}</div>
    <div style="font-size:6pt;color:#475569;font-weight:700">META A ${horaStr}</div>
  </div>
  <div style="text-align:center">
    <div style="font-size:16pt;font-weight:900;color:${brechaJOT>=0?'#059669':'#dc2626'}">${brechaJOT>=0?'+':''}${brechaJOT}</div>
    <div style="font-size:6pt;color:#475569;font-weight:700">BRECHA</div>
  </div>
  <div style="text-align:center">
    <div style="font-size:16pt;font-weight:900;color:#7c3aed">${proyeccionCierre}</div>
    <div style="font-size:6pt;color:#475569;font-weight:700">PROY. CIERRE</div>
  </div>
</div>

<div class="sec">📊 KPIs Estratégicos — CRM &amp; JOT</div>
<div class="kg6">
${[
  {l:'Leads CRM',v:totLeads,c:'#1d4ed8',bg:'#eff6ff',sub:'total período'},
  {l:'Gestionables',v:totGest,c:'#7c3aed',bg:'#faf5ff',sub:`${totLeads>0?((totGest/totLeads)*100).toFixed(0):'—'}% del total`},
  {l:'Ventas CRM',v:totVentasCRM,c:'#0891b2',bg:'#f0f9ff',sub:'etapa V.SUBIDA'},
  {l:'Ingresos JOT',v:totJOT,c:brechaJOT>=0?'#059669':'#dc2626',bg:brechaJOT>=0?'#f0fdf4':'#fef2f2',sub:`meta día: ${metaAjustadaHoy}`},
  {l:'Activos Mes',v:totActivos-totBacklog,c:'#16a34a',bg:'#f0fdf4',sub:`+${totBacklog} backlog`},
  {l:'Conv. Lead→JOT',v:`${convLead_JOT}%`,c:'#d97706',bg:'#fffbeb',sub:'conversión total'},
].map(k=>`<div class="kc" style="background:${k.bg};border-color:${k.c}40"><div class="lbl">${k.l}</div><div class="val" style="color:${k.c}">${k.v}</div><div class="sub">${k.sub}</div></div>`).join('')}
</div>
<div class="kg6">
${[
  {l:'Efectividad',v:`${f1(pctEfect)}%`,c:sf(pctEfect,40,28),bg:'#f8fafc',sub:'JOT / gestionables'},
  {l:'Tasa Instal.',v:`${f1(pctInst)}%`,c:sf(pctInst,88,75),bg:'#f8fafc',sub:'activos / JOT'},
  {l:'Descarte',v:`${f1(pctDesc)}%`,c:pctDesc<=30?'#059669':pctDesc<=40?'#d97706':'#dc2626',bg:'#f8fafc',sub:'≤30% óptimo'},
  {l:'Efic. vs Pauta',v:`${f1(pctEfic)}%`,c:sf(pctEfic,20,12),bg:'#f8fafc',sub:'activos / leads'},
  {l:'Tarjeta Créd.',v:`${f1(pctTjt)}%`,c:'#0891b2',bg:'#f0f9ff',sub:'% sobre JOT'},
  {l:'Por Regular.',v:totReg,c:totReg>5?'#dc2626':totReg>0?'#d97706':'#059669',bg:totReg>5?'#fef2f2':totReg>0?'#fffbeb':'#f0fdf4',sub:totReg>0?'atención requerida':'sin pendientes'},
].map(k=>`<div class="kc" style="background:${k.bg};border-color:${k.c}40"><div class="lbl">${k.l}</div><div class="val" style="color:${k.c}">${k.v}</div><div class="sub">${k.sub}</div></div>`).join('')}
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
  <div>
    <div class="sec" style="margin-top:4px">🔽 Embudo CRM — Etapas de Negociación</div>
    <div class="funnel">
    ${embudo.map((e,i)=>{
      const pct=((Number(e.total)/totEmbudo)*100).toFixed(1);
      const w=Math.max(8,Math.round(Number(e.total)/totEmbudo*100));
      const col=colorEmb[i%colorEmb.length];
      const nom=(e.etapa||'—').length>28?(e.etapa||'—').substring(0,27)+'…':(e.etapa||'—');
      return`<div class="fstep"><div style="width:145px;font-size:5.5pt;text-align:right;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${e.etapa||''}">${nom}</div><div class="fbar-wrap"><div class="fbar" style="width:${w}%;background:${col}"><span style="color:#fff;font-size:5.3pt;font-weight:900">${e.total}</span></div></div><span style="font-size:5.5pt;color:#64748b;width:30px;text-align:right">${pct}%</span></div>`;
    }).join('')}
    </div>
  </div>
  <div>
    <div class="sec" style="margin-top:4px">📋 Estados JOT — Netlife</div>
    <div class="funnel">
    ${estadosJOT.map((e,i)=>{
      const pct=((Number(e.total)/totEstJOT)*100).toFixed(1);
      const w=Math.max(8,Math.round(Number(e.total)/totEstJOT*100));
      const col=getColorJOT(e.estado);
      return`<div class="fstep"><div style="width:110px;font-size:5.5pt;text-align:right;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(e.estado||'—').substring(0,22)}</div><div class="fbar-wrap"><div class="fbar" style="width:${w}%;background:${col}"><span style="color:#fff;font-size:5.3pt;font-weight:900">${e.total}</span></div></div><span style="font-size:5.5pt;color:#64748b;width:30px;text-align:right">${pct}%</span></div>`;
    }).join('')}
    </div>
    <div style="margin-top:6px;padding:5px 8px;background:#f0f9ff;border-radius:5px;border-left:2px solid #0891b2">
      <div style="font-size:6pt;font-weight:900;color:#0891b2;margin-bottom:2px">CONVERSIÓN CRM → JOT</div>
      <div style="display:flex;gap:12px;font-size:6.5pt;color:#334155">
        <span>Ventas CRM → JOT: <b>${convCRM_JOT}%</b></span>
        <span>Lead → JOT: <b>${convLead_JOT}%</b></span>
        <span>Backlog activo: <b>${totBacklog}</b></span>
      </div>
    </div>
  </div>
</div>
<div class="ftr"><span class="ftr-logo">▌ NOVO ERP · NOVONET</span><span>Informe Gerencial 360° · CRM + JOT · Confidencial · Uso Gerencial</span><span>Pág. 1 / 4 · ${fechaStr}</span></div>

<!-- ═══════════ PÁGINA 2 — SUPERVISORES CRM + JOT ═══════════ -->
<div class="pb">
<div class="topbar"></div>
<div class="hdr">
  <div class="hdr-logo"><span class="hdr-badge">NOVO ERP</span>
    <div><h1>RENDIMIENTO POR SUPERVISOR</h1><p>CRM + JOT · Novonet · ${diaActual} ${fechaStr}</p></div>
  </div>
  <div class="hdr-r"><div class="dia">Período: ${filtros.fechaDesde} → ${filtros.fechaHasta}</div><div>Para: Gerencia y Coordinadores · Confidencial</div></div>
</div>

<div class="sec">📋 Evaluación Integral — CRM + JOT por Supervisor</div>
<table>
  <thead>
    <tr>
      <th style="text-align:left;padding-left:6px;min-width:140px">Supervisor</th>
      <th title="Leads totales CRM">Leads</th>
      <th title="Leads gestionables">Gest.</th>
      <th title="Ventas subidas CRM">V.CRM</th>
      <th title="Ingresos JOT" style="background:#065f46">JOT</th>
      <th title="Activos mismo mes" style="background:#065f46">Activ.</th>
      <th title="Backlog">Bklog</th>
      <th title="Efectividad JOT/Gestionables">Efect%</th>
      <th title="Tasa instalación">Inst%</th>
      <th title="Descarte">Desc%</th>
      <th title="Eficiencia vs pauta">Efic%</th>
      <th title="Por regularizar">Regul</th>
      <th>Est.</th>
    </tr>
  </thead>
  <tbody>
  ${sups.slice(0,14).map((s,i)=>{
    const leads=Number(s.leads_totales||0);
    const gest=Number(s.gestionables||0);
    const vcrm=Number(s.ventas_crm||0);
    const jot=Number(s.ingresos_reales||0);
    const act=Number(s.real_mes||0);
    const bk=Number(s.backlog||0);
    const ef=Number(s.efectividad_real||0);
    const inst=Number(s.tasa_instalacion||0);
    const desc=Number(s.descarte||0);
    const efic=Number(s.eficiencia||0);
    const reg=Number(s.por_regularizar||0);
    const est=jot>=12?'🟢':jot>=6?'🟡':'🔴';
    const bg=i%2===1?'background:#f0f6ff;':'';
    return`<tr style="${bg}">
      <td class="tdn">${s.nombre_grupo||'—'}</td>
      <td>${leads}</td>
      <td>${gest}</td>
      <td style="color:#0891b2;font-weight:700">${vcrm}</td>
      <td style="color:${sf(jot,12,6)};font-weight:900;background:${jot>=12?'#f0fdf4':jot>=6?'#fffbeb':'#fef2f2'}">${jot}</td>
      <td style="color:#059669;font-weight:700">${act}</td>
      <td style="color:${bk>3?'#d97706':'#64748b'}">${bk}</td>
      <td style="color:${sf(ef,40,28)};font-weight:700">${f1(ef)}%</td>
      <td style="color:${sf(inst,88,75)};font-weight:700">${f1(inst)}%</td>
      <td style="color:${desc<=30?'#059669':desc<=40?'#d97706':'#dc2626'}">${f1(desc)}%</td>
      <td style="color:${sf(efic,20,12)}">${f1(efic)}%</td>
      <td style="color:${reg>2?'#dc2626':reg>0?'#d97706':'#64748b'}">${reg}</td>
      <td>${est}</td>
    </tr>`;
  }).join('')}
  <tr class="tot">
    <td class="tdn" style="color:#fff">▶ TOTAL / PROM.</td>
    <td>${totLeads}</td>
    <td>${totGest}</td>
    <td>${totVentasCRM}</td>
    <td>${totJOT}</td>
    <td>${totActivos-totBacklog}</td>
    <td>${totBacklog}</td>
    <td>${f1(pctEfect)}%</td>
    <td>${f1(pctInst)}%</td>
    <td>${f1(pctDesc)}%</td>
    <td>${f1(pctEfic)}%</td>
    <td>${totReg}</td>
    <td>—</td>
  </tr>
  </tbody>
</table>

<div class="sec green">🏆 TOP 3 — Estrategia a Replicar</div>
<div class="pgrid3">
${top3.map((s,i)=>{
  const jot=Number(s.ingresos_reales||0),gest=Number(s.gestionables||0);
  const ef=Number(s.efectividad_real||0),inst=Number(s.tasa_instalacion||0);
  const vcrm=Number(s.ventas_crm||0);
  const clr=['#059669','#0284c7','#7c3aed'][i];
  const bg=['#f0fdf4','#f0f9ff','#faf5ff'][i];
  const bc=['#10b981','#38bdf8','#a78bfa'][i];
  return`<div class="pcard" style="background:${bg};border-color:${bc}">
    <div style="display:flex;align-items:center;gap:6px">
      <span style="font-size:13pt;font-weight:900;color:${clr}">#${i+1}</span>
      <div><div class="pname">${s.nombre_grupo||'—'}</div>
      <div class="pmeta"><span>JOT: <b>${jot}</b></span><span>CRM: <b>${vcrm}</b></span><span>Efect: <b>${f1(ef)}%</b></span><span>Inst: <b>${f1(inst)}%</b></span></div></div>
    </div>
    <div class="ptip" style="border-color:${bc}">💡 ${estrategiaTop(s,i)}</div>
  </div>`;
}).join('')}
</div>
<div class="sec danger">🚨 Focos de Intervención</div>
<div class="pgrid3">
${bot3.slice(0,3).map(s=>{
  const jot=Number(s.ingresos_reales||0),ef=Number(s.efectividad_real||0);
  const desc=Number(s.descarte||0),inst=Number(s.tasa_instalacion||0);
  const causas=[];
  if(ef<20) causas.push(`Efectividad ${f1(ef)}% — revisar script y proceso de cierre`);
  if(desc>40) causas.push(`Descarte ${f1(desc)}% — calidad de leads o contactabilidad baja`);
  if(inst<75) causas.push(`Instalación ${f1(inst)}% — revisar coordinación técnica`);
  if(jot<4) causas.push(`Producción mínima (${jot} JOT) — acompañamiento directo urgente`);
  if(!causas.length) causas.push(`Métricas bajo el promedio del equipo — agendar reunión 1:1`);
  return`<div class="pcard" style="background:#fef2f2;border-color:#fca5a5">
    <div style="display:flex;align-items:center;gap:6px">
      <span style="font-size:12pt;font-weight:900;color:#dc2626">⚠️</span>
      <div><div class="pname">${s.nombre_grupo||'—'}</div>
      <div class="pmeta"><span>JOT: <b style="color:#dc2626">${jot}</b></span><span>Efect: <b style="color:#dc2626">${f1(ef)}%</b></span><span>Desc: <b style="color:#dc2626">${f1(desc)}%</b></span></div></div>
    </div>
    <div class="ptip" style="border-color:#ef4444;background:#fff5f5">🔧 ${causas[0]}</div>
  </div>`;
}).join('')}
</div>
<div class="ftr"><span class="ftr-logo">▌ NOVO ERP · NOVONET</span><span>Informe Gerencial 360° · Confidencial · Generado: ${horaStr}</span><span>Pág. 2 / 4 · ${fechaStr}</span></div>
</div>

<!-- ═══════════ PÁGINA 3 — ESTRATEGIA & PLAN DE ACCIÓN ═══════════ -->
<div class="pb">
<div class="topbar"></div>
<div class="hdr">
  <div class="hdr-logo"><span class="hdr-badge">NOVO ERP</span>
    <div><h1>ANÁLISIS ESTRATÉGICO &amp; PLAN DE ACCIÓN</h1><p>Novonet · ${diaActual} ${fechaStr}</p></div>
  </div>
  <div class="hdr-r"><div class="dia">Para: Gerencia General &amp; Coordinadores</div><div>Confidencial · Uso Interno</div></div>
</div>

<div class="sec">🔮 Proyección Operativa</div>
<div class="pgrid2" style="margin-bottom:10px">
  <div class="pcrd" style="background:#f0f9ff;border-color:#38bdf8">
    <div class="pl" style="color:#0369a1">📈 Cierre Estimado Hoy</div>
    <div class="pv" style="color:#0369a1">${proyeccionCierre} JOT</div>
    <div class="pd">
      Ritmo: ${totJOT} JOT en el ${(pctDia*100).toFixed(0)}% del día · Meta ajustada: ${metaAjustadaHoy}${esFinDeSemana?' (FDS)':''}<br/>
      Ventas CRM registradas: ${totVentasCRM} · Conversión CRM→JOT: ${convCRM_JOT}%<br/>
      ${brechaJOT>=0?'✅ Tendencia positiva — mantener cadencia de cierres':'⚠️ Acelerar ritmo — priorizar leads con alta intención de compra'}
    </div>
  </div>
  <div class="pcrd" style="background:${mananaEsFDS?'#fffbeb':'#f0fdf4'};border-color:${mananaEsFDS?'#fbbf24':'#10b981'}">
    <div class="pl" style="color:${mananaEsFDS?'#92400e':'#065f46'}">🎯 Meta ${diaManana}</div>
    <div class="pv" style="color:${mananaEsFDS?'#d97706':'#059669'}">${proyeccionManana} JOT</div>
    <div class="pd">
      ${mananaEsFDS?`⚠️ Fin de semana — factor ${Math.round(factorManana*100)}% aplicado<br/>Priorizar leads de alta intención sobre volumen<br/>Activar solo equipo rotativo`:`📅 Jornada completa — meta estándar ${META_DIA} JOT<br/>Briefing 07:45 con supervisores — asignaciones del día<br/>Revisar backlog y regularizaciones pendientes`}
    </div>
  </div>
</div>

<div class="sec">⚡ Plan de Acción Gerencial — ${diaManana.toUpperCase()}</div>
${acciones.slice(0,7).map((a,i)=>`
<div class="aitem" style="background:${i%2===0?'#f8fafc':'white'}">
  <span class="ai">${a.i}</span>
  <div><span class="at">${i+1}. ${a.t}</span><span class="ad">${a.d}</span></div>
</div>`).join('')}

<div class="sec warn" style="margin-top:9px">📐 Análisis de Eficiencia Comercial</div>
<table>
  <thead><tr>
    <th style="text-align:left;padding-left:6px">Indicador</th>
    <th>Valor Actual</th>
    <th>Benchmark</th>
    <th>Estado</th>
    <th style="text-align:left;padding-left:6px">Interpretación Gerencial</th>
  </tr></thead>
  <tbody>
  ${[
    {ind:'Efectividad (JOT/Gestionables)',val:`${f1(pctEfect)}%`,bench:'≥40%',ok:pctEfect>=40,int:pctEfect>=40?'Equipo convierte por encima del estándar. Mantener y documentar proceso.':pctEfect>=28?'Brecha moderada. Revisar calidad de leads y proceso de seguimiento.':'Efectividad crítica. Intervención inmediata en proceso de cierre.'},
    {ind:'Tasa de Instalación (Activos/JOT)',val:`${f1(pctInst)}%`,bench:'≥88%',ok:pctInst>=88,int:pctInst>=88?'Excelente retención post-cierre. Coordinación técnica eficiente.':pctInst>=75?'Nivel aceptable con margen de mejora en seguimiento técnico.':'Alto riesgo de churn. Revisar proceso técnico y satisfacción del cliente.'},
    {ind:'Descarte sobre Gestionables',val:`${f1(pctDesc)}%`,bench:'≤30%',ok:pctDesc<=30,int:pctDesc<=30?'Calidad de leads y contactabilidad en rango óptimo.':pctDesc<=40?'Descarte moderado. Revisar segmentación de campaña.':'Descarte alto. Ajustar fuentes de leads y criterios de calificación.'},
    {ind:'Eficiencia vs Pauta (Activos/Leads)',val:`${f1(pctEfic)}%`,bench:'≥20%',ok:pctEfic>=20,int:pctEfic>=20?'Retorno de inversión en pauta dentro del rango esperado.':pctEfic>=12?'ROI de pauta bajo. Optimizar segmentación y creativos.':'ROI crítico. Revisar estrategia de pauta urgentemente.'},
    {ind:'Conversión Lead→JOT',val:`${convLead_JOT}%`,bench:'≥17%',ok:Number(convLead_JOT)>=17,int:Number(convLead_JOT)>=17?'Funnel completo saludable desde captación hasta activación.':'Pérdida en el funnel CRM→JOT. Identificar etapa de mayor fuga.'},
    {ind:'Tarjeta de Crédito % JOT',val:`${f1(pctTjt)}%`,bench:'≥30%',ok:pctTjt>=30,int:pctTjt>=30?'Mix de pago favorable. Menor riesgo de rechazo técnico.':'Predomina efectivo/cuenta. Mayor riesgo en proceso de activación.'},
  ].map((r,i)=>`<tr style="${i%2===1?'background:#f0f6ff;':''}">
    <td class="tdn">${r.ind}</td>
    <td style="font-weight:900;color:${r.ok?'#059669':'#dc2626'};text-align:center">${r.val}</td>
    <td style="color:#64748b;text-align:center">${r.bench}</td>
    <td style="text-align:center">${r.ok?'<span class="pill" style="background:#dcfce7;color:#166534">✓ OK</span>':'<span class="pill" style="background:#fef2f2;color:#991b1b">✗ ATENCIÓN</span>'}</td>
    <td class="tdn" style="font-size:6.3pt;font-weight:400;color:#475569">${r.int}</td>
  </tr>`).join('')}
  </tbody>
</table>
<div class="ftr"><span class="ftr-logo">▌ NOVO ERP · NOVONET</span><span>Informe Gerencial 360° · Confidencial · Generado: ${horaStr}</span><span>Pág. 3 / 4 · ${fechaStr}</span></div>
</div>

<!-- ═══════════ PÁGINA 4 — RENDIMIENTO POR ASESOR ═══════════ -->
<div class="pb">
<div class="topbar"></div>
<div class="hdr">
  <div class="hdr-logo"><span class="hdr-badge">NOVO ERP</span>
    <div><h1>RENDIMIENTO INDIVIDUAL — ASESORES</h1><p>CRM + JOT · Novonet · ${diaActual} ${fechaStr}</p></div>
  </div>
  <div class="hdr-r"><div class="dia">Período: ${filtros.fechaDesde} → ${filtros.fechaHasta}</div><div>Top ${asesoresPDF.length} asesores por Ingresos JOT · Confidencial</div></div>
</div>
<div class="sec">👤 Tabla de Rendimiento Individual — CRM + JOT</div>
${asesoresPDF.length>0?`
<table>
  <thead><tr>
    <th style="text-align:left;padding-left:6px;min-width:150px">#&nbsp; Asesor</th>
    <th>Leads</th><th>Gest.</th><th>V.CRM</th>
    <th style="background:#065f46">JOT</th>
    <th style="background:#065f46">Activ.</th>
    <th>Bklog</th><th>Efect%</th><th>Inst%</th><th>Desc%</th><th>Regul</th><th>Est.</th>
  </tr></thead>
  <tbody>
  ${asesoresPDF.map((a,i)=>{
    const leads=Number(a.leads_totales||0);
    const gest=Number(a.gestionables||0);
    const vcrm=Number(a.ventas_crm||0);
    const jot=Number(a.ingresos_reales||0);
    const act=Number(a.real_mes||0);
    const bk=Number(a.backlog||0);
    const ef=Number(a.efectividad_real||0);
    const inst=Number(a.tasa_instalacion||0);
    const desc=Number(a.descarte||0);
    const reg=Number(a.por_regularizar||0);
    const est=jot>=5?'🟢':jot>=2?'🟡':'🔴';
    const bg=i%2===1?'background:#f0f6ff;':'';
    return`<tr style="${bg}">
      <td class="tdn"><span style="color:#94a3b8;font-size:5.5pt;margin-right:4px">${i+1}.</span>${a.nombre_grupo||'—'}</td>
      <td>${leads}</td><td>${gest}</td>
      <td style="color:#0891b2;font-weight:700">${vcrm}</td>
      <td style="color:${sf(jot,5,2)};font-weight:900;background:${jot>=5?'#f0fdf4':jot>=2?'#fffbeb':'#fef2f2'}">${jot}</td>
      <td style="color:#059669;font-weight:700">${act}</td>
      <td style="color:${bk>2?'#d97706':'#64748b'}">${bk}</td>
      <td style="color:${sf(ef,40,28)};font-weight:700">${f1(ef)}%</td>
      <td style="color:${sf(inst,88,75)};font-weight:700">${f1(inst)}%</td>
      <td style="color:${desc<=30?'#059669':desc<=40?'#d97706':'#dc2626'}">${f1(desc)}%</td>
      <td style="color:${reg>2?'#dc2626':reg>0?'#d97706':'#64748b'}">${reg}</td>
      <td>${est}</td>
    </tr>`;
  }).join('')}
  <tr class="tot">
    <td class="tdn" style="color:#fff">▶ TOTAL / PROMEDIO EQUIPO</td>
    <td>${asesoresPDF.reduce((s,a)=>s+Number(a.leads_totales||0),0)}</td>
    <td>${asesoresPDF.reduce((s,a)=>s+Number(a.gestionables||0),0)}</td>
    <td>${asesoresPDF.reduce((s,a)=>s+Number(a.ventas_crm||0),0)}</td>
    <td>${asesoresPDF.reduce((s,a)=>s+Number(a.ingresos_reales||0),0)}</td>
    <td>${asesoresPDF.reduce((s,a)=>s+Number(a.real_mes||0),0)}</td>
    <td>${asesoresPDF.reduce((s,a)=>s+Number(a.backlog||0),0)}</td>
    <td>${(asesoresPDF.reduce((s,a)=>s+Number(a.efectividad_real||0),0)/Math.max(asesoresPDF.length,1)).toFixed(1)}%</td>
    <td>${(asesoresPDF.reduce((s,a)=>s+Number(a.tasa_instalacion||0),0)/Math.max(asesoresPDF.length,1)).toFixed(1)}%</td>
    <td>${(asesoresPDF.reduce((s,a)=>s+Number(a.descarte||0),0)/Math.max(asesoresPDF.length,1)).toFixed(1)}%</td>
    <td>${asesoresPDF.reduce((s,a)=>s+Number(a.por_regularizar||0),0)}</td>
    <td>—</td>
  </tr>
  </tbody>
</table>`:'<p style="color:#94a3b8;padding:8px;font-size:7pt">No hay datos de asesores para el período seleccionado.</p>'}
<div style="margin-top:8px;padding:7px 10px;background:#f0f6ff;border-radius:5px;border-left:3px solid #2563eb;font-size:6.5pt;color:#334155">
  <b style="color:#1A3A6E;display:block;margin-bottom:3px">📌 Leyenda de Indicadores</b>
  <span style="margin-right:12px"><b>JOT</b> = Ingresos registrados en JotForm (ventas activadas)</span>
  <span style="margin-right:12px"><b>V.CRM</b> = Ventas subidas en Bitrix (etapa "Venta Subida")</span>
  <span style="margin-right:12px"><b>Efect%</b> = JOT / Gestionables · Bench ≥40%</span>
  <span style="margin-right:12px"><b>Inst%</b> = Activos / JOT · Bench ≥88%</span>
  <span><b>🟢</b> ≥meta &nbsp;<b>🟡</b> riesgo &nbsp;<b>🔴</b> bajo meta</span>
</div>
<div class="ftr"><span class="ftr-logo">▌ NOVO ERP · NOVONET</span><span>Informe Gerencial 360° · CRM + JOT · Confidencial · Generado: ${horaStr}</span><span>Pág. 4 / 4 · ${fechaStr}</span></div>
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),400);</script>
</body></html>`;

    const w = window.open('', '_blank', 'width=960,height=800');
    if (w) { w.document.write(html); w.document.close(); }
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
    const totalJotform      = s.reduce((acc, c) => acc + Number(c.ingresos_reales || 0), 0);
    const totalActivos      = s.reduce((acc, c) => acc + Number(c.real_mes || 0) + Number(c.backlog || 0), 0);
    const totalBacklog      = s.reduce((acc, c) => acc + Number(c.backlog || 0), 0);
    const totalGestionables = s.reduce((acc, c) => acc + Number(c.gestionables || 0), 0);
    const totalIngresosCRM  = s.reduce((acc, c) => acc + Number(c.ventas_crm || 0), 0);
    return {
      ingresosCRM:              totalIngresosCRM,
      gestionables:             totalGestionables,
      regularizar:              s.reduce((acc, c) => acc + Number(c.por_regularizar || 0), 0),
      ingresosJotform:          totalJotform,
      descartePorc:             (s.reduce((acc, c) => acc + Number(c.descarte || 0), 0) / n).toFixed(1),
      leadsGestionables:        s.reduce((acc, c) => acc + Number(c.leads_totales || 0), 0),
      // Efectividad = Ingresos JOT / Gestionables
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

  // FIX: label del funnel usa los campos correctos (etapa y total del payload)
  const CustomFunnelLabel = ({ x, y, width, height, index }) => {
    if (height < 22) return null;
    const item = (data.graficoEmbudo || [])[index];
    if (!item) return null;
    const pct = ((Number(item.total) / totalBaseEmbudo) * 100).toFixed(1);
    return (
      <text x={x + width / 2} y={y + height / 2} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="900">
        {`${item.etapa} = ${item.total} (${pct}%)`}
      </text>
    );
  };

  // FIX: mapeo de datos para gráficas de monitoreo — campos correctos del backend
  const dataGraficoAsesores = (monitoreoData.asesores || []).map(a => {
    const g   = Number(a.real_dia_leads   || 0);
    const j   = Number(a.v_subida_jot_hoy || 0);
    const crm = Number(a.v_subida_crm_hoy || 0);
    const act = Number(a.activos_jot_hoy  || 0);
    const pct = (num, den) => den > 0 ? parseFloat(((num / den) * 100).toFixed(1)) : 0;
    return { nombre: a.nombre_grupo, gestionables: g, jot: j, crm, activos: act,
      efect_jot:   pct(j,   g),
      efect_crm:   pct(crm, g),
      efect_pauta: pct(act, g),
    };
  });
  const dataGraficoSupervisores = (monitoreoData.supervisores || []).map(s => {
    const g   = Number(s.real_dia_leads   || 0);
    const j   = Number(s.v_subida_jot_hoy || 0);
    const crm = Number(s.v_subida_crm_hoy || 0);
    const act = Number(s.activos_jot_hoy  || 0);
    const pct = (num, den) => den > 0 ? parseFloat(((num / den) * 100).toFixed(1)) : 0;
    return { nombre: s.nombre_grupo, gestionables: g, jot: j, crm, activos: act,
      efect_jot:   pct(j,   g),
      efect_crm:   pct(crm, g),
      efect_pauta: pct(act, g),
    };
  });

  const totalBarrasDia = (data.graficoBarrasDia || []).reduce((acc, d) => acc + Number(d.total || 0), 0);

  // FIX: formatFechaCorta normaliza tanto Date objects como strings ISO
  const dataBarrasConSemaforo = useMemo(() =>
    (data.graficoBarrasDia || []).map(d => {
      const fechaStr = d.fecha instanceof Date ? d.fecha.toISOString() : String(d.fecha || '');
      return {
        ...d,
        fecha:    fechaStr,            // conservar el string para el XAxis
        fechaDia: formatFechaCorta(fechaStr),  // solo el número del día
        faltante: Math.max(0, META_DIA - Number(d.total)),
        activos:  Number(d.activos || 0),  // FIX: ahora el backend envía este campo
        _cumple:  Number(d.total) >= META_DIA,
        _pct:     META_DIA > 0 ? Number(d.total) / META_DIA : 0,
      };
    }), [data.graficoBarrasDia]);

  const dataCRMFiltrada = useMemo(() => {
    if (!diaFiltrado) return data.dataCRM || [];
    return (data.dataCRM || []).filter(r => {
      const fecha = String(r.FECHA_CREACION_CRM || r.fecha || r.creado_el_fecha || '');
      const dia   = formatFechaCorta(fecha);
      return dia === String(diaFiltrado);
    });
  }, [data.dataCRM, diaFiltrado]);

  const inputCls  = "bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-[10px] font-bold text-slate-800 outline-none focus:border-blue-500 transition-colors uppercase";
  const selectCls = "bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-[10px] font-bold text-slate-800 outline-none appearance-none uppercase";

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

  // FIX: FunnelChart usa dataKey="value" y nameKey="name" (campos que ahora envía el backend)
  const GraficoEmbudo = () => (
    <div className="flex gap-4 h-full">
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <FunnelChart>
            <Funnel
              data={data.graficoEmbudo || []}
              dataKey="value"
              nameKey="name"
              isAnimationActive={false}
              label={CustomFunnelLabel}
            >
              {(data.graficoEmbudo || []).map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORES_EMBUDO[index % COLORES_EMBUDO.length]} />
              ))}
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
              <span className="text-[8px] font-black text-slate-800 shrink-0">{entry.total}</span>
              <span className="text-[8px] font-bold text-slate-400 shrink-0">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const TooltipEfect = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: '8px 12px', fontSize: 9 }}>
        <div style={{ color: '#94a3b8', fontWeight: 700, marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => <div key={i} style={{ color: p.color, fontWeight: 800 }}>{p.name}: {p.value}{typeof p.value === 'number' && p.name.startsWith('%') ? '%' : ''}</div>)}
      </div>
    );
  };

  const GraficoAsesores = () => (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={dataGraficoAsesores} margin={{ top: 20, right: 45, left: 0, bottom: 80 }} barCategoryGap="20%" barGap={2}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
        <XAxis dataKey="nombre" axisLine={false} tickLine={false} tick={<CustomXAxisTickVertical />} interval={0} />
        <YAxis yAxisId="vol" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 9 }} />
        <YAxis yAxisId="pct" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9 }} unit="%" domain={[0, 'auto']} width={38} />
        <Tooltip content={<TooltipEfect />} />
        <Legend wrapperStyle={{ fontSize: 8, paddingTop: 4 }}
          formatter={v => ({ gestionables:'Gestionables', jot:'JOT', crm:'CRM V.Sub.', activos:'Activos',
            efect_jot:'% Ef.JOT', efect_crm:'% Ef.CRM', efect_pauta:'% Ef.Pauta' }[v] || v)} />
        <Bar yAxisId="vol" dataKey="gestionables" fill="#8b5cf6" radius={[4,4,0,0]} barSize={12} label={{ position:'top', fill:'#c4b5fd', fontSize:8, fontWeight:900 }} />
        <Bar yAxisId="vol" dataKey="jot"          fill="#10b981" radius={[4,4,0,0]} barSize={12} label={{ position:'top', fill:'#6ee7b7', fontSize:8, fontWeight:900 }} />
        <Bar yAxisId="vol" dataKey="crm"          fill="#3b82f6" radius={[4,4,0,0]} barSize={12} label={{ position:'top', fill:'#93c5fd', fontSize:8, fontWeight:900 }} />
        <Bar yAxisId="vol" dataKey="activos"      fill="#f59e0b" radius={[4,4,0,0]} barSize={12} label={{ position:'top', fill:'#fde68a', fontSize:8, fontWeight:900 }} />
        <Line yAxisId="pct" type="monotone" dataKey="efect_jot"   stroke="#10b981" strokeWidth={2} dot={{ r:3, fill:'#10b981', strokeWidth:0 }}>
          <LabelList dataKey="efect_jot"   position="top" style={{ fontSize:7, fill:'#10b981', fontWeight:800 }} formatter={v => v>0?`${v}%`:''} />
        </Line>
        <Line yAxisId="pct" type="monotone" dataKey="efect_crm"   stroke="#3b82f6" strokeWidth={2} dot={{ r:3, fill:'#3b82f6', strokeWidth:0 }} strokeDasharray="5 3">
          <LabelList dataKey="efect_crm"   position="top" style={{ fontSize:7, fill:'#3b82f6', fontWeight:800 }} formatter={v => v>0?`${v}%`:''} />
        </Line>
        <Line yAxisId="pct" type="monotone" dataKey="efect_pauta" stroke="#f59e0b" strokeWidth={2} dot={{ r:3, fill:'#f59e0b', strokeWidth:0 }} strokeDasharray="2 2">
          <LabelList dataKey="efect_pauta" position="top" style={{ fontSize:7, fill:'#f59e0b', fontWeight:800 }} formatter={v => v>0?`${v}%`:''} />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );

  const GraficoSupervisores = () => (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={dataGraficoSupervisores} margin={{ top: 20, right: 45, left: 0, bottom: 80 }} barCategoryGap="20%" barGap={2}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
        <XAxis dataKey="nombre" axisLine={false} tickLine={false} tick={<CustomXAxisTickVertical />} interval={0} />
        <YAxis yAxisId="vol" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 9 }} />
        <YAxis yAxisId="pct" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9 }} unit="%" domain={[0, 'auto']} width={38} />
        <Tooltip content={<TooltipEfect />} />
        <Legend wrapperStyle={{ fontSize: 8, paddingTop: 4 }}
          formatter={v => ({ gestionables:'Gestionables', jot:'JOT', crm:'CRM V.Sub.', activos:'Activos',
            efect_jot:'% Ef.JOT', efect_crm:'% Ef.CRM', efect_pauta:'% Ef.Pauta' }[v] || v)} />
        <Bar yAxisId="vol" dataKey="gestionables" fill="#06b6d4" radius={[4,4,0,0]} barSize={20} label={{ position:'top', fill:'#67e8f9', fontSize:8, fontWeight:900 }} />
        <Bar yAxisId="vol" dataKey="jot"          fill="#10b981" radius={[4,4,0,0]} barSize={20} label={{ position:'top', fill:'#6ee7b7', fontSize:8, fontWeight:900 }} />
        <Bar yAxisId="vol" dataKey="crm"          fill="#3b82f6" radius={[4,4,0,0]} barSize={20} label={{ position:'top', fill:'#93c5fd', fontSize:8, fontWeight:900 }} />
        <Bar yAxisId="vol" dataKey="activos"      fill="#f59e0b" radius={[4,4,0,0]} barSize={20} label={{ position:'top', fill:'#fde68a', fontSize:8, fontWeight:900 }} />
        <Line yAxisId="pct" type="monotone" dataKey="efect_jot"   stroke="#10b981" strokeWidth={2.5} dot={{ r:4, fill:'#10b981', strokeWidth:0 }}>
          <LabelList dataKey="efect_jot"   position="top" style={{ fontSize:8, fill:'#10b981', fontWeight:800 }} formatter={v => v>0?`${v}%`:''} />
        </Line>
        <Line yAxisId="pct" type="monotone" dataKey="efect_crm"   stroke="#3b82f6" strokeWidth={2.5} dot={{ r:4, fill:'#3b82f6', strokeWidth:0 }} strokeDasharray="5 3">
          <LabelList dataKey="efect_crm"   position="top" style={{ fontSize:8, fill:'#3b82f6', fontWeight:800 }} formatter={v => v>0?`${v}%`:''} />
        </Line>
        <Line yAxisId="pct" type="monotone" dataKey="efect_pauta" stroke="#f59e0b" strokeWidth={2.5} dot={{ r:4, fill:'#f59e0b', strokeWidth:0 }} strokeDasharray="2 2">
          <LabelList dataKey="efect_pauta" position="top" style={{ fontSize:8, fill:'#f59e0b', fontWeight:800 }} formatter={v => v>0?`${v}%`:''} />
        </Line>
      </ComposedChart>
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
          <button onClick={() => setTabActiva("CONSULTA")} className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[10px] font-black rounded-lg transition-all uppercase ${tabActiva === "CONSULTA" ? "bg-[#1A3A6E] text-white shadow-lg" : "text-slate-500 hover:bg-slate-300"}`}>📥 CONSULTA Y DESCARGA</button>
        </div>
      </div>

      {tabActiva === "GENERAL" ? (
        <div className="animate-in fade-in duration-500">
          {/* Panel de filtros */}
          <div className="bg-slate-50 rounded-2xl shadow-sm mb-8 overflow-visible border border-slate-200">
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-9 gap-4 items-end">
              <div className="lg:col-span-2 flex flex-col gap-2">
                <label className="text-[9px] font-black text-blue-400 italic tracking-widest uppercase">PERÍODO DE CONSULTA</label>
                <div className="flex bg-white border border-slate-300 rounded-2xl p-1.5 shadow-inner">
                  <input type="date" className="bg-transparent text-slate-800 text-center text-[11px] font-bold outline-none w-full"
                    value={filtros.fechaDesde} onChange={e => updateFiltro('fechaDesde', e.target.value)} />
                  <div className="text-slate-400 px-2 font-black self-center">-</div>
                  <input type="date" className="bg-transparent text-slate-800 text-center text-[11px] font-bold outline-none w-full"
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
                <select className={selectCls} value={filtros.supervisor} onChange={e => updateFiltro('supervisor', e.target.value)}>
                  <option value="">TODOS</option>
                  {[...new Set((allSupervisores || []).map(s => s.nombre_grupo).filter(n => n && n !== 'SIN ASIGNAR'))].sort().map((nombre, i) => (
                    <option key={i} value={nombre}>{nombre}</option>
                  ))}
                </select>
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
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black text-emerald-400 italic uppercase">📡 CAMPAÑA/ORIGEN</label>
                <MultiSelectCanal
                  value={filtros.canal}
                  onChange={vals => updateFiltro('canal', vals)}
                  options={data.canales || ["ARTS","ARTS FACEBOOK","ARTS GOOGLE","REMARKETING","VIDIKA GOOGLE","POR RECOMENDACIÓN"]}
                  accentColor="blue"
                />
              </div>
              <button onClick={() => { setFiltrosAplicados(filtros); fetchDashboard(filtros); }} className="bg-blue-600 hover:bg-blue-500 text-white h-[42px] rounded-xl text-[10px] font-black shadow-lg shadow-blue-900/20 transition-all active:scale-95 uppercase">{loading ? "CARGANDO..." : "APLICAR FILTROS"}</button>
              <button onClick={generarInforme360} className="bg-slate-800 hover:bg-slate-700 text-white h-[42px] rounded-xl text-[10px] font-black shadow-lg transition-all active:scale-95 uppercase flex items-center justify-center gap-1.5">
                <span>📄</span> Informe 360°
              </button>
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
            <KpiMini label="Activas Mes"     meta={metaDinamica(1156,  filtros.fechaDesde, filtros.fechaHasta)}  real={stats.activas - stats.backlog}       color="border-l-emerald-500" />
            <KpiMini label="Activas Backlog" meta={metaDinamica(70,   filtros.fechaDesde, filtros.fechaHasta)}  real={stats.backlog}                       color="border-l-cyan-500" />
            <KpiMini label="Activas Total"   meta={metaDinamica(1300,  filtros.fechaDesde, filtros.fechaHasta)}  real={stats.activas}                       color="border-l-teal-500" />
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
            <ExpandableChart title={`PRODUCCIÓN POR DÍA (CERRADOS) — TOTAL: ${totalBarrasDia}`} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md" modalHeight={580}>
              <h3 className="text-[10px] font-black text-emerald-600 mb-4 italic tracking-widest flex items-center gap-2 flex-wrap uppercase">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0"></span>
                PRODUCCIÓN POR DÍA (CERRADOS)
                <span className="ml-2 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBarrasDia}</span>
                <span className="ml-auto flex items-center gap-2 text-[9px] text-slate-400 font-bold not-italic flex-wrap">
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-emerald-500 rounded inline-block"></span> OK</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-amber-500 rounded inline-block"></span> CERCA</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-500 rounded inline-block"></span> BAJO</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-400 rounded inline-block"></span> ACTIVOS</span>
                  <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-yellow-400 inline-block"></span> META {META_DIA}</span>
                </span>
              </h3>
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
              <ChartArea h={260}><GraficoBarrasDia /></ChartArea>
            </ExpandableChart>

            <ExpandableChart title={`EMBUDO DE CONVERSIÓN — TOTAL: ${totalBaseEmbudo}`} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md" modalHeight={580}>
              <h3 className="text-[10px] font-black text-emerald-600 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                EMBUDO DE CONVERSIÓN
                <span className="ml-2 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBaseEmbudo}</span>
              </h3>
              <ChartArea h={300}><GraficoEmbudo /></ChartArea>
            </ExpandableChart>
          </div>

          {/* Tablas */}
          <div className="mb-8"><HorizontalTable title="KPI POR SUPERVISOR" data={data.supervisores} /></div>
          <div className="mb-8"><HorizontalTable title="KPI POR ASESOR" data={data.asesores} hasScroll={true} /></div>

          <div className="grid grid-cols-1 gap-4">
            <DataVisor
              title={diaFiltrado ? `DETALLE BASE CRM — DÍA ${diaFiltrado} FILTRADO (${dataCRMFiltrada.length} registros)` : "DETALLE BASE CRM"}
              data={dataCRMFiltrada}
              onDownload={() => descargarExcel("CRM")}
              color="bg-slate-600"
              filtroBadge={diaFiltrado ? <button onClick={() => setDiaFiltrado(null)} className="text-[8px] bg-white/20 px-2 py-0.5 rounded-full font-black ml-2">DÍA {diaFiltrado} ✕ LIMPIAR</button> : null}
            />
            <DataVisor title="DETALLE BASE JOTFORM (NETLIFE)" data={data.dataNetlife} onDownload={() => descargarExcel("JOTFORM")} color="bg-blue-600" />
          </div>
        </div>

      ) : tabActiva === "MONITOREO" ? (
        <div className="animate-in slide-in-from-right-5 duration-500 space-y-6">
          <div className="bg-emerald-600 text-white p-5 rounded-2xl flex justify-between items-center shadow-xl border-b-4 border-emerald-700">
            <div>
              <h2 className="text-lg font-black italic tracking-tighter flex items-center gap-2 uppercase">
                <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>
                MONITOREO DE GESTIÓN EN VIVO
              </h2>
              <p className="text-[9px] font-bold text-emerald-300 tracking-[0.2em] uppercase">DATOS ACUMULADOS DEL MES Y DÍA ACTUAL</p>
            </div>
            <button onClick={() => fetchMonitoreo()} className="bg-white/10 hover:bg-white/20 px-6 py-2 rounded-xl text-[10px] font-black backdrop-blur-sm transition-all border border-white/20 uppercase">{loading ? "ACTUALIZANDO..." : "FORZAR RECARGA"}</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ExpandableChart title="ASESORES — GESTIONABLES VS INGRESOS HOY" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-md" modalHeight={580}>
              <h3 className="text-[10px] font-black text-violet-400 mb-2 italic tracking-widest flex items-center gap-2 flex-wrap uppercase">
                <span className="w-2 h-2 bg-violet-500 rounded-full animate-pulse shrink-0"></span>
                ASESORES — GESTIONABLES VS INGRESOS HOY
              </h3>
              <div className="flex gap-3 mb-3 text-[8px] font-black">
                <span className="flex items-center gap-1 text-violet-400"><span className="w-2 h-2 rounded-sm bg-violet-500"></span> GESTIONABLES</span>
                <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-sm bg-emerald-500"></span> INGRESOS (más oscuro = mejor)</span>
              </div>
              <ChartArea h={300}><GraficoAsesores /></ChartArea>
            </ExpandableChart>

            <ExpandableChart title="SUPERVISORES — GESTIONABLES VS INGRESOS HOY" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-md" modalHeight={580}>
              <h3 className="text-[10px] font-black text-cyan-400 mb-2 italic tracking-widest flex items-center gap-2 flex-wrap uppercase">
                <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse shrink-0"></span>
                SUPERVISORES — GESTIONABLES VS INGRESOS HOY
              </h3>
              <div className="flex gap-3 mb-3 text-[8px] font-black">
                <span className="flex items-center gap-1 text-cyan-400"><span className="w-2 h-2 rounded-sm bg-cyan-500"></span> GESTIONABLES</span>
                <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-sm bg-emerald-500"></span> INGRESOS (más oscuro = mejor)</span>
              </div>
              <ChartArea h={300}><GraficoSupervisores /></ChartArea>
            </ExpandableChart>
          </div>

          <DailyMonitoringTable title="CONTROL OPERATIVO: SUPERVISORES" data={monitoreoData.supervisores} />
          <DailyMonitoringTable title="CONTROL OPERATIVO: ASESORES" data={monitoreoData.asesores} hasScroll={true} />
        </div>

      ) : tabActiva === "REPORTE180" ? (
        <Reporte180
          data={reporte180Data}
          filtros={filtros180}
          setFiltros={setFiltros180}
          onFetch={fetchReporte180}
          loading={loading}
          etapasCRM={data.etapasCRM}
          ETAPAS_JOTFORM={ETAPAS_JOTFORM}
        />
      ) : (
        <ConsultaDescargaNovonet />
      )}
    </div>
  );
}

// ======================================================
// CONSULTA Y DESCARGA — NOVONET
// ======================================================
const COLUMNAS_NOVONET = [
  { header: 'FECHA DE CARGA A JOT',                    field: 'created_at' },
  { header: 'ID NEGOCIACIÓN',                           field: 'id_bitrix' },
  { header: 'CODIGO EJECUTIVO',                         field: 'codigo_asesor' },
  { header: 'PLAN. CASA',                               field: 'plan_casa' },
  { header: 'PLAN. PROFESIONAL.',                       field: 'plan_profesional' },
  { header: 'PLAN PYME',                                field: 'plan_pyme' },
  { header: 'PLAN HOGAR ADULTO MAYOR',                  field: 'plan_hogar_adulto_mayor' },
  { header: 'APLICA DESCUENTO (3ERA EDAD O CONADIS)',   field: 'descuento_3era_edad' },
  { header: 'ADICIONAL',                                field: 'servicio_empaquetado' },
  { header: 'LOGIN',                                    field: 'login_netlife' },
  { header: 'ESTADO DE NETLIFE',                        field: 'estatus_netlife' },
  { header: 'FORMA DE PAGO',                            field: 'forma_pago' },
  { header: 'FECHA DE INGRESO A TELCOS',                field: 'fecha_ingreso_telcos' },
  { header: 'FECHA DE ASIGNACIÓN EN TELCOS',            field: null },
  { header: 'FECHA DE ACTIVACIÓN EN TELCOS',            field: 'fecha_activacion' },
  { header: 'PROVINCIA',                                field: 'provincia' },
  { header: 'CIUDAD',                                   field: 'ciudad' },
  { header: 'OBSERVACIÓN DE LA VENTA',                  field: 'nombre_empresa' },
  { header: 'ESTADO DE REGULARIZACIÓN',                 field: 'estado_regularizacion' },
  { header: 'DETALLE DE REGULARIZACIÓN',                field: 'novedades_atc' },
  { header: 'COBRO TC CLIENTE',                         field: null },
];

function ConsultaDescargaNovonet() {
  const hoy = new Date().toISOString().split('T')[0];
  const [fechaDesde, setFechaDesde] = useState(hoy);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [loading,    setLoading]    = useState(false);
  const [rows,       setRows]       = useState(null);
  const [error,      setError]      = useState(null);

  const consultar = async () => {
    setLoading(true); setError(null); setRows(null);
    try {
      const res    = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores/consulta-descarga?fechaDesde=${fechaDesde}&fechaHasta=${fechaHasta}`);
      const result = await res.json();
      if (result.success) setRows(result.rows);
      else setError(result.error || 'Error al consultar');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const descargarExcel = () => {
    if (!rows || rows.length === 0) return;
    const header = COLUMNAS_NOVONET.map(c => c.header);
    const data_  = rows.map(row =>
      COLUMNAS_NOVONET.map(c => {
        if (!c.field) return '';
        const v = row[c.field];
        if (v === null || v === undefined) return '';
        if (c.field.startsWith('fecha') || c.field === 'created_at') {
          try { return new Date(v).toLocaleDateString('es-EC'); } catch { return String(v); }
        }
        return v;
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([header, ...data_]);
    // Ancho de columnas
    ws['!cols'] = COLUMNAS_NOVONET.map(() => ({ wch: 22 }));
    // Estilo de encabezado (solo en navegadores que soportan xlsx-style)
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Novonet');
    XLSX.writeFile(wb, `Consulta_Novonet_${fechaDesde}_${fechaHasta}.xlsx`);
  };

  return (
    <div className="animate-in slide-in-from-right-5 duration-500 space-y-5">
      {/* Header panel */}
      <div className="bg-[#1A3A6E] text-white p-5 rounded-2xl flex justify-between items-center shadow-xl border-b-4 border-[#0f2550]">
        <div>
          <h2 className="text-lg font-black italic tracking-tighter flex items-center gap-2 uppercase">📥 CONSULTA Y DESCARGA — NOVONET</h2>
          <p className="text-[9px] font-bold text-blue-300 tracking-[0.2em] uppercase mt-1">Vista: vista_analisis_novonet · Filtro por Fecha de Carga a JOT</p>
        </div>
        <div className="text-right text-[9px] text-blue-300">
          {rows !== null && <div className="text-lg font-black text-white">{rows.length.toLocaleString()} registros</div>}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Fecha Inicio (JOT)</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Fecha Fin (JOT)</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </div>
          <button onClick={consultar} disabled={loading}
            className="h-[42px] px-6 rounded-xl text-[10px] font-black uppercase text-white bg-[#1A3A6E] hover:bg-[#0f2550] shadow transition-all active:scale-95 disabled:opacity-60">
            {loading ? '⏳ Consultando...' : '🔍 Consultar'}
          </button>
          {rows !== null && rows.length > 0 && (
            <button onClick={descargarExcel}
              className="h-[42px] px-6 rounded-xl text-[10px] font-black uppercase text-white bg-emerald-600 hover:bg-emerald-700 shadow transition-all active:scale-95 flex items-center gap-2">
              ⬇️ Descargar Excel ({rows.length.toLocaleString()} filas)
            </button>
          )}
        </div>
        {error && <p className="mt-3 text-[10px] font-bold text-red-600 bg-red-50 px-4 py-2 rounded-lg">⚠️ {error}</p>}
      </div>

      {/* Tabla preview */}
      {rows !== null && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#1A3A6E]">
              Vista previa — {Math.min(rows.length, 200)} de {rows.length.toLocaleString()} registros
            </span>
            <span className="text-[9px] text-slate-400">El Excel contiene todos los registros</span>
          </div>
          {rows.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">No se encontraron registros para el período seleccionado.</div>
          ) : (
            <div className="overflow-auto max-h-[500px]">
              <table className="text-[8px] font-mono border-collapse w-full whitespace-nowrap">
                <thead className="sticky top-0 z-10">
                  <tr>
                    {COLUMNAS_NOVONET.map((c, i) => (
                      <th key={i} className="px-3 py-2 text-left font-black uppercase tracking-widest border-b border-r border-slate-200 last:border-r-0"
                        style={{ background: '#1A3A6E', color: '#fff', minWidth: '120px', fontSize: '7px' }}>
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'}>
                      {COLUMNAS_NOVONET.map((c, ci) => {
                        let val = c.field ? row[c.field] : '';
                        if (val !== null && val !== undefined && (c.field?.startsWith('fecha') || c.field === 'created_at')) {
                          try { val = new Date(val).toLocaleDateString('es-EC'); } catch {}
                        }
                        return (
                          <td key={ci} className="px-3 py-1.5 border-b border-r border-slate-100 last:border-r-0 text-slate-600 max-w-[200px] truncate">
                            {val ?? ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!rows && !loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl bg-blue-50">📥</div>
          <div className="text-sm font-black text-slate-500">Selecciona el período y presiona "Consultar"</div>
          <div className="text-xs text-slate-400 text-center max-w-sm">Los datos provienen de <span className="font-black text-[#1A3A6E]">vista_analisis_novonet</span> y se filtran por la fecha de carga en JOT.</div>
        </div>
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

  // FIX: labels del funnel 180° también usan el payload correcto
  const CustomFunnelLabelCRM = ({ x, y, width, height, index }) => {
    if (height < 22) return null;
    const item = (embudoCRM || [])[index];
    if (!item) return null;
    const pct = ((Number(item.total) / totalBaseEmbudoCRM) * 100).toFixed(1);
    return <text x={x + width / 2} y={y + height / 2} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="900">{`${item.etapa} = ${item.total} (${pct}%)`}</text>;
  };
  const CustomFunnelLabelJOT = ({ x, y, width, height, index }) => {
    if (height < 22) return null;
    const item = (embudoJotform || [])[index];
    if (!item) return null;
    const pct = ((Number(item.total) / totalBaseEmbudoJOT) * 100).toFixed(1);
    return <text x={x + width / 2} y={y + height / 2} fill="#ffffff" textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight="900">{`${item.etapa} = ${item.total} (${pct}%)`}</text>;
  };

  // Solo actualiza el estado; la consulta se ejecuta al presionar "APLICAR FILTROS"
  const updateFiltro180 = (campo, valor) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
  };

  const inputCls  = "bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-[10px] font-bold text-slate-800 outline-none focus:border-violet-500 transition-colors uppercase";
  const selectCls = "bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-[10px] font-bold text-slate-800 outline-none appearance-none uppercase";

  // FIX: FunnelChart 180° también usa dataKey="value" y nameKey="name"
  const GraficoEmbudoCRM = () => (
    <div className="flex gap-4 h-full">
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <FunnelChart>
            <Funnel data={embudoCRM || []} dataKey="value" nameKey="name" isAnimationActive={false} label={CustomFunnelLabelCRM}>
              {(embudoCRM || []).map((_, index) => <Cell key={`crm-${index}`} fill={COLORES_EMBUDO_CRM[index % COLORES_EMBUDO_CRM.length]} />)}
            </Funnel>
            <Tooltip content={<TooltipEmbudo />} />
          </FunnelChart>
        </ResponsiveContainer>
      </div>
      <div className="w-[180px] overflow-y-auto flex flex-col gap-1.5 py-1 pr-1">
        {(embudoCRM || []).slice(0, 15).map((entry, index) => {
          const pct = ((Number(entry.total) / totalBaseEmbudoCRM) * 100).toFixed(1);
          return <div key={index} className="flex items-center gap-2 min-w-0"><div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORES_EMBUDO_CRM[index % COLORES_EMBUDO_CRM.length] }} /><span className="text-[8px] text-slate-400 truncate leading-tight flex-1 uppercase">{entry.etapa}</span><span className="text-[8px] font-black text-slate-800 shrink-0">{entry.total}</span><span className="text-[8px] font-bold text-slate-400 shrink-0">({pct}%)</span></div>;
        })}
      </div>
    </div>
  );

  const GraficoEmbudoJOT = () => (
    <div className="flex gap-4 h-full">
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <FunnelChart>
            <Funnel data={embudoJotform || []} dataKey="value" nameKey="name" isAnimationActive={false} label={CustomFunnelLabelJOT}>
              {(embudoJotform || []).map((_, index) => <Cell key={`jot-${index}`} fill={COLORES_EMBUDO_JOT[index % COLORES_EMBUDO_JOT.length]} />)}
            </Funnel>
            <Tooltip content={<TooltipEmbudo />} />
          </FunnelChart>
        </ResponsiveContainer>
      </div>
      <div className="w-[180px] overflow-y-auto flex flex-col gap-1.5 py-1 pr-1">
        {(embudoJotform || []).slice(0, 15).map((entry, index) => {
          const pct = ((Number(entry.total) / totalBaseEmbudoJOT) * 100).toFixed(1);
          return <div key={index} className="flex items-center gap-2 min-w-0"><div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORES_EMBUDO_JOT[index % COLORES_EMBUDO_JOT.length] }} /><span className="text-[8px] text-slate-400 truncate leading-tight flex-1 uppercase">{entry.etapa}</span><span className="text-[8px] font-black text-slate-800 shrink-0">{entry.total}</span><span className="text-[8px] font-bold text-slate-400 shrink-0">({pct}%)</span></div>;
        })}
      </div>
    </div>
  );

  return (
    <div className="animate-in slide-in-from-right-5 duration-500 space-y-6">
      <div className="bg-violet-600 text-white p-5 rounded-2xl flex justify-between items-center shadow-xl border-b-4 border-violet-700">
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

      <div className="bg-slate-50 rounded-2xl shadow-sm overflow-hidden border border-slate-200">
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4 items-end">
          <div className="lg:col-span-2 flex flex-col gap-2">
            <label className="text-[9px] font-black text-violet-400 italic tracking-widest uppercase">PERÍODO</label>
            <div className="flex bg-white border border-slate-300 rounded-2xl p-1.5 shadow-inner">
              <input type="date" className="bg-transparent text-slate-800 text-center text-[11px] font-bold outline-none w-full"
                value={filtros.fechaDesde} onChange={e => updateFiltro180('fechaDesde', e.target.value)} />
              <div className="text-slate-400 px-2 font-black self-center">-</div>
              <input type="date" className="bg-transparent text-slate-800 text-center text-[11px] font-bold outline-none w-full"
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
        <ExpandableChart title={`EMBUDO CRM — ETAPAS DE NEGOCIACIÓN — TOTAL: ${totalBaseEmbudoCRM}`} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md" modalHeight={620}>
          <h3 className="text-[10px] font-black text-blue-600 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
            EMBUDO CRM — ETAPAS DE NEGOCIACIÓN
            <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBaseEmbudoCRM}</span>
          </h3>
          <ChartArea h={340}><GraficoEmbudoCRM /></ChartArea>
        </ExpandableChart>

        <ExpandableChart title={`EMBUDO JOTFORM — ESTADOS NETLIFE — TOTAL: ${totalBaseEmbudoJOT}`} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md" modalHeight={620}>
          <h3 className="text-[10px] font-black text-emerald-600 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            EMBUDO JOTFORM — ESTADOS NETLIFE
            <span className="ml-2 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBaseEmbudoJOT}</span>
          </h3>
          <ChartArea h={340}><GraficoEmbudoJOT /></ChartArea>
        </ExpandableChart>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md">
        <h3 className="text-[10px] font-black text-cyan-600 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
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
                  <th className="bg-slate-100 text-slate-600 p-2 text-left font-black sticky left-0 z-20 border-r border-slate-200 min-w-[120px] uppercase">CIUDAD</th>
                  {fechas.map(f => <th key={f} className="bg-slate-100 text-slate-600 p-1 font-black min-w-[36px] text-center border-l border-slate-200">{f ? f.split('-').slice(1).join('/') : f}</th>)}
                </tr>
              </thead>
              <tbody>
                {ciudades.map((ciudad, ci) => (
                  <tr key={ci} className="hover:bg-slate-50 transition-colors">
                    <td className="sticky left-0 bg-white border-r border-slate-200 p-2 font-black text-slate-700 uppercase truncate max-w-[120px]">{ciudad}</td>
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
      <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
        <h2 className="text-[10px] font-black uppercase italic tracking-[0.2em] text-slate-800 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"></span>
          {title} <span className="text-slate-500 font-mono normal-case">({safeData.length} registros)</span>
        </h2>
        <button onClick={descargarExcel} className="text-[9px] bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded-full font-black transition-all flex items-center gap-2 text-white uppercase">⬇️ EXCEL</button>
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
            <tr className="bg-slate-200 text-slate-800 text-[8px] font-black border-b-2 border-slate-400">
              <td className="px-2 py-1.5 border-r border-slate-400 sticky left-0 bg-slate-200 z-10 whitespace-nowrap" style={{ width: NW, minWidth: NW, maxWidth: NW }}>▶ TOTAL</td>
              <td className="text-center border-r border-slate-700 px-3 py-1.5">{totals.real_mes}</td>
              <td className="text-center border-r border-slate-700 px-3">{totals.backlog}</td>
              <td className="text-center border-r border-slate-700 px-3 bg-slate-700 text-white">{totals.total_activas_calculada}</td>
              <td className="text-center border-r border-slate-600 px-3 text-slate-400">—</td>
              <td className="text-center border-r border-slate-600 px-3">{totals.gestionables}</td>
              <td className="text-center border-r border-slate-700 px-3">{totals.ventas_crm}</td>
              <td className="text-center border-r border-slate-600 px-3 font-black">{totals.ingresos_reales}</td>
              <td className="text-center border-r border-slate-600 px-3">{totals.efectividad_real}%</td>
              <td className="text-center border-r border-slate-600 px-3">{totals.descarte}%</td>
              <td className="text-center border-r border-slate-600 px-3">{totals.tasa_instalacion}%</td>
              <td className="text-center border-r border-slate-400 px-3 bg-slate-50">{totals.eficiencia}%</td>
              <td className="text-center border-r border-slate-600 px-3">{tarjetaPct}%</td>
              <td className="text-center border-r border-slate-600 px-3">{terceraEdadPct}%</td>
              <td className="text-center px-3">{totals.regularizacion}</td>
            </tr>
          </thead>
          <tbody>
            {safeData.map((row, i) => (
              <tr key={i} className={`border-b border-slate-200 hover:bg-blue-50/40 transition-colors text-[8px] ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="px-2 py-1.5 border-r border-slate-300 sticky left-0 font-black text-slate-800 whitespace-nowrap truncate"
                  style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', width: NW, minWidth: NW, maxWidth: NW }}>
                  {row.nombre_grupo}
                </td>
                <td className={tdD}>{row.real_mes || '—'}</td>
                <td className={tdD}>{row.backlog ?? '—'}</td>
                <td className={`${tdD} bg-slate-50 font-black`}>{row.total_activas_calculada || '—'}</td>
                <td className={`${tdDB} text-slate-400`}>—</td>
                <td className={tdDB}>{row.gestionables || '—'}</td>
                <td className={tdD}>{row.ventas_crm || '—'}</td>
                <td className={`${tdDB} font-black text-blue-700`}>{row.ingresos_reales || '—'}</td>
                <td className={tdDB}>{row.efectividad_real != null ? `${Number(row.efectividad_real).toFixed(1)}%` : '—'}</td>
                <td className={tdDB}>{row.descarte != null ? `${Number(row.descarte).toFixed(1)}%` : '—'}</td>
                <td className={tdDB}>{row.tasa_instalacion != null ? `${Number(row.tasa_instalacion).toFixed(1)}%` : '—'}</td>
                <td className={`${tdDB} bg-slate-50`}>{row.eficiencia != null ? `${Number(row.eficiencia).toFixed(1)}%` : '—'}</td>
                <td className={tdDB}>{row.tarjeta_credito && row.ingresos_reales ? `${((Number(row.tarjeta_credito)/Number(row.ingresos_reales))*100).toFixed(1)}%` : '—'}</td>
                <td className={tdDB}>{row.tercera_edad && row.real_mes ? `${((Number(row.tercera_edad)/Number(row.real_mes))*100).toFixed(1)}%` : '—'}</td>
                <td className="text-center px-3 py-2 w-16 whitespace-nowrap">{row.regularizacion || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
