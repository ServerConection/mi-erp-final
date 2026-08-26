const pool = require('../config/db');
const { esLeadTotalExpr, esGestionableExpr, esDescarteExpr } = require('../shared/etapas');
const { fechaWebhookExpr, etapaWebhookExpr, horaWebhookExpr } = require('../shared/webhookRedes');

const FECHA = fechaWebhookExpr('w');
const ETAPA = etapaWebhookExpr('w');
const HORA = horaWebhookExpr('w');

const fechas = (q) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());
  return { desde: q.fechaDesde || hoy, hasta: q.fechaHasta || hoy };
};
const seleccion = (q) => String(q.canales || '').split(',').map(v => v.trim()).filter(Boolean);
const filtroOrigen = (items, offset = 2) => items.length
  ? { sql: `AND COALESCE(NULLIF(BTRIM(w.source), ''), 'SIN ORIGEN') IN (${items.map((_, i) => `$${offset + i + 1}`).join(',')})`, params: items }
  : { sql: '', params: [] };
const filtroInversion = (items, offset = 2) => items.length
  ? { sql: `AND canal_publicidad IN (${items.map((_, i) => `$${offset + i + 1}`).join(',')})`, params: items }
  : { sql: '', params: [] };

const selectMetricas = `
  COUNT(*) FILTER (WHERE ${esLeadTotalExpr(ETAPA)}) AS n_leads,
  COUNT(*) FILTER (WHERE ${esGestionableExpr(ETAPA)}) AS gestionables,
  COUNT(*) FILTER (WHERE ${ETAPA} ~* 'ATC|SOPORTE') AS atc,
  COUNT(*) FILTER (WHERE ${ETAPA} ~* 'FUERA DE COBERTURA') AS fuera_cobertura,
  COUNT(*) FILTER (WHERE ${ETAPA} ~* 'ZONA.*PELIGRO') AS zona_peligrosa,
  COUNT(*) FILTER (WHERE ${ETAPA} ~* 'INNEGOCIABLE') AS innegociable,
  COUNT(*) FILTER (WHERE ${ETAPA} ~* 'DUP(L)?LICADO') AS duplicado,
  COUNT(*) FILTER (WHERE ${esDescarteExpr(ETAPA)}) AS descarte,
  COUNT(*) FILTER (WHERE ${ETAPA} ~* 'VENTA SUBIDA') AS venta_subida,
  COUNT(*) FILTER (WHERE ${ETAPA} ~* 'SEGUIMIENTO') AS seguimiento_negociacion,
  COUNT(*) FILTER (WHERE ${ETAPA} ~* 'REGULARIZA') AS regularizacion,
  COUNT(*) FILTER (WHERE ${ETAPA} ~* 'MAS DE 15 DIAS') AS mas_15_dias_cierre,
  COUNT(*) FILTER (WHERE ${ETAPA} ~* 'CONTACTO NUEVO.*SUPERVISOR') AS contacto_nuevo_supervisor,
  COUNT(*) FILTER (WHERE ${ETAPA} ~* 'URGENTE GESTION SUPERVISOR') AS urgente_gestion_supervisor,
  COUNT(*) FILTER (WHERE ${ETAPA} ~* 'ENVIO REQUISITOS') AS envio_requisitos`;

async function getCanalesDisponibles(req, res) {
  try {
    const { desde, hasta } = fechas(req.query);
    const r = await pool.query(`SELECT COALESCE(NULLIF(BTRIM(w.source),''),'SIN ORIGEN') canal_publicidad,
      COUNT(*) FILTER (WHERE ${esLeadTotalExpr(ETAPA)}) n_leads
      FROM bitrix_webhook_leads w WHERE w.empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date
      GROUP BY 1 ORDER BY n_leads DESC`, [desde, hasta]);
    res.json({ success: true, canales: r.rows });
  } catch (error) { responderError(res, 'canales', error); }
}

async function consultarDiario(desde, hasta, canales) {
  const f = filtroOrigen(canales);
  return pool.query(`SELECT ${FECHA} fecha, COALESCE(NULLIF(BTRIM(w.source),''),'SIN ORIGEN') canal_publicidad,
    ${selectMetricas}, 0::bigint activos_jotform, 0::bigint fin_gestion_jotform,
    0::bigint rechazado_jotform, 0::bigint desiste_servicio_jotform
    FROM bitrix_webhook_leads w WHERE w.empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date ${f.sql}
    GROUP BY 1,2 ORDER BY 1 DESC, n_leads DESC`, [desde, hasta, ...f.params]);
}

async function getMonitoreoRedesVelsa(req, res) {
  try {
    const { desde, hasta } = fechas(req.query); const canales = seleccion(req.query);
    const data = (await consultarDiario(desde, hasta, canales)).rows;
    const sum = k => data.reduce((a, r) => a + Number(r[k] || 0), 0);
    const n = sum('n_leads'), g = sum('gestionables'), venta = sum('venta_subida'), atc = sum('atc');
    const descartados = sum('descarte');
    const totales = { n_leads:n, gestionables:g, atc, fuera_cobertura:sum('fuera_cobertura'), zona_peligrosa:sum('zona_peligrosa'),
      innegociable:sum('innegociable'), duplicado:sum('duplicado'), descarte:sum('descarte'), venta_subida:venta,
      seguimiento_negociacion:sum('seguimiento_negociacion'), regularizacion:sum('regularizacion'),
      mas_15_dias_cierre:sum('mas_15_dias_cierre'), contacto_nuevo_supervisor:sum('contacto_nuevo_supervisor'),
      urgente_gestion_supervisor:sum('urgente_gestion_supervisor'), envio_requisitos:sum('envio_requisitos'),
      activos_jotform:0, fin_gestion_jotform:0, rechazado_jotform:0, desiste_servicio_jotform:0, descartados,
      pct_venta_subida:g ? +(venta/g*100).toFixed(1):0, pct_atc:n ? +(atc/n*100).toFixed(1):0,
      pct_descartado:g ? +(descartados/g*100).toFixed(1):0 };
    const porCanal = Object.values(data.reduce((m,r)=>{const c=r.canal_publicidad;if(!m[c])m[c]={canal_publicidad:c,n_leads:0,gestionables:0,atc:0,venta_subida:0,descartados:0};
      for(const k of ['n_leads','gestionables','atc','venta_subida'])m[c][k]+=Number(r[k]||0);m[c].descartados+=Number(r.descarte||0);return m;},{}));
    const fi=filtroInversion(canales); const inv=await pool.query(`SELECT canal_publicidad,SUM(monto_usd) inversion FROM velsa_inversion_redes WHERE fecha BETWEEN $1 AND $2 ${fi.sql} GROUP BY 1`,[desde,hasta,...fi.params]);
    const invMap=Object.fromEntries(inv.rows.map(r=>[r.canal_publicidad,Number(r.inversion||0)]));
    let inversionTotal=0; porCanal.forEach(r=>{r.inversion=invMap[r.canal_publicidad]||0;inversionTotal+=r.inversion;r.cpl=r.n_leads&&r.inversion?+(r.inversion/r.n_leads).toFixed(2):null;r.costo_venta=r.venta_subida&&r.inversion?+(r.inversion/r.venta_subida).toFixed(2):null;});
    totales.inversion_total=+inversionTotal.toFixed(2);totales.cpl_promedio=n&&inversionTotal?+(inversionTotal/n).toFixed(2):null;totales.costo_venta_promedio=venta&&inversionTotal?+(inversionTotal/venta).toFixed(2):null;
    res.json({success:true,totales,porCanal:porCanal.sort((a,b)=>b.n_leads-a.n_leads),data});
  } catch(error){responderError(res,'monitoreo',error);}
}

async function getTendenciaDiaria(req,res){
  try{const {desde,hasta}=fechas(req.query),canales=seleccion(req.query);const rows=(await consultarDiario(desde,hasta,canales)).rows;
    const map={};for(const r of rows){const f=new Date(r.fecha).toISOString().slice(0,10);if(!map[f])map[f]={fecha:f,n_leads:0,gestionables:0,atc:0,venta_subida:0,descartados:0};for(const k of ['n_leads','gestionables','atc','venta_subida'])map[f][k]+=Number(r[k]||0);map[f].descartados+=Number(r.descarte||0);}
    const fi=filtroInversion(canales);const inv=await pool.query(`SELECT fecha,SUM(monto_usd) inversion FROM velsa_inversion_redes WHERE fecha BETWEEN $1 AND $2 ${fi.sql} GROUP BY 1`,[desde,hasta,...fi.params]);for(const r of inv.rows){const f=new Date(r.fecha).toISOString().slice(0,10);if(!map[f])map[f]={fecha:f,n_leads:0,gestionables:0,atc:0,venta_subida:0,descartados:0};map[f].inversion=Number(r.inversion||0);}
    res.json({success:true,data:Object.values(map).sort((a,b)=>a.fecha.localeCompare(b.fecha)).map(r=>({...r,inversion:r.inversion||0,cpl:r.n_leads&&r.inversion?+(r.inversion/r.n_leads).toFixed(2):null,costo_venta:r.venta_subida&&r.inversion?+(r.inversion/r.venta_subida).toFixed(2):null}))});
  }catch(error){responderError(res,'tendencia',error);}}

async function getInversion(req,res){try{const {desde,hasta}=fechas(req.query),f=filtroInversion(seleccion(req.query));const r=await pool.query(`SELECT id,fecha,canal_publicidad,monto_usd,creado_por,updated_at FROM velsa_inversion_redes WHERE fecha BETWEEN $1 AND $2 ${f.sql} ORDER BY fecha DESC,canal_publicidad`,[desde,hasta,...f.params]);res.json({success:true,data:r.rows});}catch(e){responderError(res,'inversion',e);}}
async function upsertInversion(req,res){try{const items=Array.isArray(req.body.items)?req.body.items:[req.body],out=[];for(const x of items){if(!x.fecha||!x.canal_publicidad||Number(x.monto_usd)<0) return res.status(400).json({success:false,message:'Datos de inversión inválidos'});const r=await pool.query(`INSERT INTO velsa_inversion_redes(fecha,canal_publicidad,monto_usd,creado_por,updated_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(fecha,canal_publicidad) DO UPDATE SET monto_usd=EXCLUDED.monto_usd,creado_por=EXCLUDED.creado_por,updated_at=now() RETURNING *`,[x.fecha,x.canal_publicidad,Number(x.monto_usd),req.user?.usuario||'desconocido']);out.push(r.rows[0]);}res.json({success:true,data:out});}catch(e){responderError(res,'guardar inversión',e);}}

async function getMonitoreoCiudad(req,res){try{const {desde,hasta}=fechas(req.query),f=filtroOrigen(seleccion(req.query));const r=await pool.query(`SELECT ''::text provincia,COALESCE(NULLIF(BTRIM(w.city),''),'SIN CIUDAD') ciudad,COUNT(*) FILTER(WHERE ${esLeadTotalExpr(ETAPA)}) n_leads,COUNT(*) FILTER(WHERE ${ETAPA}~*'ATC|SOPORTE') atc,COUNT(*) FILTER(WHERE ${ETAPA}~*'VENTA SUBIDA') venta_subida FROM bitrix_webhook_leads w WHERE empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date ${f.sql} GROUP BY 2 ORDER BY n_leads DESC`,[desde,hasta,...f.params]);const d=await pool.query(`SELECT ${FECHA} fecha,COALESCE(NULLIF(BTRIM(w.city),''),'SIN CIUDAD') ciudad,COUNT(*) FILTER(WHERE ${esLeadTotalExpr(ETAPA)}) n_leads FROM bitrix_webhook_leads w WHERE empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date ${f.sql} GROUP BY 1,2 ORDER BY 1,2`,[desde,hasta,...f.params]);res.json({success:true,porCiudad:r.rows,porCiudadDia:d.rows});}catch(e){responderError(res,'ciudad',e);}}
async function getMonitoreoHora(req,res){try{const {desde,hasta}=fechas(req.query),f=filtroOrigen(seleccion(req.query));const q=`FROM bitrix_webhook_leads w WHERE empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date ${f.sql}`;const r=await pool.query(`SELECT ${HORA} hora,COUNT(*) FILTER(WHERE ${esLeadTotalExpr(ETAPA)}) n_leads,COUNT(*) FILTER(WHERE ${ETAPA}~*'ATC|SOPORTE') atc,COUNT(*) FILTER(WHERE ${ETAPA}~*'VENTA SUBIDA') venta_subida ${q} GROUP BY 1 ORDER BY 1`,[desde,hasta,...f.params]);const d=await pool.query(`SELECT ${FECHA} fecha,${HORA} hora,COUNT(*) FILTER(WHERE ${esLeadTotalExpr(ETAPA)}) n_leads ${q} GROUP BY 1,2 ORDER BY 1,2`,[desde,hasta,...f.params]);res.json({success:true,porHora:r.rows,porHoraDia:d.rows});}catch(e){responderError(res,'hora',e);}}
async function getMonitoreoAtc(req,res){try{const {desde,hasta}=fechas(req.query),f=filtroOrigen(seleccion(req.query));const r=await pool.query(`SELECT COALESCE(NULLIF(BTRIM(w.motivo_atc),''),${ETAPA},'SIN MOTIVO') motivo,COUNT(*) cantidad FROM bitrix_webhook_leads w WHERE empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date AND ${ETAPA}!~*'VENTA SUBIDA' ${f.sql} GROUP BY 1 ORDER BY 2 DESC`,[desde,hasta,...f.params]);res.json({success:true,data:r.rows,aviso:'Fuente directa del webhook Bitrix; usa motivo ATC y, cuando está vacío, la etapa CRM.'});}catch(e){responderError(res,'ATC',e);}}

async function getReporteData(req,res){try{const {desde,hasta}=fechas(req.query),canales=seleccion(req.query);const diario=(await consultarDiario(desde,hasta,canales)).rows;const dias=(await pool.query(`SELECT to_char(d,'YYYY-MM-DD') fecha FROM generate_series($1::date,$2::date,'1 day') d`,[desde,hasta])).rows.map(r=>r.fecha);const fi=filtroInversion(canales);const inv=(await pool.query(`SELECT fecha,SUM(monto_usd) inversion FROM velsa_inversion_redes WHERE fecha BETWEEN $1 AND $2 ${fi.sql} GROUP BY 1`,[desde,hasta,...fi.params])).rows;const map={};for(const r of diario){const f=new Date(r.fecha).toISOString().slice(0,10);if(!map[f])map[f]={n_leads:0,gestionables:0,atc:0,venta_subida:0,descartados:0,inversion:0};for(const k of ['n_leads','gestionables','atc','venta_subida'])map[f][k]+=Number(r[k]||0);map[f].descartados+=Number(r.descarte||0);}for(const r of inv){const f=new Date(r.fecha).toISOString().slice(0,10);if(!map[f])map[f]={n_leads:0,gestionables:0,atc:0,venta_subida:0,descartados:0,inversion:0};map[f].inversion=Number(r.inversion||0);}const inversion=dias.map(fecha=>({fecha,...(map[fecha]||{n_leads:0,gestionables:0,atc:0,venta_subida:0,descartados:0,inversion:0})}));const fake={query:{...req.query,fechaDesde:desde,fechaHasta:hasta,canales:canales.join(',')}};let ciudad,hora;await getMonitoreoCiudad(fake,{json:x=>{ciudad=x.porCiudad}});await getMonitoreoHora(fake,{json:x=>{hora=x.porHora}});const canalesDisp=await pool.query(`SELECT COALESCE(NULLIF(BTRIM(source),''),'SIN ORIGEN') canal_publicidad,COUNT(*) n_leads FROM bitrix_webhook_leads w WHERE empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 2 DESC`,[desde,hasta]);res.json({success:true,meta:{dias,fechaDesde:desde,fechaHasta:hasta},inversion,pago:[],ciclo:[],ciudad:ciudad||[],hora:hora||[],canales_disponibles:canalesDisp.rows});}catch(e){responderError(res,'reporte',e);}}

async function getAgenciasCanal(req,res){try{const r=await pool.query(`SELECT NULLIF(BTRIM(w.source),'') origen,COUNT(*) n_leads,COALESCE(MAX(m.agencia),'VELSA') agencia FROM bitrix_webhook_leads w LEFT JOIN velsa_lineas_canal m ON m.origen=NULLIF(BTRIM(w.source),'') WHERE empresa='velsa' AND NULLIF(BTRIM(w.source),'') IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`);res.json({success:true,origenes:r.rows});}catch(e){responderError(res,'agencias',e);}}
async function upsertAgenciaCanal(req,res){try{const items=Array.isArray(req.body.items)?req.body.items:[req.body],out=[];for(const x of items){if(!x.origen)return res.status(400).json({success:false,message:'Cada registro requiere origen'});if(!String(x.agencia||'').trim()){await pool.query('DELETE FROM velsa_lineas_canal WHERE origen=$1',[x.origen]);out.push({origen:x.origen,agencia:null});}else{const r=await pool.query(`INSERT INTO velsa_lineas_canal(origen,agencia,creado_por,actualizado_en) VALUES($1,$2,$3,now()) ON CONFLICT(origen) DO UPDATE SET agencia=EXCLUDED.agencia,creado_por=EXCLUDED.creado_por,actualizado_en=now() RETURNING *`,[x.origen,String(x.agencia).trim(),req.user?.usuario||'desconocido']);out.push(r.rows[0]);}}res.json({success:true,data:out});}catch(e){responderError(res,'guardar agencia',e);}}
async function getResumenPorAgencia(req,res){try{const {desde,hasta}=fechas(req.query),f=filtroOrigen(seleccion(req.query));const r=await pool.query(`SELECT COALESCE(m.agencia,'VELSA') agencia,COUNT(*) FILTER(WHERE ${esLeadTotalExpr(ETAPA)}) n_leads,COUNT(*) FILTER(WHERE ${esGestionableExpr(ETAPA)}) gestionables,COUNT(*) FILTER(WHERE ${ETAPA}~*'ATC|SOPORTE') atc,COUNT(*) FILTER(WHERE ${ETAPA}~*'VENTA SUBIDA') venta_subida,COUNT(*) FILTER(WHERE ${esDescarteExpr(ETAPA)}) descartados FROM bitrix_webhook_leads w LEFT JOIN velsa_lineas_canal m ON m.origen=NULLIF(BTRIM(w.source),'') WHERE empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date ${f.sql} GROUP BY 1 ORDER BY 2 DESC`,[desde,hasta,...f.params]);res.json({success:true,porAgencia:r.rows.map(x=>{const n=Number(x.n_leads||0),g=Number(x.gestionables||0),v=Number(x.venta_subida||0);return{...x,n_leads:n,gestionables:g,atc:Number(x.atc||0),venta_subida:v,descartados:Number(x.descartados||0),pct_venta_subida:g?+(v/g*100).toFixed(1):0,inversion:0,cpl:null,costo_venta:null};})});}catch(e){responderError(res,'resumen agencias',e);}}

function responderError(res,seccion,error){console.error(`Error Redes VELSA webhook (${seccion}):`,error);res.status(500).json({success:false,message:`Error al obtener ${seccion}`,error:process.env.NODE_ENV==='production'?'Error interno del servidor':error.message});}
module.exports={getCanalesDisponibles,getMonitoreoRedesVelsa,getTendenciaDiaria,getInversion,upsertInversion,getMonitoreoCiudad,getMonitoreoHora,getMonitoreoAtc,getReporteData,getAgenciasCanal,upsertAgenciaCanal,getResumenPorAgencia};
