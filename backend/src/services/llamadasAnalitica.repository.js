const { validateFilters, invalid } = require('./llamadasAnalitica');
const EXPORT_LIMIT=100000;
function where(filters) {
  const values=[],clauses=[];
  const add=(sql,value)=>{values.push(value);clauses.push(sql.replace('?', '$'+values.length));};
  for(const key of ['empresa','direccion','agente','estado']) if(filters[key]) add(key+' = ?',filters[key]);
  if(filters.desde) add('fecha >= ?::date',filters.desde);
  if(filters.hasta) add("fecha < (?::date + interval '1 day')",filters.hasta);
  return {sql:clauses.length?'WHERE '+clauses.join(' AND '):'',values};
}
const METRICS=`count(*)::int AS total, count(*) FILTER (WHERE telefono !~ '^[0-9]{8,15}$')::int AS "numerosAtipicos",
 count(*) FILTER (WHERE estado='ANSWERED')::int AS contestadas,
 COALESCE(100.0*count(*) FILTER (WHERE estado='ANSWERED')/NULLIF(count(*),0),0)::float8 AS tasa,
 count(DISTINCT telefono)::int AS telefonos,
 count(DISTINCT telefono) FILTER (WHERE estado='ANSWERED')::int AS "telefonosContestados",
 COALESCE(count(*)::float8/NULLIF(count(DISTINCT telefono),0),0) AS "intentosPorTelefono",
 COALESCE(sum(facturados),0)::float8 AS "segundosFacturados",
 COALESCE(sum(duracion),0)::float8 AS duracion,
 avg(espera)::float8 AS "esperaMedia",COALESCE(sum(costo),0)::float8 AS costo`;
const DETAIL=`to_char(fecha,'YYYY-MM-DD HH24:MI:SS') AS fecha, empresa,direccion,agente,telefono,duracion,facturados,espera,estado,costo::float8 AS costo`;
async function importBatch(pool,files,user) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize imports across processes; unique key remains final arbiter.
    await client.query("SELECT pg_advisory_xact_lock(19640919, 360)");
    const results=[];
    for(const file of files) {
      const result=await client.query(`INSERT INTO llamadas_cdr_cargas
        (archivo,archivo_hash,empresa,direccion,usuario_id,usuario,insertadas,repetidas,rechazadas,errores)
        VALUES($1,$2,$3,$4,$5,$6,0,0,$7,$8::jsonb) RETURNING id`,
        [file.archivo,file.hash,file.empresa,file.direccion,user.id,user.usuario||String(user.id),file.rechazadas,JSON.stringify(file.errores)]);
      const id=result.rows[0].id; let insertadas=0;
      for(let i=0;i<file.rows.length;i+=1000) {
        const part=file.rows.slice(i,i+1000);
        const inserted=await client.query(`INSERT INTO llamadas_cdr
          (huella,empresa,direccion,fecha,agente,telefono,duracion,facturados,espera,estado,costo,carga_id)
          SELECT huella,empresa,direccion,fecha::timestamp,agente,telefono,duracion,facturados,espera,estado,costo,$2
          FROM jsonb_to_recordset($1::jsonb) AS r(huella text,empresa text,direccion text,fecha text,agente text,telefono text,duracion integer,facturados integer,espera integer,estado text,costo numeric)
          ON CONFLICT (huella) DO NOTHING`, [JSON.stringify(part),id]);
        insertadas+=inserted.rowCount;
      }
      const repetidas=file.rows.length-insertadas;
      await client.query('UPDATE llamadas_cdr_cargas SET insertadas=$1,repetidas=$2 WHERE id=$3',[insertadas,repetidas,id]);
      results.push({archivo:file.archivo,insertadas,repetidas,rechazadas:file.rechazadas,errores:file.errores});
    }
    await client.query('COMMIT'); return results;
  } catch(e) {await client.query('ROLLBACK').catch(()=>{});throw e;} finally {client.release();}
}
async function dashboard(pool,query={},exporting=false) {
  const f=validateFilters(query),filter=where(f),client=await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const {rows}=await client.query(`WITH filtered AS (
      SELECT *,to_char(fecha,'YYYY-MM-DD') AS dia,to_char(fecha,'HH24') AS hora,
      extract(dow from fecha)::int::text || '-' || to_char(fecha,'HH24') AS mapa FROM llamadas_cdr ${filter.sql}
    ) SELECT CASE WHEN grouping(dia)=0 THEN 'diario' WHEN grouping(agente)=0 THEN 'agentes'
      WHEN grouping(hora)=0 THEN 'horas' WHEN grouping(mapa)=0 THEN 'mapa'
      WHEN grouping(estado)=0 THEN 'estados' WHEN grouping(empresa)=0 THEN 'empresas' ELSE 'resumen' END AS tipo,
      COALESCE(dia,agente,hora,mapa,estado,empresa,'') AS grupo,${METRICS}
      FROM filtered GROUP BY GROUPING SETS ((),(dia),(agente),(hora),(mapa),(estado),(empresa)) ORDER BY grupo`,filter.values);
    const out={diario:[],agentes:[],horas:[],mapa:[],estados:[],empresas:[]};
    for(const row of rows) {const {tipo,...value}=row;if(tipo==='resumen')out.resumen=value;else out[tipo].push(value);}
    if(exporting && out.resumen.total>EXPORT_LIMIT) throw invalid('La exportación admite hasta 100.000 filas. Reduce el rango de fechas.');
    out.cobertura=(await client.query(`SELECT empresa,direccion,count(*)::int AS total,
      to_char(min(fecha),'YYYY-MM-DD HH24:MI:SS') AS desde,to_char(max(fecha),'YYYY-MM-DD HH24:MI:SS') AS hasta
      FROM llamadas_cdr GROUP BY empresa,direccion ORDER BY empresa,direccion`)).rows;
    const catalog=await client.query(`SELECT array_agg(DISTINCT agente ORDER BY agente) AS agentes,array_agg(DISTINCT estado ORDER BY estado) AS estados FROM llamadas_cdr ${f.empresa?'WHERE empresa=$1':''}`,f.empresa?[f.empresa]:[]);
    out.catalogos={agentes:catalog.rows[0].agentes||[],estados:catalog.rows[0].estados||[]};
    out.cargas=(await client.query(`SELECT archivo,empresa,direccion,creado_en,usuario,insertadas,repetidas,rechazadas FROM llamadas_cdr_cargas ${f.empresa?'WHERE empresa=$1':''} ORDER BY id DESC LIMIT 30`,f.empresa?[f.empresa]:[])).rows;
    const limit=exporting?EXPORT_LIMIT:100,offset=exporting?0:(f.pagina-1)*limit;
    out.detalle=(await client.query(`SELECT ${DETAIL} FROM llamadas_cdr ${filter.sql} ORDER BY fecha DESC,huella LIMIT $${filter.values.length+1} OFFSET $${filter.values.length+2}`,[...filter.values,limit,offset])).rows;
    out.totalDetalle=out.resumen.total;out.pagina=exporting?1:f.pagina;out.limite=limit;
    await client.query('COMMIT');return out;
  } catch(e) {await client.query('ROLLBACK').catch(()=>{});throw e;} finally {client.release();}
}
module.exports={importBatch,dashboard,where,EXPORT_LIMIT};
