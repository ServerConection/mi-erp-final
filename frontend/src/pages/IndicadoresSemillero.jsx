import { useEffect, useRef, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, LabelList, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { fetchConSesion } from '../utils/sesion';
import TablaOrigenesEtapas from '../components/TablaOrigenesEtapas';
import { diasPeriodo } from '../utils/origenesEtapas';
const API = import.meta.env.VITE_API_URL || 'http://localhost:3050';
const iniciales = () => {
  const hasta = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return { desde: `${hasta.slice(0, 7)}-01`, hasta, responsable: '', origen: '', etapa: '', buscar: '' };
};
const numero = n => Number(n || 0).toLocaleString('es-EC');
const coloresEtapas = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b', '#84cc16', '#f97316'];
const porcentaje = (n, total) => total ? `${(n / total * 100).toFixed(1)}%` : '—';
const etiquetas = { responsable: 'Responsable', origen: 'Origen', etapa: 'Etapa', buscar: 'Búsqueda', bitrix_id: 'ID Bitrix', phone: 'Teléfono', fecha: 'Fecha de creación', city: 'Ciudad', pipeline: 'Pipeline', comentario: 'Comentario', razon_descarte: 'Razón de descarte', motivo_atc: 'Motivo ATC' };
const campo = 'mt-1 block w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 text-sm font-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
function exportar(nombre, filas) {
  if (!filas.length) return;
  const columnas = Object.keys(filas[0]);
  const escape = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  const text = [columnas.map(k => escape(etiquetas[k] || k)), ...filas.map(r => columnas.map(k => escape(r[k])))].map(r => r.join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = nombre; a.click(); URL.revokeObjectURL(url);
}
export default function IndicadoresSemillero() {
  const [filtros, setFiltros] = useState(iniciales), [activos, setActivos] = useState(iniciales);
  const [pagina, setPagina] = useState(1), [data, setData] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [detalle, setDetalle] = useState(null), [refresh, setRefresh] = useState(0);
  const dialogRef = useRef(null);
  const [vista, setVista] = useState('resumen'), [orden, setOrden] = useState('total');
  const pendientes = JSON.stringify(filtros) !== JSON.stringify(activos);
  const aplicar = next => { setFiltros(next); setActivos({ ...next }); setPagina(1); };
  const explorar = (key, value) => aplicar({ ...activos, [key]: value });
  const periodoRapido = tipo => {
    const next = iniciales(), fin = next.hasta;
    if (tipo === 'hoy') next.desde = fin;
    if (tipo === 'semana') next.desde = new Date(Date.parse(`${fin}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10);
    setFiltros(prev => ({ ...prev, desde: next.desde, hasta: fin }));
  };
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError('');
    const params = new URLSearchParams({ ...activos, pagina });
    fetchConSesion(`${API}/api/semillero/dashboard?${params}`, { signal: ctrl.signal })
      .then(async res => { const result = await res.json(); if (!res.ok || !result.success) throw new Error(result.error || 'No se pudo cargar el dashboard'); return result; })
      .then(setData).catch(e => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [activos, pagina, refresh]);
  useEffect(() => { if (detalle && !dialogRef.current.open) dialogRef.current.showModal(); }, [detalle]);
  const dias = new Map(), etapas = new Map();
  for (const r of data?.origenesEtapasDia || []) {
    dias.set(r.fecha, (dias.get(r.fecha) || 0) + Number(r.total));
    etapas.set(r.etapa, (etapas.get(r.etapa) || 0) + Number(r.total));
  }
  const porEtapa = [...etapas].sort(([, a], [, b]) => b - a).map(([etapa, total]) => ({ etapa, total }));
  const etapasDia = new Map();
  for (const r of data?.origenesEtapasDia || []) {
    if (!etapasDia.has(r.fecha)) etapasDia.set(r.fecha, {});
    const index = porEtapa.findIndex(e => e.etapa === r.etapa);
    const key = `etapa${index}`;
    etapasDia.get(r.fecha)[key] = (etapasDia.get(r.fecha)[key] || 0) + Number(r.total);
  }
  const porDia = diasPeriodo(data?.periodo.desde, data?.periodo.hasta).map(fecha => ({ fecha: `${fecha.slice(8)}/${fecha.slice(5, 7)}`, total: dias.get(fecha) || 0, ...Object.fromEntries(porEtapa.map((e, i) => [`etapa${i}`, etapasDia.get(fecha)?.[`etapa${i}`] || 0])) }));
  const actualizar = (key, value) => setFiltros(prev => ({ ...prev, [key]: value }));
  return <div className="space-y-6 pb-6 text-slate-800">
    <div className="flex flex-wrap justify-between items-center gap-3"><div><h1 className="text-2xl font-black text-slate-800 flex items-center gap-3"><span className="bg-emerald-600 text-white px-3 py-2 rounded-xl text-lg italic shadow-sm">SEM</span>SISTEMA DE INDICADORES</h1><p className="text-xs text-slate-500 uppercase tracking-widest mt-2">Semillero · Seguimiento comercial CRM</p></div><button disabled={loading} onClick={() => setRefresh(v => v + 1)} className="bg-blue-600 text-white rounded-xl px-4 py-2 disabled:opacity-40">{loading ? 'Actualizando…' : 'Actualizar datos'}</button></div>
    <form onSubmit={e => { e.preventDefault(); aplicar(filtros); }} className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="col-span-full flex flex-wrap justify-between gap-3 items-center"><h2 className="text-xs font-black uppercase tracking-wide text-blue-600">Período y filtros de consulta</h2><div className="flex gap-2">{[['hoy', 'Hoy'], ['semana', 'Últimos 7 días'], ['mes', 'Este mes']].map(([key, label]) => <button key={key} type="button" onClick={() => periodoRapido(key)} className="text-xs px-3 py-2 border rounded-lg hover:bg-blue-50">{label}</button>)}</div></div>
      {[['desde', 'Desde'], ['hasta', 'Hasta']].map(([key, label]) => <label key={key} className="text-sm font-semibold text-slate-600">{label}<input required type="date" max={key === 'desde' ? filtros.hasta : undefined} min={key === 'hasta' ? filtros.desde : undefined} value={filtros[key]} onChange={e => actualizar(key, e.target.value)} className={campo} /></label>)}
      {[['responsable', 'Responsable'], ['origen', 'Origen'], ['etapa', 'Etapa CRM']].map(([key, label]) => <label key={key} className="text-sm font-semibold text-slate-600">{label}<select value={filtros[key]} onChange={e => actualizar(key, e.target.value)} className={campo}><option value="">Todos</option>{(data?.opciones[key] || []).map(v => <option key={v}>{v}</option>)}</select></label>)}
      <label className="text-sm font-semibold text-slate-600">Buscar<input type="search" placeholder="ID, teléfono o responsable" value={filtros.buscar} onChange={e => actualizar('buscar', e.target.value)} className={campo} /></label>
      <div className="flex gap-2 items-end"><button disabled={loading} className="bg-blue-600 text-white rounded-xl px-4 py-2.5 disabled:opacity-40">Aplicar filtros</button><button type="button" disabled={loading} onClick={() => aplicar(iniciales())} className="border rounded-xl px-3 py-2.5">Limpiar</button></div>
      {pendientes && <p role="status" className="col-span-full text-xs text-amber-800 bg-amber-50 rounded-lg p-3">Tienes filtros sin aplicar. Pulsa Aplicar filtros para actualizar los resultados.</p>}
    </form>
    <div className="flex flex-wrap gap-2">{['responsable', 'origen', 'etapa', 'buscar'].filter(k => activos[k]).map(k => <button key={k} disabled={loading} onClick={() => explorar(k, '')} aria-label={`Quitar filtro ${etiquetas[k]}`} className="rounded-full bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 text-xs">{etiquetas[k]}: {activos[k]} <span aria-hidden="true">×</span></button>)}</div>
    <div role="group" aria-label="Vista del dashboard" className="flex gap-2">{[['resumen', 'Resumen e indicadores'], ['detalle', 'Detalle de leads']].map(([key, label]) => <button key={key} aria-pressed={vista === key} onClick={() => setVista(key)} className={`rounded-xl px-4 py-2 text-sm font-bold ${vista === key ? 'bg-slate-800 text-white' : 'bg-white border text-slate-600'}`}>{label}</button>)}</div>
    {error && <p role="alert" className="bg-red-50 text-red-700 rounded-xl p-4">{error} <button onClick={() => setRefresh(v => v + 1)} className="underline">Reintentar</button></p>}
    {loading ? <p role="status" className="text-slate-500 py-8 animate-pulse">Consultando datos de Semillero…</p> : !error && data && <>
      <p className="text-xs text-slate-500">Período aplicado: {data.periodo.desde} a {data.periodo.hasta} · Fecha de creación en Ecuador · Etapa actual del lead.</p>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">{[['total', 'Leads totales'], ['gestionables', 'Gestionables'], ['atc', 'ATC / Soporte'], ['ventas', 'Venta Subida'], ['descarte', 'Descarte']].map(([key, label]) => <div key={key} className="bg-white border border-slate-200 shadow-sm rounded-xl p-4"><p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">{label}</p><strong className={`block text-2xl mt-2 ${key === 'ventas' ? 'text-emerald-600' : key === 'descarte' ? 'text-rose-600' : 'text-blue-600'}`}>{numero(data.resumen[key])}</strong><p className="text-xs text-slate-400 mt-2">{key === 'total' ? 'Todas las etapas' : `${porcentaje(data.resumen[key], data.resumen.total)} del total`}</p></div>)}<div className="bg-white border shadow-sm rounded-xl p-4"><p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Venta / Gestionables</p><strong className="block mt-2 text-2xl text-emerald-600">{porcentaje(data.resumen.ventas, data.resumen.gestionables)}</strong><p className="text-xs text-slate-400 mt-2">Conversión CRM</p></div></div>
      {vista === 'resumen' && <>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white border rounded-2xl p-5 lg:col-span-2"><h2 className="font-bold text-slate-700 mb-1">Leads por día de creación</h2><p className="text-xs text-slate-500 mb-4">Cada color representa una etapa. El número superior es el total del día; los porcentajes de la leyenda corresponden al período filtrado.</p>{porEtapa.length ? <div className="flex flex-col xl:flex-row gap-5"><div className="flex-1 min-w-0 overflow-x-auto"><div style={{ minWidth: Math.max(360, porDia.length * 34) }}><ResponsiveContainer width="100%" height={340}><ComposedChart data={porDia} margin={{ top: 28, right: 16, left: 0, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="fecha" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const dia = payload[0].payload;
          return <div className="bg-slate-800 text-white rounded-xl p-3 shadow-xl text-xs max-h-72 overflow-auto"><p className="font-bold mb-2">{label} · Total: {numero(dia.total)}</p>{porEtapa.map((e, i) => dia[`etapa${i}`] > 0 && <div key={e.etapa} className="flex items-center justify-between gap-4 py-1"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: coloresEtapas[i % coloresEtapas.length] }} />{e.etapa}</span><strong>{numero(dia[`etapa${i}`])} · {porcentaje(dia[`etapa${i}`], dia.total)}</strong></div>)}</div>;
        }} />{porEtapa.map((e, i) => <Bar key={e.etapa} dataKey={`etapa${i}`} name={e.etapa} stackId="etapas" fill={coloresEtapas[i % coloresEtapas.length]} maxBarSize={42} />)}<Line dataKey="total" stroke="transparent" dot={false} activeDot={false} legendType="none" tooltipType="none" isAnimationActive={false}><LabelList dataKey="total" position="top" offset={8} formatter={v => v > 0 ? numero(v) : ''} style={{ fill: '#334155', fontSize: 10, fontWeight: 700 }} /></Line></ComposedChart></ResponsiveContainer></div></div><div className="xl:w-72 shrink-0 max-h-80 overflow-auto space-y-2"><h3 className="text-xs font-bold text-slate-500 uppercase">Etapas · Total y % del período</h3>{porEtapa.map((e, i) => <button key={e.etapa} onClick={() => explorar('etapa', e.etapa)} className="w-full flex items-center justify-between gap-3 text-xs text-left rounded-lg p-2 hover:bg-slate-50" title="Filtrar por esta etapa"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 shrink-0 rounded" style={{ background: coloresEtapas[i % coloresEtapas.length] }} />{e.etapa}</span><span className="shrink-0 font-semibold tabular-nums">{numero(e.total)} <span className="text-slate-500">({porcentaje(e.total, data.resumen.total)})</span></span></button>)}</div></div> : <p className="text-slate-500 py-8">Sin datos para este período.</p>}</div>
        <div className="bg-white border rounded-2xl p-5"><h2 className="font-bold text-slate-700 mb-4">Distribución por etapa CRM</h2><div className="max-h-80 overflow-auto space-y-3">{porEtapa.map(e => <div key={e.etapa}><div className="flex justify-between gap-2 text-xs mb-1"><button disabled={loading} onClick={() => explorar('etapa', e.etapa)} className="text-left text-blue-700 hover:underline" title="Filtrar por esta etapa">{e.etapa}</button><strong>{numero(e.total)} · {data.resumen.total ? (e.total / data.resumen.total * 100).toFixed(1) : 0}%</strong></div><div className="bg-slate-100 h-2 rounded-full"><div className="bg-blue-500 h-2 rounded-full" style={{ width: `${e.total / Math.max(1, data.resumen.total) * 100}%` }} /></div></div>)}{!porEtapa.length && <p className="text-slate-500">Sin datos para este período.</p>}</div></div>
      </div>
      <TablaOrigenesEtapas filas={data.origenesEtapasDia} periodo={data.periodo} loading={false} />
      <section className="bg-white border rounded-2xl overflow-hidden"><div className="p-5 bg-slate-50 flex flex-wrap justify-between items-center gap-3"><h2 className="text-xs font-black uppercase text-slate-700">KPI por responsable</h2><div className="flex items-center gap-2"><label className="text-xs">Ordenar por <select value={orden} onChange={e => setOrden(e.target.value)} className="border rounded-lg p-2 ml-1"><option value="total">Leads</option><option value="gestionables">Gestionables</option><option value="ventas">Venta Subida</option></select></label><button onClick={() => exportar('semillero-responsables.csv', data.responsables)} className="bg-blue-600 text-white rounded-lg px-3 py-2 text-xs">Exportar CSV</button></div></div><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b">{['Responsable', 'Leads', 'Gestionables', 'Venta Subida', '% Venta / Gestionables'].map((h, i) => <th key={h} className={`p-3 ${i ? 'text-center' : ''}`}>{h}</th>)}</tr></thead><tbody>{[...data.responsables].sort((a,b) => b[orden] - a[orden]).map(r => <tr key={r.responsable} className="border-b hover:bg-blue-50"><td className="p-3"><button onClick={() => explorar('responsable', r.responsable)} className="text-blue-700 font-semibold text-left hover:underline" title="Filtrar por este responsable">{r.responsable}</button></td><td className="p-3 text-center tabular-nums">{numero(r.total)}</td><td className="p-3 text-center tabular-nums">{numero(r.gestionables)}</td><td className="p-3 text-center tabular-nums">{numero(r.ventas)}</td><td className="p-3 text-center tabular-nums">{porcentaje(r.ventas, r.gestionables)}</td></tr>)}</tbody></table></div>{!data.responsables.length && <p className="p-5 text-slate-500">No hay responsables para este período.</p>}</section>
      </>}
      {vista === 'detalle' && <>
      <section className="bg-white border rounded-2xl overflow-hidden"><div className="p-5 bg-slate-50 flex flex-wrap justify-between items-center gap-3"><div><h2 className="text-xs font-black uppercase text-slate-700">Detalle de leads · {numero(data.resumen.total)} registros</h2><p className="text-xs text-slate-500 mt-1">50 registros por página · Más recientes primero</p></div><button disabled={!data.leads.length} onClick={() => exportar('semillero-leads-pagina.csv', data.leads)} className="border rounded-lg px-3 py-2 text-xs disabled:opacity-40">Exportar esta página</button></div><div className="overflow-auto"><table className="w-full text-sm whitespace-nowrap"><thead><tr className="text-left border-b">{['ID Bitrix', 'Fecha', 'Responsable', 'Teléfono', 'Origen', 'Etapa', 'Detalle'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{data.leads.map(r => <tr key={r.bitrix_id} className="border-b hover:bg-slate-50">{[r.bitrix_id, r.fecha, r.responsable, r.phone || '—', r.origen, r.etapa].map((v, i) => <td key={i} className="p-3">{v}</td>)}<td className="p-3"><button onClick={() => setDetalle(r)} className="text-blue-600 font-semibold">Ver detalle</button></td></tr>)}</tbody></table></div>{!data.leads.length && <p className="p-5 text-slate-500">No hay leads para los filtros seleccionados.</p>}<div className="p-4 flex justify-between items-center"><button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} className="border rounded-lg px-3 py-2 disabled:opacity-40">Anterior</button><span className="text-sm text-slate-500">Página {pagina} de {Math.max(1, data.paginas)}</span><button disabled={pagina >= data.paginas} onClick={() => setPagina(p => p + 1)} className="border rounded-lg px-3 py-2 disabled:opacity-40">Siguiente</button></div></section>
      </>}
    </>}
    <dialog ref={dialogRef} onClose={() => setDetalle(null)} className="rounded-2xl p-6 max-w-xl w-[90vw] max-h-[80vh] overflow-auto backdrop:bg-black/40"><div className="flex justify-between items-center mb-4"><h2 className="font-bold">Lead #{detalle?.bitrix_id}</h2><button onClick={() => dialogRef.current.close()} className="border rounded-lg px-3 py-2">Cerrar</button></div><dl className="space-y-3">{detalle && Object.entries(detalle).map(([key, value]) => <div key={key}><dt className="text-xs font-semibold text-slate-500 uppercase">{etiquetas[key] || key.replaceAll('_', ' ')}</dt><dd className="text-sm whitespace-pre-wrap break-words">{value || '—'}</dd></div>)}</dl></dialog>
  </div>;
}
