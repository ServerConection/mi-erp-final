const legacy = require('./redes.controller');
const pool = require('../config/db');
const { esLeadTotalExpr, esGestionableExpr, esDescarteExpr, esPorRegularizarExpr } = require('../shared/etapas');
const { fechaWebhookExpr, etapaWebhookExpr, horaWebhookExpr } = require('../shared/webhookRedes');
const { normalizarOrigenSql, agenciaSql } = require('../shared/origenesRedes');
const { construirForecastAgencias, resolverCanalInversion, agregarFilasSoloInversion } = require('../shared/inversionRedes');
const { asegurarInversionReciente } = require('../services/inversionFreshness.service');

const FECHA = fechaWebhookExpr('w');
const ETAPA = etapaWebhookExpr('w');
const HORA = horaWebhookExpr('w');
const ORIGEN = normalizarOrigenSql('w.source');
const ORIGEN_CATALOGO = normalizarOrigenSql('lc.origen');
const AGENCIA = `COALESCE(NULLIF(${agenciaSql('m.agencia')},''),NULLIF(BTRIM(w.source),''),'SIN ORIGEN')`;

const rango = q => {
  const hoy = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil'}).format(new Date());
  return { desde:q.fechaDesde||hoy, hasta:q.fechaHasta||hoy };
};
const seleccion = q => String(q.canales||'').split(',').map(x=>x.trim()).filter(Boolean);
const joinCatalogo = `LEFT JOIN LATERAL (SELECT lc.agencia FROM novonet_lineas_canal lc WHERE ${ORIGEN_CATALOGO}=${ORIGEN} ORDER BY (BTRIM(lc.origen)=BTRIM(w.source)) DESC,lc.actualizado_en DESC NULLS LAST LIMIT 1) m ON TRUE`;
const filtroAgencia = (items, offset=2) => items.length ? {sql:`AND agencia IN (${items.map((_,i)=>`$${offset+i+1}`).join(',')})`,params:items}:{sql:'',params:[]};

const baseCte = `WITH base AS (SELECT w.*,${FECHA} fecha_crm,${HORA} hora_crm,${ETAPA} etapa_crm,${AGENCIA} agencia FROM bitrix_webhook_leads w ${joinCatalogo} WHERE w.empresa='novonet')`;
const metricas = `COUNT(*) FILTER(WHERE ${esLeadTotalExpr('etapa_crm')}) n_leads,
 COUNT(*) FILTER(WHERE ${esGestionableExpr('etapa_crm')}) negociables,
 COUNT(*) FILTER(WHERE etapa_crm~*'ATC|SOPORTE') atc_soporte,
 COUNT(*) FILTER(WHERE etapa_crm~*'FUERA DE COBERTURA') fuera_cobertura,
 COUNT(*) FILTER(WHERE etapa_crm~*'ZONA.*PELIGRO') zonas_peligrosas,
 COUNT(*) FILTER(WHERE etapa_crm~*'INNEGOCIABLE') innegociable,
 COUNT(*) FILTER(WHERE etapa_crm~*'VENTA SUBIDA') venta_subida_bitrix,
 COUNT(*) FILTER(WHERE etapa_crm~*'SEGUIMIENTO') seguimiento_negociacion,
 COUNT(*) FILTER(WHERE etapa_crm~*'GESTI(O|Ó)N DIARIA') gestion_diaria,
 COUNT(*) FILTER(WHERE etapa_crm~*'DOCUMENTOS PENDIENTES') doc_pendientes,
 COUNT(*) FILTER(WHERE etapa_crm~*'VOLVER A LLAMAR') volver_llamar,
 COUNT(*) FILTER(WHERE etapa_crm~*'MANTIENE PROVEEDOR') mantiene_proveedor,
 COUNT(*) FILTER(WHERE etapa_crm~*'OTRO PROVEEDOR') otro_proveedor,
 COUNT(*) FILTER(WHERE etapa_crm~*'NO VOLVER A CONTACTAR') no_volver_contactar,
 COUNT(*) FILTER(WHERE etapa_crm~*'NO INTERESA.*COSTO') no_interesa_costo,
 COUNT(*) FILTER(WHERE etapa_crm~*'DESISTE') desiste_compra,
 COUNT(*) FILTER(WHERE etapa_crm~*'CLIENTE DISCAPACIDAD') cliente_discapacidad,
 COUNT(*) FILTER(WHERE etapa_crm~*'OPORTUNIDADES') oportunidades,
 COUNT(*) FILTER(WHERE etapa_crm~*'DUP(L)?LICADO') duplicado,
 COUNT(*) FILTER(WHERE etapa_crm~*'CONTRATO NETLIFE') contrato_netlife`;

// ─────────────────────────────────────────────────────────────────────────────
// LADO JOTFORM (bloques 3/4/5 del Reporte Data)
// ─────────────────────────────────────────────────────────────────────────────
// Los datos de JotForm (ingresos, forma de pago, activaciones Netlife,
// regularización) NO existen en bitrix_webhook_leads — solo viven en las
// columnas j_* de mestra_bitrix, que es donde siempre se han medido.
// Pero la fecha de creación del lead en Bitrix SÍ se toma de
// bitrix_webhook_leads (tiempo real), no de b_creado_el_fecha de mestra_bitrix
// (carga batch, se atrasa). Por eso el ciclo de venta se calcula contra
// w.created_at: activación Netlife menos creación real del lead.
//
// El JOIN es por j_id_bitrix = bitrix_id. Es LEFT: si un registro JOT todavía
// no tiene su lead en la tabla del webhook, igual cuenta para ingresos/pago
// (solo queda fuera del ciclo de venta, que necesita ambas fechas).

// Las fechas de JotForm son TEXT 'YYYY-MM-DD'. TO_DATE revienta con basura;
// este guard devuelve NULL en vez de tumbar la query.
const jDate = (col) =>
  `(CASE WHEN BTRIM(${col}) ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT(BTRIM(${col}), 10)::date END)`;

const J_REG = jDate('t1.j_fecha_registro_sistema');   // ingreso a JOT
const J_ACT = jDate('t1.j_fecha_activacion_netlife'); // activación Netlife

const jotBaseCte = `WITH jot AS (
  SELECT t1.*,
         (w.created_at AT TIME ZONE 'America/Guayaquil')::date AS b_fecha,
         ${J_REG} AS f_registro,
         ${J_ACT} AS f_activacion,
         ${AGENCIA} AS agencia
  FROM public.mestra_bitrix t1
  LEFT JOIN public.bitrix_webhook_leads w
         ON w.empresa = 'novonet'
        AND BTRIM(w.bitrix_id::text) = BTRIM(t1.j_id_bitrix::text)
  ${joinCatalogo}
  WHERE t1.j_id_bitrix IS NOT NULL
)`;

const ACTIVO = `t1.j_netlife_estatus_real ILIKE 'ACTIVO'`;

// Denominadores JOT por día — alimentan el bloque 1 (Inversión / Costos).
async function jotDenominadores(desde, hasta, agencias) {
  const f = filtroAgencia(agencias);
  return pool.query(`${jotBaseCte}
    SELECT dia,
      COUNT(*) FILTER (WHERE en_registro) AS ingreso_jot,
      COUNT(*) FILTER (WHERE en_registro AND b_fecha IS NOT NULL AND f_registro = b_fecha) AS ingreso_bitrix_mismo_dia,
      COUNT(*) FILTER (WHERE activo AND en_activacion) AS activos_mes,
      COUNT(*) FILTER (WHERE activo AND f_registro < $1::date AND en_activacion) AS activo_backlog,
      COUNT(*) FILTER (WHERE (estatus ILIKE '%PREPLANIFICADO%' OR estatus ILIKE '%REPLANIFICADO%') AND en_registro) AS preplaneados,
      COUNT(*) FILTER (WHERE estatus ILIKE '%ASIGNADO%'   AND en_registro) AS asignados,
      COUNT(*) FILTER (WHERE estatus ILIKE '%PRESERVICIO%' AND en_registro) AS preservicio
    FROM (
      SELECT b_fecha, f_registro, agencia,
             t1.j_netlife_estatus_real AS estatus,
             (t1.j_netlife_estatus_real ILIKE 'ACTIVO') AS activo,
             (f_registro   BETWEEN $1::date AND $2::date) AS en_registro,
             (f_activacion BETWEEN $1::date AND $2::date) AS en_activacion,
             EXTRACT(DAY FROM COALESCE(
               CASE WHEN f_registro   BETWEEN $1::date AND $2::date THEN f_registro   END,
               CASE WHEN f_activacion BETWEEN $1::date AND $2::date THEN f_activacion END
             ))::int AS dia
      FROM jot t1
    ) t
    WHERE dia IS NOT NULL ${f.sql}
    GROUP BY dia
    ORDER BY dia`, [desde, hasta, ...f.params]);
}

// Bloque 3 — Estatus ventas JOT.
async function statusJot(desde, hasta, agencias) {
  const f = filtroAgencia(agencias);
  return pool.query(`${jotBaseCte}
    SELECT EXTRACT(DAY FROM f_registro)::int AS dia,
      COUNT(*) AS ingreso_jot,
      COUNT(*) FILTER (WHERE b_fecha IS NOT NULL AND f_registro = b_fecha) AS ingreso_bitrix,
      COUNT(*) FILTER (WHERE ${ACTIVO}) AS activo_backlog,
      COUNT(*) FILTER (WHERE ${ACTIVO} AND f_activacion BETWEEN $1::date AND $2::date) AS activos,
      COUNT(*) AS total_ventas_jot,
      COUNT(*) FILTER (WHERE t1.j_netlife_estatus_real ILIKE '%DESISTE%') AS desiste_servicio_jot,
      COUNT(*) FILTER (WHERE t1.j_estatus_regularizacion ILIKE '%REGULARIZADO%'
                         AND t1.j_estatus_regularizacion NOT ILIKE '%NO REQUIERE%'
                         AND NOT ${esPorRegularizarExpr('t1.j_estatus_regularizacion')}) AS regularizados,
      COUNT(*) FILTER (WHERE ${esPorRegularizarExpr('t1.j_estatus_regularizacion')}) AS por_regularizar
    FROM jot t1
    WHERE f_registro BETWEEN $1::date AND $2::date ${f.sql}
    GROUP BY dia ORDER BY dia`, [desde, hasta, ...f.params]);
}

// Bloque 4 — Forma de pago (100% JotForm; el JOIN solo sirve para filtrar por agencia).
async function formaPago(desde, hasta, agencias) {
  const f = filtroAgencia(agencias);
  const activaEnRango = `${ACTIVO} AND f_activacion BETWEEN $1::date AND $2::date`;
  const via = (m) => `t1.j_forma_pago ILIKE '%${m}%'`;
  return pool.query(`${jotBaseCte}
    SELECT EXTRACT(DAY FROM f_registro)::int AS dia,
      COUNT(*) FILTER (WHERE ${via('CUENTA')})   AS pago_cuenta,
      COUNT(*) FILTER (WHERE ${via('EFECTIVO')}) AS pago_efectivo,
      COUNT(*) FILTER (WHERE ${via('TARJETA')})  AS pago_tarjeta,
      COUNT(*) FILTER (WHERE ${via('CUENTA')}   AND ${activaEnRango}) AS pago_cuenta_activa,
      COUNT(*) FILTER (WHERE ${via('EFECTIVO')} AND ${activaEnRango}) AS pago_efectivo_activa,
      COUNT(*) FILTER (WHERE ${via('TARJETA')}  AND ${activaEnRango}) AS pago_tarjeta_activa
    FROM jot t1
    WHERE f_registro BETWEEN $1::date AND $2::date ${f.sql}
    GROUP BY dia ORDER BY dia`, [desde, hasta, ...f.params]);
}

// Bloque 5 — Ciclo de venta EN TIEMPO REAL.
// diff = activación Netlife (JotForm) − creación del lead (webhook Bitrix).
// Se agrupa por el día de creación del lead, que es el que manda el reporte.
async function cicloVenta(desde, hasta, agencias) {
  const f = filtroAgencia(agencias);
  return pool.query(`${jotBaseCte}
    SELECT EXTRACT(DAY FROM b_fecha)::int AS dia,
      COUNT(*) FILTER (WHERE diff = 0) AS ciclo_0,
      COUNT(*) FILTER (WHERE diff = 1) AS ciclo_1,
      COUNT(*) FILTER (WHERE diff = 2) AS ciclo_2,
      COUNT(*) FILTER (WHERE diff = 3) AS ciclo_3,
      COUNT(*) FILTER (WHERE diff = 4) AS ciclo_4,
      COUNT(*) FILTER (WHERE diff >= 5) AS ciclo_mas5
    FROM (
      SELECT b_fecha, agencia, (f_activacion - b_fecha) AS diff
      FROM jot t1
      WHERE f_activacion IS NOT NULL
        AND b_fecha IS NOT NULL
        AND b_fecha BETWEEN $1::date AND $2::date
    ) t
    WHERE diff >= 0 ${f.sql}
    GROUP BY dia ORDER BY dia`, [desde, hasta, ...f.params]);
}

async function catalogoAgencias(){const r=await pool.query(`SELECT COALESCE(NULLIF(BTRIM(agencia),''),'SIN AGENCIA') canal,array_agg(origen ORDER BY origen) lineas FROM novonet_lineas_canal GROUP BY 1 ORDER BY 1`);return r.rows;}
async function detalleDiario(desde,hasta,agencias){const f=filtroAgencia(agencias);return pool.query(`${baseCte} SELECT fecha_crm fecha,agencia canal_inversion,agencia canal_publicidad,${metricas} FROM base WHERE fecha_crm BETWEEN $1::date AND $2::date ${f.sql} GROUP BY 1,2 ORDER BY 1 DESC,2`,[desde,hasta,...f.params]);}
async function inversion(desde,hasta){const r=await pool.query(`SELECT fecha::date fecha,origen,monto_usd FROM novonet_inversion_redes WHERE fecha BETWEEN $1::date AND $2::date ORDER BY 1,2`,[desde,hasta]);return r.rows;}

async function getMonitoreoRedes(req,res){try{await asegurarInversionReciente();const {desde,hasta}=rango(req.query),ags=seleccion(req.query);const rows=(await detalleDiario(desde,hasta,ags)).rows;const inv=await inversion(desde,hasta);const map={};for(const x of inv){const f=new Date(x.fecha).toISOString().slice(0,10),a=resolverCanalInversion(x.origen);if(ags.length&&!ags.includes(a))continue;map[`${f}__${a}`]=(map[`${f}__${a}`]||0)+Number(x.monto_usd||0);}const data=agregarFilasSoloInversion(rows,map).map(r=>{const f=new Date(r.fecha).toISOString().slice(0,10);return{...r,inversion_usd:map[`${f}__${r.canal_inversion}`]||0,ingreso_jot:0,ingreso_bitrix_mismo_dia:0,activo_backlog:0,activos_mes:0,estado_activo_netlife:0,desiste_servicio_jot:0,pago_cuenta:0,pago_efectivo:0,pago_tarjeta:0,pago_cuenta_activa:0,pago_efectivo_activa:0,pago_tarjeta_activa:0,ciclo_0_dias:0,ciclo_1_dia:0,ciclo_2_dias:0,ciclo_3_dias:0,ciclo_4_dias:0,ciclo_mas5_dias:0,regularizados:0,por_regularizar:0,total_gestionables:Number(r.negociables||0),total_ventas_jot:0,total_ventas_crm:Number(r.venta_subida_bitrix||0)};});res.json({success:true,data,canales_disponibles:await catalogoAgencias()});}catch(e){error(res,'monitoreo',e);}}

async function getMonitoreoCiudad(req,res){try{const {desde,hasta}=rango(req.query),f=filtroAgencia(seleccion(req.query));const q=`${baseCte} SELECT fecha_crm fecha,COALESCE(NULLIF(BTRIM(city),''),'SIN CIUDAD') ciudad,''::text provincia,COUNT(*) FILTER(WHERE ${esLeadTotalExpr('etapa_crm')}) total_leads,COUNT(*) FILTER(WHERE etapa_crm~*'VENTA SUBIDA') activos,0::bigint ingresos_jot FROM base WHERE fecha_crm BETWEEN $1::date AND $2::date ${f.sql} GROUP BY 1,2`;const d=(await pool.query(q,[desde,hasta,...f.params])).rows;const m={};for(const r of d){const k=r.ciudad;if(!m[k])m[k]={ciudad:k,provincia:'',total_leads:0,activos:0,ingresos_jot:0};for(const x of ['total_leads','activos','ingresos_jot'])m[k][x]+=Number(r[x]||0);}const totales=Object.values(m).map(x=>({...x,pct_activos:x.total_leads?+(x.activos/x.total_leads*100).toFixed(1):0})).sort((a,b)=>b.total_leads-a.total_leads);res.json({success:true,totales,data:d.map(x=>({...x,pct_activos:Number(x.total_leads)?+(Number(x.activos)/Number(x.total_leads)*100).toFixed(1):0}))});}catch(e){error(res,'ciudad',e);}}
async function getMonitoreoHora(req,res){try{const {desde,hasta}=rango(req.query),f=filtroAgencia(seleccion(req.query));const q=`${baseCte} SELECT hora_crm hora,COUNT(*) FILTER(WHERE ${esLeadTotalExpr('etapa_crm')}) n_leads,COUNT(*) FILTER(WHERE etapa_crm~*'ATC|SOPORTE') atc FROM base WHERE fecha_crm BETWEEN $1::date AND $2::date ${f.sql}`;const t=await pool.query(`${q} GROUP BY 1 ORDER BY 1`,[desde,hasta,...f.params]);const d=await pool.query(`${baseCte} SELECT fecha_crm fecha,hora_crm hora,COUNT(*) FILTER(WHERE ${esLeadTotalExpr('etapa_crm')}) n_leads,COUNT(*) FILTER(WHERE etapa_crm~*'ATC|SOPORTE') atc FROM base WHERE fecha_crm BETWEEN $1::date AND $2::date ${f.sql} GROUP BY 1,2 ORDER BY 1 DESC,2`,[desde,hasta,...f.params]);res.json({success:true,totales:t.rows.map(x=>({...x,pct_atc_hora:Number(x.n_leads)?+(Number(x.atc)/Number(x.n_leads)*100).toFixed(1):0})),data:d.rows});}catch(e){error(res,'hora',e);}}
async function getMonitoreoAtc(req,res){try{const {desde,hasta}=rango(req.query),f=filtroAgencia(seleccion(req.query));const t=await pool.query(`${baseCte} SELECT COALESCE(NULLIF(BTRIM(motivo_atc),''),etapa_crm,'SIN MOTIVO') motivo_atc,COUNT(*) cantidad FROM base WHERE fecha_crm BETWEEN $1::date AND $2::date AND etapa_crm~*'ATC|SOPORTE' ${f.sql} GROUP BY 1 ORDER BY 2 DESC`,[desde,hasta,...f.params]);const d=await pool.query(`${baseCte} SELECT fecha_crm fecha,COALESCE(NULLIF(BTRIM(motivo_atc),''),etapa_crm,'SIN MOTIVO') motivo_atc,COUNT(*) cantidad FROM base WHERE fecha_crm BETWEEN $1::date AND $2::date AND etapa_crm~*'ATC|SOPORTE' ${f.sql} GROUP BY 1,2 ORDER BY 1 DESC,3 DESC`,[desde,hasta,...f.params]);res.json({success:true,totales:t.rows,data:d.rows});}catch(e){error(res,'ATC',e);}}

async function getMonitoreoMetas(req,res){try{await asegurarInversionReciente();const {desde,hasta}=rango(req.query);const ags=seleccion(req.query),f=filtroAgencia(ags);const r=await pool.query(`${baseCte} SELECT agencia canal,source origen,${metricas} FROM base WHERE fecha_crm BETWEEN $1::date AND $2::date ${f.sql} GROUP BY 1,2 ORDER BY n_leads DESC`,[desde,hasta,...f.params]);const inv=await inversion(desde,hasta),invMap={};for(const x of inv){const a=resolverCanalInversion(x.origen);invMap[a]=(invMap[a]||0)+Number(x.monto_usd||0);}const groups={};for(const x of r.rows){if(!groups[x.canal])groups[x.canal]={canal:x.canal,inversion_usd:invMap[x.canal]||0,total_leads:0,leads_sac:0,leads_calidad:0,venta_subida:0,ingreso_jot:0,lineas:[]};const g=groups[x.canal],n=Number(x.n_leads||0),gest=Number(x.negociables||0),v=Number(x.venta_subida_bitrix||0),sac=Math.max(0,n-gest);g.total_leads+=n;g.leads_sac+=sac;g.leads_calidad+=gest;g.venta_subida+=v;g.lineas.push({origen:x.origen,total_leads:n,leads_sac:sac,leads_calidad:gest,venta_subida:v,ingreso_jot:0,pct_sac:n?sac/n*100:0,pct_calidad:n?gest/n*100:0,pct_ventas:gest?v/gest*100:0,pct_ventas_jot:0});}const canales=Object.values(groups).map(g=>({...g,pct_sac:g.total_leads?g.leads_sac/g.total_leads*100:0,pct_calidad:g.total_leads?g.leads_calidad/g.total_leads*100:0,pct_ventas:g.leads_calidad?g.venta_subida/g.leads_calidad*100:0,pct_ventas_jot:0,cpl:g.total_leads&&g.inversion_usd?g.inversion_usd/g.total_leads:null,cpl_gest:g.leads_calidad&&g.inversion_usd?g.inversion_usd/g.leads_calidad:null,cpa:g.venta_subida&&g.inversion_usd?g.inversion_usd/g.venta_subida:null,cpa_jot:null}));res.json({success:true,canales,canales_disponibles:await catalogoAgencias()});}catch(e){error(res,'metas',e);}}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/redes/reporte-data — Reporte mensual completo (TabReporteData.jsx)
// ─────────────────────────────────────────────────────────────────────────────
// Bloques 1 (inversión/costos), 2 (leads+etapas), ciudad, hora y ATC salen de
// bitrix_webhook_leads (tiempo real). Bloques 3 (estatus JOT), 4 (forma de
// pago) y 5 (ciclo de venta) salen de las columnas j_* de mestra_bitrix, que
// es donde vive JotForm — pero el ciclo se mide contra el created_at del
// webhook, no contra b_creado_el_fecha del batch.
//
// OJO con los nombres: el front espera total_leads / venta_subida /
// seguimiento, mientras que la constante `metricas` (compartida con los otros
// endpoints) los llama n_leads / venta_subida_bitrix / seguimiento_negociacion.
// Antes se mandaba `metricas` crudo y por eso el bloque 2 salía todo en cero.
const mapEtapasReporte = (r) => ({
  ...r,
  total_leads:  Number(r.n_leads || 0),
  venta_subida: Number(r.venta_subida_bitrix || 0),
  seguimiento:  Number(r.seguimiento_negociacion || 0),
});

const porDia = (rows) => Object.fromEntries(rows.map(r => [Number(r.dia), r]));

async function getReporteData(req,res){
  try{
    await asegurarInversionReciente();
    const y=Number(req.query.anio)||new Date().getFullYear();
    const m=Number(req.query.mes)||new Date().getMonth()+1;
    const ultimo=new Date(y,m,0).getDate();
    const desde=`${y}-${String(m).padStart(2,'0')}-01`;
    const hasta=`${y}-${String(m).padStart(2,'0')}-${String(ultimo).padStart(2,'0')}`;
    const ags=seleccion(req.query), f=filtroAgencia(ags);

    // ── Bitrix (tiempo real) ────────────────────────────────────────────────
    const diario=(await pool.query(`${baseCte} SELECT EXTRACT(DAY FROM fecha_crm)::int dia,${metricas} FROM base WHERE fecha_crm BETWEEN $1::date AND $2::date ${f.sql} GROUP BY 1 ORDER BY 1`,[desde,hasta,...f.params])).rows;
    const etapas=diario.map(mapEtapasReporte);

    // ── JotForm (mestra_bitrix) ─────────────────────────────────────────────
    // Si mestra_bitrix no existe o está refrescando, el reporte NO se cae:
    // los bloques JOT quedan vacíos y el front los oculta solo.
    let jotDenoms=[], statusJotRows=[], pagoRows=[], cicloRows=[];
    try{
      const [d,sj,pg,cv]=await Promise.all([
        jotDenominadores(desde,hasta,ags),
        statusJot(desde,hasta,ags),
        formaPago(desde,hasta,ags),
        cicloVenta(desde,hasta,ags),
      ]);
      jotDenoms=d.rows; statusJotRows=sj.rows; pagoRows=pg.rows; cicloRows=cv.rows;
    }catch(e){
      console.error('[reporte-data] bloques JOT no disponibles:',e.message);
    }
    const jotByDia=porDia(jotDenoms);

    // ── Inversión ───────────────────────────────────────────────────────────
    const inv=await inversion(desde,hasta);
    const invDia={};
    for(const x of inv){
      const agenciaInv=resolverCanalInversion(x.origen);
      if(ags.length&&!ags.includes(agenciaInv))continue;
      const d=new Date(x.fecha).getUTCDate();
      invDia[d]=(invDia[d]||0)+Number(x.monto_usd||0);
    }
    const byDia=Object.fromEntries(diario.map(x=>[Number(x.dia),x]));
    const inversionRows=Array.from({length:ultimo},(_,i)=>{
      const d=i+1, x=byDia[d]||{}, j=jotByDia[d]||{};
      return{
        dia:d,
        inversion_usd:invDia[d]||0,
        n_leads:Number(x.n_leads||0),
        negociables:Number(x.negociables||0),
        venta_subida:Number(x.venta_subida_bitrix||0),
        ingreso_jot:Number(j.ingreso_jot||0),
        ingreso_bitrix_mismo_dia:Number(j.ingreso_bitrix_mismo_dia||0),
        activos_mes:Number(j.activos_mes||0),
        activo_backlog:Number(j.activo_backlog||0),
        preplaneados:Number(j.preplaneados||0),
        asignados:Number(j.asignados||0),
        preservicio:Number(j.preservicio||0),
      };
    });

    // ── Resto (sin cambios) ─────────────────────────────────────────────────
    const hora=(await pool.query(`${baseCte} SELECT hora_crm hora,COUNT(*) FILTER(WHERE ${esLeadTotalExpr('etapa_crm')}) n_leads,COUNT(*) FILTER(WHERE etapa_crm~*'ATC|SOPORTE') atc FROM base WHERE fecha_crm BETWEEN $1::date AND $2::date ${f.sql} GROUP BY 1 ORDER BY 1`,[desde,hasta,...f.params])).rows;
    const horaDia=(await pool.query(`${baseCte} SELECT EXTRACT(DAY FROM fecha_crm)::int dia,hora_crm hora,COUNT(*) FILTER(WHERE ${esLeadTotalExpr('etapa_crm')}) n_leads,COUNT(*) FILTER(WHERE etapa_crm~*'ATC|SOPORTE') atc FROM base WHERE fecha_crm BETWEEN $1::date AND $2::date ${f.sql} GROUP BY 1,2 ORDER BY 1,2`,[desde,hasta,...f.params])).rows;
    const ciudad=(await pool.query(`${baseCte} SELECT COALESCE(NULLIF(BTRIM(city),''),'SIN CIUDAD') ciudad,''::text provincia,COUNT(*) FILTER(WHERE ${esLeadTotalExpr('etapa_crm')}) total_leads,COUNT(*) FILTER(WHERE etapa_crm~*'VENTA SUBIDA') activos,0::bigint ingresos_jot FROM base WHERE fecha_crm BETWEEN $1::date AND $2::date ${f.sql} GROUP BY 1 ORDER BY total_leads DESC`,[desde,hasta,...f.params])).rows.map(x=>({...x,pct_activos:Number(x.total_leads)?+(Number(x.activos)/Number(x.total_leads)*100).toFixed(1):0}));
    const atc=(await pool.query(`${baseCte} SELECT COALESCE(NULLIF(BTRIM(motivo_atc),''),etapa_crm,'SIN MOTIVO') motivo_atc,COUNT(*) cantidad FROM base WHERE fecha_crm BETWEEN $1::date AND $2::date AND etapa_crm~*'ATC|SOPORTE' ${f.sql} GROUP BY 1 ORDER BY 2 DESC`,[desde,hasta,...f.params])).rows;

    const hoy=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil'}).format(new Date());
    res.json({
      success:true,
      meta:{anio:y,mes:m,dias:Array.from({length:ultimo},(_,i)=>({dia:i+1,nombre:['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'][new Date(y,m-1,i+1).getDay()]}))},
      canales_disponibles:await catalogoAgencias(),
      inversion:inversionRows,
      forecast_agencias:construirForecastAgencias(inv,{desde,hasta,hoy:hoy<desde?desde:hoy>hasta?hasta:hoy}),
      etapas,
      status_jot:statusJotRows,
      pago:pagoRows,
      ciclo:cicloRows,
      ciudad,hora,hora_dia:horaDia,
      atc_motivos:atc,
      atc_totales:atc,
    });
  }catch(e){error(res,'reporte data',e);}
}

function error(res,seccion,e){console.error(`Error Redes webhook (${seccion}):`,e);res.status(500).json({success:false,message:`Error al obtener ${seccion}`,error:process.env.NODE_ENV==='production'?'Error interno del servidor':e.message});}
module.exports={...legacy,getMonitoreoRedes,getMonitoreoCiudad,getMonitoreoHora,getMonitoreoAtc,getMonitoreoMetas,getReporteData};
