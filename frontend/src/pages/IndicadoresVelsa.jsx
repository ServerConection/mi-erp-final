import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
        className="rounded-2xl border border-orange-300 shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ backgroundColor: '#ffffff', animation: 'slideUp 0.25s ease' }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity:0 } to { transform: translateY(0); opacity:1 } }`}</style>
        <div className="flex justify-between items-center px-6 py-4 border-b border-orange-200">
          <span className="text-[11px] font-black text-orange-600 uppercase tracking-widest italic">{title}</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl font-black transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100"
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

/** Multi-select dropdown para Campaña/Origen */
function MultiSelectCanal({ value = [], onChange, options = [], accentColor = "orange" }) {
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
  const btnCls = `w-full text-left bg-stone-50 border border-stone-200 rounded-lg px-3 py-[9px] text-[9px] font-bold text-stone-600 flex justify-between items-center gap-1 hover:border-${accentColor}-300 transition-colors`;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className={btnCls}>
        <span className="truncate">{value.length === 0 ? 'TODAS LAS CAMPAÑAS' : value.length === 1 ? value[0] : `${value.length} SELECCIONADAS`}</span>
        <span className={`text-${accentColor}-400 text-[8px] shrink-0`}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
          {value.length > 0 && (
            <button onClick={() => onChange([])} className="w-full text-left px-3 py-2 text-[8px] font-black text-red-500 hover:bg-red-50 border-b border-stone-100 uppercase">
              ✕ Limpiar selección
            </button>
          )}
          {options.map((opt, i) => (
            <label key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-stone-50 cursor-pointer text-[9px] font-bold text-stone-700 border-b border-stone-50 last:border-0">
              <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)}
                className={`accent-${accentColor}-500 w-3 h-3 shrink-0`} />
              <span className="truncate">{opt}</span>
            </label>
          ))}
          {options.length === 0 && <div className="px-3 py-3 text-[9px] text-stone-400 uppercase">Sin opciones</div>}
        </div>
      )}
    </div>
  );
}

// ======================================================
// COMPONENTE PRINCIPAL
// ======================================================
export default function ReporteVelsa() {
  const [tabActiva, setTabActiva] = useState("GENERAL");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);
  const prefetchRef = useRef(null);
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
    canal: [],
  });

  // filtrosAplicados = los que realmente usa la consulta; solo se actualizan al presionar "APLICAR FILTROS"
  const [filtrosAplicados, setFiltrosAplicados] = useState({
    fechaDesde: getFechaHoyEcuador(),
    fechaHasta: getFechaHoyEcuador(),
    asesor: "",
    supervisor: "",
    estadoNetlife: "",
    estadoRegularizacion: "",
    etapaCRM: "",
    etapaJotform: "",
    canal: [],
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

  // ── Nombres de supervisores para el dropdown ──────────────────────────────
  const nombresSupervisores = useMemo(
    () => [...(data.supervisores || [])].sort((a, b) => (a.nombre_grupo > b.nombre_grupo ? 1 : -1)),
    [data.supervisores]
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

  // Pre-fetch silencioso: calienta el caché del servidor para monitoreo y reporte180
  const prefetchBackground = useCallback((filtrosActivos) => {
    if (prefetchRef.current) prefetchRef.current.abort();
    const ctrl = new AbortController();
    prefetchRef.current = ctrl;
    const p180 = new URLSearchParams(Object.fromEntries(
      Object.entries(filtrosActivos)
        .filter(([_, v]) => Array.isArray(v) ? v.length > 0 : v !== "")
        .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])
    ));
    Promise.allSettled([
      fetch(`${import.meta.env.VITE_API_URL}/api/indicadores-velsa/monitoreo-diario`, { signal: ctrl.signal }),
      fetch(`${import.meta.env.VITE_API_URL}/api/indicadores-velsa/reporte180?${p180}`, { signal: ctrl.signal }),
    ]).catch(() => {});
  }, []);

  const fetchDashboard = async (filtrosOverride) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setLoading(true);
    try {
      const filtrosActivos = filtrosOverride || filtrosAplicados;
      const p = new URLSearchParams(Object.fromEntries(
        Object.entries(filtrosActivos)
          .filter(([_, v]) => Array.isArray(v) ? v.length > 0 : v !== "")
          .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])
      ));
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores-velsa/dashboard?${p}`, { signal: ctrl.signal });
      const result = await res.json();
      if (result.success) {
        setData({ ...result, porcentajeTarjeta: Number(result.porcentajeTarjeta ?? 0), porcentajeTerceraEdad: Number(result.porcentajeTerceraEdad ?? 0) });
        mostrarAlertas(result.supervisores);
        // Pre-calentar las otras tabs en background (sin bloquear UI)
        prefetchBackground(filtrosActivos);
      }
    } catch (e) { if (e.name !== 'AbortError') console.error("Error Dashboard:", e); }
    finally { if (!ctrl.signal.aborted) setLoading(false); }
  };

  const fetchMonitoreo = async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores-velsa/monitoreo-diario`, { signal: ctrl.signal });
      const result = await res.json();
      if (result.success) setMonitoreoData(result);
    } catch (e) { if (e.name !== 'AbortError') console.error("Error Monitoreo:", e); }
    finally { if (!ctrl.signal.aborted) setLoading(false); }
  };

  const fetchReporte180 = async (filtrosOverride) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setLoading(true);
    try {
      const filtrosActivos = filtrosOverride || filtros180;
      const p = new URLSearchParams(Object.fromEntries(
        Object.entries(filtrosActivos)
          .filter(([_, v]) => Array.isArray(v) ? v.length > 0 : v !== "")
          .map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v])
      ));
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores-velsa/reporte180?${p}`, { signal: ctrl.signal });
      const result = await res.json();
      if (result.success) setReporte180Data(result);
    } catch (e) { if (e.name !== 'AbortError') console.error("Error Reporte180:", e); }
    finally { if (!ctrl.signal.aborted) setLoading(false); }
  };

  // ── Helper: actualiza el estado visual de filtros; la consulta se ejecuta al presionar "APLICAR FILTROS" ─
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

  // ─── Informe Gerencial 360° VELSA ─────────────────────────────────────────
  const generarInforme360 = () => {
    const hoy = new Date();
    const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const diaSemana = hoy.getDay();
    const diaActual = DIAS[diaSemana];
    const esFinDeSemana = diaSemana === 0 || diaSemana === 6;
    const esSabado = diaSemana === 6;
    const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1);
    const diaManana = DIAS[manana.getDay()];
    const mananaEsFDS = manana.getDay() === 0 || manana.getDay() === 6;
    const mananaEsSabado = manana.getDay() === 6;
    const esPrevioFDS = diaSemana === 5;

    const horaActual = hoy.getHours() + hoy.getMinutes() / 60;
    const INICIO = 8, FIN = 18;
    const pctDia = Math.min(1, Math.max(0.05, (horaActual - INICIO) / (FIN - INICIO)));
    const META_DIA = 65;
    const factorManana = mananaEsFDS ? (mananaEsSabado ? 0.60 : 0.28) : 1.0;
    const factorHoy = esFinDeSemana ? (esSabado ? 0.60 : 0.28) : 1.0;

    const jotActual = Number(stats.ingresosJotform || 0);
    const metaAjustadaHoy = Math.round(META_DIA * factorHoy);
    const metaAHora = Math.round(metaAjustadaHoy * pctDia);
    const brechaJOT = jotActual - metaAHora;
    const proyeccionCierre = pctDia > 0 ? Math.round(jotActual / pctDia) : jotActual;
    const proyeccionManana = Math.round(META_DIA * factorManana);
    const estadoDia = brechaJOT >= 0 ? '🟢 EN META' : brechaJOT >= -8 ? '🟡 EN RIESGO' : '🔴 BAJO META';
    const colorEstado = brechaJOT >= 0 ? '#059669' : brechaJOT >= -8 ? '#d97706' : '#dc2626';
    const bgEstado = brechaJOT >= 0 ? '#fff7ed' : brechaJOT >= -8 ? '#fffbeb' : '#fef2f2';
    const borderEstado = brechaJOT >= 0 ? '#f97316' : brechaJOT >= -8 ? '#f59e0b' : '#ef4444';

    const sups = [...(data.supervisores || [])].filter(s => s.nombre_grupo);
    const supsOrd = [...sups].sort((a, b) => Number(b.ingresos_reales) - Number(a.ingresos_reales));
    const top3 = supsOrd.slice(0, 3);
    const bot3 = [...supsOrd].reverse().slice(0, 3).filter(s => Number(s.ingresos_reales || 0) < Number(supsOrd[0]?.ingresos_reales || 99));

    const semaforo = (val, good, warn) => val >= good ? '#059669' : val >= warn ? '#d97706' : '#dc2626';
    const f1 = v => isNaN(Number(v)) ? '—' : Number(v).toFixed(1);

    const estrategiaTop = (s) => {
      const ef = Number(s.eficiencia || 0);
      const jot = Number(s.ingresos_reales || 0);
      const inst = Number(s.tasa_instalacion || 0);
      const desc = Number(s.pct_descarte || 0);
      if (ef >= 40) return `Efectividad ${ef.toFixed(1)}% sobresaliente — compartir cadencia de llamadas y proceso de calificación.`;
      if (inst >= 88) return `Tasa instalación ${inst.toFixed(1)}% — coordinación técnica ejemplar. Replicar protocolo post-cierre.`;
      if (desc <= 25) return `Descarte ${desc.toFixed(1)}% — gestión de leads de alta calidad. Revisar criterios de filtrado.`;
      return `Producción ${jot} JOT destacada — replicar metodología de seguimiento y timing de contacto.`;
    };

    const acciones = [];
    if (brechaJOT < -5) acciones.push('📞 Activar recuperación de leads sin gestión — redistribuir entre asesores disponibles.');
    if (Number(stats.efectividad) < 38) acciones.push('🎯 Efectividad por debajo del umbral — sesión de roleplay y revisión de objeciones.');
    if (Number(stats.descartePorc) > 35) acciones.push('🔍 Descarte elevado — ajustar segmentación de campaña y criterios de calificación VELSA.');
    if (Number(stats.tasaInstalacion) < 80) acciones.push('🔧 Tasa instalación baja — coordinación urgente área técnica, priorizar agenda del día.');
    if (Number(stats.regularizar) > 5) acciones.push(`📝 ${stats.regularizar} casos por regularizar — resolver antes del mediodía, involucrar coordinador.`);
    if (top3[0]) acciones.push(`🏆 Compartir metodología de ${top3[0]?.nombre_grupo} — sesión de best-practice con el equipo completo.`);
    if (mananaEsFDS) {
      acciones.push(`📅 ${diaManana} es ${mananaEsSabado ? 'sábado' : 'domingo'} — meta ajustada a ${proyeccionManana} JOT. Solo equipo rotativo.`);
      acciones.push('💬 Enviar resumen semanal de VELSA a gerencia antes del cierre de hoy.');
    } else if (esPrevioFDS) {
      acciones.push('📊 Consolidar métricas semanales — enviar reporte a coordinación antes de las 17h.');
    } else {
      acciones.push('📋 Briefing 07:45 con supervisores VELSA — asignar focos del día y metas por asesor.');
    }
    if (acciones.length < 4) acciones.push('✅ Equipo en condiciones óptimas — mantener ritmo y reforzar seguimiento de leads tibios.');

    const fechaStr = `${hoy.getDate()} de ${MESES[hoy.getMonth()]} de ${hoy.getFullYear()}`;
    const horaStr = hoy.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
<title>Informe 360° VELSA — ${fechaStr}</title>
<style>
@page{size:A4;margin:0mm 13mm 10mm;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;font-size:8.5pt;color:#0f172a;background:#fff;}
.p2{page-break-before:always;}
/* ── Barra de color corporativo ── */
.topbar{height:6px;background:linear-gradient(90deg,#1A3A6E 0%,#378ADD 65%,#70bdf5 100%);margin-bottom:0;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
/* ── Header ── */
.hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1A3A6E;padding:9px 0 9px;margin-bottom:11px;}
.hdr-logo{display:flex;align-items:center;gap:9px;}
.hdr-badge{background:#1A3A6E;color:#fff;font-size:10pt;font-weight:900;padding:5px 11px;border-radius:5px;letter-spacing:1px;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.hdr-tag{background:#f97316;color:#fff;font-size:7pt;font-weight:900;padding:2px 7px;border-radius:3px;letter-spacing:.5px;vertical-align:middle;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.hdr h1{font-size:13pt;font-weight:900;color:#1A3A6E;letter-spacing:-0.3px;margin:0;}
.hdr p{font-size:7pt;color:#64748b;margin-top:2px;}
.hdr-r{text-align:right;font-size:7pt;color:#64748b;line-height:1.7;}
.hdr-r .dia{font-size:9.5pt;font-weight:900;color:#1A3A6E;}
/* ── Secciones ── */
.sec{font-size:7.5pt;font-weight:900;text-transform:uppercase;letter-spacing:.9px;color:#1A3A6E;border-left:3px solid #378ADD;padding:4px 8px;margin:11px 0 5px;background:#eef4fc;border-radius:0 4px 4px 0;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.sec.red{color:#b91c1c;border-color:#ef4444;background:#fff5f5;}
/* ── Banner estado ── */
.banner{border-radius:8px;padding:8px 13px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:10px;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.banner .estado{font-size:12pt;font-weight:900;}
.banner .det{font-size:7pt;color:#334155;text-align:right;line-height:1.7;}
/* ── KPI Cards ── */
.kgrid{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin-bottom:11px;}
.kcard{border-radius:7px;padding:8px 6px;border-width:1px;border-style:solid;text-align:center;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.kcard .lbl{font-size:5.5pt;color:#64748b;font-weight:700;text-transform:uppercase;margin-bottom:3px;letter-spacing:.3px;}
.kcard .val{font-size:17pt;font-weight:900;line-height:1.1;}
.kcard .meta{font-size:5.5pt;color:#94a3b8;margin-top:2px;}
/* ── Tablas ── */
table{width:100%;border-collapse:collapse;margin-bottom:10px;}
th{background:#1A3A6E;color:#fff;font-size:6.5pt;font-weight:700;padding:6px 4px;text-align:center;text-transform:uppercase;letter-spacing:.3px;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
td{font-size:7pt;padding:4.5px 3px;border-bottom:1px solid #dbe8f8;text-align:center;}
tr:nth-child(even) td{background:#f0f6ff;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
.tdn{text-align:left;font-weight:700;color:#1A3A6E;padding-left:7px;}
/* ── Cards supervisor / proyección ── */
.pcard{border-radius:8px;padding:9px 11px;margin-bottom:6px;border-width:1px;border-style:solid;}
.pcard .pname{font-size:9pt;font-weight:900;color:#0f172a;}
.pcard .pmeta{display:flex;gap:10px;margin-top:3px;font-size:7pt;color:#475569;flex-wrap:wrap;}
.pcard .ptip{margin-top:5px;font-size:7pt;color:#334155;background:#f0f6ff;border-radius:4px;padding:5px 8px;border-left:2px solid #378ADD;}
.pgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:11px;}
.pcrd{border-radius:9px;padding:11px 13px;border-width:1px;border-style:solid;}
.pcrd .pl{font-size:6pt;font-weight:900;text-transform:uppercase;margin-bottom:4px;letter-spacing:.4px;}
.pcrd .pv{font-size:22pt;font-weight:900;line-height:1.05;}
.pcrd .pd{font-size:6.5pt;margin-top:4px;color:#475569;line-height:1.5;}
/* ── Acciones ── */
.aitem{display:flex;gap:7px;padding:5px 0;border-bottom:1px solid #dbe8f8;font-size:8pt;align-items:flex-start;}
/* ── Footer ── */
.ftr{margin-top:12px;padding-top:6px;border-top:2px solid #1A3A6E;font-size:6.5pt;color:#64748b;display:flex;justify-content:space-between;align-items:center;}
.ftr-logo{font-weight:900;color:#1A3A6E;letter-spacing:.5px;font-size:7pt;}
</style></head><body>
<div class="topbar"></div>
<div class="hdr">
  <div class="hdr-logo">
    <span class="hdr-badge">NOVO ERP</span>
    <div>
      <h1>SISTEMA DE INDICADORES &nbsp;<span class="hdr-tag">VELSA</span></h1>
      <p>Informe de Gestión Comercial 360° — Velsa</p>
    </div>
  </div>
  <div class="hdr-r"><div class="dia">${diaActual.toUpperCase()}, ${fechaStr}</div><div>Generado: ${horaStr} &nbsp;·&nbsp; Período: ${filtros.fechaDesde} → ${filtros.fechaHasta}</div></div>
</div>
<div class="banner" style="background:${bgEstado};border:1.5px solid ${borderEstado};">
  <span class="estado" style="color:${colorEstado}">${estadoDia}</span>
  <span class="det">JOT logrados: <b>${jotActual}</b> &nbsp;·&nbsp; Meta a esta hora: <b>${metaAHora}</b> &nbsp;·&nbsp; Brecha: <b>${brechaJOT>=0?'+':''}${brechaJOT}</b><br/>
  ${esFinDeSemana?`⚠️ ${diaActual} — meta ajustada al ${Math.round(factorHoy*100)}% &nbsp;·&nbsp; `:''}Ritmo proyecta <b>${proyeccionCierre} JOT</b> al cierre</span>
</div>
<div class="sec">📊 Indicadores Clave del Día</div>
<div class="kgrid">
${[
  {l:'Leads Totales',v:stats.leadsGestionables,c:'#ea580c',bg:'#fff7ed'},
  {l:'Ingresos JOT',v:jotActual,c:brechaJOT>=0?'#059669':'#dc2626',bg:brechaJOT>=0?'#f0fdf4':'#fef2f2'},
  {l:'Efectividad',v:`${f1(stats.efectividad)}%`,c:semaforo(Number(stats.efectividad),40,25),bg:'#fafaf9'},
  {l:'Tasa Inst.',v:`${f1(stats.tasaInstalacion)}%`,c:semaforo(Number(stats.tasaInstalacion),80,65),bg:'#fafaf9'},
  {l:'Descarte %',v:`${f1(stats.descartePorc)}%`,c:Number(stats.descartePorc)<=30?'#059669':'#dc2626',bg:'#fafaf9'},
  {l:'Regularizar',v:stats.regularizar||0,c:Number(stats.regularizar)>0?'#d97706':'#059669',bg:Number(stats.regularizar)>0?'#fffbeb':'#f0fdf4'},
].map(k=>`<div class="kcard" style="background:${k.bg};border-color:${k.c}40"><div class="lbl">${k.l}</div><div class="val" style="color:${k.c}">${k.v}</div></div>`).join('')}
</div>
<div class="sec">📋 Evaluación 360° por Supervisor</div>
<table><thead><tr><th style="text-align:left;padding-left:6px">Supervisor</th><th>JOT</th><th>Leads</th><th>Efectiv.</th><th>Tasa Inst.</th><th>Activos</th><th>Descarte</th><th>Est.</th></tr></thead>
<tbody>${sups.slice(0,13).map(s=>{
  const jot=Number(s.ingresos_reales||0);
  const leads=Number(s.leads_gestionables||0);
  const ef=leads>0?((jot/leads)*100).toFixed(1):'0.0';
  const inst=Number(s.tasa_instalacion||0);
  const act=Number(s.ventas_activas||0);
  const desc=Number(s.pct_descarte||0);
  const est=jot>=12?'🟢':jot>=6?'🟡':'🔴';
  return`<tr><td class="tdn">${s.nombre_grupo||'—'}</td><td style="color:${semaforo(jot,12,6)};font-weight:900">${jot}</td><td>${leads}</td><td style="color:${semaforo(Number(ef),40,25)};font-weight:700">${ef}%</td><td style="color:${semaforo(inst,80,65)};font-weight:700">${inst.toFixed(1)}%</td><td>${act}</td><td style="color:${Number(desc)<=30?'#059669':'#dc2626'}">${desc.toFixed(1)}%</td><td>${est}</td></tr>`;
}).join('')}</tbody></table>
<div class="ftr"><span class="ftr-logo">▌ NOVO ERP · VELSA</span><span>Informe de Gestión Comercial 360° · Confidencial · Uso Gerencial</span><span>Página 1 / 2</span></div>
<div class="p2">
<div class="topbar"></div>
<div class="hdr">
  <div class="hdr-logo">
    <span class="hdr-badge">NOVO ERP</span>
    <div>
      <h1>ESTRATEGIA &amp; ACCIÓN &nbsp;<span class="hdr-tag">VELSA</span></h1>
      <p>Velsa · Indicadores Comerciales · ${diaActual} ${fechaStr}</p>
    </div>
  </div>
  <div class="hdr-r"><div class="dia">Para: Gerencia y Coordinadores</div><div>Confidencial · Uso interno</div></div>
</div>
<div class="sec">🏆 TOP 3 — Replicar Estrategia</div>
${top3.map((s,i)=>{
  const jot=Number(s.ingresos_reales||0);
  const leads=Number(s.leads_gestionables||0);
  const ef=leads>0?((jot/leads)*100).toFixed(1):'0.0';
  const act=Number(s.ventas_activas||0);
  const clr=['#c2410c','#b45309','#7c3aed'][i];
  const bg=['#fff7ed','#fefce8','#faf5ff'][i];
  const bc=['#fb923c','#fbbf24','#a78bfa'][i];
  return`<div class="pcard" style="background:${bg};border-color:${bc}"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:14pt;font-weight:900;color:${clr};min-width:26px">#${i+1}</span><div><div class="pname">${s.nombre_grupo||'—'}</div><div class="pmeta"><span>JOT: <b>${jot}</b></span><span>Leads: <b>${leads}</b></span><span>Efectividad: <b>${ef}%</b></span><span>Activos: <b>${act}</b></span></div></div></div><div class="ptip" style="border-color:${bc}">💡 ${estrategiaTop(s)}</div></div>`;
}).join('')}
<div class="sec red">🚨 FOCOS DE INTERVENCIÓN</div>
${bot3.slice(0,3).map(s=>{
  const jot=Number(s.ingresos_reales||0);
  const leads=Number(s.leads_gestionables||0);
  const ef=leads>0?((jot/leads)*100).toFixed(1):'0.0';
  const desc=Number(s.pct_descarte||0);
  const causas=[];
  if(Number(ef)<20)causas.push(`efectividad ${ef}% — revisar proceso de calificación y script`);
  if(desc>40)causas.push(`descarte ${desc.toFixed(1)}% — revisar calidad de leads VELSA`);
  if(jot<4)causas.push(`producción mínima (${jot} JOT) — acompañamiento directo urgente`);
  if(!causas.length)causas.push(`métricas bajo el promedio del equipo — agendar reunión 1:1 hoy`);
  return`<div class="pcard" style="background:#fef2f2;border-color:#fca5a5"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:12pt;font-weight:900;color:#dc2626;min-width:26px">⚠️</span><div><div class="pname">${s.nombre_grupo||'—'}</div><div class="pmeta"><span>JOT: <b style="color:#dc2626">${jot}</b></span><span>Leads: <b>${leads}</b></span><span>Efectividad: <b style="color:#dc2626">${ef}%</b></span><span>Descarte: <b style="color:#dc2626">${desc.toFixed(1)}%</b></span></div></div></div><div class="ptip" style="border-color:#ef4444;background:#fff5f5">🔧 ${causas.join(' · ')}</div></div>`;
}).join('')}
<div class="sec">🔮 Proyección para Mañana — ${diaManana.toUpperCase()}</div>
<div class="pgrid">
  <div class="pcrd" style="background:#fff7ed;border-color:#fb923c"><div class="pl" style="color:#c2410c">📈 Cierre Estimado Hoy</div><div class="pv" style="color:#c2410c">${proyeccionCierre} JOT</div><div class="pd">Ritmo: ${jotActual} JOT en el ${(pctDia*100).toFixed(0)}% del día · Meta: ${metaAjustadaHoy}${esFinDeSemana?' (ajustada)':''}<br/>${brechaJOT>=0?'✅ Tendencia positiva — mantener cadencia':'⚠️ Acelerar cierres en las próximas horas'}</div></div>
  <div class="pcrd" style="background:${mananaEsFDS?'#fffbeb':'#f0fdf4'};border-color:${mananaEsFDS?'#fbbf24':'#10b981'}"><div class="pl" style="color:${mananaEsFDS?'#92400e':'#065f46'}">🎯 Meta ${diaManana}</div><div class="pv" style="color:${mananaEsFDS?'#d97706':'#059669'}">${proyeccionManana} JOT</div><div class="pd">${mananaEsFDS?`⚠️ Fin de semana — factor ${Math.round(factorManana*100)}% aplicado<br/>Enfoque en leads de alta intención, no cantidad`:`📅 Jornada completa — meta estándar ${META_DIA} JOT<br/>Briefing supervisores VELSA a las 07:45`}</div></div>
</div>
<div class="sec">⚡ Plan de Acción — ${diaManana.toUpperCase()}</div>
${acciones.map((a,i)=>`<div class="aitem"><span style="color:#ea580c;font-weight:900;min-width:20px">${i+1}.</span><span>${a}</span></div>`).join('')}
<div class="ftr"><span class="ftr-logo">▌ NOVO ERP · VELSA</span><span>Informe Gerencial 360° · Confidencial · Generado: ${horaStr}</span><span>Página 2 / 2 · ${fechaStr}</span></div>
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),350);</script>
</body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
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
    const g   = Number(a.real_dia_leads   || 0);
    const j   = Number(a.v_subida_jot_hoy || 0);
    const crm = Number(a.v_subida_crm_hoy || 0);
    const act = Number(a.activos_jot_hoy  || 0);
    const pct = (num, den) => den > 0 ? parseFloat(((num / den) * 100).toFixed(1)) : 0;
    return { nombre: a.nombre_grupo, gestionables: g, jot: j, crm, activos: act,
      efect_jot: pct(j, g), efect_crm: pct(crm, g), efect_pauta: pct(act, g) };
  });
  const dataGraficoSupervisores = (monitoreoData.supervisores || []).map(s => {
    const g   = Number(s.real_dia_leads   || 0);
    const j   = Number(s.v_subida_jot_hoy || 0);
    const crm = Number(s.v_subida_crm_hoy || 0);
    const act = Number(s.activos_jot_hoy  || 0);
    const pct = (num, den) => den > 0 ? parseFloat(((num / den) * 100).toFixed(1)) : 0;
    return { nombre: s.nombre_grupo, gestionables: g, jot: j, crm, activos: act,
      efect_jot: pct(j, g), efect_crm: pct(crm, g), efect_pauta: pct(act, g) };
  });
  const totalBarrasDia = (data.graficoBarrasDia || []).reduce((acc, d) => acc + Number(d.total || 0), 0);

  const inputCls = "bg-white border border-stone-300 rounded-xl px-3 py-2.5 text-[10px] font-bold text-slate-800 outline-none focus:border-orange-500 transition-colors uppercase";
  const selectCls = "bg-white border border-stone-300 rounded-xl px-3 py-2.5 text-[10px] font-bold text-slate-800 outline-none appearance-none uppercase";

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
              <span className="text-[8px] font-black text-slate-800 shrink-0">{entry.total}</span>
              <span className="text-[8px] font-bold text-stone-500 shrink-0">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const TooltipEfect = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: '#0c0a09', border: '1px solid #44403c', borderRadius: 8, padding: '8px 12px', fontSize: 9 }}>
        <div style={{ color: '#a8a29e', fontWeight: 700, marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => <div key={i} style={{ color: p.color, fontWeight: 800 }}>{p.name}: {p.value}{p.name?.startsWith('%') ? '%' : ''}</div>)}
      </div>
    );
  };

  const GraficoAsesores = () => (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={dataGraficoAsesores} margin={{ top: 20, right: 45, left: 0, bottom: 80 }} barCategoryGap="20%" barGap={2}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1c1917" />
        <XAxis dataKey="nombre" axisLine={false} tickLine={false} tick={<CustomXAxisTickVertical />} interval={0} />
        <YAxis yAxisId="vol" axisLine={false} tickLine={false} tick={{ fill: '#57534e', fontSize: 9 }} />
        <YAxis yAxisId="pct" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#a8a29e', fontSize: 9 }} unit="%" domain={[0, 'auto']} width={38} />
        <Tooltip content={<TooltipEfect />} />
        <Legend wrapperStyle={{ fontSize: 8, paddingTop: 4 }}
          formatter={v => ({ gestionables:'Gestionables', jot:'JOT', crm:'CRM V.Sub.', activos:'Activos',
            efect_jot:'% Ef.JOT', efect_crm:'% Ef.CRM', efect_pauta:'% Ef.Pauta' }[v] || v)} />
        <Bar yAxisId="vol" dataKey="gestionables" fill="#f97316" radius={[4,4,0,0]} barSize={12} label={{ position:'top', fill:'#fdba74', fontSize:8, fontWeight:900 }} />
        <Bar yAxisId="vol" dataKey="jot"          fill="#10b981" radius={[4,4,0,0]} barSize={12} label={{ position:'top', fill:'#6ee7b7', fontSize:8, fontWeight:900 }} />
        <Bar yAxisId="vol" dataKey="crm"          fill="#3b82f6" radius={[4,4,0,0]} barSize={12} label={{ position:'top', fill:'#93c5fd', fontSize:8, fontWeight:900 }} />
        <Bar yAxisId="vol" dataKey="activos"      fill="#fbbf24" radius={[4,4,0,0]} barSize={12} label={{ position:'top', fill:'#fde68a', fontSize:8, fontWeight:900 }} />
        <Line yAxisId="pct" type="monotone" dataKey="efect_jot"   stroke="#10b981" strokeWidth={2} dot={{ r:3, fill:'#10b981', strokeWidth:0 }}>
          <LabelList dataKey="efect_jot"   position="top" style={{ fontSize:7, fill:'#10b981', fontWeight:800 }} formatter={v => v>0?`${v}%`:''} />
        </Line>
        <Line yAxisId="pct" type="monotone" dataKey="efect_crm"   stroke="#3b82f6" strokeWidth={2} dot={{ r:3, fill:'#3b82f6', strokeWidth:0 }} strokeDasharray="5 3">
          <LabelList dataKey="efect_crm"   position="top" style={{ fontSize:7, fill:'#3b82f6', fontWeight:800 }} formatter={v => v>0?`${v}%`:''} />
        </Line>
        <Line yAxisId="pct" type="monotone" dataKey="efect_pauta" stroke="#fbbf24" strokeWidth={2} dot={{ r:3, fill:'#fbbf24', strokeWidth:0 }} strokeDasharray="2 2">
          <LabelList dataKey="efect_pauta" position="top" style={{ fontSize:7, fill:'#fbbf24', fontWeight:800 }} formatter={v => v>0?`${v}%`:''} />
        </Line>
      </ComposedChart>
    </ResponsiveContainer>
  );

  const GraficoSupervisores = () => (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={dataGraficoSupervisores} margin={{ top: 20, right: 45, left: 0, bottom: 80 }} barCategoryGap="20%" barGap={2}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1c1917" />
        <XAxis dataKey="nombre" axisLine={false} tickLine={false} tick={<CustomXAxisTickVertical />} interval={0} />
        <YAxis yAxisId="vol" axisLine={false} tickLine={false} tick={{ fill: '#57534e', fontSize: 9 }} />
        <YAxis yAxisId="pct" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#a8a29e', fontSize: 9 }} unit="%" domain={[0, 'auto']} width={38} />
        <Tooltip content={<TooltipEfect />} />
        <Legend wrapperStyle={{ fontSize: 8, paddingTop: 4 }}
          formatter={v => ({ gestionables:'Gestionables', jot:'JOT', crm:'CRM V.Sub.', activos:'Activos',
            efect_jot:'% Ef.JOT', efect_crm:'% Ef.CRM', efect_pauta:'% Ef.Pauta' }[v] || v)} />
        <Bar yAxisId="vol" dataKey="gestionables" fill="#ea580c" radius={[4,4,0,0]} barSize={20} label={{ position:'top', fill:'#fb923c', fontSize:8, fontWeight:900 }} />
        <Bar yAxisId="vol" dataKey="jot"          fill="#10b981" radius={[4,4,0,0]} barSize={20} label={{ position:'top', fill:'#6ee7b7', fontSize:8, fontWeight:900 }} />
        <Bar yAxisId="vol" dataKey="crm"          fill="#3b82f6" radius={[4,4,0,0]} barSize={20} label={{ position:'top', fill:'#93c5fd', fontSize:8, fontWeight:900 }} />
        <Bar yAxisId="vol" dataKey="activos"      fill="#fbbf24" radius={[4,4,0,0]} barSize={20} label={{ position:'top', fill:'#fde68a', fontSize:8, fontWeight:900 }} />
        <Line yAxisId="pct" type="monotone" dataKey="efect_jot"   stroke="#10b981" strokeWidth={2.5} dot={{ r:4, fill:'#10b981', strokeWidth:0 }}>
          <LabelList dataKey="efect_jot"   position="top" style={{ fontSize:8, fill:'#10b981', fontWeight:800 }} formatter={v => v>0?`${v}%`:''} />
        </Line>
        <Line yAxisId="pct" type="monotone" dataKey="efect_crm"   stroke="#3b82f6" strokeWidth={2.5} dot={{ r:4, fill:'#3b82f6', strokeWidth:0 }} strokeDasharray="5 3">
          <LabelList dataKey="efect_crm"   position="top" style={{ fontSize:8, fill:'#3b82f6', fontWeight:800 }} formatter={v => v>0?`${v}%`:''} />
        </Line>
        <Line yAxisId="pct" type="monotone" dataKey="efect_pauta" stroke="#fbbf24" strokeWidth={2.5} dot={{ r:4, fill:'#fbbf24', strokeWidth:0 }} strokeDasharray="2 2">
          <LabelList dataKey="efect_pauta" position="top" style={{ fontSize:8, fill:'#fbbf24', fontWeight:800 }} formatter={v => v>0?`${v}%`:''} />
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
          <button onClick={() => setTabActiva("CONSULTA")} className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-[10px] font-black rounded-lg transition-all uppercase ${tabActiva === "CONSULTA" ? "bg-[#1A3A6E] text-white shadow-lg" : "text-stone-500 hover:bg-stone-300"}`}>
            📥 CONSULTA Y DESCARGA
          </button>
        </div>
      </div>

      {tabActiva === "GENERAL" ? (
        <div className="animate-in fade-in duration-500">

          {/* Panel de filtros */}
          <div className="bg-slate-50 rounded-2xl shadow-sm mb-8 overflow-visible border border-slate-200">
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-9 gap-4 items-end">
              {/* Período — solo actualiza al cambiar fecha (no hace fetch por tecla) */}
              <div className="lg:col-span-2 flex flex-col gap-2">
                <label className="text-[9px] font-black text-orange-400 italic tracking-widest uppercase">PERÍODO DE CONSULTA</label>
                <div className="flex bg-white border border-slate-300 rounded-2xl p-1.5 shadow-inner">
                  <input type="date" className="bg-transparent text-slate-800 text-center text-[11px] font-bold outline-none w-full"
                    value={filtros.fechaDesde}
                    onChange={e => updateFiltro('fechaDesde', e.target.value)} />
                  <div className="text-slate-400 px-2 font-black self-center">-</div>
                  <input type="date" className="bg-transparent text-slate-800 text-center text-[11px] font-bold outline-none w-full"
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
                <select className={selectCls} value={filtros.supervisor}
                  onChange={e => updateFiltro('supervisor', e.target.value)}>
                  <option value="">TODOS</option>
                  {nombresSupervisores.map((s) => (
                    <option key={s.nombre_grupo} value={s.nombre_grupo}>{s.nombre_grupo}</option>
                  ))}
                </select>
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
                <MultiSelectCanal
                  value={filtros.canal}
                  onChange={vals => updateFiltro('canal', vals)}
                  options={data.canales || []}
                  accentColor="orange"
                />
              </div>

              <button onClick={() => { setFiltrosAplicados(filtros); fetchDashboard(filtros); }} className="bg-orange-600 hover:bg-orange-500 text-white h-[42px] rounded-xl text-[10px] font-black shadow-lg shadow-orange-900/20 transition-all active:scale-95 uppercase">
                {loading ? "CARGANDO..." : "APLICAR FILTROS"}
              </button>
              <button onClick={generarInforme360} className="bg-stone-800 hover:bg-stone-700 text-white h-[42px] rounded-xl text-[10px] font-black shadow-lg transition-all active:scale-95 uppercase flex items-center justify-center gap-1.5">
                <span>📄</span> Informe 360°
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
            <ExpandableChart title={`PRODUCCIÓN POR DÍA (CERRADOS) — TOTAL: ${totalBarrasDia}`} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md" modalHeight={500}>
              <h3 className="text-[10px] font-black text-orange-600 mb-8 italic tracking-widest flex items-center gap-2 flex-wrap uppercase">
                <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse shrink-0"></span>
                PRODUCCIÓN POR DÍA (CERRADOS)
                <span className="ml-2 bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBarrasDia}</span>
                <span className="ml-auto flex items-center gap-2 text-[9px] text-stone-400 font-bold not-italic">
                  <span className="w-3 h-2 bg-orange-500 rounded inline-block"></span> REAL
                  <span className="w-3 h-2 bg-amber-400 rounded inline-block"></span> ACTIVOS
                  <span className="w-3 h-2 bg-red-500/50 rounded inline-block"></span> FALTA
                  <span className="w-4 border-t-2 border-dashed border-orange-400 inline-block"></span> META 65
                </span>
              </h3>
              <div className="h-[300px]"><GraficoBarrasDia /></div>
            </ExpandableChart>

            <ExpandableChart title={`EMBUDO DE CONVERSIÓN — TOTAL: ${totalBaseEmbudo}`} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md" modalHeight={500}>
              <h3 className="text-[10px] font-black text-orange-600 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
                <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
                EMBUDO DE CONVERSIÓN
                <span className="ml-2 bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBaseEmbudo}</span>
              </h3>
              <div className="h-[300px]"><GraficoEmbudo /></div>
            </ExpandableChart>
          </div>

          {/* Tablas */}
          <div className="mb-8"><HorizontalTable title="KPI POR SUPERVISOR" data={data.supervisores} /></div>
          <div className="mb-8"><HorizontalTable title="KPI POR ASESOR" data={data.asesores} hasScroll={true} /></div>
          <div className="grid grid-cols-1 gap-4">
            <DataVisor title="DETALLE BASE CRM" data={data.dataCRM} onDownload={() => descargarExcel("CRM")} color="bg-stone-600" />
            <DataVisor title="DETALLE BASE JOTFORM (NETLIFE)" data={data.dataNetlife} onDownload={() => descargarExcel("JOTFORM")} color="bg-orange-600" />
          </div>
        </div>

      ) : tabActiva === "MONITOREO" ? (
        <div className="animate-in slide-in-from-right-5 duration-500 space-y-6">
          <div className="bg-orange-600 text-white p-5 rounded-2xl flex justify-between items-center shadow-xl border-b-4 border-orange-700">
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
            <ExpandableChart title="ASESORES — GESTIONABLES VS INGRESOS HOY" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-md" modalHeight={500}>
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

            <ExpandableChart title="SUPERVISORES — GESTIONABLES VS INGRESOS HOY" className="bg-white p-5 rounded-2xl border border-slate-200 shadow-md" modalHeight={500}>
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
        <ConsultaDescargaVelsa />
      )}
    </div>
  );
}

// ======================================================
// CONSULTA Y DESCARGA — VELSA
// ======================================================
const COLUMNAS_VELSA = [
  { header: 'FECHA DE CARGA A JOT',                    field: 'created_at' },
  { header: 'ID NEGOCIACIÓN',                           field: 'id_bitrix' },
  { header: 'CODIGO EJECUTIVO',                         field: 'codigo_asesor' },
  { header: 'PLAN. CASA',                               field: 'plan_casa' },
  { header: 'PLAN. PROFESIONAL.',                       field: 'plan_profesional' },
  { header: 'PLAN PYME',                                field: 'plan_pyme' },
  { header: 'PLAN HOGAR ADULTO MAYOR',                  field: 'plan_hogar_adulto_mayor' },
  { header: 'APLICA DESCUENTO (3ERA EDAD O CONADIS)',   field: 'aplica_descuento' },
  { header: 'ADICIONAL',                                field: 'servicio_normales' },
  { header: 'LOGIN',                                    field: 'inicio_sesion_netlife' },
  { header: 'ESTADO DE NETLIFE',                        field: 'estado_venta_netlife' },
  { header: 'FORMA DE PAGO',                            field: 'forma_pago' },
  { header: 'FECHA DE INGRESO A TELCOS',                field: 'ingreso_telcos_vendedores' },
  { header: 'FECHA DE ASIGNACIÓN EN TELCOS',            field: 'fecha_agenda' },
  { header: 'FECHA DE ACTIVACIÓN EN TELCOS',            field: 'fecha_activacion_telcos' },
  { header: 'PROVINCIA',                                field: 'provincia' },
  { header: 'CIUDAD',                                   field: 'ciudad' },
  { header: 'OBSERVACIÓN DE LA VENTA',                  field: 'observacion_venta' },
  { header: 'ESTADO DE REGULARIZACIÓN',                 field: 'estado_regularizacion_novo' },
  { header: 'DETALLE DE REGULARIZACIÓN',                field: 'detalle_regularizacion' },
  { header: 'COBRO TC CLIENTE',                         field: null },
];

function ConsultaDescargaVelsa() {
  const hoy = new Date().toISOString().split('T')[0];
  const [fechaDesde, setFechaDesde] = useState(hoy);
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [loading,    setLoading]    = useState(false);
  const [rows,       setRows]       = useState(null);
  const [error,      setError]      = useState(null);

  const consultar = async () => {
    setLoading(true); setError(null); setRows(null);
    try {
      const res    = await fetch(`${import.meta.env.VITE_API_URL}/api/indicadores-velsa/consulta-descarga?fechaDesde=${fechaDesde}&fechaHasta=${fechaHasta}`);
      const result = await res.json();
      if (result.success) setRows(result.rows);
      else setError(result.error || 'Error al consultar');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const descargarExcel = () => {
    if (!rows || rows.length === 0) return;
    const header = COLUMNAS_VELSA.map(c => c.header);
    const data_  = rows.map(row =>
      COLUMNAS_VELSA.map(c => {
        if (!c.field) return '';
        const v = row[c.field];
        if (v === null || v === undefined) return '';
        if (c.field.startsWith('fecha') || c.field === 'created_at' || c.field === 'ingreso_telcos_vendedores') {
          try { return new Date(v).toLocaleDateString('es-EC'); } catch { return String(v); }
        }
        return v;
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([header, ...data_]);
    ws['!cols'] = COLUMNAS_VELSA.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Velsa');
    XLSX.writeFile(wb, `Consulta_Velsa_${fechaDesde}_${fechaHasta}.xlsx`);
  };

  return (
    <div className="animate-in slide-in-from-right-5 duration-500 space-y-5">
      {/* Header panel */}
      <div className="bg-[#1A3A6E] text-white p-5 rounded-2xl flex justify-between items-center shadow-xl border-b-4 border-[#0f2550]">
        <div>
          <h2 className="text-lg font-black italic tracking-tighter flex items-center gap-2 uppercase">📥 CONSULTA Y DESCARGA — VELSA</h2>
          <p className="text-[9px] font-bold text-blue-300 tracking-[0.2em] uppercase mt-1">Vista: vw_jotform_velsa_netlife_completo · Filtro por Fecha de Carga a JOT</p>
        </div>
        <div className="text-right text-[9px] text-blue-300">
          {rows !== null && <div className="text-lg font-black text-white">{rows.length.toLocaleString()} registros</div>}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Fecha Inicio (JOT)</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="border border-stone-300 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Fecha Fin (JOT)</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="border border-stone-300 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
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
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-stone-100 flex justify-between items-center bg-stone-50">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#1A3A6E]">
              Vista previa — {Math.min(rows.length, 200)} de {rows.length.toLocaleString()} registros
            </span>
            <span className="text-[9px] text-stone-400">El Excel contiene todos los registros</span>
          </div>
          {rows.length === 0 ? (
            <div className="py-16 text-center text-stone-400 text-sm">No se encontraron registros para el período seleccionado.</div>
          ) : (
            <div className="overflow-auto max-h-[500px]">
              <table className="text-[8px] font-mono border-collapse w-full whitespace-nowrap">
                <thead className="sticky top-0 z-10">
                  <tr>
                    {COLUMNAS_VELSA.map((c, i) => (
                      <th key={i} className="px-3 py-2 text-left font-black uppercase tracking-widest border-b border-r border-stone-200 last:border-r-0"
                        style={{ background: '#1A3A6E', color: '#fff', minWidth: '120px', fontSize: '7px' }}>
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-amber-50/30'}>
                      {COLUMNAS_VELSA.map((c, ci) => {
                        let val = c.field ? row[c.field] : '';
                        if (val !== null && val !== undefined && (c.field?.startsWith('fecha') || c.field === 'created_at' || c.field === 'ingreso_telcos_vendedores')) {
                          try { val = new Date(val).toLocaleDateString('es-EC'); } catch {}
                        }
                        return (
                          <td key={ci} className="px-3 py-1.5 border-b border-r border-stone-100 last:border-r-0 text-stone-600 max-w-[200px] truncate">
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
          <div className="text-sm font-black text-stone-500">Selecciona el período y presiona "Consultar"</div>
          <div className="text-xs text-stone-400 text-center max-w-sm">Los datos provienen de <span className="font-black text-[#1A3A6E]">vw_jotform_velsa_netlife_completo</span> y se filtran por la fecha de carga en JOT.</div>
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

  // ── Helper: actualiza filtro 180; la consulta se ejecuta al presionar "APLICAR FILTROS" ─
  const updateFiltro180 = (campo, valor) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
  };

  const inputCls = "bg-white border border-stone-300 rounded-xl px-3 py-2.5 text-[10px] font-bold text-slate-800 outline-none focus:border-amber-500 transition-colors uppercase";
  const selectCls = "bg-white border border-stone-300 rounded-xl px-3 py-2.5 text-[10px] font-bold text-slate-800 outline-none appearance-none uppercase";

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
          return <div key={index} className="flex items-center gap-2 min-w-0"><div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORES_EMBUDO_CRM[index % COLORES_EMBUDO_CRM.length] }} /><span className="text-[8px] text-stone-400 truncate leading-tight flex-1 uppercase">{entry.etapa}</span><span className="text-[8px] font-black text-slate-800 shrink-0">{entry.total}</span><span className="text-[8px] font-bold text-stone-500 shrink-0">({pct}%)</span></div>;
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
          return <div key={index} className="flex items-center gap-2 min-w-0"><div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: COLORES_EMBUDO_JOT[index % COLORES_EMBUDO_JOT.length] }} /><span className="text-[8px] text-stone-400 truncate leading-tight flex-1 uppercase">{entry.etapa}</span><span className="text-[8px] font-black text-slate-800 shrink-0">{entry.total}</span><span className="text-[8px] font-bold text-stone-500 shrink-0">({pct}%)</span></div>;
        })}
      </div>
    </div>
  );

  return (
    <div className="animate-in slide-in-from-right-5 duration-500 space-y-6">
      <div className="bg-amber-600 text-white p-5 rounded-2xl flex justify-between items-center shadow-xl border-b-4 border-amber-700">
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

      <div className="bg-slate-50 rounded-2xl shadow-sm overflow-hidden border border-slate-200">
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4 items-end">
          <div className="lg:col-span-2 flex flex-col gap-2">
            <label className="text-[9px] font-black text-amber-600 italic tracking-widest uppercase">PERÍODO</label>
            <div className="flex bg-white border border-slate-300 rounded-2xl p-1.5 shadow-inner">
              <input type="date" className="bg-transparent text-slate-800 text-center text-[11px] font-bold outline-none w-full"
                value={filtros.fechaDesde} onChange={e => updateFiltro180('fechaDesde', e.target.value)} />
              <div className="text-slate-400 px-2 font-black self-center">-</div>
              <input type="date" className="bg-transparent text-slate-800 text-center text-[11px] font-bold outline-none w-full"
                value={filtros.fechaHasta} onChange={e => updateFiltro180('fechaHasta', e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-2"><label className="text-[9px] font-black text-stone-500 italic uppercase">ASESOR</label>
            <select className={selectCls} value={filtros.asesor} onChange={e => updateFiltro180('asesor', e.target.value)}>
              <option value="">TODOS</option>
              {nombresAsesores.map((a) => (
                <option key={a.nombre_grupo} value={a.nombre_grupo}>{a.nombre_grupo}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2"><label className="text-[9px] font-black text-stone-500 italic uppercase">SUPERVISOR</label>
            <select className={selectCls} value={filtros.supervisor} onChange={e => updateFiltro180('supervisor', e.target.value)}>
              <option value="">TODOS</option>
              {nombresSupervisores.map((s) => (
                <option key={s.nombre_grupo} value={s.nombre_grupo}>{s.nombre_grupo}</option>
              ))}
            </select>
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
        <ExpandableChart title={`EMBUDO CRM — ETAPAS DE NEGOCIACIÓN — TOTAL: ${totalBaseEmbudoCRM}`} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md" modalHeight={550}>
          <h3 className="text-[10px] font-black text-amber-600 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
            EMBUDO CRM — ETAPAS DE NEGOCIACIÓN
            <span className="ml-2 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBaseEmbudoCRM}</span>
          </h3>
          <div className="h-[340px]"><GraficoEmbudoCRM /></div>
        </ExpandableChart>

        <ExpandableChart title={`EMBUDO JOTFORM — ESTADOS NETLIFE — TOTAL: ${totalBaseEmbudoJOT}`} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md" modalHeight={550}>
          <h3 className="text-[10px] font-black text-emerald-600 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            EMBUDO JOTFORM — ESTADOS NETLIFE
            <span className="ml-2 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[8px] font-black">TOTAL: {totalBaseEmbudoJOT}</span>
          </h3>
          <div className="h-[340px]"><GraficoEmbudoJOT /></div>
        </ExpandableChart>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md">
        <h3 className="text-[10px] font-black text-orange-600 mb-4 italic tracking-widest flex items-center gap-2 uppercase">
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
                  <th className="bg-slate-100 text-slate-600 p-2 text-left font-black sticky left-0 z-20 border-r border-slate-200 min-w-[120px] uppercase">CIUDAD</th>
                  {fechas.map(f => <th key={f} className="bg-slate-100 text-slate-600 p-1 font-black min-w-[36px] text-center border-l border-slate-200">{f ? f.split('-').slice(1).join('/') : f}</th>)}
                </tr>
              </thead>
              <tbody>
                {ciudades.map((ciudad, ci) => (
                  <tr key={ci} className="hover:bg-slate-50 transition-colors">
                    <td className="sticky left-0 bg-white border-r border-slate-200 p-2 font-black text-slate-700 uppercase truncate max-w-[120px]">{ciudad}</td>
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
      <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
        <h2 className="text-[10px] font-black uppercase italic tracking-[0.2em] text-slate-800 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block"></span>
          {title} <span className="text-slate-500 font-mono normal-case">({safeData.length} registros)</span>
        </h2>
        <button onClick={descargarExcel} className="text-[9px] bg-orange-600 hover:bg-orange-500 px-4 py-1.5 rounded-full font-black transition-all flex items-center gap-2 text-white uppercase">⬇️ EXCEL</button>
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
            <tr className="bg-slate-200 text-slate-800 text-[8px] font-black border-b-2 border-slate-400">
              <td className="px-2 py-1.5 border-r border-slate-400 sticky left-0 bg-slate-200 z-10 whitespace-nowrap" style={{ width: NW, minWidth: NW, maxWidth: NW }}>▶ TOTAL</td>
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
      <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex justify-between items-center text-slate-800">
        <span className="text-[10px] font-black italic tracking-[0.2em] flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block animate-pulse"></span>
          {title} <span className="text-slate-500 font-mono normal-case">({safeData.length} registros)</span>
        </span>
        <button onClick={descargarExcel} className="text-[9px] bg-orange-600 hover:bg-orange-500 px-4 py-1.5 rounded-full font-black transition-all flex items-center gap-2 text-white uppercase">⬇️ EXCEL</button>
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
            <tr className="bg-slate-200 text-slate-800 text-[8px] font-black border-b-2 border-slate-400">
              <td className="p-2 border-r border-slate-400 sticky left-0 bg-slate-200 z-10">▶ TOTAL</td>
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