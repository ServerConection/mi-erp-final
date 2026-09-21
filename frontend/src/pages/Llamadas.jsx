import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, Legend, BarChart, Bar } from 'recharts';
import { PhoneCall, Download, Upload, RefreshCw } from 'lucide-react';
import './Llamadas.css';

const BASE = `${(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '').replace(/\/api$/, '')}/api/llamadas/analitica`;
const n = v => Number(v || 0).toLocaleString('es-EC', { maximumFractionDigits: 1 });
const pct = v => `${n(v)} %`;
const date = v => v ? String(v).replace('T', ' ').slice(0, 19) : '—';
const query = f => new URLSearchParams(Object.entries(f).filter(([,v]) => v !== '')).toString();
function role() { try { const u = jwtDecode(localStorage.getItem('token')); return String(u.perfil || u.rol || '').trim().toUpperCase(); } catch { return ''; } }
async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, { ...options, headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, ...options.headers } });
  const type = response.headers.get('content-type') || '';
  if (!response.ok) { const body = type.includes('json') ? await response.json() : {}; throw new Error(body.error || `No se pudo completar la solicitud (${response.status}).`); }
  if (!type.includes('json')) throw new Error('El servidor no devolvió datos JSON. Revise la configuración de la API.');
  return response.json();
}
function Table({ columns, rows }) { return <div className="calls-scroll"><table><thead><tr>{columns.map(c => <th key={c[0]}>{c[1]}</th>)}</tr></thead><tbody>{rows.length ? rows.map((r,i) => <tr key={i}>{columns.map(c => <td key={c[0]}>{c[2] ? c[2](r[c[0]],r) : r[c[0]] ?? '—'}</td>)}</tr>) : <tr><td colSpan={columns.length}>Sin registros para estos filtros.</td></tr>}</tbody></table></div>; }
const grouped = [['grupo','Agente'],['total','Intentos',n],['contestadas','Contestadas',n],['tasa','% contestadas',pct],['telefonos','Teléfonos únicos',n],['segundosFacturados','Min. facturados',v=>n(v/60)]];
export default function Llamadas() {
  const perfil = role();
  const allowed = perfil && !['ASESOR','USUARIO'].includes(perfil);
  const [draft,setDraft] = useState({empresa:'NETLIFE',desde:'',hasta:'',direccion:'',agente:'',estado:''});
  const [filters,setFilters] = useState(draft);
  const [page,setPage] = useState(1);
  const [version,setVersion] = useState(0);
  const [data,setData] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState('');
  const [files,setFiles] = useState([]);
  const [imports,setImports] = useState(null);
  const input = useRef(null);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController(); setLoading(true); setError('');
    request(`/dashboard?${query({...filters,pagina:page})}`, {signal:controller.signal}).then(setData).catch(e => {if(e.name !== 'AbortError') {setError(e.message); setData(null);}}).finally(()=> {if(!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  },[filters,page,version,allowed]);
  if (!allowed) return <Navigate to="/" replace />;
  async function upload(e) {
    e.preventDefault(); setError(''); setImports(null);
    if (!files.length || files.length > 8) {setError('Seleccione entre 1 y 8 archivos CSV.'); return;}
    setBusy('upload');
    try { const form = new FormData(); files.forEach(f=>form.append('archivos',f)); const result = await request('/importar',{method:'POST',body:form}); setImports(result.archivos || []); setFiles([]); input.current.value=''; setVersion(v=>v+1); }
    catch(e) {setError(e.message);} finally {setBusy('');}
  }
  async function download() {
    setBusy('download'); setError('');
    try {const r = await fetch(`${BASE}/export.xlsx?${query(filters)}`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}); const type = r.headers.get('content-type') || ''; if(!r.ok || type.includes('html') || type.includes('json')) {const b = type.includes('json') ? await r.json() : {}; throw new Error(b.error || 'No se pudo descargar el Excel.');} const url=URL.createObjectURL(await r.blob()); const a=document.createElement('a'); a.href=url; a.download=`Llamadas_${filters.empresa || 'Todas'}.xlsx`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);}
    catch(e) {setError(e.message);} finally {setBusy('');}
  }
  const s=data?.resumen || {};
  const best=[...(data?.horas || [])].filter(h=>h.total>=30).sort((a,b)=>b.tasa-a.tasa || b.total-a.total).slice(0,3);
  const heat=new Map((data?.mapa || []).map(h=>[h.grupo,h]));
  return <main className="calls-page">
    <header className="calls-heading"><div><div className="calls-eyebrow"><PhoneCall size={16}/> INTELIGENCIA OPERATIVA</div><h1>Llamadas <span>360°</span></h1><p>Netlife y Ecuanet · volumen, respuesta y oportunidades por horario</p></div><button className="calls-primary" onClick={download} disabled={!!busy || loading || !data}><Download size={17}/>{busy==='download'?'Preparando…':'Descargar Excel'}</button></header>
    <form className="calls-card calls-filters" onSubmit={e=>{e.preventDefault();setPage(1);setFilters({...draft});}}>
      <label>Empresa<select value={draft.empresa} onChange={e=>setDraft({...draft,empresa:e.target.value,agente:'',estado:''})}><option value="NETLIFE">Netlife</option><option value="ECUANET">Ecuanet</option><option value="">Comparar empresas</option></select></label>
      <label>Desde<input type="date" value={draft.desde} onChange={e=>setDraft({...draft,desde:e.target.value})}/></label><label>Hasta<input type="date" min={draft.desde} value={draft.hasta} onChange={e=>setDraft({...draft,hasta:e.target.value})}/></label>
      <label>Dirección<select value={draft.direccion} onChange={e=>setDraft({...draft,direccion:e.target.value})}><option value="">Todas</option><option value="inbound">Entrantes</option><option value="outbound">Salientes</option></select></label>
      <label>Agente<select value={draft.agente} onChange={e=>setDraft({...draft,agente:e.target.value})}><option value="">Todos</option>{(data?.catalogos?.agentes || []).map(a=><option key={a}>{a}</option>)}</select></label>
      <label>Resultado<select value={draft.estado} onChange={e=>setDraft({...draft,estado:e.target.value})}><option value="">Todos</option>{(data?.catalogos?.estados || []).map(a=><option key={a}>{a}</option>)}</select></label><button className="calls-primary" disabled={loading}><RefreshCw size={16}/>Aplicar</button>
    </form>
    {draft.empresa !== filters.empresa && <p className="calls-note">Aplique la nueva empresa para actualizar las opciones de agentes y resultados.</p>}
    {error && <div className="calls-error" role="alert">{error}</div>}
    {perfil==='ADMINISTRADOR' && <details className="calls-card"><summary>Cargar datos diarios · solo administrador</summary><p className="calls-muted">Seleccione los CSV originales (hasta 8). El histórico se conserva y los registros repetidos se detectan automáticamente.</p><form className="calls-upload" onSubmit={upload}><input aria-label="Archivos de llamadas" ref={input} type="file" accept=".csv,text/csv" multiple onChange={e=>setFiles(Array.from(e.target.files))}/><button className="calls-primary" disabled={!!busy || !files.length}><Upload size={16}/>{busy==='upload'?'Procesando…':'Cargar archivos'}</button></form>{imports && <><Table rows={imports} columns={ [['archivo','Archivo'],['insertadas','Nuevas',n],['repetidas','Repetidas',n],['rechazadas','Rechazadas',n]]}/>{imports.filter(r=>r.errores?.length).map((r,i)=><p className="calls-error" key={i}>{r.archivo}: {r.errores.map(e=>typeof e==='string'?e:JSON.stringify(e)).join(' · ')}</p>)}</>}</details>}
    {loading ? <div className="calls-card" role="status">Calculando indicadores…</div> : data && <>
      <section className="calls-kpis">{[['Intentos',n(s.total),'Registros de llamada'],['Contestadas',n(s.contestadas),`${pct(s.tasa)} de los intentos`],['Teléfonos únicos',n(s.telefonos),`${n(s.telefonosContestados)} con respuesta`],['Intentos por teléfono',n(s.intentosPorTelefono),'Intensidad de reintentos'],['Duración total',`${n(s.duracion/3600)} h`,'Incluye fases de la llamada'],['Horas facturadas',n(s.segundosFacturados/3600),'No equivale a conversación'],['Costo registrado',n(s.costo),'Unidad monetaria no especificada'],['Espera media entrante',(s.esperaMedia == null ? '—' : `${n(s.esperaMedia)} s`),'Según registros disponibles']].map(([title,value,sub])=><article className="calls-card calls-kpi" key={title}><p>{title}</p><strong>{value}</strong><small>{sub}</small></article>)}</section>
      {Number(s.numerosAtipicos) > 0 && <div className="calls-note"><strong>Calidad de los números:</strong> {n(s.numerosAtipicos)} intentos tienen valores marcados fuera del formato de 8 a 15 dígitos. Se conservan en los indicadores para no sesgar la tasa. Los teléfonos únicos no equivalen a clientes con números válidos.</div>}
      {!s.total && <div className="calls-note">No hay llamadas para esta selección. Ajuste los filtros o cargue los archivos del período.</div>}
      <div className="calls-grid"><section className="calls-card"><h2>Evolución diaria</h2><p className="calls-muted">Intentos y contestadas · los días sin registros no prueban una caída del sistema.</p><ResponsiveContainer width="100%" height={280}><AreaChart data={data.diario}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="grupo" tick={{fontSize:11}}/><YAxis/><Tooltip/><Legend/><Area name="Intentos" dataKey="total" stroke="#64748b" fill="#e2e8f0"/><Area name="Contestadas" dataKey="contestadas" stroke="#0891b2" fill="#cffafe"/></AreaChart></ResponsiveContainer></section>
      <section className="calls-card"><h2>Resultados de llamada</h2><ResponsiveContainer width="100%" height={310}><BarChart data={data.estados} layout="vertical" margin={{left:30,right:16}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number"/><YAxis type="category" dataKey="grupo" width={110} tick={{fontSize:11}}/><Tooltip/><Bar name="Llamadas" dataKey="total" fill="#0891b2" radius={[0,5,5,0]}/></BarChart></ResponsiveContainer></section></div>
      <section className="calls-card"><h2>Horarios con mayor respuesta</h2><p className="calls-muted">Orientación exploratoria: porcentaje de contestadas con al menos 30 intentos por hora. No implica causalidad ni confirma contacto humano.</p><div className="calls-best">{best.length ? best.map(h=><div key={h.grupo}><strong>{h.grupo}:00</strong><span>{pct(h.tasa)} contestadas</span><small>{n(h.contestadas)} / {n(h.total)} intentos</small></div>):<p>Aún no hay horarios con una muestra de 30 intentos.</p>}</div></section>
      <section className="calls-card"><h2>Respuesta por día de semana y hora</h2><p className="calls-muted">Cada celda muestra % contestadas y número de intentos. Más intensidad = mayor porcentaje. — = sin datos.</p><div className="calls-scroll"><div className="calls-heat"><span/>{Array.from({length:24},(_,h)=><b key={h}>{String(h).padStart(2,'0')}</b>)}{['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map((d,day)=><div className="calls-heat-row" key={d}><b>{d}</b>{Array.from({length:24},(_,hour)=>{const r=heat.get(`${day}-${String(hour).padStart(2,'0')}`) || heat.get(`${day}-${hour}`);return <div key={hour} className="calls-cell" title={`${d} ${hour}:00 · ${n(r?.contestadas)} contestadas de ${n(r?.total)} intentos`} style={{background:r?.total?`rgba(8,145,178,${0.08+Math.min(Number(r.tasa)||0,100)/150})`:'#f1f5f9'}}>{r?.total?<><strong>{Math.round(r.tasa)}%</strong><small>{n(r.total)}</small></>:'—'}</div>;})}</div>)}</div></div></section>
      <section className="calls-card"><h2>Desempeño por agente</h2><p className="calls-muted">Compare con el mismo período y dirección. Estos datos no permiten calcular ocupación sin horas de conexión.</p><Table rows={data.agentes || []} columns={grouped}/></section>
      <section className="calls-card"><h2>Comparación por empresa</h2><Table rows={data.empresas || []} columns={grouped.map(c=>c[0]==='grupo'?['grupo','Empresa']:c)}/><h2>Cobertura de los datos</h2><p className="calls-muted">Primera y última llamada disponibles por empresa y dirección. No compare períodos con cobertura diferente.</p><Table rows={data.cobertura || []} columns={ [['empresa','Empresa'],['direccion','Dirección'],['desde','Primera llamada',date],['hasta','Última llamada',date],['total','Registros',n]]}/></section>
      <section className="calls-card"><h2>Detalle de llamadas</h2><p className="calls-muted">{n(data.totalDetalle)} registros · Excel con filtros aplicados, hasta 100.000 llamadas. Para un volumen mayor, divida el período.</p><Table rows={data.detalle || []} columns={ [['fecha','Fecha',date],['empresa','Empresa'],['direccion','Dirección'],['agente','Agente'],['telefono','Teléfono'],['estado','Resultado'],['duracion','Duración (s)',n],['facturados','Facturados (s)',n],['espera','Espera (s)',v=>v == null ? '—' : n(v)]]}/><div className="calls-pagination"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page}</span><button disabled={page*(data.limite || 100)>=data.totalDetalle} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div></section>
      <details className="calls-card"><summary>Historial de cargas</summary><Table rows={data.cargas || []} columns={ [['creado_en','Fecha',date],['archivo','Archivo'],['usuario','Usuario'],['empresa','Empresa'],['direccion','Dirección'],['insertadas','Nuevas',n],['repetidas','Repetidas',n],['rechazadas','Rechazadas',n]]}/></details>
      <aside className="calls-note"><strong>Cómo interpretar el reporte.</strong> ANSWERED significa contestada según la central, no contacto humano confirmado ni venta. Los segundos facturados no equivalen necesariamente a conversación. La duración incluye otras fases de la llamada. La tasa de respuesta es contestadas / intentos; no es conversión comercial. Las horas corresponden al archivo de origen. La deduplicación compara el contenido completo normalizado: como el CSV no incluye un identificador único, una corrección de una llamada no se puede reconocer inequívocamente.</aside>
    </>}
  </main>;
}
