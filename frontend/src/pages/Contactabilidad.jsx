import { useEffect, useMemo, useState } from 'react';
import ContactabilidadFilters from './contactabilidad/ContactabilidadFilters.jsx';
import ContactabilidadKpis from './contactabilidad/ContactabilidadKpis.jsx';
import ContactabilidadRankings from './contactabilidad/ContactabilidadRankings.jsx';
import ContactabilidadHeatmap from './contactabilidad/ContactabilidadHeatmap.jsx';
import ContactabilidadFunnel from './contactabilidad/ContactabilidadFunnel.jsx';
import ContactabilidadQuality from './contactabilidad/ContactabilidadQuality.jsx';
import ContactabilidadOperationalTable from './contactabilidad/ContactabilidadOperationalTable.jsx';
import { buildAnalyticsQuery, readFilters } from '../utils/contactabilidadAnalytics.js';

const API = import.meta.env.VITE_API_URL || '';
const EMPTY = { resumen:{}, por_origen:[], por_asesor:[], por_etapa:[], por_hora:[], embudo:[], operativo:[], calidad_datos:{} };
const fmt = (value) => value ? new Date(value).toLocaleString('es-EC', { timeZone:'America/Guayaquil' }) : '—';

async function getAnalytics(query, signal) {
  const response = await fetch(`${API}/api/bot-auditor/contactabilidad/analytics?${query}`, {
    signal,
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  const json = await response.json();
  if (!response.ok || json.success === false) throw new Error(json.error || `Error ${response.status}`);
  return json.data || EMPTY;
}

export default function Contactabilidad() {
  const [tab, setTab] = useState('inteligencia');
  const [filters, setFilters] = useState(() => readFilters(window.location.search));
  const [analytics, setAnalytics] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const query = useMemo(() => buildAnalyticsQuery(filters), [filters]);

  useEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    const controller = new AbortController();
    const load = (showLoading = false) => {
      if (showLoading) setLoading(true);
      return getAnalytics(query, controller.signal)
        .then((data) => { setAnalytics(data); setError(''); })
        .catch((e) => { if (e.name !== 'AbortError') setError(e.message); })
        .finally(() => showLoading && setLoading(false));
    };
    load(true);
    const timer = setInterval(() => load(false), 30 * 60 * 1000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [query]);

  const options = useMemo(() => ({
    origenes: [...new Set(analytics.por_origen.map(r=>r.origen).filter(Boolean))].sort(),
    asesores: analytics.por_asesor.filter(r=>r.asesor_id).map(r=>({id:String(r.asesor_id),nombre:r.asesor_nombre})).sort((a,b)=>a.nombre.localeCompare(b.nombre)),
    etapas: [...new Set(analytics.por_etapa.map(r=>r.etapa_nombre).filter(Boolean))].sort(),
  }), [analytics]);

  const tabButton = (value, label) => <button type="button" onClick={()=>setTab(value)} style={{padding:'10px 18px',border:0,borderRadius:9,cursor:'pointer',fontWeight:800,background:tab===value?'#1d4ed8':'#e2e8f0',color:tab===value?'#fff':'#334155'}}>{label}</button>;

  return <div style={{padding:24,background:'#f8fafc',minHeight:'100vh',color:'#0f172a'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start',flexWrap:'wrap'}}>
      <div><h1 style={{margin:0}}>📊 Inteligencia de Contactabilidad</h1><p style={{color:'#64748b'}}>Decisiones por origen, asesor, etapa y horario · actualización cada 30 minutos</p></div>
      <div style={{display:'flex',gap:8}}>{tabButton('inteligencia','Inteligencia')}{tabButton('operacion','Operación')}</div>
      <small style={{color:'#64748b'}}>Abre "Operaci�n" para ver Mensajes y fechas del cliente y del asesor.</small>
      <small style={{color:'#64748b'}}>Pendiente de reintento identifica registros con cero mensajes; el listado se ordena por fecha de creacion, del mas reciente al mas antiguo.</small>
    </div>
    <ContactabilidadFilters filters={filters} options={options} onChange={setFilters} onReset={()=>setFilters(readFilters(''))} />
    <ContactabilidadKpis resumen={analytics.resumen} loading={loading} />
    {error && <div role="alert" style={{padding:14,borderRadius:10,background:'#fee2e2',color:'#991b1b',marginBottom:14}}>No se pudo actualizar: {error}</div>}

    {tab === 'inteligencia' ? <div id="contactabilidad-inteligencia" style={{display:'grid',gap:14}}>
      <ContactabilidadRankings porOrigen={analytics.por_origen} porAsesor={analytics.por_asesor} porEtapa={analytics.por_etapa} />
      <ContactabilidadHeatmap data={analytics.por_hora} />
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(330px,1fr))',gap:14}}>
        <ContactabilidadFunnel data={analytics.embudo} />
        <ContactabilidadQuality data={analytics.calidad_datos} />
      </div>
    </div> : <ContactabilidadOperationalTable rows={analytics.operativo} loading={loading} />}
    <p style={{fontSize:11,color:'#94a3b8'}}>Última sincronización: {fmt(analytics.calidad_datos.ultima_sincronizacion || analytics.resumen.ultima_sincronizacion)}</p>
  </div>;
}
