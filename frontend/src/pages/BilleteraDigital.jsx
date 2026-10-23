import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, CalendarDays, Check, CheckCircle2, Clock3, CreditCard, LockKeyhole, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL;
const dinero = (v) => Number(v || 0).toLocaleString('es-EC', { style: 'currency', currency: 'USD' });
const cantidadTexto = (cantidad, singular, plural = `${singular}s`) => `${Number(cantidad || 0)} ${Number(cantidad) === 1 ? singular : plural}`;
const esSinAsignar = (fila) => String(fila?.usuario || '').trim().toUpperCase() === 'SIN ASIGNAR';
const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const rangoMes = (mes) => { const [y, m] = mes.split('-').map(Number); const hoy = new Date(); const fin = hoy.getFullYear() === y && hoy.getMonth() + 1 === m ? hoy.getDate() : new Date(y, m, 0).getDate(); return { desde: `${mes}-01`, hasta: `${mes}-${String(fin).padStart(2, '0')}` }; };
const iniciales = (n) => String(n || '?').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, ' ').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
const nombreCorto = (nombre) => {
  const unicos = [];
  String(nombre || '').trim().split(/\s+/).forEach((parte) => {
    const limpia = parte.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ'-]/g, '');
    if (limpia && !unicos.some((x) => x.toLocaleLowerCase('es') === limpia.toLocaleLowerCase('es'))) unicos.push(limpia);
  });
  return unicos.slice(0, 2).map((parte) => parte.toLocaleLowerCase('es').replace(/(^|[-'])\p{L}/gu, (letra) => letra.toLocaleUpperCase('es'))).join(' ') || 'Asesor';
};
const NOMBRE_MES = (mes) => { const [y, m] = mes.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const fechasPago = (mes) => {
  const [y, m] = mes.split('-').map(Number);
  const siguiente = new Date(y, m, 1);
  const fechaRetiro = new Date(siguiente.getFullYear(), siguiente.getMonth(), 8);
  const fecha = (dia) => new Date(siguiente.getFullYear(), siguiente.getMonth(), dia).toLocaleDateString('es-EC', { day: 'numeric', month: 'long' });
  return {
    asegurado: fecha(5), anticipo: fecha(8), restante: fecha(15), fechaRetiro,
    retiroCorto: fechaRetiro.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' }).replace('.', ''),
    mesPeriodo: NOMBRE_MES(mes).replace(/ de \d{4}$/, '').toLowerCase(),
    mesPago: siguiente.toLocaleDateString('es-EC', { month: 'long' }).toLowerCase(),
  };
};

function Kpi({ etiqueta, valor, ayuda, tono, alerta = false, activo = false, onClick }) {
  const tonos = { verde: 'text-emerald-600', ambar: 'text-amber-600', azul: 'text-indigo-700', gris: 'text-slate-800' };
  const Tag = onClick ? 'button' : 'div';
  return <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-pressed={onClick ? activo : undefined} className={`rounded-2xl border p-4 text-left shadow-sm transition ${alerta ? `border-red-200 bg-red-50 ${onClick ? 'hover:border-red-400' : ''}` : 'border-slate-200 bg-white'} ${activo ? 'ring-2 ring-red-500 ring-offset-2' : ''}`}><div className={`text-[11px] font-bold uppercase tracking-wider ${alerta ? 'text-red-600' : 'text-slate-400'}`}>{etiqueta}</div><div className={`mt-1 text-2xl font-black ${alerta ? 'text-red-700' : tonos[tono] || tonos.gris}`}>{valor}</div>{ayuda && <div className={`mt-0.5 text-[11px] ${alerta ? 'text-red-600' : 'text-slate-500'}`}>{ayuda}</div>}</Tag>;
}

function Skeletons() {
  return <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((x) => <div key={x} className="mx-auto w-full max-w-[360px] animate-pulse rounded-[2.5rem] border-[9px] border-slate-300 bg-slate-100 p-5"><div className="mx-auto h-5 w-24 rounded-full bg-slate-300" /><div className="mt-6 flex justify-between"><div className="h-9 w-32 rounded-lg bg-slate-200" /><div className="h-10 w-10 rounded-full bg-slate-200" /></div><div className="mt-4 h-64 rounded-[1.75rem] bg-slate-300" /><div className="mt-4 grid grid-cols-2 gap-2"><div className="h-11 rounded-2xl bg-slate-300" /><div className="h-11 rounded-2xl bg-slate-200" /></div><div className="mt-5 h-12 rounded-2xl bg-slate-200" /><div className="mt-2 h-12 rounded-2xl bg-slate-200" /></div>)}</div>;
}

function CelularBilletera({ a, mes, empresa }) {
  const [mostrarRetiro, setMostrarRetiro] = useState(false);
  const nombreAsesor = a.nombre_asesor || a.usuario;
  const nombreVisible = nombreCorto(nombreAsesor);
  const enCamino = Math.max(0, (a.valor_total || 0) - (a.valor_disponible || 0));
  const pct = a.valor_total > 0 ? Math.round((a.valor_disponible / a.valor_total) * 100) : 0;
  const pagos = fechasPago(mes);
  const tieneVentas = Number(a.activas_totales || 0) > 0;
  const puedeRetirar = Number(a.valor_disponible || 0) > 0 && new Date() >= pagos.fechaRetiro;
  const tieneSoloPendientes = Number(a.valor_disponible || 0) === 0 && enCamino > 0;
  const todoLiberado = pct === 100 && enCamino === 0;
  const totalComision = Number(a.valor_total || 0);
  const pagosComision = totalComision > 0 ? { anticipo: totalComision * 0.4, restante: totalComision * 0.6 } : null;
  return <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-[2.5rem] border-[9px] border-slate-950 bg-[#f4f7fb] shadow-[0_24px_60px_-24px_rgba(15,23,42,.5)]">
    <div className="mx-auto mt-2 h-5 w-24 rounded-full bg-slate-950" />
    <div className="p-4 pb-5">
      <div className="flex items-center justify-between"><div className="min-w-0 flex-1 pr-3"><p className="text-[11px] font-semibold text-slate-400">Hola 👋</p><p className="truncate text-[15px] font-black text-slate-900" title={nombreAsesor}>{nombreVisible}</p></div><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-black text-blue-700 ring-4 ring-white">{iniciales(nombreVisible)}</div></div>
      <div className={`mt-3 flex min-h-[42px] items-center justify-between rounded-2xl border p-3 text-xs ${a.sin_valor > 0 ? 'border-red-200 bg-red-50 shadow-sm' : 'border-emerald-100 bg-emerald-50/70'}`}>{a.sin_valor > 0 ? <><span className="flex items-center gap-2 font-bold text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{cantidadTexto(a.sin_valor, 'venta')} sin valor en catálogo</span><b className="text-red-600">Revisar</b></> : <span className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Sin alertas</span>}</div>
      <div className="relative mt-4 overflow-hidden rounded-[1.75rem] border border-[rgba(255,255,255,0.22)] bg-gradient-to-br from-[#F07A12] via-[#E85D0A] to-[#C2410C] p-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-1px_0_rgba(0,0,0,0.12),0_10px_24px_-8px_rgba(194,65,12,0.45)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.18)_0%,rgba(255,255,255,0)_45%)]" />
        <div className="absolute -right-14 -top-16 h-44 w-44 rounded-full border-[28px] border-white/10" /><div className="absolute -bottom-20 -left-16 h-40 w-40 rounded-full bg-amber-200/20 blur-xl" />
        <div className="relative flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-white/65">{empresa}</p><p className="mt-0.5 text-sm font-black tracking-wide">{empresa} CARD</p></div><CreditCard className="h-7 w-7 text-white/80" strokeWidth={1.7} /></div>
        <div className="relative mt-7"><p className="text-xs font-semibold text-white/80">Saldo disponible</p><div className="mt-1"><p className="text-[2.45rem] font-black leading-none tracking-[-.04em]">{dinero(a.valor_disponible)}</p></div><p className="mt-2 text-xs font-semibold text-white/85">{tieneVentas ? `de ${dinero(a.valor_total)} de comisión del mes` : 'Aún no hay ventas este mes'}</p></div>
        {tieneVentas && (tieneSoloPendientes ? <div className="relative mt-5 text-sm font-bold">Tienes {dinero(enCamino)} por regularizar</div> : <><div className="relative mt-5 flex items-center justify-between text-sm font-bold"><span>{todoLiberado ? 'Todo liberado' : `${pct}% liberado`}</span>{!todoLiberado && <span>{dinero(enCamino)} por regularizar</span>}</div><div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-white shadow-[0_0_12px_white] transition-all" style={{ width: `${Math.min(100, pct)}%` }} /></div></>)}
        <div className="relative mt-5 flex items-end justify-between gap-3"><span className="min-w-0 truncate text-[13px] font-normal text-white/85">Cód. asesor: {a.codigo_asesor || 'Sin código'}</span><span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-white/70">Comisiones</span></div>
      </div>
      <div className="mt-4 grid grid-cols-[3fr_2fr] gap-2"><button type="button" onClick={() => setMostrarRetiro(true)} className={`flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-3 py-3 text-xs font-black transition ${puedeRetirar ? 'bg-slate-950 text-white shadow-lg hover:-translate-y-0.5 hover:bg-blue-700' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}>{puedeRetirar ? <ArrowDownToLine className="h-4 w-4 shrink-0" /> : <CalendarDays className="h-4 w-4 shrink-0" />} {puedeRetirar ? 'Retirar' : 'Ver fechas de retiro'}</button><div className="flex items-center justify-center gap-2 rounded-2xl bg-white px-3 py-3 text-xs font-black text-slate-700 shadow-sm"><ShoppingBag className="h-4 w-4 text-blue-600" /> {cantidadTexto(a.activas_totales, 'venta')}</div></div>
      <div className="mt-5 flex items-center justify-between"><p className="text-xs font-black text-slate-800">Resumen del mes</p><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{NOMBRE_MES(mes)}</span></div>
      <div className="mt-2 space-y-2 text-xs">
        <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm"><span className="flex items-center gap-2 font-semibold text-slate-600"><span className="rounded-full bg-emerald-100 p-1.5 text-emerald-600"><Check className="h-3.5 w-3.5" /></span>{cantidadTexto(a.activas_regularizadas, 'regularizada')}</span><b className="text-emerald-600">+{dinero(a.valor_disponible)}</b></div>
        <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm"><span className="flex items-center gap-2 font-semibold text-slate-600"><span className="rounded-full bg-amber-100 p-1.5 text-amber-600"><Clock3 className="h-3.5 w-3.5" /></span>{cantidadTexto(a.activas_por_regularizar, 'por regularizar', 'por regularizar')}</span><b className="text-amber-600">{dinero(enCamino)}</b></div>
      </div>
    </div>
    {mostrarRetiro && <div className="absolute inset-0 z-20 flex items-end bg-slate-950/55 p-3 backdrop-blur-sm"><div className="w-full rounded-[1.75rem] bg-white p-5 shadow-2xl">
      <span className="inline-flex rounded-2xl bg-blue-100 p-3 text-blue-700"><CalendarDays className="h-5 w-5" /></span>
      <h3 className="mt-4 text-lg font-black text-slate-900">Fechas de retiro de {pagos.mesPago}</h3><p className="mt-1 text-xs leading-5 text-slate-500">Los pagos de {pagos.mesPeriodo} estarán disponibles en estas fechas.</p>
      <div className="relative mt-5 space-y-5 pl-8 text-xs before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-0.5 before:bg-blue-200">{[[pagos.asegurado, 'Pago del asegurado', null], [pagos.anticipo, 'Pago del 40% de la comisión', pagosComision?.anticipo], [pagos.restante, 'Pago del 60% restante', pagosComision?.restante]].map(([fecha, descripcion, monto]) => <div key={fecha} className="relative"><span className="absolute -left-8 top-1 h-3.5 w-3.5 rounded-full border-[3px] border-blue-600 bg-white" /><div className="flex items-start justify-between gap-3"><div><b className="text-sm text-slate-900">{fecha}</b><p className="mt-0.5 text-slate-500">{descripcion}</p></div>{monto != null && <b className="shrink-0 text-sm text-slate-900">{dinero(monto)}</b>}</div></div>)}</div>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-[10px] font-semibold leading-4 text-amber-800"><LockKeyhole className="h-4 w-4 shrink-0" />Esta vista es informativa. No realiza movimientos de dinero.</div><button type="button" onClick={() => setMostrarRetiro(false)} className="mt-4 w-full rounded-xl bg-slate-950 py-3 text-xs font-black text-white">Entendido</button>
    </div></div>}
  </div>;
}

export default function BilleteraDigital() {
  const [empresa, setEmpresa] = useState('NOVONET'); const [mes, setMes] = useState(mesActual()); const [data, setData] = useState({ filas: [], totales: {} }); const [loading, setLoading] = useState(true), [error, setError] = useState(''); const [buscar, setBuscar] = useState(''); const [soloSinValor, setSoloSinValor] = useState(false);
  useEffect(() => { const ctrl = new AbortController(); const r = rangoMes(mes); const qs = new URLSearchParams({ empresa, activacionDesde: r.desde, activacionHasta: r.hasta }); fetch(`${API}/api/comisiones?${qs}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, signal: ctrl.signal }).then(async (res) => { const b = await res.json().catch(() => ({})); if (!res.ok) throw new Error(b.error || `HTTP ${res.status}`); return b; }).then((b) => setData(b.data || { filas: [], totales: {} })).catch((e) => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!ctrl.signal.aborted) setLoading(false); }); return () => ctrl.abort(); }, [empresa, mes]);
  const cambiarEmpresa = (valor) => { setLoading(true); setError(''); setEmpresa(valor); };
  const cambiarMes = (valor) => { if (!valor) return; setLoading(true); setError(''); setMes(valor); };
  const filasAsignadas = useMemo(() => (data.filas || []).filter((a) => !esSinAsignar(a)), [data]);
  const sinAsignar = useMemo(() => (data.filas || []).filter(esSinAsignar).reduce((acc, fila) => ({ activas_totales: acc.activas_totales + Number(fila.activas_totales || 0), valor_total: acc.valor_total + Number(fila.valor_total || 0) }), { activas_totales: 0, valor_total: 0 }), [data]);
  const asesores = useMemo(() => { const q = buscar.trim().toLowerCase(); return [...filasAsignadas].filter((a) => (!soloSinValor || Number(a.sin_valor) > 0) && (!q || `${a.nombre_asesor || ''} ${a.usuario} ${a.codigo_asesor}`.toLowerCase().includes(q))).sort((x, y) => (y.valor_total - x.valor_total) || (y.valor_disponible - x.valor_disponible)); }, [filasAsignadas, buscar, soloSinValor]);
  const t = data.totales || {}; const conSaldo = filasAsignadas.filter((a) => a.valor_disponible > 0).length;
  return <div className="min-h-full bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-4 md:p-7"><div className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Administración</p><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">Billetera Digital <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">Vista previa</span></h1><p className="mt-1 text-sm text-slate-500">Saldo de comisiones de cada asesor. Disponible = ventas regularizadas; por liberar = activas pendientes de regularización.</p></div><div className="flex flex-wrap items-center gap-2"><div className="inline-flex rounded-xl border bg-white p-1 shadow-sm">{['NOVONET', 'VELSA'].map((x) => <button key={x} onClick={() => cambiarEmpresa(x)} className={`rounded-lg px-4 py-1.5 text-sm font-bold ${empresa === x ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{x}</button>)}</div><input type="month" value={mes} onChange={(e) => cambiarMes(e.target.value)} className="rounded-xl border bg-white px-3 py-1.5 text-sm shadow-sm" aria-label="Mes" /></div></header>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
    {loading ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((x) => <div key={x} className="h-[104px] animate-pulse rounded-2xl border border-slate-200 bg-slate-200" />)}</div> : <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Kpi etiqueta="Saldo disponible" valor={dinero(t.valor_disponible)} ayuda="Listo para pagar" tono="verde" /><Kpi etiqueta="Por liberar" valor={dinero((t.valor_total || 0) - (t.valor_disponible || 0))} ayuda="Espera regularización" tono="ambar" /><Kpi etiqueta="Comisión proyectada" valor={dinero(t.valor_total)} ayuda={`${cantidadTexto(t.activas_totales, 'activa')} en el mes`} tono="azul" /><Kpi etiqueta="Asesores con saldo" valor={`${conSaldo} / ${filasAsignadas.length}`} ayuda={data.mes_catalogo ? `Catálogo ${data.mes_catalogo}` : 'Sin catálogo cargado'} /><Kpi etiqueta="Ventas sin valor en catálogo" valor={Number(t.sin_valor || 0)} ayuda={soloSinValor ? 'Mostrando solo alertas' : 'Haz clic para filtrar'} alerta activo={soloSinValor} onClick={() => setSoloSinValor((v) => !v)} /></div>}
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><p className="text-sm text-slate-500">Cada celular es lo que verá el asesor en su app · {NOMBRE_MES(mes)}. Ordenados por valor total.</p><input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar asesor o código…" className="w-full rounded-xl border bg-white px-3 py-2 text-sm shadow-sm md:w-72" /></div>
    {!loading && sinAsignar.activas_totales > 0 && <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" /><span><b>{cantidadTexto(sinAsignar.activas_totales, 'Venta')} sin asesor asignado:</b> {dinero(sinAsignar.valor_total)}</span></div><Link to="/comisiones" className="shrink-0 rounded-lg border border-amber-300 bg-white px-4 py-2 text-center text-xs font-bold text-amber-800 transition hover:bg-amber-100">Revisar</Link></div>}
    {loading ? <Skeletons /> : !asesores.length ? <div className="rounded-2xl border border-dashed bg-white p-16 text-center text-sm text-slate-500">{soloSinValor ? 'No hay asesores con ventas sin valor en el catálogo.' : 'Sin asesores con activas en este mes.'}</div> : <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">{asesores.map((a) => <CelularBilletera key={`${a.usuario}-${a.codigo_asesor}`} a={a} mes={mes} empresa={empresa} />)}</div>}
    <p className="text-center text-[11px] text-slate-400">Vista informativa sin movimientos de dinero reales.</p>
  </div></div>;
}
