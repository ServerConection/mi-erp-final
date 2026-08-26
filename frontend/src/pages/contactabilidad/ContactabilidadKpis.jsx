import { formatDuration } from '../../utils/contactabilidadAnalytics.js';

export default function ContactabilidadKpis({ resumen = {}, loading }) {
  const cards = [
    ['Leads', resumen.leads ?? 0, '#2563eb'],
    ['Contactados', resumen.contactados ?? 0, '#0891b2'],
    ['Contactabilidad', `${resumen.tasa_contactabilidad ?? 0}%`, '#059669'],
    ['Mediana 1ª respuesta', formatDuration(resumen.mediana_primera_respuesta_seg), '#7c3aed'],
    ['Pendientes asesor', resumen.pendientes_asesor ?? 0, '#ea580c'],
    ['Más de 30 min', resumen.pendientes_30m ?? 0, '#dc2626'],
  ];
  return <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,margin:'16px 0'}}>
    {cards.map(([label,value,color])=><div key={label} style={{background:'#fff',border:'1px solid #e2e8f0',borderTop:`3px solid ${color}`,borderRadius:12,padding:16,minHeight:82}}>
      <div style={{fontSize:11,textTransform:'uppercase',letterSpacing:.4,color:'#64748b'}}>{label}</div>
      <strong style={{display:'block',marginTop:7,fontSize:loading?17:25,color:'#0f172a'}}>{loading?'Cargando…':value}</strong>
    </div>)}
  </div>;
}
