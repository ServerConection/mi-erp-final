import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { ChevronDown, ChevronUp, ChevronsUpDown, Download, FileSpreadsheet, Info, RefreshCw, Search, SlidersHorizontal, Target, Trophy, X } from 'lucide-react';
import { formatearFechaTelcos } from '../utils/formatoFechaComisiones';
import { filasDesdeLibro } from '../utils/catalogoComisiones';

const API = import.meta.env.VITE_API_URL;
const hoy = () => {
  const d = new Date(), y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dia = String(d.getDate()).padStart(2, '0');
  return { primero: `${y}-${m}-01`, hoy: `${y}-${m}-${dia}`, mes: `${y}-${m}` };
};
const actual = hoy();
const rangoVacio = { desde: '', hasta: '' };
const dinero = (v) => Number(v || 0).toLocaleString('es-EC', { style: 'currency', currency: 'USD' });
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const esSinAsignar = (r) => String(r?.usuario || '').trim().toUpperCase() === 'SIN ASIGNAR';
const rangoMes = (mes) => {
  const [y, m] = mes.split('-').map(Number); const d = new Date();
  const fin = d.getFullYear() === y && d.getMonth() + 1 === m ? d.getDate() : new Date(y, m, 0).getDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(fin).padStart(2, '0')}` };
};
const nombreMes = (mes) => { const [y, m] = mes.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const BONOS = [[40, 40], [50, 60], [60, 80]];

/** Desglose de lo que cobra un asesor (mismas reglas del backend). */
function desglose(r, reglas) {
  const asegurado = r.asegurado_aplicado ? (reglas?.asegurado || 550) : 0;
  const directa = Number(r.valor_comision_directa || 0);
  const pyme = Number(r.valor_pyme_bono || 0);
  const tabla = Math.max(0, Number(r.valor_disponible || 0) - asegurado - directa - pyme);
  return { asegurado, tabla, directa, pyme, bono: Number(r.bono_volumen || 0) };
}
function proximoHito(r, reglas) {
  const meta = reglas?.meta || 35; const n = Number(r.ventas_tabla || 0); const v = Number(r.ventas_volumen || r.activas_regularizadas || 0);
  if (n < meta) return { texto: `Le faltan ${meta - n} a tabla para el asegurado de ${dinero(reglas?.asegurado || 550)}`, tono: 'ambar' };
  const sig = BONOS.find(([desde]) => v < desde);
  if (sig) return { texto: `Le faltan ${sig[0] - v} para el bono de ${dinero(sig[1])}`, tono: 'violeta' };
  return { texto: 'Alcanzó el bono máximo de volumen', tono: 'verde' };
}

function CargaCatalogo({ onCargado }) {
  const [mes, setMes] = useState(actual.mes);
  const [archivo, setArchivo] = useState(null);
  const [meses, setMeses] = useState([]);
  const [estado, setEstado] = useState({ tipo: '', texto: '' });
  const [cargando, setCargando] = useState(false);
  const leerMeses = () => fetch(`${API}/api/comisiones/catalogo`, { headers: auth() })
    .then((r) => r.json()).then((b) => setMeses(b.data?.meses || [])).catch(() => {});
  useEffect(() => { leerMeses(); }, []);
  const subir = async () => {
    if (!archivo) return setEstado({ tipo: 'error', texto: 'Selecciona el Excel del catálogo.' });
    setCargando(true); setEstado({ tipo: '', texto: '' });
    try {
      const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
      const leido = filasDesdeLibro(XLSX, libro);
      if (!leido) throw new Error('No encontré la pestaña CATALOGOS DE PLANES ni una hoja con TIPO y COM MENOR A 35.');
      const r = await fetch(`${API}/api/comisiones/catalogo`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ mes, filas: leido.filas }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      setEstado({ tipo: 'ok', texto: `Catálogo ${b.data.mes} cargado: ${b.data.cargadas} planes con valor (${b.data.omitidas} filas sin valor omitidas).` });
      leerMeses(); onCargado?.();
    } catch (e) { setEstado({ tipo: 'error', texto: e.message }); }
    finally { setCargando(false); }
  };
  return <details className="group rounded-2xl border bg-white p-4 shadow-sm">
    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-black text-slate-700"><FileSpreadsheet className="h-4 w-4 text-amber-600" />Catálogo de comisiones {meses[0] ? <span className="font-semibold text-slate-400">· vigente {meses[0].mes} ({meses[0].filas} planes)</span> : <span className="font-semibold text-red-500">· sin catálogo cargado</span>}<ChevronDown className="ml-auto h-4 w-4 text-slate-400 transition group-open:rotate-180" /></summary>
    <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
      <label className="text-xs font-bold text-slate-600">Mes<input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="mt-1 block rounded-lg border px-3 py-2 text-sm font-normal" /></label>
      <label className="flex-1 text-xs font-bold text-slate-600">Excel del catálogo<input type="file" accept=".xlsx,.xls" onChange={(e) => setArchivo(e.target.files?.[0] || null)} className="mt-1 block w-full rounded-lg border px-3 py-1.5 text-sm font-normal" /></label>
      <button type="button" disabled={cargando} onClick={subir} className="rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50">{cargando ? 'Cargando…' : 'Cargar catálogo'}</button>
    </div>
    <p className="mt-2 text-[11px] text-slate-500">Sube el Excel con la pestaña CATALOGOS DE PLANES. Volver a cargar el mismo mes reemplaza el anterior (queda guardado como inactivo).</p>
    {estado.texto && <div className={`mt-3 rounded-lg p-2 text-sm font-semibold ${estado.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{estado.texto}</div>}
  </details>;
}

function RangoFecha({ titulo, ayuda, value, onChange }) {
  return <fieldset className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
    <legend className="px-1 text-xs font-black text-slate-700">{titulo}</legend>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-[10px] font-bold uppercase text-slate-400">Desde<input aria-label={`${titulo} desde`} type="date" value={value.desde} onChange={(e) => onChange({ ...value, desde: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-700" /></label>
      <label className="text-[10px] font-bold uppercase text-slate-400">Hasta<input aria-label={`${titulo} hasta`} type="date" value={value.hasta} onChange={(e) => onChange({ ...value, hasta: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-700" /></label>
    </div><p className="mt-2 text-[10px] text-slate-500">{ayuda}</p>
  </fieldset>;
}

function BarraMeta({ n, meta }) {
  const pct = Math.min(100, Math.round((Number(n || 0) / meta) * 100));
  return <div className="w-32">
    <div className="flex justify-between text-[10px] font-bold text-slate-500"><span>{n || 0}/{meta}</span><span>{pct}%</span></div>
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct >= 85 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} /></div>
  </div>;
}

const FILTROS = [
  { id: 'todos', txt: 'Todos', fn: () => true },
  { id: 'asegurado', txt: 'Con asegurado', fn: (r) => r.asegurado_aplicado },
  { id: 'cerca', txt: 'Cerca del asegurado', fn: (r, m) => !r.asegurado_aplicado && Number(r.ventas_tabla || 0) >= m - 5 },
  { id: 'pendientes', txt: 'Con por regularizar', fn: (r) => Number(r.activas_por_regularizar) > 0 },
  { id: 'alertas', txt: 'Con alertas', fn: (r) => Number(r.sin_valor) > 0 || Number(r.te_excedentes) > 0 || Number(r.no_vender) > 0 },
];
const COLUMNAS = [
  { k: 'usuario', txt: 'Asesor' },
  { k: 'ultima_fecha_activacion', txt: 'Última activación' },
  { k: 'activas_por_regularizar', txt: 'Por regularizar', c: true },
  { k: 'activas_regularizadas', txt: 'Regularizadas', c: true },
  { k: 'ventas_tabla', txt: 'Meta asegurado', c: true },
  { k: 'valor_total', txt: 'Valor total', r: true },
  { k: 'valor_disponible', txt: 'Disponible', r: true },
];

function Detalle({ r, reglas, empresa, mes, onCerrar }) {
  const d = desglose(r, reglas); const hito = proximoHito(r, reglas);
  const fila = (txt, v, ayuda, tono = 'text-slate-800') => v > 0 && <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2.5"><div><div className="text-sm font-semibold text-slate-700">{txt}</div>{ayuda && <div className="text-[11px] text-slate-400">{ayuda}</div>}</div><div className={`text-sm font-black ${tono}`}>{dinero(v)}</div></div>;
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]" onClick={onCerrar}>
    <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-widest text-amber-600">{empresa} · {nombreMes(mes)}</p><h2 className="mt-1 text-xl font-black text-slate-900">{r.nombre_asesor || r.usuario}</h2><p className="text-xs text-slate-500">{r.usuario} · Código {r.codigo_asesor || '—'}</p><p className="text-[11px] text-slate-400">Última activación {formatearFechaTelcos(r.ultima_fecha_activacion)} · último ingreso Telcos {formatearFechaTelcos(r.ultima_fecha_ingreso_telcos)}</p></div><button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-emerald-50 p-3"><div className="text-2xl font-black text-emerald-700">{r.activas_regularizadas}</div><div className="text-[10px] font-bold uppercase text-emerald-700">Regularizadas</div></div>
        <div className="rounded-xl bg-amber-50 p-3"><div className="text-2xl font-black text-amber-600">{r.activas_por_regularizar}</div><div className="text-[10px] font-bold uppercase text-amber-700">Por regularizar</div></div>
        <div className="rounded-xl bg-blue-50 p-3"><div className="text-2xl font-black text-blue-700">{r.ventas_tabla ?? 0}</div><div className="text-[10px] font-bold uppercase text-blue-700">A tabla</div></div>
      </div>
      <div className="mt-4 rounded-xl border p-3"><div className="flex items-center gap-2 text-xs font-bold text-slate-600"><Target className="h-4 w-4 text-blue-600" />Meta del asegurado</div><div className="mt-2"><BarraMeta n={r.ventas_tabla} meta={reglas?.meta || 35} /></div><p className={`mt-2 text-xs font-semibold ${hito.tono === 'ambar' ? 'text-amber-700' : hito.tono === 'violeta' ? 'text-violet-700' : 'text-emerald-700'}`}>{hito.texto}</p></div>
      <h3 className="mt-5 text-xs font-black uppercase text-slate-500">Cómo se forma lo disponible</h3>
      <div className="mt-1">
        {fila('Asegurado', d.asegurado, `Llegó a ${reglas?.meta || 35} ventas a tabla`, 'text-emerald-700')}
        {fila(r.asegurado_aplicado ? 'Comisión desde la venta 36' : 'Comisión por ventas a tabla', d.tabla, r.asegurado_aplicado ? `Tramo ${r.tramo}` : 'Tabla “hasta 41” por venta')}
        {fila('Planes de comisión', d.directa, 'No cuentan para el asegurado')}
        {fila('PYME como bono', d.pyme, 'Llegó a 35 sin contar PYME')}
        <div className="flex justify-between py-3 text-base font-black text-emerald-700"><span>Disponible</span><span>{dinero(r.valor_disponible)}</span></div>
        {fila('Bono al volumen (aparte, va en el rol)', d.bono, `${r.ventas_volumen ?? r.activas_regularizadas} ventas que cuentan`, 'text-violet-700')}
        {Number(r.valor_total) > Number(r.valor_disponible) && <p className="mt-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Si regulariza sus {r.activas_por_regularizar} pendientes llegaría a <b>{dinero(r.valor_total)}</b>.</p>}
      </div>
      {(Number(r.sin_valor) > 0 || Number(r.te_excedentes) > 0 || Number(r.no_vender) > 0) && <div className="mt-4 space-y-1.5">
        {Number(r.sin_valor) > 0 && <p className="rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-700">{r.sin_valor} ventas sin valor en el catálogo (plan no encontrado).</p>}
        {Number(r.te_excedentes) > 0 && <p className="rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-700">{r.te_excedentes} de tercera edad pasan su 15% y no se pagan.</p>}
        {Number(r.no_vender) > 0 && <p className="rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-800">{r.no_vender} planes “No vender”: se pagan como comisión pero no cuentan como venta.</p>}
      </div>}
      <Link to={`/rol-pagos?${new URLSearchParams({ empresa, mes, usuario: r.usuario })}`} className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-black text-white hover:bg-slate-700"><FileSpreadsheet className="h-4 w-4" />Ver rol de pago</Link>
    </aside>
  </div>;
}

export default function Comisiones() {
  const [empresa, setEmpresa] = useState('NOVONET');
  const [mes, setMes] = useState(actual.mes);
  const [avanzado, setAvanzado] = useState(false);
  const [buscarGlobal, setBuscarGlobal] = useState('');
  const [telcos, setTelcos] = useState(rangoVacio);
  const [jotform, setJotform] = useState(rangoVacio);
  const [activacion, setActivacion] = useState(rangoMes(actual.mes));
  const [filtros, setFiltros] = useState({ activacionDesde: rangoMes(actual.mes).desde, activacionHasta: rangoMes(actual.mes).hasta });
  const [data, setData] = useState({ filas: [], totales: {} });
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [ultima, setUltima] = useState(null);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [orden, setOrden] = useState({ k: 'valor_disponible', dir: -1 });
  const [abierto, setAbierto] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController(); setLoading(true); setError('');
    fetch(`${API}/api/comisiones?${new URLSearchParams({ empresa, ...filtros })}`, { headers: auth(), signal: ctrl.signal })
      .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`); return b; })
      .then((b) => { setData(b.data || { filas: [], totales: {} }); setUltima(new Date()); })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [empresa, filtros, recarga]);
  // Actualización automática cada 10 minutos
  useEffect(() => { const id = setInterval(() => setRecarga((x) => x + 1), 10 * 60 * 1000); return () => clearInterval(id); }, []);
  useEffect(() => { const esc = (e) => { if (e.key === 'Escape') setAbierto(null); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, []);

  const cambiarMes = (m) => { if (!m) return; setMes(m); const r = rangoMes(m); setActivacion(r); setTelcos(rangoVacio); setJotform(rangoVacio); setBuscarGlobal(''); setFiltros({ activacionDesde: r.desde, activacionHasta: r.hasta }); };
  const rangoCorrecto = (r, nombre) => {
    if (!r.desde && !r.hasta) return true;
    if (!r.desde || !r.hasta) { setError(`Completa las dos fechas de ${nombre}.`); return false; }
    if (r.desde > r.hasta) { setError(`La fecha inicial de ${nombre} no puede superar la final.`); return false; }
    return true;
  };
  const consultar = (e) => {
    e.preventDefault();
    if (!rangoCorrecto(telcos, 'Ingreso Telcos') || !rangoCorrecto(jotform, 'Creación Jotform') || !rangoCorrecto(activacion, 'Activación')) return;
    if (!telcos.desde && !jotform.desde && !activacion.desde) return setError('Selecciona al menos un rango de fechas.');
    setFiltros({ buscar: buscarGlobal.trim(), telcosDesde: telcos.desde, telcosHasta: telcos.hasta, jotformDesde: jotform.desde, jotformHasta: jotform.hasta, activacionDesde: activacion.desde, activacionHasta: activacion.hasta });
  };
  const personalizado = Boolean(filtros.buscar || filtros.telcosDesde || filtros.jotformDesde || filtros.activacionDesde !== rangoMes(mes).desde || filtros.activacionHasta !== rangoMes(mes).hasta);

  const t = data.totales || {}; const reglas = data.reglas || {}; const meta = reglas.meta || 35;
  const sinAsignar = (data.filas || []).filter(esSinAsignar);
  const filas = useMemo(() => {
    const f = FILTROS.find((x) => x.id === filtro) || FILTROS[0];
    const texto = q.trim().toLowerCase();
    return (data.filas || []).filter((r) => !esSinAsignar(r))
      .filter((r) => f.fn(r, meta))
      .filter((r) => !texto || `${r.nombre_asesor || ''} ${r.usuario} ${r.codigo_asesor || ''}`.toLowerCase().includes(texto))
      .sort((a, b) => {
        const x = a[orden.k], y = b[orden.k];
        if (typeof x === 'number' || typeof y === 'number') return (Number(x || 0) - Number(y || 0)) * orden.dir;
        return String(x || '').localeCompare(String(y || '')) * orden.dir;
      });
  }, [data, filtro, q, orden, meta]);
  const conteo = (id) => (data.filas || []).filter((r) => !esSinAsignar(r)).filter((r) => FILTROS.find((x) => x.id === id).fn(r, meta)).length;
  const ordenar = (k) => setOrden((o) => (o.k === k ? { k, dir: -o.dir } : { k, dir: k === 'usuario' ? 1 : -1 }));
  const exportar = () => {
    const filasXls = filas.map((r) => { const d = desglose(r, reglas); return {
      Asesor: r.nombre_asesor || r.usuario, Usuario: r.usuario, Codigo: r.codigo_asesor, 'Última activación': r.ultima_fecha_activacion, 'Último ingreso Telcos': r.ultima_fecha_ingreso_telcos,
      'Por regularizar': r.activas_por_regularizar, Regularizadas: r.activas_regularizadas, 'Activas totales': r.activas_totales,
      'Ventas a tabla': r.ventas_tabla, Tramo: r.tramo, Asegurado: d.asegurado, 'Comisión tabla': Number(d.tabla.toFixed(2)),
      'Planes comisión': d.directa, 'PYME bono': d.pyme, Disponible: r.valor_disponible, 'Bono volumen': d.bono, 'Valor total': r.valor_total,
      'Sin valor': r.sin_valor, '3ra edad sobre 15%': r.te_excedentes, 'No vender': r.no_vender,
    }; });
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasXls), 'Comisiones');
    XLSX.writeFile(libro, `Comisiones_${empresa}_${mes}.xlsx`);
  };
  const IconoOrden = ({ k }) => (orden.k !== k ? <ChevronsUpDown className="h-3 w-3 opacity-40" /> : orden.dir > 0 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />);

  return <div className="min-h-full bg-slate-50 p-4 md:p-7"><div className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-widest text-amber-600">Administración</p><h1 className="text-2xl font-black text-slate-900">Comisiones</h1>
        <p className="mt-1 text-sm text-slate-500">Ventas activas por fecha de activación. Solo se paga lo regularizado. Se actualiza cada 10 minutos{ultima && <> · última {ultima.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</>}.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border bg-white p-1 shadow-sm">{['NOVONET', 'VELSA'].map((x) => <button key={x} type="button" onClick={() => setEmpresa(x)} className={`rounded-lg px-4 py-1.5 text-sm font-bold ${empresa === x ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{x}</button>)}</div>
        <input type="month" value={mes} onChange={(e) => cambiarMes(e.target.value)} aria-label="Mes" className="rounded-xl border bg-white px-3 py-1.5 text-sm shadow-sm" />
        <button type="button" onClick={() => setRecarga((x) => x + 1)} title="Actualizar ahora" className="rounded-xl border bg-white p-2 text-slate-600 shadow-sm hover:text-blue-600"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        <button type="button" onClick={() => setAvanzado((v) => !v)} className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold shadow-sm ${avanzado || personalizado ? 'border-blue-300 bg-blue-50 text-blue-700' : 'bg-white text-slate-600'}`}><SlidersHorizontal className="h-4 w-4" />Filtros{personalizado && ' ·'}</button>
      </div>
    </header>

    {avanzado && <form onSubmit={consultar} className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end"><label className="flex-1 text-xs font-bold text-slate-600">Búsqueda en las ventas<input value={buscarGlobal} onChange={(e) => setBuscarGlobal(e.target.value)} placeholder="ID Bitrix, login, estado, plan, ciudad…" className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal" /></label><button type="button" onClick={() => cambiarMes(mes)} className="rounded-lg border px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Volver al mes</button><button className="rounded-lg bg-slate-900 px-7 py-2.5 text-sm font-bold text-white hover:bg-slate-700">Consultar</button></div>
      <div className="grid gap-3 lg:grid-cols-3"><RangoFecha titulo="Fecha de activación" ayuda="Base de pago. Por defecto el mes elegido." value={activacion} onChange={setActivacion} /><RangoFecha titulo="Ingreso Telcos" ayuda="Opcional." value={telcos} onChange={setTelcos} /><RangoFecha titulo="Creación Jotform" ayuda="Opcional." value={jotform} onChange={setJotform} /></div>
    </form>}

    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
    {t.te_alerta && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">Alerta: tercera edad es el {t.te_pct}% de las ventas regularizadas de {empresa} (tope 15%). A cada asesor no se le pagan las de 3ra edad que pasan su 15%.</div>}

    {loading && !data.filas?.length ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((x) => <div key={x} className="h-[110px] animate-pulse rounded-2xl bg-slate-200" />)}</div> : <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 shadow-sm"><div className="text-[11px] font-bold uppercase text-emerald-700">Disponible a pagar</div><div className="mt-1 text-2xl font-black text-emerald-700 md:text-3xl">{dinero(t.valor_disponible)}</div><div className="text-[11px] text-emerald-700/80">{t.activas_regularizadas || 0} regularizadas</div></div>
      <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="text-[11px] font-bold uppercase text-amber-700">Por liberar</div><div className="mt-1 text-2xl font-black text-amber-600 md:text-3xl">{dinero((t.valor_total || 0) - (t.valor_disponible || 0))}</div><div className="text-[11px] text-slate-500">{t.activas_por_regularizar || 0} por regularizar</div></div>
      <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="text-[11px] font-bold uppercase text-slate-400">Comisión proyectada</div><div className="mt-1 text-2xl font-black text-slate-800 md:text-3xl">{dinero(t.valor_total)}</div><div className="text-[11px] text-slate-500">{t.activas_totales || 0} activas en el mes</div></div>
      <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-center gap-1 text-[11px] font-bold uppercase text-slate-400"><Trophy className="h-3.5 w-3.5 text-amber-500" />Con asegurado</div><div className="mt-1 text-2xl font-black text-slate-800 md:text-3xl">{t.con_asegurado || 0}</div><div className="text-[11px] text-slate-500">{conteo('cerca')} cerca de lograrlo · bono volumen {dinero(t.bono_volumen)}</div></div>
    </div>}

    <details className="rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-slate-700"><Info className="h-4 w-4 text-blue-600" />¿Cómo se calcula?<span className="ml-1 text-xs font-semibold text-slate-400">catálogo {data.mes_catalogo || '—'}</span></summary>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
        <li>Solo se paga lo <b>REGULARIZADO</b>, por fecha de activación del mes (incluye backlog).</li>
        <li>Menos de {meta} ventas a tabla: cada venta con la tabla “hasta 41”.</li>
        <li>Con {meta} ventas a tabla gana el <b>asegurado de {dinero(reglas.asegurado || 550)}</b>; desde la venta 36 se suma cada venta extra (36–{(reglas.desdeTramo2 || 42) - 1} “hasta 41”, desde la {reglas.desdeTramo2 || 42} “42 en adelante”).</li>
        <li>Planes de comisión y “No vender” se pagan aparte y no cuentan para el asegurado. Si llega a {meta} sin PYME, las PYME se pagan como bono.</li>
        <li>Tercera edad: máximo 15% de sus ventas. Bono al volumen: 40 = $40, 50 = $60, 60 = $80.</li>
      </ul>
    </details>

    <CargaCatalogo onCargado={() => setRecarga((x) => x + 1)} />

    <div className="flex flex-col gap-3 rounded-2xl border bg-white p-3 shadow-sm lg:flex-row lg:items-center">
      <div className="flex flex-wrap gap-1.5">{FILTROS.map((f) => <button key={f.id} type="button" onClick={() => setFiltro(f.id)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filtro === f.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{f.txt} <span className="opacity-60">{conteo(f.id)}</span></button>)}</div>
      <div className="flex flex-1 items-center gap-2 lg:justify-end">
        <label className="relative flex-1 lg:max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar asesor o código…" className="w-full rounded-xl border py-2 pl-9 pr-3 text-sm" /></label>
        <button type="button" onClick={exportar} disabled={!filas.length} className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Download className="h-4 w-4" />Excel</button>
      </div>
    </div>

    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="max-h-[70vh] overflow-auto"><table className="w-full text-left text-sm">
      <thead className="sticky top-0 z-10 bg-slate-100 text-[11px] uppercase text-slate-500"><tr>{COLUMNAS.map((c) => <th key={c.k} className={`px-4 py-3 ${c.c ? 'text-center' : c.r ? 'text-right' : ''}`}><button type="button" onClick={() => ordenar(c.k)} className={`inline-flex items-center gap-1 font-bold uppercase hover:text-slate-900 ${orden.k === c.k ? 'text-slate-900' : ''}`}>{c.txt}<IconoOrden k={c.k} /></button></th>)}</tr></thead>
      <tbody className="divide-y">
        {loading && !data.filas?.length ? <tr><td colSpan={COLUMNAS.length} className="p-14 text-center text-slate-500">Calculando comisiones…</td></tr>
          : !filas.length ? <tr><td colSpan={COLUMNAS.length} className="p-14 text-center text-slate-500">{q || filtro !== 'todos' ? 'Ningún asesor coincide con el filtro.' : 'No hay activaciones en el periodo.'}</td></tr>
          : filas.map((r) => <tr key={`${r.usuario}-${r.codigo_asesor}`} onClick={() => setAbierto(r)} className="cursor-pointer transition hover:bg-blue-50/60">
            <td className="px-4 py-3"><div className="font-bold text-slate-800">{r.nombre_asesor || r.usuario}</div><div className="text-[11px] text-slate-500">{r.usuario} · {r.codigo_asesor}</div></td>
            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatearFechaTelcos(r.ultima_fecha_activacion)}</td>
            <td className="px-4 py-3 text-center font-bold text-amber-600">{r.activas_por_regularizar}</td>
            <td className="px-4 py-3 text-center font-bold text-emerald-600">{r.activas_regularizadas}</td>
            <td className="px-4 py-3"><div className="flex flex-col items-center gap-1"><BarraMeta n={r.ventas_tabla} meta={meta} /><div className="flex flex-wrap justify-center gap-1">{r.asegurado_aplicado && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">ASEGURADO</span>}{Number(r.bono_volumen) > 0 && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-black text-violet-700">BONO {dinero(r.bono_volumen)}</span>}{(Number(r.sin_valor) > 0 || Number(r.te_excedentes) > 0) && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-black text-red-700">REVISAR</span>}</div></div></td>
            <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-600">{dinero(r.valor_total)}</td>
            <td className="whitespace-nowrap px-4 py-3 text-right"><span className="rounded-lg bg-emerald-50 px-2 py-1 font-black text-emerald-700">{dinero(r.valor_disponible)}</span></td>
          </tr>)}
      </tbody></table></div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50 px-4 py-3 text-xs text-slate-500"><span>Haz clic en un asesor para ver el detalle y su rol de pago.</span>{sinAsignar.length > 0 && <span className="font-bold text-amber-700">{sinAsignar.reduce((a, r) => a + Number(r.activas_totales || 0), 0)} ventas sin asesor asignado ({dinero(sinAsignar.reduce((a, r) => a + Number(r.valor_total || 0), 0))})</span>}</div>
    </div>

    {abierto && <Detalle r={abierto} reglas={reglas} empresa={empresa} mes={mes} onCerrar={() => setAbierto(null)} />}
  </div></div>;
}
