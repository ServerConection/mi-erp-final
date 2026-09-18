import { useEffect, useRef, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { fetchConSesion } from '../utils/sesion';
import TablaOrigenesEtapas from '../components/TablaOrigenesEtapas';
const API = import.meta.env.VITE_API_URL || 'http://localhost:3050';
const iniciales = () => {
  const hasta = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return { desde: `${hasta.slice(0, 7)}-01`, hasta, responsable: '', origen: '', etapa: '', buscar: '' };
};
const numero = n => Number(n || 0).toLocaleString('es-EC');
export default function IndicadoresSemillero() {
  const [filtros, setFiltros] = useState(iniciales), [activos, setActivos] = useState(iniciales);
  const [pagina, setPagina] = useState(1), [data, setData] = useState(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [detalle, setDetalle] = useState(null), [refresh, setRefresh] = useState(0);
  const dialogRef = useRef(null);
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
  const porDia = [...dias].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, total]) => ({ fecha: `${fecha.slice(8)}/${fecha.slice(5, 7)}`, total }));
  const porEtapa = [...etapas].sort(([, a], [, b]) => b - a).map(([etapa, total]) => ({ etapa, total }));
  const actualizar = (key, value) => setFiltros(prev => ({ ...prev, [key]: value }));
  return <div className="space-y-6 pb-6">
    <div className="flex flex-wrap justify-between items-center gap-3"><div><h1 className="text-3xl font-bold text-slate-800">Indicadores Semillero</h1><p className="text-slate-500">Seguimiento de leads y etapas del CRM.</p></div><button disabled={loading} onClick={() => setRefresh(v => v + 1)} className="bg-blue-600 text-white rounded-xl px-4 py-2 disabled:opacity-40">{loading ? 'Actualizando…' : 'Actualizar datos'}</button></div>
    <form onSubmit={e => { e.preventDefault(); setActivos({ ...filtros }); setPagina(1); }} className="bg-white border rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[['desde', 'Desde'], ['hasta', 'Hasta']].map(([key, label]) => <label key={key} className="text-sm font-semibold text-slate-600">{label}<input required type="date" value={filtros[key]} onChange={e => actualizar(key, e.target.value)} className="mt-1 block w-full border rounded-lg px-3 py-2" /></label>)}
      {[['responsable', 'Responsable'], ['origen', 'Origen'], ['etapa', 'Etapa CRM']].map(([key, label]) => <label key={key} className="text-sm font-semibold text-slate-600">{label}<select value={filtros[key]} onChange={e => actualizar(key, e.target.value)} className="mt-1 block w-full border rounded-lg px-3 py-2"><option value="">Todos</option>{(data?.opciones[key] || []).map(v => <option key={v}>{v}</option>)}</select></label>)}
      <label className="text-sm font-semibold text-slate-600">Buscar<input type="search" placeholder="ID, teléfono o responsable" value={filtros.buscar} onChange={e => actualizar('buscar', e.target.value)} className="mt-1 block w-full border rounded-lg px-3 py-2" /></label>
      <div className="flex gap-2 items-end"><button disabled={loading} className="bg-blue-600 text-white rounded-lg px-4 py-2 disabled:opacity-40">Aplicar filtros</button><button type="button" disabled={loading} onClick={() => { const next = iniciales(); setFiltros(next); setActivos(next); setPagina(1); }} className="border rounded-lg px-3 py-2">Limpiar</button></div>
    </form>
    {error && <p role="alert" className="bg-red-50 text-red-700 rounded-xl p-4">{error} <button onClick={() => setRefresh(v => v + 1)} className="underline">Reintentar</button></p>}
    {loading ? <p role="status" className="text-slate-500 py-8">Consultando datos de Semillero…</p> : !error && data && <>
      <p className="text-xs text-slate-500">Período aplicado: {data.periodo.desde} a {data.periodo.hasta} · Fecha de creación en Ecuador · Etapa actual del lead.</p>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">{[['total', 'Leads totales'], ['gestionables', 'Gestionables'], ['atc', 'ATC / Soporte'], ['ventas', 'Venta Subida'], ['descarte', 'Descarte']].map(([key, label]) => <div key={key} className="bg-white border rounded-xl p-4"><p className="text-xs text-slate-500 font-semibold">{label}</p><strong className="text-2xl text-blue-600">{numero(data.resumen[key])}</strong></div>)}<div className="bg-white border rounded-xl p-4"><p className="text-xs text-slate-500 font-semibold">Venta Subida / Gestionables</p><strong className="text-2xl text-emerald-600">{data.resumen.gestionables ? (data.resumen.ventas / data.resumen.gestionables * 100).toFixed(1) : '0.0'}%</strong></div></div>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white border rounded-2xl p-5"><h2 className="font-bold text-slate-700 mb-4">Leads por día de creación</h2>{porDia.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={porDia}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="fecha" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="total" name="Leads" fill="#2563eb" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer> : <p className="text-slate-500 py-8">Sin datos para este período.</p>}</div>
        <div className="bg-white border rounded-2xl p-5"><h2 className="font-bold text-slate-700 mb-4">Distribución por etapa CRM</h2><div className="max-h-80 overflow-auto space-y-3">{porEtapa.map(e => <div key={e.etapa}><div className="flex justify-between gap-2 text-xs mb-1"><span>{e.etapa}</span><strong>{numero(e.total)} · {data.resumen.total ? (e.total / data.resumen.total * 100).toFixed(1) : 0}%</strong></div><div className="bg-slate-100 h-2 rounded-full"><div className="bg-blue-500 h-2 rounded-full" style={{ width: `${e.total / Math.max(1, data.resumen.total) * 100}%` }} /></div></div>)}{!porEtapa.length && <p className="text-slate-500">Sin datos para este período.</p>}</div></div>
      </div>
      <TablaOrigenesEtapas filas={data.origenesEtapasDia} periodo={data.periodo} loading={false} />
      <section className="bg-white border rounded-2xl overflow-hidden"><h2 className="p-5 font-bold text-slate-700 bg-slate-50">Indicadores por responsable</h2><div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left border-b">{['Responsable', 'Leads', 'Gestionables', 'Venta Subida', '% Venta / Gestionables'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{data.responsables.map(r => <tr key={r.responsable} className="border-b"><td className="p-3">{r.responsable}</td><td className="p-3">{numero(r.total)}</td><td className="p-3">{numero(r.gestionables)}</td><td className="p-3">{numero(r.ventas)}</td><td className="p-3">{r.gestionables ? (r.ventas / r.gestionables * 100).toFixed(1) : '0.0'}%</td></tr>)}</tbody></table></div></section>
      <section className="bg-white border rounded-2xl overflow-hidden"><h2 className="p-5 font-bold bg-slate-50 text-slate-700">Detalle de leads · {numero(data.resumen.total)} registros</h2><div className="overflow-auto"><table className="w-full text-sm whitespace-nowrap"><thead><tr className="text-left border-b">{['ID Bitrix', 'Fecha', 'Responsable', 'Teléfono', 'Origen', 'Etapa', 'Detalle'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{data.leads.map(r => <tr key={r.bitrix_id} className="border-b hover:bg-slate-50">{[r.bitrix_id, r.fecha, r.responsable, r.phone || '—', r.origen, r.etapa].map((v, i) => <td key={i} className="p-3">{v}</td>)}<td className="p-3"><button onClick={() => setDetalle(r)} className="text-blue-600 font-semibold">Ver detalle</button></td></tr>)}</tbody></table></div>{!data.leads.length && <p className="p-5 text-slate-500">No hay leads para los filtros seleccionados.</p>}<div className="p-4 flex justify-between items-center"><button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} className="border rounded-lg px-3 py-2 disabled:opacity-40">Anterior</button><span className="text-sm text-slate-500">Página {pagina} de {Math.max(1, data.paginas)}</span><button disabled={pagina >= data.paginas} onClick={() => setPagina(p => p + 1)} className="border rounded-lg px-3 py-2 disabled:opacity-40">Siguiente</button></div></section>
    </>}
    <dialog ref={dialogRef} onClose={() => setDetalle(null)} className="rounded-2xl p-6 max-w-xl w-[90vw] max-h-[80vh] overflow-auto backdrop:bg-black/40"><div className="flex justify-between items-center mb-4"><h2 className="font-bold">Lead #{detalle?.bitrix_id}</h2><button onClick={() => dialogRef.current.close()} className="border rounded-lg px-3 py-2">Cerrar</button></div><dl className="space-y-3">{detalle && Object.entries(detalle).map(([key, value]) => <div key={key}><dt className="text-xs font-semibold text-slate-500 uppercase">{key.replaceAll('_', ' ')}</dt><dd className="text-sm whitespace-pre-wrap break-words">{value || '—'}</dd></div>)}</dl></dialog>
  </div>;
}
