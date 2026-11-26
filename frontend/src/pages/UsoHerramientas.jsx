import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, CalendarDays, CheckCircle2, Download, MapPin,
  MessageCircle, RefreshCw, Search, ShieldAlert, Users, XCircle,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
const inicioMes = () => `${hoy().slice(0, 8)}01`;
const token = () => localStorage.getItem('token');
const perfil = () => {
  try { return JSON.parse(localStorage.getItem('userProfile') || '{}'); } catch { return {}; }
};
const num = (v) => Number(v || 0).toLocaleString('es-EC');
const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;
const POR_PAGINA = 20;
const fechaCorta = (v) => new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short' })
  .format(new Date(`${v}T12:00:00`));
const fechaMatriz = (v) => new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: '2-digit' })
  .format(new Date(`${v}T12:00:00`));
const diaSemana = (v) => new Intl.DateTimeFormat('es-EC', { weekday: 'short' })
  .format(new Date(`${v}T12:00:00`)).replace('.', '');
const moduloEtiqueta = (fila) => `${String(fila.modulo || '').replaceAll('_', ' ')}${fila.modulo_empresa ? ` ${fila.modulo_empresa}` : ''}`;
const rangoFechas = (desde, hasta) => {
  if (!desde || !hasta || desde > hasta) return [];
  const fechas = [];
  const actual = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  while (actual <= fin && fechas.length < 93) {
    fechas.push(actual.toISOString().slice(0, 10));
    actual.setUTCDate(actual.getUTCDate() + 1);
  }
  return fechas;
};

function Kpi({ icon: Icon, label, value, detail, tone = 'blue' }) {
  const tonos = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100', emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100', rose: 'bg-rose-50 text-rose-700 ring-rose-100',
  };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className={`mb-3 inline-flex rounded-xl p-2.5 ring-1 ${tonos[tone]}`}><Icon size={18} /></div>
    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-3xl font-black tracking-tight text-slate-900">{value}</p>
    <p className="mt-1 text-xs text-slate-500">{detail}</p>
  </div>;
}

function Empty({ children }) {
  return <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">{children}</div>;
}

function Paginacion({ pagina, total, onChange }) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const inicio = total ? (pagina - 1) * POR_PAGINA + 1 : 0;
  const fin = Math.min(pagina * POR_PAGINA, total);
  return <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="text-xs font-semibold text-slate-500">Mostrando {inicio}–{fin} de {total} registros</p>
    <div className="flex items-center gap-2">
      <button disabled={pagina <= 1} onClick={() => onChange(pagina - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
      <span className="min-w-20 text-center text-xs font-bold text-slate-600">{pagina} de {paginas}</span>
      <button disabled={pagina >= paginas} onClick={() => onChange(pagina + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Siguiente</button>
    </div>
  </div>;
}

function exportarCsv(nombre, filas) {
  if (!filas.length) return;
  const headers = Object.keys(filas[0]);
  const csv = [headers, ...filas.map((f) => headers.map((h) => f[h] ?? ''))]
    .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre; a.click(); URL.revokeObjectURL(a.href);
}

export default function UsoHerramientas() {
  const user = perfil();
  const esAdmin = String(user.perfil || '').toUpperCase() === 'ADMINISTRADOR';
  const [tab, setTab] = useState('uso');
  const [filtros, setFiltros] = useState({ desde: inicioMes(), hasta: hoy(), empresa: esAdmin ? '' : String(user.empresa || '').toUpperCase() });
  const [busqueda, setBusqueda] = useState('');
  const [filtrosAuditoria, setFiltrosAuditoria] = useState({ usuario: '', evento: '', modulo: '', empresa: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paginaUso, setPaginaUso] = useState(1);
  const [paginaAuditoria, setPaginaAuditoria] = useState(1);
  const [paginaCobertura, setPaginaCobertura] = useState(1);
  const [anchoMatriz, setAnchoMatriz] = useState(0);
  const scrollMatrizArriba = useRef(null);
  const scrollMatrizContenido = useRef(null);

  const cargar = async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams(filtros);
      const r = await fetch(`${API}/api/wa/uso/reporte?${qs}`, { headers: { Authorization: `Bearer ${token()}` } });
      const body = await r.json();
      if (!r.ok || !body.success) throw new Error(body.error || 'No se pudo cargar el reporte');
      setData(body.data); setPaginaUso(1); setPaginaAuditoria(1); setPaginaCobertura(1);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, []); // carga inicial; aplicar evita consultas por cada tecla

  const q = busqueda.trim().toLowerCase();
  const uso = useMemo(() => (data?.uso?.wabot || []).filter((f) => !q || `${f.usuario} ${f.empresa} ${f.fecha}`.toLowerCase().includes(q)), [data, q]);
  const accesos = useMemo(() => (data?.uso?.accesos || []).filter((f) => !q || `${f.usuario} ${f.empresa} ${f.fecha} ${f.modulo}`.toLowerCase().includes(q)), [data, q]);
  const acciones = useMemo(() => (data?.uso?.acciones || []).filter((f) => !q || `${f.usuario} ${f.empresa} ${f.fecha} ${f.modulo} ${f.detalle}`.toLowerCase().includes(q)), [data, q]);
  const auditoria = useMemo(() => [
    ...accesos.map((f) => ({ ...f, evento: 'INGRESO', detalle: 'Ingresó al módulo' })),
    ...acciones.map((f) => f.accion === 'CLICK'
      ? { ...f, evento: 'REGISTRO_ANTERIOR', detalle: `${f.detalle || 'Acción'} · Sin contexto de filtros (registro previo a la auditoría detallada)` }
      : { ...f, evento: f.accion, detalle: f.detalle || 'Realizó una acción' }),
  ].sort((a, b) => Number(b.orden) - Number(a.orden)), [accesos, acciones]);
  const opcionesAuditoria = useMemo(() => ({
    usuarios: [...new Set(auditoria.map((f) => f.usuario).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    eventos: [...new Set(auditoria.map((f) => f.evento).filter(Boolean))].sort(),
    modulos: [...new Set(auditoria.map(moduloEtiqueta).filter(Boolean))].sort(),
    empresas: [...new Set(auditoria.map((f) => f.empresa).filter(Boolean))].sort(),
  }), [auditoria]);
  const auditoriaFiltrada = useMemo(() => auditoria.filter((f) =>
    (!filtrosAuditoria.usuario || f.usuario === filtrosAuditoria.usuario)
    && (!filtrosAuditoria.evento || f.evento === filtrosAuditoria.evento)
    && (!filtrosAuditoria.modulo || moduloEtiqueta(f) === filtrosAuditoria.modulo)
    && (!filtrosAuditoria.empresa || f.empresa === filtrosAuditoria.empresa)), [auditoria, filtrosAuditoria]);
  const cobertura = useMemo(() => (data?.cobertura || []).filter((f) => !q || `${f.usuario} ${f.empresa} ${f.fecha}`.toLowerCase().includes(q)), [data, q]);
  const usoPagina = uso.slice((paginaUso - 1) * POR_PAGINA, paginaUso * POR_PAGINA);
  const auditoriaPagina = auditoriaFiltrada.slice((paginaAuditoria - 1) * POR_PAGINA, paginaAuditoria * POR_PAGINA);
  const fechasMatriz = useMemo(() => rangoFechas(
    data?.cobertura_desde && data.cobertura_desde > filtros.desde ? data.cobertura_desde : filtros.desde,
    filtros.hasta,
  ), [data?.cobertura_desde, filtros.desde, filtros.hasta]);
  const usuariosMatriz = useMemo(() => {
    const mapa = new Map();
    for (const fila of cobertura) {
      const clave = `${fila.empresa}|${fila.usuario}`;
      if (!mapa.has(clave)) mapa.set(clave, { usuario: fila.usuario, empresa: fila.empresa, dias: new Map(), gestionables: 0, consultados: 0 });
      const usuario = mapa.get(clave);
      usuario.dias.set(fila.fecha, fila);
      usuario.gestionables += Number(fila.gestionables || 0);
      usuario.consultados += Number(fila.consultados || 0);
    }
    return [...mapa.values()].sort((a, b) =>
      (b.gestionables - b.consultados) - (a.gestionables - a.consultados) || a.usuario.localeCompare(b.usuario));
  }, [cobertura]);
  const usuariosPagina = usuariosMatriz.slice((paginaCobertura - 1) * POR_PAGINA, paginaCobertura * POR_PAGINA);
  const totalesDia = useMemo(() => {
    const mapa = new Map(fechasMatriz.map((fecha) => [fecha, { gestionables: 0, consultados: 0 }]));
    for (const fila of cobertura) {
      const t = mapa.get(fila.fecha);
      if (!t) continue;
      t.gestionables += Number(fila.gestionables || 0);
      t.consultados += Number(fila.consultados || 0);
    }
    return mapa;
  }, [cobertura, fechasMatriz]);
  const totalUso = uso.reduce((s, f) => s + Number(f.usos), 0);
  const totalChats = uso.reduce((s, f) => s + Number(f.conversaciones), 0);
  const usuariosActivos = new Set(uso.map((f) => `${f.empresa}|${f.usuario}`)).size;
  const totalAccesosModulo = (modulo) => accesos.filter((f) => f.modulo === modulo).length;
  const tot = data?.totales || { gestionables: 0, consultados: 0, no_consultados: 0 };
  useEffect(() => {
    const contenido = scrollMatrizContenido.current;
    if (!contenido) return undefined;
    const medir = () => setAnchoMatriz(contenido.scrollWidth);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(contenido);
    return () => observer.disconnect();
  }, [tab, fechasMatriz.length, usuariosPagina.length, loading]);

  const sincronizarScroll = (origen, destinoRef) => {
    if (destinoRef.current && destinoRef.current.scrollLeft !== origen.currentTarget.scrollLeft) {
      destinoRef.current.scrollLeft = origen.currentTarget.scrollLeft;
    }
  };

  return <div className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
    <style>{`
      .matriz-scroll-superior::-webkit-scrollbar { height: 18px; }
      .matriz-scroll-superior::-webkit-scrollbar-track { background: #e2e8f0; border-radius: 999px; }
      .matriz-scroll-superior::-webkit-scrollbar-thumb { background: #2563eb; border: 3px solid #e2e8f0; border-radius: 999px; }
      .matriz-scroll-superior::-webkit-scrollbar-thumb:hover { background: #1d4ed8; }
      .matriz-scroll-superior { scrollbar-color: #2563eb #e2e8f0; scrollbar-width: auto; }
      .matriz-scroll-contenido { scrollbar-width: none; }
      .matriz-scroll-contenido::-webkit-scrollbar { display: none; }
    `}</style>
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold ring-1 ring-white/15"><Activity size={14} /> Analítica operativa</div>
            <h1 className="text-2xl font-black tracking-tight sm:text-4xl">Uso y cobertura</h1>
            <p className="mt-2 max-w-2xl text-sm text-blue-100">Comprueba quién utiliza Wabot y si cada lead que continúa gestionable fue consultado en Cobertura.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <label className="text-xs font-semibold text-blue-100">Desde<input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} className="mt-1 block w-full rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-800" /></label>
            <label className="text-xs font-semibold text-blue-100">Hasta<input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} className="mt-1 block w-full rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-800" /></label>
            {esAdmin && <label className="text-xs font-semibold text-blue-100">Empresa<select value={filtros.empresa} onChange={(e) => setFiltros({ ...filtros, empresa: e.target.value })} className="mt-1 block w-full rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-800"><option value="">Todas</option><option>NOVONET</option><option>VELSA</option></select></label>}
            <button onClick={cargar} disabled={loading} className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Aplicar</button>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-3 gap-1">
          <button onClick={() => setTab('uso')} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${tab === 'uso' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}><MessageCircle size={16} className="mr-2 inline" />Uso de herramientas</button>
          <button onClick={() => setTab('cobertura')} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${tab === 'cobertura' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}><MapPin size={16} className="mr-2 inline" />Cobertura</button>
          <button onClick={() => setTab('auditoria')} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${tab === 'auditoria' ? 'bg-blue-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}><Users size={16} className="mr-2 inline" />Auditoría</button>
        </div>
        <div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={17} /><input value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPaginaUso(1); setPaginaAuditoria(1); setPaginaCobertura(1); }} placeholder="Buscar usuario, fecha, módulo o acción" className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 sm:w-80" /></div>
      </div>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700"><ShieldAlert className="mr-2 inline" size={18} />{error}</div>}

      {tab === 'uso' ? <>
        <section className="grid gap-3 sm:grid-cols-3"><Kpi icon={Activity} label="Mensajes salientes" value={num(totalUso)} detail="Sin campañas, notas ni sistema" /><Kpi icon={MessageCircle} label="Chats activos" value={num(totalChats)} detail="Con cualquier actividad en el día" tone="emerald" /><Kpi icon={Users} label="Usuarios activos" value={num(usuariosActivos)} detail="Personas con actividad" tone="amber" /></section>
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="font-black text-slate-900">Actividad diaria en Wabot</h2><p className="text-xs text-slate-500">Mensajes salientes de la línea y chats con actividad entrante o saliente.</p></div><button onClick={() => exportarCsv(`uso-wabot-${filtros.desde}-${filtros.hasta}.csv`, uso)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Descargar CSV"><Download size={18} /></button></div>
          {loading ? <Empty><RefreshCw className="mb-2 animate-spin" />Cargando actividad…</Empty> : uso.length ? <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Empresa</th><th className="px-4 py-3 text-right">Mensajes</th><th className="px-4 py-3 text-right">Chats activos</th></tr></thead><tbody className="divide-y divide-slate-100">{usoPagina.map((f, i) => <tr key={`${f.fecha}-${f.usuario_id}-${i}`} className="hover:bg-blue-50/40"><td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{fechaCorta(f.fecha)}</td><td className="px-4 py-3 font-semibold text-slate-900">{f.usuario}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{f.empresa}</span></td><td className="px-4 py-3 text-right text-lg font-black text-blue-700">{num(f.usos)}</td><td className="px-4 py-3 text-right font-bold text-slate-600">{num(f.conversaciones)}</td></tr>)}</tbody></table></div><Paginacion pagina={paginaUso} total={uso.length} onChange={setPaginaUso} /></> : <Empty>No hay actividad de Wabot en el período seleccionado.</Empty>}
        </section>
      </> : tab === 'auditoria' ? <>
        <section className="grid gap-3 sm:grid-cols-3">
          <Kpi icon={Activity} label="Ingresos a Indicadores" value={num(totalAccesosModulo('INDICADORES'))} detail="NOVONET y VELSA según el filtro" />
          <Kpi icon={MessageCircle} label="Ingresos a Contactabilidad" value={num(totalAccesosModulo('CONTACTABILIDAD'))} detail="Aperturas del tablero" tone="emerald" />
          <Kpi icon={Users} label="Ingresos a Vista Asesor" value={num(totalAccesosModulo('VISTA_ASESOR'))} detail="NOVONET y VELSA según el filtro" tone="amber" />
        </section>
        <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-bold text-slate-500">Usuario<select value={filtrosAuditoria.usuario} onChange={(e) => { setFiltrosAuditoria({ ...filtrosAuditoria, usuario: e.target.value }); setPaginaAuditoria(1); }} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"><option value="">Todos los usuarios</option>{opcionesAuditoria.usuarios.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-500">Evento<select value={filtrosAuditoria.evento} onChange={(e) => { setFiltrosAuditoria({ ...filtrosAuditoria, evento: e.target.value }); setPaginaAuditoria(1); }} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"><option value="">Todos los eventos</option>{opcionesAuditoria.eventos.map((v) => <option key={v} value={v}>{v.replaceAll('_', ' ')}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-500">Módulo<select value={filtrosAuditoria.modulo} onChange={(e) => { setFiltrosAuditoria({ ...filtrosAuditoria, modulo: e.target.value }); setPaginaAuditoria(1); }} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"><option value="">Todos los módulos</option>{opcionesAuditoria.modulos.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-500">Empresa del usuario<select value={filtrosAuditoria.empresa} onChange={(e) => { setFiltrosAuditoria({ ...filtrosAuditoria, empresa: e.target.value }); setPaginaAuditoria(1); }} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"><option value="">Todas las empresas</option>{opcionesAuditoria.empresas.map((v) => <option key={v}>{v}</option>)}</select></label>
          <button onClick={() => { setFiltrosAuditoria({ usuario: '', evento: '', modulo: '', empresa: '' }); setPaginaAuditoria(1); }} className="mt-auto h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">Limpiar filtros</button>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="font-black text-slate-900">Auditoría de uso</h2><p className="text-xs text-slate-500">{num(auditoriaFiltrada.length)} eventos encontrados, ordenados por fecha y hora.</p></div><button onClick={() => exportarCsv(`auditoria-modulos-${filtros.desde}-${filtros.hasta}.csv`, auditoriaFiltrada)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Descargar CSV"><Download size={18} /></button></div>
          {loading ? <Empty><RefreshCw className="mb-2 animate-spin" />Cargando auditoría…</Empty> : auditoriaFiltrada.length ? <><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Fecha y hora</th><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Empresa</th><th className="px-4 py-3">Módulo</th><th className="px-4 py-3">Evento</th><th className="px-4 py-3">Detalle de auditoría</th></tr></thead><tbody className="divide-y divide-slate-100">{auditoriaPagina.map((f, i) => <tr key={`${f.evento}-${f.id}-${i}`} className="align-top hover:bg-blue-50/40"><td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{f.fecha_hora}</td><td className="px-4 py-3 font-semibold text-slate-900">{f.usuario}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{f.empresa}</span></td><td className="whitespace-nowrap px-4 py-3 font-bold text-slate-600">{moduloEtiqueta(f)}</td><td className="px-4 py-3"><span className="whitespace-nowrap rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{f.evento.replaceAll('_', ' ')}</span></td><td className="min-w-80 max-w-2xl whitespace-normal px-4 py-3 text-slate-700">{f.detalle}</td></tr>)}</tbody></table></div><Paginacion pagina={paginaAuditoria} total={auditoriaFiltrada.length} onChange={setPaginaAuditoria} /></> : <Empty>No hay actividad que coincida con los filtros seleccionados.</Empty>}
        </section>
      </> : <>
        {data?.cobertura_desde && data.cobertura_desde > filtros.desde && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><CalendarDays className="mr-2 inline" size={18} /><b>Período comparable desde {fechaCorta(data.cobertura_desde)}.</b> El historial de consultas no existía antes; esos días se excluyen para no marcar falsos incumplimientos.</div>}
        <section className="grid gap-3 sm:grid-cols-4"><Kpi icon={CalendarDays} label="Gestionables" value={num(tot.gestionables)} detail="Según etapa actual del CRM" /><Kpi icon={CheckCircle2} label="Consultados" value={num(tot.consultados)} detail={`${pct(tot.consultados, tot.gestionables)}% de cumplimiento`} tone="emerald" /><Kpi icon={XCircle} label="Sin consultar" value={num(tot.no_consultados)} detail="Requieren seguimiento" tone="rose" /><Kpi icon={MapPin} label="Adopción" value={`${pct(tot.consultados, tot.gestionables)}%`} detail="Gestionables con consulta" tone="amber" /></section>
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-slate-900">Matriz diaria de cobertura</h2><p className="text-xs text-slate-500">Cada celda muestra <b>gestionables / consultas</b>. Desplázate horizontalmente para comparar días.</p></div><div className="flex items-center gap-3"><div className="hidden items-center gap-3 text-[11px] font-bold text-slate-600 lg:flex"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded bg-rose-400" />Sin consultar</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded bg-amber-400" />Parcial</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded bg-emerald-500" />Completo</span></div><button onClick={() => exportarCsv(`cobertura-uso-${filtros.desde}-${filtros.hasta}.csv`, cobertura.map(({ detalle_no_consultados, ...f }) => ({ ...f, ids_no_consultados: detalle_no_consultados.join(' | ') })))} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Descargar CSV"><Download size={18} /></button></div></div>
          {loading ? <Empty><RefreshCw className="mb-2 animate-spin" />Cruzando gestionables…</Empty> : usuariosMatriz.length ? <>
            <div className="border-b border-slate-200 bg-slate-50 px-3 pb-2 pt-3">
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-500"><span>Desplazar fechas</span><span>← derecha / izquierda →</span></div>
              <div ref={scrollMatrizArriba} onScroll={(e) => sincronizarScroll(e, scrollMatrizContenido)} className="matriz-scroll-superior h-6 max-w-full overflow-x-scroll overflow-y-hidden rounded-full">
                <div style={{ width: anchoMatriz, height: 1 }} />
              </div>
            </div>
            <div ref={scrollMatrizContenido} onScroll={(e) => sincronizarScroll(e, scrollMatrizArriba)} className="matriz-scroll-contenido max-w-full overflow-x-auto">
              <table className="min-w-max border-separate border-spacing-0 text-sm">
                <thead><tr>
                  <th className="sticky left-0 z-30 min-w-64 border-b border-r border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-600">Usuario</th>
                  <th className="min-w-24 border-b border-r border-slate-200 bg-slate-100 px-3 py-3 text-center text-xs font-black uppercase tracking-wide text-slate-600">Total</th>
                  {fechasMatriz.map((fecha) => <th key={fecha} className="min-w-24 border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-center"><span className="block text-[10px] font-bold uppercase text-slate-400">{diaSemana(fecha)}</span><span className="text-xs font-black text-slate-700">{fechaMatriz(fecha)}</span></th>)}
                </tr></thead>
                <tbody>
                  <tr className="bg-blue-50">
                    <td className="sticky left-0 z-20 border-b border-r border-blue-100 bg-blue-50 px-4 py-3"><span className="font-black text-blue-900">TOTAL DIARIO</span><span className="block text-[10px] text-blue-600">gestionables / consultas</span></td>
                    <td className="border-b border-r border-blue-100 px-2 py-2 text-center"><span className="text-base font-black text-blue-950">{tot.gestionables}</span><span className="mx-1 text-blue-300">/</span><span className="font-black text-blue-700">{tot.consultados}</span></td>
                    {fechasMatriz.map((fecha) => { const t = totalesDia.get(fecha); return <td key={fecha} className="border-b border-r border-blue-100 px-2 py-2 text-center"><span className="font-black text-blue-950">{t?.gestionables || 0}</span><span className="mx-1 text-blue-300">/</span><span className="font-black text-blue-700">{t?.consultados || 0}</span></td>; })}
                  </tr>
                  {usuariosPagina.map((u) => <tr key={`${u.empresa}-${u.usuario}`} className="group hover:bg-slate-50">
                    <td className="sticky left-0 z-20 border-b border-r border-slate-100 bg-white px-4 py-3 group-hover:bg-slate-50"><span className="block max-w-56 truncate font-bold text-slate-900" title={u.usuario}>{u.usuario}</span><span className="text-[10px] font-bold text-slate-400">{u.empresa}</span></td>
                    <td className="border-b border-r border-slate-100 px-2 py-2 text-center"><span className="text-base font-black text-slate-900">{u.gestionables}</span><span className="mx-1 text-slate-300">/</span><span className="font-black text-emerald-700">{u.consultados}</span></td>
                    {fechasMatriz.map((fecha) => { const d = u.dias.get(fecha); const g = Number(d?.gestionables || 0); const c = Number(d?.consultados || 0); const estado = !g ? 'bg-slate-50 text-slate-300' : !c ? 'bg-rose-50 text-rose-700 ring-rose-100' : c >= g ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-amber-50 text-amber-800 ring-amber-100'; return <td key={fecha} className="border-b border-r border-slate-100 p-1.5"><div className={`rounded-lg px-2 py-2 text-center ring-1 ring-inset ${estado}`} title={g ? `${u.usuario}: ${g} gestionables, ${c} consultas` : 'Sin gestionables'}>{g ? <><span className="text-base font-black">{g}</span><span className="mx-1 opacity-40">/</span><span className="font-black">{c}</span></> : <span className="font-bold">—</span>}</div></td>; })}
                  </tr>)}
                </tbody>
              </table>
            </div>
            <Paginacion pagina={paginaCobertura} total={usuariosMatriz.length} onChange={setPaginaCobertura} />
          </> : <Empty>No hay gestionables asignados en el período seleccionado.</Empty>}
        </section>
      </>}
    </div>
  </div>;
}
