const control = { padding: '9px 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', color: '#0f172a' };

export default function ContactabilidadFilters({ filters, options, onChange, onReset }) {
  const set = (key) => (event) => onChange({ ...filters, [key]: event.target.value });
  return <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'end', padding:14, background:'#fff', border:'1px solid #e2e8f0', borderRadius:12 }}>
    <label style={{fontSize:12,color:'#475569'}}>Desde<br/><input style={control} type="date" value={filters.desde} onChange={set('desde')} /></label>
    <label style={{fontSize:12,color:'#475569'}}>Hasta<br/><input style={control} type="date" value={filters.hasta} onChange={set('hasta')} /></label>
    <label style={{fontSize:12,color:'#475569'}}>Empresa<br/><select style={control} value={filters.empresa} onChange={set('empresa')}><option value="">Todas</option><option>NOVONET</option><option>VELSA</option></select></label>
    <label style={{fontSize:12,color:'#475569'}}>Origen<br/><select style={{...control,minWidth:170}} value={filters.origen} onChange={set('origen')}><option value="">Todos</option>{options.origenes.map(v=><option key={v}>{v}</option>)}</select></label>
    <label style={{fontSize:12,color:'#475569'}}>Asesor<br/><select style={{...control,minWidth:190}} value={filters.asesor_id} onChange={set('asesor_id')}><option value="">Todos</option>{options.asesores.map(v=><option key={v.id} value={v.id}>{v.nombre}</option>)}</select></label>
    <label style={{fontSize:12,color:'#475569'}}>Etapa<br/><select style={{...control,minWidth:180}} value={filters.etapa} onChange={set('etapa')}><option value="">Todas</option>{options.etapas.map(v=><option key={v}>{v}</option>)}</select></label>
    <button type="button" onClick={onReset} style={{...control,cursor:'pointer',fontWeight:700}}>Limpiar</button>
  </div>;
}
