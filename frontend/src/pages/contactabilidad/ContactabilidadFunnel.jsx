export default function ContactabilidadFunnel({ data = [] }) {
  const total = Number(data[0]?.leads || 0);
  const colors = ['#2563eb','#0891b2','#059669','#7c3aed','#f59e0b'];
  return <section style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:12,padding:16}}>
    <h3 style={{margin:'0 0 4px'}}>Embudo conversacional</h3><p style={{margin:'0 0 14px',fontSize:12,color:'#64748b'}}>Avance desde creación hasta venta subida.</p>
    <div style={{display:'grid',gap:8}}>{data.map((row,index)=>{
      const pct = total ? Number(row.leads||0)*100/total : 0;
      return <div key={row.clave}><div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span>{row.etiqueta}</span><strong>{row.leads} · {pct.toFixed(1)}%</strong></div><div style={{height:12,background:'#e2e8f0',borderRadius:8,overflow:'hidden',marginTop:4}}><div style={{height:'100%',width:`${Math.max(pct,1)}%`,background:colors[index%colors.length],borderRadius:8}}/></div></div>;
    })}</div>
  </section>;
}
