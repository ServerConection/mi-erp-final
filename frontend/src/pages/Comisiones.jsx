import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { formatearFechaTelcos } from '../utils/formatoFechaComisiones';
import { filasDesdeLibro } from '../utils/catalogoComisiones';

const API = import.meta.env.VITE_API_URL;
const hoy = () => {
  const d = new Date(), y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dia = String(d.getDate()).padStart(2, '0');
  return { primero: `${y}-${m}-01`, hoy: `${y}-${m}-${dia}` };
};
const actual = hoy();
const rangoVacio = { desde: '', hasta: '' };
const dinero = (v) => Number(v || 0).toLocaleString('es-EC', { style: 'currency', currency: 'USD' });
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// Carga del catálogo mensual (Excel con columnas TIPO ... COM MENOR A 35).
function CargaCatalogo({ onCargado }) {
  const [mes, setMes] = useState(actual.primero.slice(0, 7));
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
      if (!leido) throw new Error('No encontré una hoja con las columnas TIPO y COM MENOR A 35.');
      const r = await fetch(`${API}/api/comisiones/catalogo`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ mes, filas: leido.filas }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
      setEstado({ tipo: 'ok', texto: `Catálogo ${b.data.mes} cargado: ${b.data.cargadas} planes con valor (${b.data.omitidas} filas sin valor omitidas).` });
      leerMeses(); onCargado?.();
    } catch (e) { setEstado({ tipo: 'error', texto: e.message }); }
    finally { setCargando(false); }
  };

  return <details className="rounded-2xl border bg-white p-4 shadow-sm">
    <summary className="cursor-pointer text-sm font-black text-slate-700">📥 Catálogo de comisiones del mes {meses[0] ? <span className="ml-2 font-semibold text-slate-400">· vigente: {meses[0].mes} ({meses[0].filas} planes)</span> : <span className="ml-2 font-semibold text-red-500">· sin catálogo cargado</span>}</summary>
    <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
      <label className="text-xs font-bold text-slate-600">Mes<input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="mt-1 block rounded-lg border px-3 py-2 text-sm font-normal" /></label>
      <label className="flex-1 text-xs font-bold text-slate-600">Excel del catálogo<input type="file" accept=".xlsx,.xls" onChange={(e) => setArchivo(e.target.files?.[0] || null)} className="mt-1 block w-full rounded-lg border px-3 py-1.5 text-sm font-normal" /></label>
      <button type="button" disabled={cargando} onClick={subir} className="rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50">{cargando ? 'Cargando…' : 'Cargar catálogo'}</button>
    </div>
    <p className="mt-2 text-[11px] text-slate-500">Se lee la hoja que tenga las columnas TIPO, VELOCIDAD MBPS, SERVICIOS ADICIONALES y COM MENOR A 35. Volver a cargar el mismo mes reemplaza el anterior (queda guardado como inactivo).</p>
    {estado.texto && <div className={`mt-3 rounded-lg p-2 text-sm font-semibold ${estado.tipo === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{estado.texto}</div>}
  </details>;
}

function RangoFecha({ titulo, ayuda, value, onChange, destacado }) {
  return <fieldset className={`rounded-xl border p-3 ${destacado ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-slate-50/60'}`}>
    <legend className="px-1 text-xs font-black text-slate-700">{titulo}</legend>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-[10px] font-bold uppercase text-slate-400">Desde<input aria-label={`${titulo} desde`} type="date" value={value.desde} onChange={e=>onChange({...value,desde:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-700" /></label>
      <label className="text-[10px] font-bold uppercase text-slate-400">Hasta<input aria-label={`${titulo} hasta`} type="date" value={value.hasta} onChange={e=>onChange({...value,hasta:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal text-slate-700" /></label>
    </div><p className="mt-2 text-[10px] text-slate-500">{ayuda}</p>
  </fieldset>;
}

export default function Comisiones() {
  const [empresa, setEmpresa] = useState('NOVONET');
  const [buscar, setBuscar] = useState('');
  const [telcos, setTelcos] = useState({ desde: actual.primero, hasta: actual.hoy });
  const [jotform, setJotform] = useState(rangoVacio);
  const [activacion, setActivacion] = useState(rangoVacio);
  const [filtros, setFiltros] = useState({ telcosDesde: actual.primero, telcosHasta: actual.hoy });
  const [data, setData] = useState({ filas: [], totales: {} });
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController(); setLoading(true); setError('');
    const qs = new URLSearchParams({ empresa, ...filtros });
    fetch(`${API}/api/comisiones?${qs}`, { headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}, signal:ctrl.signal })
      .then(async r=>{const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||`HTTP ${r.status}`);return b;})
      .then(b=>setData(b.data||{filas:[],totales:{}})).catch(e=>{if(e.name!=='AbortError')setError(e.message);})
      .finally(()=>{if(!ctrl.signal.aborted)setLoading(false);});
    return ()=>ctrl.abort();
  },[empresa,filtros,recarga]);

  // Actualización automática cada 10 minutos
  const [ultima, setUltima] = useState(null);
  useEffect(() => { if (!loading) setUltima(new Date()); }, [loading]);
  useEffect(() => {
    const id = setInterval(() => setRecarga(x => x + 1), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []); main
  const rangoCorrecto = (r, nombre) => {
    if (!r.desde && !r.hasta) return true;
    if (!r.desde || !r.hasta) { setError(`Completa las dos fechas de ${nombre}.`); return false; }
    if (r.desde > r.hasta) { setError(`La fecha inicial de ${nombre} no puede superar la final.`); return false; }
    return true;
  };
  const consultar=e=>{e.preventDefault();if(!rangoCorrecto(telcos,'Ingreso Telcos')||!rangoCorrecto(jotform,'Creación Jotform')||!rangoCorrecto(activacion,'Activación'))return;
    if(!telcos.desde&&!jotform.desde&&!activacion.desde)return setError('Selecciona al menos un rango de fechas.');
    setFiltros({buscar:buscar.trim(),telcosDesde:telcos.desde,telcosHasta:telcos.hasta,jotformDesde:jotform.desde,jotformHasta:jotform.hasta,activacionDesde:activacion.desde,activacionHasta:activacion.hasta});};
  const limpiarOpcionales=()=>{setJotform(rangoVacio);setActivacion(rangoVacio);};
  const cards=[['Por regularizar','activas_por_regularizar','text-amber-600'],['Regularizadas','activas_regularizadas','text-emerald-600'],['Activas totales','activas_totales','text-blue-700']];
  const t=data.totales||{};

  return <div className="min-h-full bg-slate-50 p-4 md:p-7"><div className="mx-auto max-w-7xl space-y-5">
    <header><p className="text-xs font-bold uppercase tracking-widest text-amber-600">Administración</p><h1 className="text-2xl font-black text-slate-900">Comisiones</h1><p className="mt-1 text-sm text-slate-500">Fuente oficial: ventas registradas en el CORE, agrupadas por el usuario que realizó el ingreso. Se actualiza cada 10 minutos{ultima&&<> · última: <b>{ultima.toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</b></>}.</p></header>main
    <div className="inline-flex rounded-xl border bg-white p-1 shadow-sm">{['NOVONET','VELSA'].map(x=><button key={x} onClick={()=>setEmpresa(x)} className={`rounded-lg px-5 py-2 text-sm font-bold ${empresa===x?'bg-blue-600 text-white':'text-slate-600 hover:bg-slate-50'}`}>Comisiones {x}</button>)}</div>
    <CargaCatalogo onCargado={()=>setRecarga(x=>x+1)} />
    <form onSubmit={consultar} className="space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end"><label className="flex-1 text-xs font-bold text-slate-600">Búsqueda global<input value={buscar} onChange={e=>setBuscar(e.target.value)} placeholder="Usuario, código, ID Bitrix, login, estado, plan, ciudad…" className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm font-normal" /></label><button type="button" onClick={limpiarOpcionales} className="rounded-lg border px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Limpiar opcionales</button><button className="rounded-lg bg-slate-900 px-7 py-2.5 text-sm font-bold text-white hover:bg-slate-700">Consultar</button></div>
      <div className="grid gap-3 lg:grid-cols-3"><RangoFecha titulo="Ingreso Telcos" ayuda="Por defecto: desde el primer día del mes hasta hoy." value={telcos} onChange={setTelcos} destacado/><RangoFecha titulo="Creación Jotform" ayuda="Opcional. Vacío no restringe los resultados." value={jotform} onChange={setJotform}/><RangoFecha titulo="Fecha de activación" ayuda="Opcional. Vacío no restringe los resultados." value={activacion} onChange={setActivacion}/></div>
    </form>
    {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
    <div className="grid grid-cols-3 gap-3">{cards.map(([l,k,c])=><div key={k} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-400">{l}</div><div className={`mt-1 text-3xl font-black ${c}`}>{Number(data.totales?.[k]||0)}</div></div>)}</div>
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-slate-400">Valor total · sobre activas totales</div><div className="mt-1 text-3xl font-black text-slate-800">{dinero(t.valor_total)}</div><div className="text-[11px] text-slate-500">Lo que se pagaría si todas sus activas se regularizan.</div></div>
      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 shadow-sm"><div className="text-xs font-bold uppercase text-emerald-700">Disponible · solo regularizadas</div><div className="mt-1 text-3xl font-black text-emerald-700">{dinero(t.valor_disponible)}</div><div className="text-[11px] text-emerald-700/80">Lo que hoy se puede pagar.</div></div>
    </div>
    <p className="text-xs text-slate-500">Cálculo con tramo <b>{data.tramo||'MENOR A 35'}</b> y catálogo <b>{data.mes_catalogo||'—'}</b>.{Number(t.sin_valor)>0&&<span className="ml-1 font-bold text-red-600">{t.sin_valor} activas sin valor en el catálogo (plan no encontrado).</span>}</p>
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Usuario Jotform/ERP</th><th className="px-5 py-3">Código asesor</th><th className="px-5 py-3">Último ingreso Telcos</th><th className="px-5 py-3 text-center">Por regularizar</th><th className="px-5 py-3 text-center">Regularizadas</th><th className="px-5 py-3 text-center">Activas totales</th><th className="px-5 py-3 text-right">Valor total</th><th className="px-5 py-3 text-right text-emerald-700">Disponible</th></tr></thead><tbody className="divide-y">
      {loading?<tr><td colSpan="8" className="p-14 text-center text-slate-500">Calculando comisiones…</td></tr>:!data.filas?.length?<tr><td colSpan="8" className="p-14 text-center text-slate-500">No existen activaciones para los filtros aplicados.</td></tr>:data.filas.map((r,i)=><tr key={`${r.codigo_asesor}-${r.usuario}-${i}`} className="hover:bg-slate-50"><td className="px-5 py-3 font-bold">{r.usuario}</td><td className="px-5 py-3 text-slate-500">{r.codigo_asesor}</td><td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatearFechaTelcos(r.ultima_fecha_ingreso_telcos)}</td><td className="px-5 py-3 text-center font-bold text-amber-600">{r.activas_por_regularizar}</td><td className="px-5 py-3 text-center font-bold text-emerald-600">{r.activas_regularizadas}</td><td className="px-5 py-3 text-center font-black text-blue-700">{r.activas_totales}</td><td className="px-5 py-3 text-right whitespace-nowrap font-semibold text-slate-700">{dinero(r.valor_total)}{r.sin_valor>0&&<div className="text-[10px] font-bold text-red-500">{r.sin_valor} sin valor</div>}</td><td className="px-5 py-3 text-right whitespace-nowrap"><span className="rounded-lg bg-emerald-50 px-2 py-1 font-black text-emerald-700">{dinero(r.valor_disponible)}</span><div className="mt-1 text-[10px] text-slate-400">de {dinero(r.valor_total)}</div></td></tr>)}
    </tbody></table></div><div className="border-t bg-slate-50 px-5 py-3 text-xs text-slate-500">Solo se cuentan registros activos, no borradores. Valor total = comisión de todas las activas; Disponible = solo las regularizadas (lo que se paga).</div></div>
  </div></div>;
}
