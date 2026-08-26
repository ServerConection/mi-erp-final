import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDuration, rankOrigins } from '../../utils/contactabilidadAnalytics.js';

const panel = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:16, minWidth:0 };
const th = {padding:'8px 7px',textAlign:'left',borderBottom:'1px solid #cbd5e1',color:'#475569',whiteSpace:'nowrap'};
const td = {padding:'8px 7px',borderBottom:'1px solid #f1f5f9'};
const pct = (v) => `${Number(v || 0).toFixed(1)}%`;

function OriginTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  return <div style={{background:'#0f172a',color:'#fff',padding:10,borderRadius:8,fontSize:12}}>
    <strong>{row.origen}</strong><br/>{row.contactados} de {row.leads} contactados ({pct(row.tasa_contactabilidad)})
  </div>;
}

function Empty({ children }) { return <div style={{padding:35,textAlign:'center',color:'#94a3b8'}}>{children}</div>; }

export default function ContactabilidadRankings({ porOrigen = [], porAsesor = [], porEtapa = [] }) {
  const origins = rankOrigins(porOrigen).slice(0, 10);
  const advisers = [...porAsesor].sort((a,b)=>b.pendientes_30m-a.pendientes_30m || b.leads-a.leads).slice(0, 12);
  const stages = [...porEtapa].sort((a,b)=>b.leads-a.leads).slice(0, 12);
  return <div style={{display:'grid',gap:14}}>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(390px,1fr))',gap:14}}>
      <section style={panel}><h3 style={{margin:'0 0 4px'}}>Contactabilidad por origen</h3><p style={{margin:'0 0 12px',fontSize:12,color:'#64748b'}}>Ranking válido desde 10 leads; porcentajes incluyen muestra.</p>
        {!origins.length?<Empty>Sin orígenes para este período.</Empty>:<ResponsiveContainer width="100%" height={Math.max(260,origins.length*34)}><BarChart data={origins} layout="vertical" margin={{left:25,right:20}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" domain={[0,100]} unit="%"/><YAxis type="category" dataKey="origen" width={125} tick={{fontSize:10}}/><Tooltip content={<OriginTooltip/>}/><Bar dataKey="tasa_contactabilidad" fill="#0ea5e9" radius={[0,5,5,0]}/></BarChart></ResponsiveContainer>}
      </section>
      <section style={panel}><h3 style={{margin:'0 0 4px'}}>Carga y pendientes por asesor</h3><p style={{margin:'0 0 12px',fontSize:12,color:'#64748b'}}>Prioriza clientes esperando más de 30 minutos.</p>
        {!advisers.length?<Empty>Sin asesores para este período.</Empty>:<ResponsiveContainer width="100%" height={Math.max(260,advisers.length*31)}><BarChart data={advisers} layout="vertical" margin={{left:25,right:20}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number"/><YAxis type="category" dataKey="asesor_nombre" width={145} tick={{fontSize:10}}/><Tooltip formatter={(v,n)=>[v,n==='pendientes_30m'?'> 30 min':'Leads']}/><Bar dataKey="leads" fill="#94a3b8" radius={[0,4,4,0]}/><Bar dataKey="pendientes_30m" fill="#ef4444" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>}
      </section>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(440px,1fr))',gap:14}}>
      <section style={{...panel,overflowX:'auto'}}><h3 style={{margin:'0 0 12px'}}>Detalle por asesor</h3><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr>{['Asesor','Leads','Contactados','Msg. asesor','Pend.','>30m','Mediana 1ª resp.'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{advisers.map(r=><tr key={r.asesor_id||r.asesor_nombre}><td style={td}>{r.asesor_nombre}</td><td style={td}>{r.leads}</td><td style={td}>{r.contactados}</td><td style={td}>{r.mensajes_asesor}</td><td style={td}>{r.pendientes_asesor}</td><td style={{...td,color:r.pendientes_30m?'#dc2626':'inherit',fontWeight:700}}>{r.pendientes_30m}</td><td style={td}>{formatDuration(r.mediana_primera_respuesta_seg)}</td></tr>)}</tbody></table></section>
      <section style={{...panel,overflowX:'auto'}}><h3 style={{margin:'0 0 12px'}}>Detalle por etapa</h3><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr>{['Etapa','Leads','Contactados','Contactabilidad','Msg. cliente','Msg. asesor','Pend.'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{stages.map(r=><tr key={r.etapa_id||r.etapa_nombre}><td style={td}>{r.etapa_nombre}</td><td style={td}>{r.leads}</td><td style={td}>{r.contactados}</td><td style={td}>{pct(r.tasa_contactabilidad)}</td><td style={td}>{r.mensajes_cliente}</td><td style={td}>{r.mensajes_asesor}</td><td style={td}>{r.pendientes_asesor}</td></tr>)}</tbody></table></section>
    </div>
  </div>;
}
