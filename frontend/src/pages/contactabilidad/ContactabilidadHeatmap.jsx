import { buildHeatmap } from '../../utils/contactabilidadAnalytics.js';

export default function ContactabilidadHeatmap({ data = [] }) {
  const matrix = buildHeatmap(data);
  const max = Math.max(1, ...matrix.flatMap(day=>day.hours.map(h=>h.leads_unicos)));
  return <section style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:16,overflowX:'auto'}}>
    <h3 style={{margin:'0 0 4px'}}>Horas más contactables</h3><p style={{margin:'0 0 14px',fontSize:12,color:'#64748b'}}>Leads únicos que escribieron por día y hora, en horario Ecuador.</p>
    <div style={{display:'grid',gridTemplateColumns:'85px repeat(16,minmax(34px,1fr))',gap:4,minWidth:720,fontSize:10}}>
      <div/>{Array.from({length:16},(_,i)=><div key={i} style={{textAlign:'center',color:'#64748b'}}>{String(i+7).padStart(2,'0')}</div>)}
      {matrix.flatMap(day=>[<strong key={`${day.dia}-label`} style={{padding:'8px 3px'}}>{day.dia}</strong>,...day.hours.map(hour=>{
        const alpha = hour.leads_unicos ? .14 + (hour.leads_unicos/max)*.78 : .04;
        return <div key={`${day.dia}-${hour.hora}`} title={`${day.dia} ${hour.hora}:00 · ${hour.leads_unicos} leads únicos · ${hour.mensajes_cliente} mensajes`} style={{padding:'8px 2px',textAlign:'center',borderRadius:5,background:`rgba(14,165,233,${alpha})`,color:alpha>.55?'#fff':'#334155',fontWeight:700}}>{hour.leads_unicos||''}</div>;
      })])}
    </div>
  </section>;
}
