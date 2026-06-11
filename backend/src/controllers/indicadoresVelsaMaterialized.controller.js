const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// GESTIONABLES: en lugar de mantener una lista blanca de etapas (ETAPAS_GESTIONABLES),
// se identifica un lead como "gestionable" EXCLUYENDO las etapas que matcheen estos
// patrones. Así, si se agregan etapas nuevas al pipeline, no afectan el conteo.
// ─────────────────────────────────────────────────────────────────────────────
const esGestionableExpr = (col) => `(
    ${col} NOT ILIKE '%ATC%'
    AND ${col} NOT ILIKE '%ZONA PELIGROSA%'
    AND ${col} NOT ILIKE '%FUERA DE COBERTURA%'
    AND ${col} NOT ILIKE '%DUPLICADO%'
)`;

const getFechaEcuador = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

const getPrimerDiaMesEcuador = () => {
  const f = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-01`;
};

const MV = `public.mv_indicadores_velsa_completo mv`;
const ESTADO_ACTIVO = `'ACTIVO'`;

// Solo etapas verdaderamente gestionables — SIN descartes
const ETAPAS_GESTIONABLES_UPPER = [
  'CONTACTO NUEVO','DOCUMENTOS PENDIENTES','VOLVER A LLAMAR',
  'GESTION DIARIA','GESTION DIARIA / PENDIENTE CIERRE','GESTION DIARIA PENDIENTE CIERRE',
  'VENTA SUBIDA',
  'CLIENTE 2 HORAS','CLIENTE 4 HORAS','CLIENTE 6 HORAS','CLIENTE 8 HORAS','CLIENTE 12 HORAS',
  'CLIENTE CON ACUERDO','PENDIENTE CIERRE',
  'OPORTUNIDADES SUPERVISOR','OPORTUNIDADES SIUPERVISOR',
  'OPORTUNIDADES SUPERVISOR MES ACTUAL','OPORTUNIDADES SUPERVISOR MES ANTERIOR',
  'REMARKETING',
  'SEGUIMIENTO NEGOCIACION','SEGUIMIENTO NEGOCIACION CON CONTACTO','SEGUIMIENTO SIN CONTACTO',
  'SEGUIMIENTO NEGOCIACIÓN','SEGUIMIENTO NEGOCIACIÓN CON CONTACTO',
  'CONTACTO NUEVO SUPERVISOR', 'VOLVER A LLAMAR NO CONTESTA', 'NO CONTESTA 15 MINUTOS', 'NO CONTESTA 30 MINUTOS', 
  'NO CONTESTA 60 MINUTOS', 'MAS DE 15 DIAS PARA CIERRE',   'CLIENTE 2 HORAS',
    'CLIENTE 4 HORAS',
    'CLIENTE 6 HORAS',
    'CLIENTE 8 HORAS',
    'CLIENTE CON ACUERDO',
    'CLIENTE DISCAPACIDAD',
    'CONTACTO NUEVO',
    'CONTRATO NETLIFE',
    'DESCARTE',
    'DESISTE DE COMPRA',
    'DOCUMENTOS PENDIENTES',
    'GESTIÓN DIARIA',
    'GESTION DIARIA',
    'MANTIENE PROVEEDOR',
    'NO INTERESA COSTO PLAN',
    'NO VOLVER A CONTACTAR',
    'OPORTUNIDADES',
    'OPORTUNIDADES SUPERVISOR',
    'OPORTUNIDADES SUPERVISORES MES ACTUAL',
    'OTRO ASESOR NOVONET',
    'OTRO PROVEEDOR',
    'PENDIENTE CIERRE',
    'POSTVENTA NOVONET',
    'VENTA SUBIDA',
    'VOLVER A LLAMAR NO CONTESTA',
    'SEGUIMIENTO NEGOCIACION',
    'SEGUIMIENTO NEGOCIACIÓN',
    'ENVIO REQUISITOS/DOCUMENTOS PENDIENTES',
    'GESTION DIARIA/PENDIENTE CIERRE',
    'CONTACTO NUEVO /SUPERVISOR',
    'MAS DE 15 DIAS PARA CIERRE',
    'MÁS DE 15 DÍAS PARA CIERRE',
    'DESCARTE REMARKETIZADO',
    'NO CONTESTA 15 MINUTOS',
    'CONTRATO NETLIFE OTRO ASESOR COMPAÑERO',
    'CONTRATO NETLIFE POR OTRO CANAL',
    'DESCARTE PLAN DE 200',
    'NO INTERESA COSTO INSTALACIÓN',
    'NO INTERESA COSTO INSTALACION',
    'VENTA DIRECTA ECUANET',
    'REMARKETING DIRARIO ARIEL CURAY',
    'REMARKETING DIARIO ARIEL CURAY'
];
const ETAPAS_GESTIONABLES = `(${ETAPAS_GESTIONABLES_UPPER.map(e => `'${e}'`).join(',')})`;

const ETAPAS_DESCARTE = `('DESCARTE')`;

// ── Filtros dinámicos ─────────────────────────────────────────────────────────
function buildFilters(q, values) {
  let f = '';
  const { asesor, supervisor, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform, idBitrix } = q;
  if (asesor)               { values.push(`%${asesor}%`);               f += ` AND mv.asesor ILIKE $${values.length}`; }
  if (supervisor)           { values.push(`%${supervisor}%`);           f += ` AND mv.supervisor ILIKE $${values.length}`; }
  if (estadoNetlife)        { values.push(`%${estadoNetlife}%`);        f += ` AND mv.estado_venta ILIKE $${values.length}`; }
  if (estadoRegularizacion) { values.push(`%${estadoRegularizacion}%`); f += ` AND mv.estado_regularizacion ILIKE $${values.length}`; }
  if (etapaCRM)             { values.push(`%${etapaCRM}%`);             f += ` AND mv.etapa_crm ILIKE $${values.length}`; }
  if (etapaJotform)         { values.push(`%${etapaJotform}%`);         f += ` AND mv.estado_venta ILIKE $${values.length}`; }
  if (idBitrix)             { values.push(idBitrix.toString());         f += ` AND (mv.id_crm::text = $${values.length} OR mv.id_jotform::text = $${values.length})`; }
  return f;
}

// ── Query KPI por columna de agrupación ──────────────────────────────────────
const queryKPI = (columna, filters) => `
  SELECT
    COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
    COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AS leads_totales,
    COUNT(*) FILTER (
      WHERE (mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
          OR (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date)
      AND ${esGestionableExpr('mv.etapa_crm')}
    ) AS gestionables,
    COUNT(*) FILTER (
      WHERE UPPER(mv.etapa_crm) = 'VENTA SUBIDA'
      AND mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
    ) AS ventas_crm,
    COUNT(*) FILTER (
      WHERE UPPER(mv.etapa_crm) = 'VENTA SUBIDA'
      AND mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
      AND mv.fecha_creacion_crm::date = mv.fecha_modificacion_crm::date
    ) AS ventas_del_dia,
    COUNT(*) FILTER (WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date) AS ingresos_reales,
    COUNT(*) FILTER (
      WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
      AND mv.estado_venta = ${ESTADO_ACTIVO}
    ) AS real_mes,
    COUNT(*) FILTER (
      WHERE UPPER(mv.etapa_crm) IN ${ETAPAS_DESCARTE}
      AND mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
    ) AS descarte_count,
    COUNT(*) FILTER (
      WHERE mv.forma_pago ILIKE '%TARJETA DE CREDITO%'
      AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
    ) AS tarjeta_credito,
    COUNT(*) FILTER (
      WHERE mv.aplica_descuento ILIKE '%TERCERA EDAD%'
      AND mv.estado_venta = ${ESTADO_ACTIVO}
      AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
    ) AS tercera_edad,
    COUNT(*) FILTER (
      WHERE mv.estado_regularizacion ILIKE '%REGULARIZAR%'
      AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
    ) AS regularizacion
  FROM ${MV}
  WHERE (
    mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
    OR (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
  ) ${filters}
  GROUP BY 1 ORDER BY ingresos_reales DESC, ventas_crm DESC
`;

// ── Query Backlog — solo usa $1 (desde) ──────────────────────────────────────
const queryBacklog = (columna, filters) => `
  SELECT
    COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
    COUNT(DISTINCT mv.id_jotform)::int AS backlog
  FROM ${MV}
  WHERE mv.id_jotform IS NOT NULL
    AND mv.fecha_activacion IS NOT NULL
    AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date < $1::date
    AND mv.fecha_activacion::date BETWEEN $1::date AND $2::date
    AND mv.estado_venta = ${ESTADO_ACTIVO}
    ${filters}
  GROUP BY 1
`;

// ── Merge KPI + Backlog + calcular campos derivados ──────────────────────────
function mergeBacklog(kpiRows, backlogRows) {
  const map = {};
  (backlogRows || []).forEach(r => { map[r.nombre_grupo] = Number(r.backlog || 0); });
  return kpiRows.map(r => {
    const gest  = Number(r.gestionables   || 0);
    const jot   = Number(r.ingresos_reales || 0);
    const activ = Number(r.real_mes       || 0);
    const desc  = Number(r.descarte_count || 0);
    const leads = Number(r.leads_totales  || 0);
    const vdia  = Number(r.ventas_del_dia || 0);
    const bk    = map[r.nombre_grupo] || 0;
    return {
      ...r,
      backlog:                    bk,
      total_activas_calculada:    activ + bk,
      // VENTA SEGUIMIENTO = ingresos Jotform − ventas del día
      venta_seguimiento:          Math.max(0, jot - vdia),
      descarte:                   gest  > 0 ? parseFloat(((desc  / gest)  * 100).toFixed(1)) : 0,
      efectividad_real:           gest  > 0 ? parseFloat(((jot   / gest)  * 100).toFixed(1)) : 0,
      tasa_instalacion:           jot   > 0 ? parseFloat(((activ / jot)   * 100).toFixed(1)) : 0,
      eficiencia:                 leads > 0 ? parseFloat(((activ / leads) * 100).toFixed(1)) : 0,
      efectividad_activas_vs_pauta: gest > 0 ? parseFloat(((activ / gest) * 100).toFixed(1)) : 0,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
async function getIndicadoresDashboardVelsa(req, res) {
  try {
    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy;
    const hasta = req.query.fechaHasta || hoy;

    const valuesMain = [desde, hasta];
    const filters    = buildFilters(req.query, valuesMain);

    const valuesBk  = [desde, hasta];
    const filtersBk = buildFilters(req.query, valuesBk);

    const qEstados = `
      SELECT COALESCE(NULLIF(TRIM(mv.estado_venta),''),'SIN ESTADO') AS estado, COUNT(*)::int AS total
      FROM ${MV}
      WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY 1 ORDER BY total DESC
    `;
    const qEmbudo = `
      SELECT COALESCE(mv.etapa_crm,'SIN ETAPA') AS etapa, COUNT(*)::int AS total
      FROM ${MV}
      WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY mv.etapa_crm ORDER BY total DESC
    `;
    const qPorDia = `
      SELECT
        (mv.fecha_registro_jotform - INTERVAL '5 hours')::date::text AS fecha,
        EXTRACT(DAY FROM (mv.fecha_registro_jotform - INTERVAL '5 hours')::date)::int AS dia,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO})::int AS activos
      FROM ${MV}
      WHERE mv.fecha_registro_jotform IS NOT NULL
        AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY (mv.fecha_registro_jotform - INTERVAL '5 hours')::date ORDER BY (mv.fecha_registro_jotform - INTERVAL '5 hours')::date ASC
    `;

    // ── NUEVO: activaciones por día usando fecha_activacion_date ────────────────
    // Indicador independiente — no modifica ningún KPI ni cálculo existente.
    const qActivacionesPorDia = `
      SELECT
        mv.fecha_activacion_date::date::text AS fecha,
        COUNT(*)::int AS activaciones
      FROM ${MV}
      WHERE mv.fecha_activacion_date IS NOT NULL
        AND mv.fecha_activacion_date::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY mv.fecha_activacion_date::date
      ORDER BY mv.fecha_activacion_date::date ASC
    `;
    const qEtapasCRM = `
      SELECT DISTINCT mv.etapa_crm AS etapa FROM ${MV}
      WHERE mv.etapa_crm IS NOT NULL AND TRIM(mv.etapa_crm) <> ''
      ORDER BY etapa ASC
    `;
    const qEtapasJot = `
      SELECT DISTINCT mv.estado_venta FROM ${MV}
      WHERE mv.estado_venta IS NOT NULL AND TRIM(mv.estado_venta) <> ''
      ORDER BY mv.estado_venta ASC
    `;
    const qTercera = `
      SELECT
        COUNT(*) FILTER (WHERE mv.aplica_descuento ILIKE '%TERCERA EDAD%' AND mv.estado_venta = ${ESTADO_ACTIVO}) AS total_tercera,
        COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO}) AS total_activos
      FROM ${MV}
      WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
    `;
    const qTarjeta = `
      SELECT
        COUNT(*) FILTER (WHERE mv.forma_pago ILIKE '%TARJETA DE CREDITO%') AS total_tarjeta,
        COUNT(*) AS total_jotform
      FROM ${MV}
      WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
    `;
    const qNetlife = `
SELECT
  mv.id_crm AS "ID_CRM",
  mv.id_registro AS "ID_JOT",
  mv.etapa_crm AS "ETAPA",
  mv.fecha_creacion_crm AS "FECHA_CREACION",
  mv.asesor AS "ASESOR",
  mv.supervisor AS "SUPERVISOR",
  mv.origen AS "ORIGEN",
  mv.payload_created_at AS "FECHA_CREADO_JOT",
  mv.codigo_asesor AS "COD_ASESOR_JOT",
  mv.inicio_sesion_netlife AS "LOGIN",
  mv.estado_venta AS "ESTADO_NETLIFE",
  mv.observacion_telcos AS "OBSERVACION_TELCOS",
  mv.fecha_ingresa_telcos AS "INGRESO_TELCOS",
  mv.fecha_activacion AS "FECHA_ACTIVACION",
  mv.estado_regularizacion AS "ESTADO_REGULARIZACION",
  mv.detalle_regularizacion AS "OBSERV_REGULARIZACION",
  mv.plan_casa AS "PLAN_CASA",
  mv.plan_pyme AS "PLAN_PYME",
  mv.plan_profesional AS "PLAN_PROFESIONAL",
  mv.plan_hogar_adulto_mayor AS "PLAN_HOGAR_ADULTO_MAYOR",
  mv.plan_pyme_corp AS "PLAN_PYME_CORP",
  mv.plan_centro_red_comercial AS "PLAN_CENTRO_RED_COMERCIAL",
  mv.forma_pago AS "FORMA_PAGO",
  mv.aplica_descuento AS "APLICA_DESCUENTO",
  mv.fecha_agenda AS "FECHA_AGENDA",
  mv.observacion AS "OBSERVACION"
FROM public.mv_indicadores_velsa_completo mv
WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date 
BETWEEN $1::date AND $2::date
${filters}
LIMIT 6000
    `;

    const [
      resSup, resAses, resBkSup, resBkAses,
      resEstados, resEmbudo, resDia,
      resEtapasCRM, resEtapasJot, resTercera, resTarjeta,
      resNetlife, resActivacionesDia,
    ] = await Promise.all([
      pool.query(queryKPI('mv.supervisor', filters), valuesMain),
      pool.query(queryKPI('mv.asesor',     filters), valuesMain),
      pool.query(queryBacklog('mv.supervisor', filtersBk), valuesBk),
      pool.query(queryBacklog('mv.asesor',     filtersBk), valuesBk),
      pool.query(qEstados,   valuesMain),
      pool.query(qEmbudo,    valuesMain),
      pool.query(qPorDia,    valuesMain),
      pool.query(qEtapasCRM),
      pool.query(qEtapasJot),
      pool.query(qTercera,   valuesMain),
      pool.query(qTarjeta,   valuesMain),
      pool.query(qNetlife,   valuesMain),
      pool.query(qActivacionesPorDia, valuesMain), // NUEVO: activaciones por fecha_activacion_date
    ]);

    const supervisores = mergeBacklog(resSup.rows,  resBkSup.rows);
    const asesores     = mergeBacklog(resAses.rows, resBkAses.rows);

    const tRow = resTercera.rows[0] || {};
    const porcentajeTerceraEdad = Number(tRow.total_activos) > 0
      ? parseFloat(((Number(tRow.total_tercera) / Number(tRow.total_activos)) * 100).toFixed(2)) : 0;

    const taRow = resTarjeta.rows[0] || {};
    const porcentajeTarjeta = Number(taRow.total_jotform) > 0
      ? parseFloat(((Number(taRow.total_tarjeta) / Number(taRow.total_jotform)) * 100).toFixed(2)) : 0;

    console.log(`[DASHBOARD-VELSA] ${desde}~${hasta} | Sup:${supervisores.length} Ases:${asesores.length}`);

    res.json({
      success: true,
      supervisores,
      asesores,
      dataNetlife:           resNetlife.rows,
      estadosNetlife:        resEstados.rows.map(r => ({ estado: r.estado, total: Number(r.total) })),
      graficoEmbudo:         resEmbudo.rows,
      graficoBarrasDia:      resDia.rows,
      graficoActivacionesDia: resActivacionesDia.rows, // NUEVO: activaciones por fecha_activacion_date
      etapasCRM:             resEtapasCRM.rows.map(r => r.etapa),
      etapasJotform:         resEtapasJot.rows.map(r => r.estado_venta),
      porcentajeTerceraEdad,
      porcentajeTarjeta,
    });
  } catch (error) {
    console.error('[DASHBOARD-VELSA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MONITOREO DIARIO
// ─────────────────────────────────────────────────────────────────────────────
async function getMonitoreoDiarioVelsa(req, res) {
  try {
    const hoy       = getFechaEcuador();
    const iniciomes = getPrimerDiaMesEcuador();

    const qMon = (columna) => `
      SELECT
        COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AS real_mes_leads,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date = $2::date AND ${esGestionableExpr('mv.etapa_crm')}) AS real_dia_leads,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AS crm_acumulado,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date = $2::date) AS crm_dia,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date = $2::date AND UPPER(mv.etapa_crm) = 'VENTA SUBIDA') AS v_subida_crm_hoy,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date AND ${esGestionableExpr('mv.etapa_crm')}) AS gestionables
      FROM ${MV}
      WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
      GROUP BY 1 ORDER BY real_mes_leads DESC
    `;
    const qJotHoy = (columna) => `
      SELECT
        COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
        COUNT(*)::int AS v_subida_jot_hoy,
        COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO})::int AS activos_jot_hoy
      FROM ${MV}
      WHERE mv.fecha_registro_jotform IS NOT NULL
        AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date = $1::date
      GROUP BY 1
    `;

    const [resSup, resAses, resJotSup, resJotAses] = await Promise.all([
      pool.query(qMon('mv.supervisor'),    [iniciomes, hoy]),
      pool.query(qMon('mv.asesor'),        [iniciomes, hoy]),
      pool.query(qJotHoy('mv.supervisor'), [hoy]),
      pool.query(qJotHoy('mv.asesor'),     [hoy]),
    ]);

    const merge = (filas, jot) => filas.map(r => {
      const j = jot.find(x => x.nombre_grupo === r.nombre_grupo) || {};
      return { ...r, v_subida_jot_hoy: Number(j.v_subida_jot_hoy||0), activos_jot_hoy: Number(j.activos_jot_hoy||0) };
    });

    res.json({ success: true, supervisores: merge(resSup.rows, resJotSup.rows), asesores: merge(resAses.rows, resJotAses.rows) });
  } catch (error) {
    console.error('[MONITOREO-VELSA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTE 180
// ─────────────────────────────────────────────────────────────────────────────
async function getReporte180Velsa(req, res) {
  try {
    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy;
    const hasta = req.query.fechaHasta || hoy;
    const values  = [desde, hasta];
    const filters = buildFilters(req.query, values);

    const qKPIs = `
      SELECT
        COUNT(*) FILTER (WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date) AS ingresos_jot,
        COUNT(*) FILTER (WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date AND mv.estado_venta = ${ESTADO_ACTIVO}) AS ventas_activas,
        ROUND(COALESCE(
          COUNT(*) FILTER (WHERE UPPER(mv.etapa_crm) IN ${ETAPAS_DESCARTE} AND mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE ((mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date OR mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AND ${esGestionableExpr('mv.etapa_crm')}),0)
        ,0)*100,2) AS pct_descarte,
        ROUND(COALESCE(
          COUNT(*) FILTER (WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE ((mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date OR mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AND ${esGestionableExpr('mv.etapa_crm')}),0)
        ,0)*100,2) AS pct_efectividad,
        ROUND(COALESCE(
          COUNT(*) FILTER (WHERE mv.aplica_descuento ILIKE '%TERCERA EDAD%' AND mv.estado_venta = ${ESTADO_ACTIVO} AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO} AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date),0)
        ,0)*100,2) AS pct_tercera_edad
      FROM ${MV}
      WHERE (mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date OR (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date) ${filters}
    `;
    const qEmbudoCRM = `
      SELECT COALESCE(mv.etapa_crm,'SIN ETAPA') AS etapa, COUNT(*)::int AS total
      FROM ${MV} WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY mv.etapa_crm ORDER BY total DESC
    `;
    const qEmbudoJot = `
      SELECT COALESCE(mv.estado_venta,'SIN ESTADO') AS etapa, COUNT(*)::int AS total
      FROM ${MV} WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY mv.estado_venta ORDER BY total DESC
    `;

    const [resKPIs, resEmbCRM, resEmbJot] = await Promise.all([
      pool.query(qKPIs,      values),
      pool.query(qEmbudoCRM, values),
      pool.query(qEmbudoJot, values),
    ]);

    const k = resKPIs.rows[0] || {};
    res.json({
      success: true,
      kpis: {
        ingresos_jot:     Number(k.ingresos_jot     || 0),
        ventas_activas:   Number(k.ventas_activas   || 0),
        pct_descarte:     Number(k.pct_descarte     || 0),
        pct_efectividad:  Number(k.pct_efectividad  || 0),
        pct_tercera_edad: Number(k.pct_tercera_edad || 0),
      },
      embudoCRM:     resEmbCRM.rows,
      embudoJotform: resEmbJot.rows,
      mapaCalor:     [],
    });
  } catch (error) {
    console.error('[REPORTE180-VELSA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTA / DESCARGA
// ─────────────────────────────────────────────────────────────────────────────
async function getConsultaDescargaVelsa(req, res) {
  try {
    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy;
    const hasta = req.query.fechaHasta || hoy;
    const values  = [desde, hasta];
    const filters = buildFilters(req.query, values);

    const result = await pool.query(`
      SELECT
        mv.id_crm, mv.id_jotform, mv.asesor, mv.supervisor,
        mv.etapa_crm, mv.estado_venta, mv.estado_regularizacion,
        mv.fecha_creacion_crm, mv.fecha_registro_jotform, mv.fecha_activacion,
        mv.forma_pago, mv.aplica_descuento, mv.ciudad, mv.origen
      FROM ${MV}
      WHERE (mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
          OR (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date)
      ${filters}
      ORDER BY mv.fecha_creacion_crm DESC LIMIT 10000
    `, values);

    res.json({ success: true, registros: result.rows, total: result.rowCount });
  } catch (error) {
    console.error('[CONSULTA-VELSA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS MV
// ─────────────────────────────────────────────────────────────────────────────
async function getStatusMaterializedView(req, res) {
  try {
    const result = await pool.query(`
      SELECT schemaname, matviewname, ispopulated,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) AS size
      FROM pg_matviews WHERE matviewname = 'mv_indicadores_velsa_completo'
    `);
    const total = await pool.query(`SELECT COUNT(*) AS total FROM public.mv_indicadores_velsa_completo`);
    res.json({ success: true, status: result.rows[0] || {}, totalRegistros: Number(total.rows[0]?.total || 0) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DETALLE CRM
// ─────────────────────────────────────────────────────────────────────────────
async function getDetalleCRMData(req, res) {
  try {
    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy;
    const hasta = req.query.fechaHasta || hoy;
    const values  = [desde, hasta];
    const filters = buildFilters(req.query, values);

    const result = await pool.query(`
      SELECT
        mv.id_crm AS "ID_CRM", mv.etapa_crm AS "ETAPA_CRM",
        mv.fecha_creacion_crm AS "FECHA_CREACION_CRM",
        mv.asesor AS "ASESOR", mv.supervisor AS "SUPERVISOR_ASIGNADO",
        mv.fecha_modificacion_crm AS "FECHA_MODIFICACION", mv.origen AS "ORIGEN"
      FROM ${MV}
      WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date ${filters}
      ORDER BY mv.fecha_creacion_crm DESC LIMIT 6000
    `, values);

    console.log(`[DETALLE-CRM-VELSA] ${desde}~${hasta} | ${result.rowCount} registros`);
    res.json({ success: true, registros: result.rows, total: result.rowCount });
  } catch (error) {
    console.error('[DETALLE-CRM-VELSA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVAS
// ─────────────────────────────────────────────────────────────────────────────
async function getActivasVelsa(req, res) {
  try {
    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy;
    const hasta = req.query.fechaHasta || hoy;
    const values  = [desde, hasta];
    const filters = buildFilters(req.query, values);

    const result = await pool.query(`
      SELECT
        COALESCE(mv.supervisor,'SIN ASIGNAR') AS supervisor,
        COALESCE(mv.asesor,'SIN ASIGNAR') AS asesor,
        COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO})::int AS activas,
        COUNT(*)::int AS total_jotform
      FROM ${MV}
      WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY 1,2 ORDER BY activas DESC
    `, values);

    res.json({ success: true, registros: result.rows });
  } catch (error) {
    console.error('[ACTIVAS-VELSA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKLOG
// ─────────────────────────────────────────────────────────────────────────────
async function getBacklogVelsa(req, res) {
  try {
    const hoy    = getFechaEcuador();
    const values = [req.query.fechaDesde || hoy];
    const filters = buildFilters(req.query, values);

    const result = await pool.query(`
      SELECT
        COALESCE(mv.supervisor,'SIN ASIGNAR') AS supervisor,
        COALESCE(mv.asesor,'SIN ASIGNAR') AS asesor,
        COUNT(DISTINCT mv.id_jotform)::int AS backlog
      FROM ${MV}
      WHERE mv.id_jotform IS NOT NULL
        AND mv.fecha_registro_jotform IS NOT NULL
        AND (mv.fecha_registro_jotform - INTERVAL '5 hours')::date < $1::date
        AND mv.estado_venta = ${ESTADO_ACTIVO}
        ${filters}
      GROUP BY 1,2 ORDER BY backlog DESC
    `, values);

    res.json({ success: true, registros: result.rows });
  } catch (error) {
    console.error('[BACKLOG-VELSA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVACIONES POR DÍA (endpoint independiente — solo usa fecha_activacion_date)
// No modifica ningún KPI ni cálculo existente del dashboard.
// ─────────────────────────────────────────────────────────────────────────────
async function getActivacionesPorDiaVelsa(req, res) {
  try {
    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy;
    const hasta = req.query.fechaHasta || hoy;
    const values = [desde, hasta];

    let filters = '';
    if (req.query.asesor)      { values.push(`%${req.query.asesor}%`);      filters += ` AND mv.asesor ILIKE $${values.length}`; }
    if (req.query.supervisor)  { values.push(`%${req.query.supervisor}%`);  filters += ` AND mv.supervisor ILIKE $${values.length}`; }
    if (req.query.estadoVenta) { values.push(`%${req.query.estadoVenta}%`); filters += ` AND mv.estado_venta ILIKE $${values.length}`; }

    const result = await pool.query(`
      SELECT
        mv.fecha_activacion_date::date::text AS fecha,
        COUNT(*)::int AS activaciones
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.fecha_activacion_date IS NOT NULL
        AND mv.fecha_activacion_date::date BETWEEN $1::date AND $2::date
        ${filters}
      GROUP BY mv.fecha_activacion_date::date
      ORDER BY mv.fecha_activacion_date::date ASC
    `, values);

    res.json({ success: true, rows: result.rows });
  } catch (error) {
    console.error('[ACTIVACIONES-DIA-VELSA]', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  getIndicadoresDashboardVelsa,
  getMonitoreoDiarioVelsa,
  getReporte180Velsa,
  getConsultaDescargaVelsa,
  getStatusMaterializedView,
  getDetalleCRMData,
  getActivasVelsa,
  getBacklogVelsa,
  getActivacionesPorDiaVelsa,
};
