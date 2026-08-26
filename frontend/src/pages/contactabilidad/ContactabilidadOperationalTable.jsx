import { pendingPriority } from '../../utils/contactabilidadAnalytics.js';
const fmt = (value) => value ? new Date(value).toLocaleString('es-EC',{timeZone:'America/Guayaquil'}) : '—';
const colors = { critico:'#dc2626', alerta:'#ea580c', normal:'#64748b' };

export default function ContactabilidadOperationalTable({ rows = [], loading }) {
  return <div style={{overflowX:'auto',background:'#fff',border:'1px solid #e2e8f0',borderRadius:12}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
    <thead><tr>{['Empresa','ID','Creado','Cliente','Asesor','Origen','Etapa','Msg. cliente','Msg. asesor','Últ. cliente','Últ. asesor','Pendiente','Min.','Prioridad'].map(h=><th key={h} style={{padding:10,textAlign:'left',borderBottom:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
    <tbody>{loading?<tr><td colSpan="14" style={{padding:30,textAlign:'center'}}>Cargando…</td></tr>:!rows.length?<tr><td colSpan="14" style={{padding:30,textAlign:'center',color:'#64748b'}}>No existen leads para los filtros seleccionados. Revisa el rango de fechas o la última sincronización.</td></tr>:rows.map(r=>{const priority=pendingPriority(r);return <tr key={`${r.empresa}-${r.id_bitrix}`}>
      {[r.empresa,r.id_bitrix,fmt(r.fecha_creacion),r.nombre_cliente||'—',r.asesor_nombre||'—',r.origen_nombre||'—',r.etapa_nombre||r.etapa_id||'—',r.mensajes_cliente_total,r.mensajes_asesor_total,fmt(r.ultimo_mensaje_cliente_at),fmt(r.ultimo_mensaje_asesor_at),r.pendiente_por||'—',r.minutos_pendiente??'—'].map((v,i)=><td key={i} style={{padding:10,borderBottom:'1px solid #f1f5f9',whiteSpace:'nowrap'}}>{v}</td>)}
      <td style={{padding:10,borderBottom:'1px solid #f1f5f9',fontWeight:800,color:colors[priority],textTransform:'uppercase'}}>{priority}</td>
    </tr>})}</tbody>
  </table></div>;
}
