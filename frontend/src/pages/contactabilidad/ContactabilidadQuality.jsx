const fmt = (value) => value ? new Date(value).toLocaleString('es-EC',{timeZone:'America/Guayaquil'}) : '—';
export default function ContactabilidadQuality({ data = {} }) {
  const total = Number(data.leads||0);
  const items = [['Con origen',data.con_origen],['Con asesor',data.con_asesor],['Con etapa',data.con_etapa],['Con mensajes',data.con_mensajes]];
  return <section style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:16}}><h3 style={{margin:'0 0 4px'}}>Calidad de datos</h3><p style={{margin:'0 0 14px',fontSize:12,color:'#64748b'}}>Cobertura del universo filtrado.</p>
    {items.map(([label,value])=>{const pct=total?Number(value||0)*100/total:0;return <div key={label} style={{marginBottom:10}}><div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span>{label}</span><strong>{value||0}/{total} · {pct.toFixed(1)}%</strong></div><div style={{height:7,background:'#e2e8f0',borderRadius:6,marginTop:4}}><div style={{height:'100%',width:`${pct}%`,background:pct>=90?'#10b981':pct>=70?'#f59e0b':'#ef4444',borderRadius:6}}/></div></div>})}
    <small style={{color:'#64748b'}}>Última sincronización: {fmt(data.ultima_sincronizacion)}</small>
  </section>;
}
