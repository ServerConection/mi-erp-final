const pool = require('../config/db');
const { esLeadTotalExpr, esGestionableExpr, esDescarteExpr } = require('../shared/etapas');
const { fechaWebhookExpr, etapaWebhookExpr, horaWebhookExpr } = require('../shared/webhookRedes');
const { resolverCanalInversion, construirForecastAgencias } = require('../shared/inversionRedes');
const { asegurarInversionReciente } = require('../services/inversionFreshness.service');

const FECHA = fechaWebhookExpr('w');
const ETAPA = etapaWebhookExpr('w');
const HORA = horaWebhookExpr('w');
const AGENCIA = `COALESCE((
  SELECT NULLIF(UPPER(BTRIM(m.agencia)), '')
  FROM velsa_lineas_canal m
  WHERE UPPER(BTRIM(m.origen)) = UPPER(BTRIM(w.source))
  LIMIT 1
), 'VELSA')`;

const fechas = (q) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());
  return { desde: q.fechaDesde || hoy, hasta: q.fechaHasta || hoy };
};
const seleccion = (q) => String(q.canales || '').split(',').map(v => v.trim()).filter(Boolean);
const filtroAgencia = (items, offset = 2) => items.length
  ? { sql: `AND ${AGENCIA} IN (${items.map((_, i) => `$${offset + i + 1}`).join(',')})`, params: items.map(v => v.toUpperCase()) }
  : { sql: '', params: [] };
const filtroInversion = (items, offset = 2) => items.length
  ? { sql: `AND (CASE UPPER(BTRIM(canal_publicidad))
      WHEN '__WINTRACKER_ARTS__' THEN 'ARTS'
      WHEN '__WINTRACKER_VIDIKA__' THEN 'VIDIKA'
      WHEN '__WINTRACKER_VELSA__' THEN 'VELSA'
      ELSE UPPER(BTRIM(canal_publicidad)) END) IN (${items.map((_, i) => `$${offset + i + 1}`).join(',')})`, params: items.map(v => v.toUpperCase()) }
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

// ─────────────────────────────────────────────────────────────────────────────
// LADO JOTFORM DE VELSA (bloques "Forma de pago" y "Ciclo de venta")
// ─────────────────────────────────────────────────────────────────────────────
// Pago y ciclo se leen de la MV; una negociaci?n cuenta una sola vez.
async function consultarFormaPago(desde, hasta, canales) {
  return pool.query(`${jotMensualMv} SELECT COALESCE(NULLIF(BTRIM(forma_pago),''),'SIN ESPECIFICAR') forma_pago,
      COUNT(*)::int cantidad FROM jot
    WHERE registro BETWEEN $1::date AND $2::date AND activacion IS NOT NULL ${filtroJotAgencia(canales)}
    GROUP BY 1 ORDER BY cantidad DESC`, [desde, hasta, ...canales.map(x => x.toUpperCase())]);
}

// Ciclo de venta desde creaci?n CRM hasta activaci?n Netlife.
async function consultarCicloVenta(desde, hasta, canales) {
  return pool.query(`${jotMensualMv} SELECT CASE
      WHEN activacion - creacion <= 0 THEN '0'
      WHEN activacion - creacion = 1 THEN '1'
      WHEN activacion - creacion = 2 THEN '2'
      WHEN activacion - creacion = 3 THEN '3'
      WHEN activacion - creacion = 4 THEN '4'
      ELSE '5+' END bucket, COUNT(*)::int cantidad
    FROM jot WHERE registro BETWEEN $1::date AND $2::date
      AND activacion IS NOT NULL AND creacion IS NOT NULL ${filtroJotAgencia(canales)}
    GROUP BY 1 ORDER BY 1`, [desde, hasta, ...canales.map(x => x.toUpperCase())]);
}

async function getCanalesDisponibles(req, res) {
  try {
    const { desde, hasta } = fechas(req.query);
    const r = await pool.query(`SELECT ${AGENCIA} canal_publicidad,
      COUNT(*) FILTER (WHERE ${esLeadTotalExpr(ETAPA)}) n_leads
      FROM bitrix_webhook_leads w WHERE w.empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date
      GROUP BY 1 ORDER BY n_leads DESC`, [desde, hasta]);
    res.json({ success: true, canales: r.rows });
  } catch (error) { responderError(res, 'canales', error); }
}

async function consultarDiario(desde, hasta, canales) {
  const f = filtroAgencia(canales);
  return pool.query(`SELECT ${FECHA} fecha, ${AGENCIA} canal_publicidad,
    ${selectMetricas}, 0::bigint activos_jotform, 0::bigint fin_gestion_jotform,
    0::bigint rechazado_jotform, 0::bigint desiste_servicio_jotform
    FROM bitrix_webhook_leads w WHERE w.empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date ${f.sql}
    GROUP BY 1,2 ORDER BY 1 DESC, n_leads DESC`, [desde, hasta, ...f.params]);
}

async function getMonitoreoRedesVelsa(req, res) {
  try {
    await asegurarInversionReciente();
    const { desde, hasta } = fechas(req.query); const canales = seleccion(req.query); const fi = filtroInversion(canales);
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
    const inv=await pool.query(`SELECT canal_publicidad,SUM(monto_usd) inversion FROM velsa_inversion_redes WHERE fecha BETWEEN $1 AND $2 ${fi.sql} GROUP BY 1`,[desde,hasta,...fi.params]);
    const invMap={}; for(const r of inv.rows){const a=resolverCanalInversion(r.canal_publicidad);invMap[a]=(invMap[a]||0)+Number(r.inversion||0);}
    let inversionTotal=Object.values(invMap).reduce((a,b)=>a+Number(b||0),0); porCanal.forEach(r=>{r.inversion=invMap[r.canal_publicidad]||0;r.cpl=r.n_leads&&r.inversion?+(r.inversion/r.n_leads).toFixed(2):null;r.costo_venta=r.venta_subida&&r.inversion?+(r.inversion/r.venta_subida).toFixed(2):null;});
    totales.inversion_total=+inversionTotal.toFixed(2);totales.cpl_promedio=n&&inversionTotal?+(inversionTotal/n).toFixed(2):null;totales.costo_venta_promedio=venta&&inversionTotal?+(inversionTotal/venta).toFixed(2):null;
    res.json({success:true,totales,porCanal:porCanal.sort((a,b)=>b.n_leads-a.n_leads),data});
  } catch(error){responderError(res,'monitoreo',error);}
}

async function getTendenciaDiaria(req,res){
  try{await asegurarInversionReciente();const {desde,hasta}=fechas(req.query),canales=seleccion(req.query),fi=filtroInversion(canales);const rows=(await consultarDiario(desde,hasta,canales)).rows;
    const map={};for(const r of rows){const f=new Date(r.fecha).toISOString().slice(0,10);if(!map[f])map[f]={fecha:f,n_leads:0,gestionables:0,atc:0,venta_subida:0,descartados:0};for(const k of ['n_leads','gestionables','atc','venta_subida'])map[f][k]+=Number(r[k]||0);map[f].descartados+=Number(r.descarte||0);}
    const inv=await pool.query(`SELECT fecha,SUM(monto_usd) inversion FROM velsa_inversion_redes WHERE fecha BETWEEN $1 AND $2 ${fi.sql} GROUP BY 1`,[desde,hasta,...fi.params]);for(const r of inv.rows){const f=new Date(r.fecha).toISOString().slice(0,10);if(!map[f])map[f]={fecha:f,n_leads:0,gestionables:0,atc:0,venta_subida:0,descartados:0};map[f].inversion=Number(r.inversion||0);}
    res.json({success:true,data:Object.values(map).sort((a,b)=>a.fecha.localeCompare(b.fecha)).map(r=>({...r,inversion:r.inversion||0,cpl:r.n_leads&&r.inversion?+(r.inversion/r.n_leads).toFixed(2):null,costo_venta:r.venta_subida&&r.inversion?+(r.inversion/r.venta_subida).toFixed(2):null}))});
  }catch(error){responderError(res,'tendencia',error);}}

async function getInversion(req,res){try{await asegurarInversionReciente();const {desde,hasta}=fechas(req.query),f=filtroInversion(seleccion(req.query));const r=await pool.query(`SELECT id,fecha,canal_publicidad,monto_usd,creado_por,updated_at FROM velsa_inversion_redes WHERE fecha BETWEEN $1 AND $2 ${f.sql} ORDER BY fecha DESC,canal_publicidad`,[desde,hasta,...f.params]);res.json({success:true,data:r.rows});}catch(e){responderError(res,'inversion',e);}}
async function upsertInversion(req,res){try{const items=Array.isArray(req.body.items)?req.body.items:[req.body],out=[];for(const x of items){if(!x.fecha||!x.canal_publicidad||Number(x.monto_usd)<0) return res.status(400).json({success:false,message:'Datos de inversión inválidos'});const r=await pool.query(`INSERT INTO velsa_inversion_redes(fecha,canal_publicidad,monto_usd,creado_por,updated_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(fecha,canal_publicidad) DO UPDATE SET monto_usd=EXCLUDED.monto_usd,creado_por=EXCLUDED.creado_por,updated_at=now() RETURNING *`,[x.fecha,x.canal_publicidad,Number(x.monto_usd),req.user?.usuario||'desconocido']);out.push(r.rows[0]);}res.json({success:true,data:out});}catch(e){responderError(res,'guardar inversión',e);}}

async function getMonitoreoCiudad(req,res){try{const {desde,hasta}=fechas(req.query),f=filtroAgencia(seleccion(req.query));const r=await pool.query(`SELECT ''::text provincia,COALESCE(NULLIF(BTRIM(w.city),''),'SIN CIUDAD') ciudad,COUNT(*) FILTER(WHERE ${esLeadTotalExpr(ETAPA)}) n_leads,COUNT(*) FILTER(WHERE ${ETAPA}~*'ATC|SOPORTE') atc,COUNT(*) FILTER(WHERE ${ETAPA}~*'VENTA SUBIDA') venta_subida FROM bitrix_webhook_leads w WHERE empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date ${f.sql} GROUP BY 2 ORDER BY n_leads DESC`,[desde,hasta,...f.params]);const d=await pool.query(`SELECT ${FECHA} fecha,COALESCE(NULLIF(BTRIM(w.city),''),'SIN CIUDAD') ciudad,COUNT(*) FILTER(WHERE ${esLeadTotalExpr(ETAPA)}) n_leads FROM bitrix_webhook_leads w WHERE empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date ${f.sql} GROUP BY 1,2 ORDER BY 1,2`,[desde,hasta,...f.params]);res.json({success:true,porCiudad:r.rows,porCiudadDia:d.rows});}catch(e){responderError(res,'ciudad',e);}}
async function getMonitoreoHora(req,res){try{const {desde,hasta}=fechas(req.query),f=filtroAgencia(seleccion(req.query));const q=`FROM bitrix_webhook_leads w WHERE empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date ${f.sql}`;const r=await pool.query(`SELECT ${HORA} hora,COUNT(*) FILTER(WHERE ${esLeadTotalExpr(ETAPA)}) n_leads,COUNT(*) FILTER(WHERE ${ETAPA}~*'ATC|SOPORTE') atc,COUNT(*) FILTER(WHERE ${ETAPA}~*'VENTA SUBIDA') venta_subida ${q} GROUP BY 1 ORDER BY 1`,[desde,hasta,...f.params]);const d=await pool.query(`SELECT ${FECHA} fecha,${HORA} hora,COUNT(*) FILTER(WHERE ${esLeadTotalExpr(ETAPA)}) n_leads ${q} GROUP BY 1,2 ORDER BY 1,2`,[desde,hasta,...f.params]);res.json({success:true,porHora:r.rows,porHoraDia:d.rows});}catch(e){responderError(res,'hora',e);}}
async function getMonitoreoAtc(req,res){try{const {desde,hasta}=fechas(req.query),f=filtroAgencia(seleccion(req.query));const r=await pool.query(`SELECT COALESCE(NULLIF(BTRIM(w.motivo_atc),''),${ETAPA},'SIN MOTIVO') motivo,COUNT(*) cantidad FROM bitrix_webhook_leads w WHERE empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date AND ${ETAPA}~*'ATC|SOPORTE' ${f.sql} GROUP BY 1 ORDER BY 2 DESC`,[desde,hasta,...f.params]);res.json({success:true,data:r.rows,aviso:'Fuente directa del webhook Bitrix; usa motivo ATC y, cuando está vacío, la etapa CRM.'});}catch(e){responderError(res,'ATC',e);}}

async function getReporteData(req,res){try{await asegurarInversionReciente();const {desde,hasta}=fechas(req.query),canales=seleccion(req.query),fi=filtroInversion(canales);const diario=(await consultarDiario(desde,hasta,canales)).rows;const dias=(await pool.query(`SELECT to_char(d,'YYYY-MM-DD') fecha FROM generate_series($1::date,$2::date,'1 day') d`,[desde,hasta])).rows.map(r=>r.fecha);const inv=(await pool.query(`SELECT fecha,SUM(monto_usd) inversion FROM velsa_inversion_redes WHERE fecha BETWEEN $1 AND $2 ${fi.sql} GROUP BY 1`,[desde,hasta,...fi.params])).rows;const map={};for(const r of diario){const f=new Date(r.fecha).toISOString().slice(0,10);if(!map[f])map[f]={n_leads:0,gestionables:0,atc:0,venta_subida:0,descartados:0,inversion:0};for(const k of ['n_leads','gestionables','atc','venta_subida'])map[f][k]+=Number(r[k]||0);map[f].descartados+=Number(r.descarte||0);}for(const r of inv){const f=new Date(r.fecha).toISOString().slice(0,10);if(!map[f])map[f]={n_leads:0,gestionables:0,atc:0,venta_subida:0,descartados:0,inversion:0};map[f].inversion=Number(r.inversion||0);}const inversion=dias.map(fecha=>({fecha,...(map[fecha]||{n_leads:0,gestionables:0,atc:0,venta_subida:0,descartados:0,inversion:0})}));const fake={query:{...req.query,fechaDesde:desde,fechaHasta:hasta,canales:canales.join(',')}};let ciudad,hora;await getMonitoreoCiudad(fake,{json:x=>{ciudad=x.porCiudad}});await getMonitoreoHora(fake,{json:x=>{hora=x.porHora}});const canalesDisp=await pool.query(`SELECT ${AGENCIA} canal_publicidad,COUNT(*) n_leads FROM bitrix_webhook_leads w WHERE empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 2 DESC`,[desde,hasta]);let pago=[],ciclo=[];try{const[pg,cv]=await Promise.all([consultarFormaPago(desde,hasta,canales),consultarCicloVenta(desde,hasta,canales)]);pago=pg.rows;ciclo=cv.rows;}catch(e){console.error('[redes-velsa/reporte] bloques JotForm no disponibles:',e.message);}res.json({success:true,meta:{dias,fechaDesde:desde,fechaHasta:hasta},inversion,pago,ciclo,ciudad:ciudad||[],hora:hora||[],canales_disponibles:canalesDisp.rows});}catch(e){responderError(res,'reporte',e);}}


// ═══════════════════════════════════════════════════════════════════════════
// REPORTE DATA MENSUAL — el mismo de Redes NOVONET, para VELSA
// ═══════════════════════════════════════════════════════════════════════════
// El reporte combina las etapas vivas del webhook con los registros de
// JotForm de la MV de Velsa. Cada id_jotform cuenta una sola vez.

const nombreDia = (y, m, d) => ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'][new Date(y, m - 1, d).getDay()];

/** Igual que en Novonet: el front espera estos nombres, no los internos. */
const mapEtapasVelsa = (r) => ({
  ...r,
  total_leads:  Number(r.n_leads || 0),
  negociables:  Number(r.gestionables || 0),
  venta_subida: Number(r.venta_subida || 0),
  seguimiento:  Number(r.seguimiento_negociacion || 0),
  atc_soporte:  Number(r.atc || 0),
  zonas_peligrosas: Number(r.zona_peligrosa || 0),
});

async function getReporteDataMensual(req, res) {
  try {
    await asegurarInversionReciente();

    const y = Number(req.query.anio) || new Date().getFullYear();
    const m = Number(req.query.mes)  || new Date().getMonth() + 1;
    const ultimo = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, '0');
    const desde = `${y}-${mm}-01`;
    const hasta = `${y}-${mm}-${String(ultimo).padStart(2, '0')}`;

    const canales = seleccion(req.query);
    const f  = filtroAgencia(canales);
    const fi = filtroInversion(canales);
    const donde = `FROM bitrix_webhook_leads w
       WHERE w.empresa = 'velsa' AND ${FECHA} BETWEEN $1::date AND $2::date ${f.sql}`;
    const params = [desde, hasta, ...f.params];

    // ── Etapas por día ──────────────────────────────────────────────────────
    const diario = (await pool.query(
      `SELECT EXTRACT(DAY FROM ${FECHA})::int dia, ${selectMetricas} ${donde} GROUP BY 1 ORDER BY 1`,
      params
    )).rows;
    const etapas = diario.map(mapEtapasVelsa);
    const porDia = Object.fromEntries(etapas.map(x => [Number(x.dia), x]));

    // ── Inversión del mes ───────────────────────────────────────────────────
    // Las filas crudas sirven para dos cosas: el total por día de la tabla de
    // costos y el forecast por agencia, que se calcula con la MISMA función
    // que Novonet para que las dos empresas proyecten igual.
    const invCrudo = (await pool.query(
      `SELECT fecha::date fecha, canal_publicidad AS origen, monto_usd
         FROM velsa_inversion_redes
        WHERE fecha BETWEEN $1::date AND $2::date ${fi.sql}`,
      [desde, hasta, ...fi.params]
    )).rows;

    const invDia = {};
    for (const x of invCrudo) {
      const agenciaInv = resolverCanalInversion(x.origen);
      if (canales.length && !canales.includes(agenciaInv)) continue;
      const d = new Date(x.fecha).getUTCDate();
      invDia[d] = (invDia[d] || 0) + Number(x.monto_usd || 0);
    }

    let jotDenoms = [], statusJot = [], jotDisponible = false;
    try {
      const jot = await consultarJotVelsaMensual(desde, hasta, canales);
      jotDenoms = jot.den; statusJot = jot.status; jotDisponible = true;
    } catch (e) {
      console.error('[redes-velsa/reporte-data] métricas JotForm no disponibles:', e.message);
    }
    const jotDia = Object.fromEntries(jotDenoms.map(x => [Number(x.dia), x]));

    // Una fila por día del mes, aunque no haya movimiento: la tabla es una
    // matriz de días y un hueco correría las columnas.
    const inversion = Array.from({ length: ultimo }, (_, i) => {
      const d = i + 1, x = porDia[d] || {}, j = jotDia[d] || {};
      return {
        dia: d,
        inversion_usd: invDia[d] || 0,
        n_leads:      Number(x.total_leads || 0),
        negociables:  Number(x.negociables || 0),
        venta_subida: Number(x.venta_subida || 0),
        ingreso_jot: Number(j.ingreso_jot || 0), ingreso_bitrix_mismo_dia: Number(j.ingreso_bitrix_mismo_dia || 0),
        activos_mes: Number(j.activos_mes || 0), activo_backlog: Number(j.activo_backlog || 0),
        preplaneados: Number(j.preplaneados || 0), asignados: Number(j.asignados || 0), preservicio: Number(j.preservicio || 0),
      };
    });

    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());
    const hoyAcotado = hoy < desde ? desde : (hoy > hasta ? hasta : hoy);

    // ── Hora, ciudad, ATC ───────────────────────────────────────────────────
    const [hora, horaDia, ciudad, atc] = await Promise.all([
      pool.query(`SELECT ${HORA} hora,
             COUNT(*) FILTER (WHERE ${esLeadTotalExpr(ETAPA)}) n_leads,
             COUNT(*) FILTER (WHERE ${ETAPA} ~* 'ATC|SOPORTE') atc
           ${donde} GROUP BY 1 ORDER BY 1`, params),
      pool.query(`SELECT EXTRACT(DAY FROM ${FECHA})::int dia, ${HORA} hora,
             COUNT(*) FILTER (WHERE ${esLeadTotalExpr(ETAPA)}) n_leads,
             COUNT(*) FILTER (WHERE ${ETAPA} ~* 'ATC|SOPORTE') atc
           ${donde} GROUP BY 1,2 ORDER BY 1,2`, params),
      pool.query(`SELECT COALESCE(NULLIF(BTRIM(w.city),''),'SIN CIUDAD') ciudad,
             ''::text provincia,
             COUNT(*) FILTER (WHERE ${esLeadTotalExpr(ETAPA)}) total_leads,
             COUNT(*) FILTER (WHERE ${ETAPA} ~* 'VENTA SUBIDA') activos,
             0::bigint ingresos_jot
           ${donde} GROUP BY 1 ORDER BY total_leads DESC`, params),
      pool.query(`SELECT COALESCE(NULLIF(BTRIM(w.motivo_atc),''),${ETAPA},'SIN MOTIVO') motivo_atc,
             COUNT(*) cantidad
           ${donde} AND ${ETAPA} ~* 'ATC|SOPORTE' GROUP BY 1 ORDER BY 2 DESC`, params),
    ]);

    // ── Forma de pago y ciclo de venta, por día ─────────────────────────────
    // Si la MV está refrescando, estos dos bloques quedan vacíos y el reporte
    // sale igual: son un añadido, no pueden tumbar la pantalla.
    let pago = [], ciclo = [];
    try {
      const [pg, cv] = await Promise.all([
        formaPagoPorDia(desde, hasta, canales),
        cicloVentaPorDia(desde, hasta, canales),
      ]);
      pago = pg.rows; ciclo = cv.rows;
    } catch (e) {
      console.error('[redes-velsa/reporte-data] bloques de la MV no disponibles:', e.message);
    }

    res.json({
      success: true,
      empresa: 'velsa',
      meta: {
        anio: y, mes: m,
        dias: Array.from({ length: ultimo }, (_, i) => ({ dia: i + 1, nombre: nombreDia(y, m, i + 1) })),
      },
      canales_disponibles: (await catalogoAgenciasVelsa()),
      inversion,
      forecast_agencias: construirForecastAgencias(invCrudo, { desde, hasta, hoy: hoyAcotado }),
      etapas,
      status_jot: statusJot,
      pago,
      ciclo,
      ciudad: ciudad.rows.map(x => ({
        ...x,
        pct_activos: Number(x.total_leads) ? +(Number(x.activos) / Number(x.total_leads) * 100).toFixed(1) : 0,
      })),
      hora: hora.rows,
      hora_dia: horaDia.rows,
      atc_motivos: atc.rows,
      atc_totales: atc.rows,
      // La pantalla usa esto para explicar por qué hay bloques vacíos en vez
      // de dejar al usuario pensando que el módulo está roto.
      bloques_pendientes: jotDisponible ? [] : ['status_jot', 'denominadores_jot'],
    });
  } catch (e) { responderError(res, 'reporte data', e); }
}

async function catalogoAgenciasVelsa() {
  const r = await pool.query(
    `SELECT COALESCE(NULLIF(BTRIM(agencia),''),'SIN AGENCIA') canal,
            array_agg(origen ORDER BY origen) lineas
       FROM velsa_lineas_canal GROUP BY 1 ORDER BY 1`
  );
  return r.rows;
}

const jotMensualMv = `WITH jot AS (
  SELECT DISTINCT ON (mv.id_jotform::text)
    mv.fecha_registro_date registro, mv.fecha_activacion_date activacion,
    mv.fecha_creacion_date creacion, mv.forma_pago, mv.asesor,
    COALESCE(NULLIF(UPPER(BTRIM(m.agencia)),''),'VELSA') agencia
  FROM public.mv_indicadores_velsa_completo mv
  LEFT JOIN public.velsa_lineas_canal m ON UPPER(BTRIM(m.origen))=UPPER(BTRIM(mv.origen))
  WHERE mv.id_jotform IS NOT NULL
  ORDER BY mv.id_jotform::text, mv.fecha_registro_date DESC NULLS LAST
)`;
const filtroJotAgencia = canales => canales.length
  ? `AND agencia IN (${canales.map((_, i) => `$${i + 3}`).join(',')})` : '';

/** Pago JotForm por fecha de registro, una fila por negociación. */
async function formaPagoPorDia(desde, hasta, canales) {
  return pool.query(`${jotMensualMv} SELECT EXTRACT(DAY FROM registro)::int dia,
    COUNT(*) FILTER (WHERE forma_pago ILIKE '%CUENTA%') pago_cuenta,
    COUNT(*) FILTER (WHERE forma_pago ILIKE '%EFECTIVO%') pago_efectivo,
    COUNT(*) FILTER (WHERE forma_pago ILIKE '%TARJETA%') pago_tarjeta,
    COUNT(*) FILTER (WHERE forma_pago ILIKE '%CUENTA%' AND activacion BETWEEN $1::date AND $2::date) pago_cuenta_activa,
    COUNT(*) FILTER (WHERE forma_pago ILIKE '%EFECTIVO%' AND activacion BETWEEN $1::date AND $2::date) pago_efectivo_activa,
    COUNT(*) FILTER (WHERE forma_pago ILIKE '%TARJETA%' AND activacion BETWEEN $1::date AND $2::date) pago_tarjeta_activa
    FROM jot WHERE registro BETWEEN $1::date AND $2::date ${filtroJotAgencia(canales)}
    GROUP BY 1 ORDER BY 1`, [desde, hasta, ...canales.map(x => x.toUpperCase())]);
}

/** Ciclo desde creación CRM hasta activación, agrupado por registro JotForm. */
async function cicloVentaPorDia(desde, hasta, canales) {
  return pool.query(`${jotMensualMv} SELECT EXTRACT(DAY FROM registro)::int dia,
    COUNT(*) FILTER (WHERE activacion - creacion = 0) ciclo_0,
    COUNT(*) FILTER (WHERE activacion - creacion = 1) ciclo_1,
    COUNT(*) FILTER (WHERE activacion - creacion = 2) ciclo_2,
    COUNT(*) FILTER (WHERE activacion - creacion = 3) ciclo_3,
    COUNT(*) FILTER (WHERE activacion - creacion = 4) ciclo_4,
    COUNT(*) FILTER (WHERE activacion - creacion >= 5) ciclo_mas5
    FROM jot WHERE registro BETWEEN $1::date AND $2::date AND activacion IS NOT NULL
      AND creacion IS NOT NULL AND activacion >= creacion ${filtroJotAgencia(canales)}
    GROUP BY 1 ORDER BY 1`, [desde, hasta, ...canales.map(x => x.toUpperCase())]);
}

async function getAgenciasCanal(req,res){try{const r=await pool.query(`SELECT NULLIF(BTRIM(w.source),'') origen,COUNT(*) n_leads,COALESCE(MAX(m.agencia),'VELSA') agencia FROM bitrix_webhook_leads w LEFT JOIN velsa_lineas_canal m ON m.origen=NULLIF(BTRIM(w.source),'') WHERE empresa='velsa' AND NULLIF(BTRIM(w.source),'') IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`);res.json({success:true,origenes:r.rows});}catch(e){responderError(res,'agencias',e);}}
async function upsertAgenciaCanal(req,res){try{const items=Array.isArray(req.body.items)?req.body.items:[req.body],out=[];for(const x of items){if(!x.origen)return res.status(400).json({success:false,message:'Cada registro requiere origen'});if(!String(x.agencia||'').trim()){await pool.query('DELETE FROM velsa_lineas_canal WHERE origen=$1',[x.origen]);out.push({origen:x.origen,agencia:null});}else{const r=await pool.query(`INSERT INTO velsa_lineas_canal(origen,agencia,creado_por,actualizado_en) VALUES($1,$2,$3,now()) ON CONFLICT(origen) DO UPDATE SET agencia=EXCLUDED.agencia,creado_por=EXCLUDED.creado_por,actualizado_en=now() RETURNING *`,[x.origen,String(x.agencia).trim(),req.user?.usuario||'desconocido']);out.push(r.rows[0]);}}res.json({success:true,data:out});}catch(e){responderError(res,'guardar agencia',e);}}
async function getResumenPorAgencia(req,res){try{await asegurarInversionReciente();const {desde,hasta}=fechas(req.query),items=seleccion(req.query),f=filtroAgencia(items),fi=filtroInversion(items);const [r,inv]=await Promise.all([
  pool.query(`SELECT ${AGENCIA} agencia,COUNT(*) FILTER(WHERE ${esLeadTotalExpr(ETAPA)}) n_leads,COUNT(*) FILTER(WHERE ${esGestionableExpr(ETAPA)}) gestionables,COUNT(*) FILTER(WHERE ${ETAPA}~*'ATC|SOPORTE') atc,COUNT(*) FILTER(WHERE ${ETAPA}~*'VENTA SUBIDA') venta_subida,COUNT(*) FILTER(WHERE ${esDescarteExpr(ETAPA)}) descartados FROM bitrix_webhook_leads w WHERE empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date ${f.sql} GROUP BY 1 ORDER BY 2 DESC`,[desde,hasta,...f.params]),
  pool.query(`SELECT canal_publicidad,SUM(monto_usd) inversion FROM velsa_inversion_redes WHERE fecha BETWEEN $1::date AND $2::date ${fi.sql} GROUP BY 1`,[desde,hasta,...fi.params])]);
  const invMap={};for(const row of inv.rows){const a=resolverCanalInversion(row.canal_publicidad);invMap[a]=(invMap[a]||0)+Number(row.inversion||0);}
  const porAgencia=r.rows.map(x=>{const leads=Number(x.n_leads||0),g=Number(x.gestionables||0),v=Number(x.venta_subida||0),inversion=invMap[x.agencia]||0;delete invMap[x.agencia];return{...x,n_leads:leads,gestionables:g,atc:Number(x.atc||0),venta_subida:v,descartados:Number(x.descartados||0),pct_venta_subida:g?+(v/g*100).toFixed(1):0,inversion,cpl:leads&&inversion?+(inversion/leads).toFixed(2):null,costo_venta:v&&inversion?+(inversion/v).toFixed(2):null};});
  for(const [agencia,inversion] of Object.entries(invMap))porAgencia.push({agencia,n_leads:0,gestionables:0,atc:0,venta_subida:0,descartados:0,pct_venta_subida:0,inversion,cpl:null,costo_venta:null});
  res.json({success:true,porAgencia});}catch(e){responderError(res,'resumen agencias',e);}}

async function getAsesoresVsPauta(req, res) {
  try {
    const { desde, hasta } = fechas(req.query), canales = seleccion(req.query), f = filtroAgencia(canales);
    const [r, jot] = await Promise.all([
      pool.query(`SELECT COALESCE(NULLIF(BTRIM(w.responsible),''),'SIN ASIGNAR') asesor,
      ${AGENCIA} agencia, COUNT(*) FILTER (WHERE ${esLeadTotalExpr(ETAPA)}) n_leads,
      COUNT(*) FILTER (WHERE ${esGestionableExpr(ETAPA)}) gestionables,
      COUNT(*) FILTER (WHERE ${ETAPA}~*'ATC|SOPORTE') atc,
      COUNT(*) FILTER (WHERE ${ETAPA}~*'VENTA SUBIDA') venta_subida
      FROM bitrix_webhook_leads w WHERE w.empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date ${f.sql}
      GROUP BY 1,2 ORDER BY venta_subida DESC, n_leads DESC`, [desde, hasta, ...f.params]),
      pool.query(`${jotMensualMv} SELECT COALESCE(NULLIF(UPPER(BTRIM(asesor)),''),'SIN ASIGNAR') asesor,
        agencia, COUNT(*) FILTER (WHERE registro BETWEEN $1::date AND $2::date)::int ingreso_jot,
        COUNT(*) FILTER (WHERE activacion BETWEEN $1::date AND $2::date)::int activos
        FROM jot WHERE (registro BETWEEN $1::date AND $2::date OR activacion BETWEEN $1::date AND $2::date)
        ${filtroJotAgencia(canales)} GROUP BY 1,2`, [desde, hasta, ...canales.map(x => x.toUpperCase())])
    ]);
    const jotMap = new Map(jot.rows.map(x => [`${x.asesor}|${x.agencia}`, x]));
    res.json({ success: true, asesores: r.rows.map(x => ({ ...x,
      ingreso_jot: Number(jotMap.get(`${String(x.asesor).trim().toUpperCase()}|${x.agencia}`)?.ingreso_jot || 0),
      activos: Number(jotMap.get(`${String(x.asesor).trim().toUpperCase()}|${x.agencia}`)?.activos || 0)
    })) });
  } catch (e) { responderError(res, 'asesores vs pauta', e); }
}

async function getGraficosRedesVelsa(req, res) {
  try {
    const { desde, hasta } = fechas(req.query), canales = seleccion(req.query);
    const f = filtroAgencia(canales);
    const [jot, jotTotales, heatmap, ciclo, jotAgencias] = await Promise.all([
      pool.query(`${jotMensualMv} SELECT registro::date::text fecha, agencia,
        COUNT(*)::int ingreso_jot FROM jot WHERE registro BETWEEN $1::date AND $2::date
        ${filtroJotAgencia(canales)} GROUP BY 1,2 ORDER BY 1,2`,
      [desde, hasta, ...canales.map(x => x.toUpperCase())]),
      pool.query(`${jotMensualMv} SELECT
        COUNT(*) FILTER (WHERE registro BETWEEN $1::date AND $2::date)::int ingreso_jot,
        COUNT(*) FILTER (WHERE activacion BETWEEN $1::date AND $2::date)::int activos
        FROM jot WHERE (registro BETWEEN $1::date AND $2::date OR activacion BETWEEN $1::date AND $2::date)
        ${filtroJotAgencia(canales)}`, [desde, hasta, ...canales.map(x => x.toUpperCase())]),
      pool.query(`SELECT EXTRACT(ISODOW FROM ${FECHA})::int dia_semana, ${HORA} hora,
        COUNT(*) FILTER (WHERE ${esLeadTotalExpr(ETAPA)})::int n_leads
        FROM bitrix_webhook_leads w WHERE w.empresa='velsa' AND ${FECHA} BETWEEN $1::date AND $2::date
        ${f.sql} GROUP BY 1,2 ORDER BY 1,2`, [desde, hasta, ...f.params]),
      consultarCicloVenta(desde, hasta, canales),
      pool.query(`${jotMensualMv} SELECT agencia,
        COUNT(*) FILTER (WHERE registro BETWEEN $1::date AND $2::date)::int ingreso_jot,
        COUNT(*) FILTER (WHERE activacion BETWEEN $1::date AND $2::date)::int activos
        FROM jot WHERE (registro BETWEEN $1::date AND $2::date OR activacion BETWEEN $1::date AND $2::date)
        ${filtroJotAgencia(canales)} GROUP BY agencia`, [desde, hasta, ...canales.map(x => x.toUpperCase())]),
    ]);
    res.json({ success: true, jotPorAgenciaDia: jot.rows, jotTotales: jotTotales.rows[0], jotPorAgencia: jotAgencias.rows, heatmap: heatmap.rows, ciclo: ciclo.rows });
  } catch (e) { responderError(res, 'gráficos VELSA', e); }
}

async function consultarJotVelsaMensual(desde, hasta, canales) {
  const where = canales.length ? `AND agencia IN (${canales.map((_, i) => `$${i + 3}`).join(',')})` : '';
  const params = [desde, hasta, ...canales.map(x => x.toUpperCase())];
  const base = `WITH registros AS (
    SELECT DISTINCT ON (mv.id_jotform::text)
      mv.id_jotform, mv.fecha_registro_date registro, mv.fecha_activacion_date activacion,
      mv.estado_venta estado, mv.estado_regularizacion regularizacion,
      COALESCE(NULLIF(UPPER(BTRIM(m.agencia)),''),'VELSA') agencia,
      (w.created_at AT TIME ZONE 'America/Guayaquil')::date fecha_bitrix
    FROM public.mv_indicadores_velsa_completo mv
    LEFT JOIN public.velsa_lineas_canal m ON UPPER(BTRIM(m.origen))=UPPER(BTRIM(mv.origen))
    LEFT JOIN public.bitrix_webhook_leads w ON w.empresa='velsa' AND BTRIM(w.bitrix_id::text)=BTRIM(mv.id_jotform::text)
    WHERE mv.id_jotform IS NOT NULL
    ORDER BY mv.id_jotform::text, mv.fecha_registro_date DESC NULLS LAST
  ), filtrados AS (SELECT * FROM registros WHERE 1=1 ${where})`;
  const [den, status] = await Promise.all([
    pool.query(`${base} SELECT EXTRACT(DAY FROM COALESCE(
      CASE WHEN registro BETWEEN $1::date AND $2::date THEN registro END,
      CASE WHEN activacion BETWEEN $1::date AND $2::date THEN activacion END))::int dia,
      COUNT(*) FILTER (WHERE registro BETWEEN $1::date AND $2::date) ingreso_jot,
      COUNT(*) FILTER (WHERE registro=fecha_bitrix AND registro BETWEEN $1::date AND $2::date) ingreso_bitrix_mismo_dia,
      COUNT(*) FILTER (WHERE estado ILIKE 'ACTIVO' AND activacion BETWEEN $1::date AND $2::date) activos_mes,
      COUNT(*) FILTER (WHERE estado ILIKE 'ACTIVO' AND registro<$1::date AND activacion BETWEEN $1::date AND $2::date) activo_backlog,
      COUNT(*) FILTER (WHERE estado ILIKE '%PREPLANIFICADO%' OR estado ILIKE '%REPLANIFICADO%') preplaneados,
      COUNT(*) FILTER (WHERE estado ILIKE '%ASIGNADO%') asignados,
      COUNT(*) FILTER (WHERE estado ILIKE '%PRESERVICIO%') preservicio
      FROM filtrados WHERE registro BETWEEN $1::date AND $2::date OR activacion BETWEEN $1::date AND $2::date
      GROUP BY 1 ORDER BY 1`, params),
    pool.query(`${base} SELECT EXTRACT(DAY FROM registro)::int dia,
      COUNT(*) ingreso_jot,
      COUNT(*) FILTER (WHERE registro=fecha_bitrix) ingreso_bitrix,
      COUNT(*) FILTER (WHERE estado ILIKE 'ACTIVO' AND activacion NOT BETWEEN $1::date AND $2::date) activo_backlog,
      COUNT(*) FILTER (WHERE estado ILIKE 'ACTIVO' AND activacion BETWEEN $1::date AND $2::date) activos,
      COUNT(*) total_ventas_jot,
      COUNT(*) FILTER (WHERE estado ILIKE '%DESISTE%') desiste_servicio_jot,
      COUNT(*) FILTER (WHERE regularizacion ILIKE '%REGULARIZADO%' AND regularizacion NOT ILIKE '%NO REQUIERE%') regularizados,
      COUNT(*) FILTER (WHERE regularizacion ILIKE '%POR REGULARIZAR%' OR regularizacion ILIKE '%PENDIENTE%') por_regularizar
      FROM filtrados WHERE registro BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 1`, params),
  ]);
  return { den: den.rows, status: status.rows };
}

async function asegurarMetasVelsa() {
  await pool.query(`CREATE TABLE IF NOT EXISTS velsa_redes_metas (
    mes date NOT NULL, agencia text NOT NULL, meta_leads integer NOT NULL DEFAULT 0,
    meta_ventas integer NOT NULL DEFAULT 0, meta_inversion numeric(14,2) NOT NULL DEFAULT 0,
    actualizado_por text, actualizado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (mes, agencia),
    CHECK (meta_leads >= 0 AND meta_ventas >= 0 AND meta_inversion >= 0)
  )`);
}

async function getMetasVelsa(req, res) {
  try {
    await asegurarInversionReciente();
    await asegurarMetasVelsa();
    const { desde, hasta } = fechas(req.query), mes = `${desde.slice(0, 7)}-01`;
    const [metas, resumen] = await Promise.all([
      pool.query('SELECT agencia, meta_leads, meta_ventas, meta_inversion FROM velsa_redes_metas WHERE mes=$1::date', [mes]),
      consultarDiario(desde, hasta, seleccion(req.query)),
    ]);
    const map = new Map(metas.rows.map(r => [r.agencia, r]));
    const agencias = {};
    for (const r of resumen.rows) {
      const a = r.canal_publicidad;
      if (!agencias[a]) agencias[a] = { agencia: a, n_leads: 0, venta_subida: 0 };
      agencias[a].n_leads += Number(r.n_leads || 0);
      agencias[a].venta_subida += Number(r.venta_subida || 0);
    }
    const fi = filtroInversion(seleccion(req.query));
    const inv = await pool.query(`SELECT canal_publicidad, SUM(monto_usd) inversion FROM velsa_inversion_redes WHERE fecha BETWEEN $1::date AND $2::date ${fi.sql} GROUP BY 1`, [desde, hasta, ...fi.params]);
    for (const r of inv.rows) {
      const a = resolverCanalInversion(r.canal_publicidad);
      if (!agencias[a]) agencias[a] = { agencia: a, n_leads: 0, venta_subida: 0 };
      agencias[a].inversion = (agencias[a].inversion || 0) + Number(r.inversion || 0);
    }
    res.json({ success: true, mes, agencias: Object.values(agencias).map(r => ({ ...r, ...(map.get(r.agencia) || { meta_leads: 0, meta_ventas: 0, meta_inversion: 0 }) })) });
  } catch (e) { responderError(res, 'metas VELSA', e); }
}

async function upsertMetasVelsa(req, res) {
  try {
    await asegurarMetasVelsa();
    const { mes, agencia, meta_leads, meta_ventas, meta_inversion } = req.body;
    if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(String(mes)) || !String(agencia || '').trim() ||
      !Number.isInteger(Number(meta_leads)) || !Number.isInteger(Number(meta_ventas)) ||
      [meta_leads, meta_ventas, meta_inversion].some(v => !Number.isFinite(Number(v)) || Number(v) < 0))
      return res.status(400).json({ success: false, message: 'Meta inválida' });
    await pool.query(`INSERT INTO velsa_redes_metas (mes, agencia, meta_leads, meta_ventas, meta_inversion, actualizado_por)
      VALUES ($1::date,$2,$3,$4,$5,$6) ON CONFLICT (mes,agencia) DO UPDATE SET
      meta_leads=EXCLUDED.meta_leads, meta_ventas=EXCLUDED.meta_ventas,
      meta_inversion=EXCLUDED.meta_inversion, actualizado_por=EXCLUDED.actualizado_por, actualizado_en=now()`,
      [mes, String(agencia).trim().toUpperCase(), Number(meta_leads), Number(meta_ventas), Number(meta_inversion), req.user?.usuario || 'desconocido']);
    res.json({ success: true });
  } catch (e) { responderError(res, 'guardar metas VELSA', e); }
}

function responderError(res,seccion,error){console.error(`Error Redes VELSA webhook (${seccion}):`,error);res.status(500).json({success:false,message:`Error al obtener ${seccion}`,error:process.env.NODE_ENV==='production'?'Error interno del servidor':error.message});}
module.exports={getReporteDataMensual,getCanalesDisponibles,getMonitoreoRedesVelsa,getTendenciaDiaria,getInversion,upsertInversion,getMonitoreoCiudad,getMonitoreoHora,getMonitoreoAtc,getReporteData,getAgenciasCanal,upsertAgenciaCanal,getResumenPorAgencia,getAsesoresVsPauta,getGraficosRedesVelsa,getMetasVelsa,upsertMetasVelsa};
