import { useEffect, useMemo, useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';
const fmt = (v) => v ? new Date(v).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }) : '—';
const tiempo = (v) => {
  if (!v) return '—';
  const min = Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h ${min % 60} min`;
  return `${Math.floor(min / 1440)} d`;
};

async function get(path) {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  const json = await response.json();
  if (!response.ok || json.success === false) throw new Error(json.error || `Error ${response.status}`);
  return json;
}

export default function Contactabilidad() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtros, setFiltros] = useState({ empresa: '', q: '', pendiente_por: '', desde: '', hasta: '' });
  const query = useMemo(() => {
    const p = new URLSearchParams({ limit: '100' });
    Object.entries(filtros).forEach(([k, v]) => v && p.set(k, v));
    return p.toString();
  }, [filtros]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([get(`/api/bot-auditor/contactabilidad?${query}`), get(`/api/bot-auditor/contactabilidad/stats?${query}`)])
      .then(([list, summary]) => { if (active) { setRows(list.data || []); setStats(summary.data || {}); setError(''); } })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    const timer = setInterval(() => get(`/api/bot-auditor/contactabilidad?${query}`).then((r) => active && setRows(r.data || [])).catch(() => {}), 30 * 60 * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [query]);

  return <div style={{ padding: 24, background: '#f8fafc', minHeight: '100vh' }}>
    <h1 style={{ margin: 0, color: '#0f172a' }}>📞 Contactabilidad</h1>
    <p style={{ color: '#64748b' }}>Mensajes, tiempos de respuesta y pendientes por lead · actualización cada 30 minutos</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(130px,1fr))', gap: 12, margin: '18px 0' }}>
      {[['Leads',stats.leads],['Mensajes cliente',stats.mensajes_cliente],['Mensajes asesor',stats.mensajes_asesor],['Contactabilidad',`${stats.tasa_contactabilidad || 0}%`],['Pendientes asesor',stats.pendientes_asesor]].map(([label,value]) =>
        <div key={label} style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:12, padding:16 }}><div style={{fontSize:12,color:'#64748b'}}>{label}</div><strong style={{fontSize:24,color:'#0f172a'}}>{value ?? 0}</strong></div>)}
    </div>
    <div style={{ display:'flex', gap:10, marginBottom:14 }}>
      <select value={filtros.empresa} onChange={(e)=>setFiltros(f=>({...f,empresa:e.target.value}))}><option value="">Todas las empresas</option><option>NOVONET</option><option>VELSA</option></select>
      <select value={filtros.pendiente_por} onChange={(e)=>setFiltros(f=>({...f,pendiente_por:e.target.value}))}><option value="">Todos los estados</option><option value="ASESOR">Pendiente asesor</option><option value="CLIENTE">Pendiente cliente</option></select>
      <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#475569'}}>Desde <input type="date" value={filtros.desde} onChange={(e)=>setFiltros(f=>({...f,desde:e.target.value}))} /></label>
      <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#475569'}}>Hasta <input type="date" value={filtros.hasta} onChange={(e)=>setFiltros(f=>({...f,hasta:e.target.value}))} /></label>
      <input placeholder="Cliente, asesor o ID" value={filtros.q} onChange={(e)=>setFiltros(f=>({...f,q:e.target.value}))} style={{minWidth:240}} />
    </div>
    {error && <div style={{color:'#b91c1c',margin:12}}>{error}</div>}
    <div style={{ overflowX:'auto', background:'white', border:'1px solid #e2e8f0', borderRadius:12 }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}><thead><tr>{['Empresa','ID','Creado','Cliente','Asesor (nombre)','Origen','Etapa (nombre)','Mensajes cliente','Mensajes asesor','Últ. cliente','Hace','Últ. asesor','Hace','Pendiente'].map(h=><th key={h} style={{padding:10,textAlign:'left',borderBottom:'1px solid #e2e8f0'}}>{h}</th>)}</tr></thead>
      <tbody>{loading ? <tr><td colSpan="14" style={{padding:30,textAlign:'center'}}>Cargando…</td></tr> : rows.map(r=><tr key={`${r.empresa}-${r.id_bitrix}`}>
        {[r.empresa,r.id_bitrix,fmt(r.fecha_creacion),r.nombre_cliente||'—',r.asesor_nombre||'—',r.origen_nombre||'—',r.etapa_nombre||r.etapa_id||'—',r.mensajes_cliente_total,r.mensajes_asesor_total,fmt(r.ultimo_mensaje_cliente_at),tiempo(r.ultimo_mensaje_cliente_at),fmt(r.ultimo_mensaje_asesor_at),tiempo(r.ultimo_mensaje_asesor_at)].map((v,i)=><td key={i} style={{padding:10,borderBottom:'1px solid #f1f5f9',whiteSpace:'nowrap'}}>{v}</td>)}
        <td style={{padding:10,fontWeight:700,color:r.pendiente_por==='ASESOR'?'#dc2626':'#2563eb'}}>{r.pendiente_por||'—'}</td></tr>)}</tbody></table>
    </div>
    <p style={{fontSize:11,color:'#94a3b8'}}>Última sincronización: {fmt(stats.ultima_sincronizacion)}</p>
  </div>;
}
