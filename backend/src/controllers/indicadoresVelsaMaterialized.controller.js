const pool = require('../config/db');

const getFechaEcuador = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

const getPrimerDiaMesEcuador = () => {
  const f = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-01`;
};

const MV = `public.mv_indicadores_velsa_completo mv`;
const ESTADO_ACTIVO = `'ACTIVO'`;

const ETAPAS_GESTIONABLES = `(
  'Venta Subida','OPORTUNIDADES SIUPERVISOR','GESTION DIARIA / PENDIENTE CIERRE',
  'CLIENTE CON ACUERDO','CLIENTE 8 HORAS','DOCUMENTOS PENDIENTES','CONTACTO NUEVO',
  'CLIENTE 2 HORAS','CLIENTE 6 HORAS','CLIENTE 12 HORAS','CLIENTE 4 HORAS',
  'VOLVER A LLAMAR','GESTION DIARIA','PENDIENTE CIERRE','VENTA SUBIDA',
  'OPORTUNIDADES SUPERVISOR','OPORTUNIDADES SUPERVISOR MES ACTUAL','OPORTUNIDADES SUPERVISOR MES ANTERIOR',
  'REMARKETING','SEGUIMIENTO NEGOCIACION','SEGUIMIENTO NEGOCIACION CON CONTACTO',
  'SEGUIMIENTO SIN CONTACTO','SEGUIMIENTO NEGOCIACIÓN','SEGUIMIENTO NEGOCIACIÓN CON CONTACTO',
  'DESCARTE PLAN DE 200','SEGUIMIENTO PLAN 200','ATC','GESTION DIARIA PENDIENTE CIERRE',
  'CLIENTE CON ACUERDO','PENDIENTE CIERRE'
)`;

const ETAPAS_DESCARTE = `(
  'Descarte','FUERA DE COBERTURA','ZONA PELIGROSA','DESCARTE','DESCARTE PLAN DE 200'
)`;

// ── Filtros dinámicos ─────────────────────────────────────────────────────────
function buildFilters(q, values) {
  let f = '';
  const { asesor, supervisor, estadoNetlife, estadoRegularizacion, etapaCRM, etapaJotform } = q;
  if (asesor)               { values.push(`%${asesor}%`);               f += ` AND mv.asesor ILIKE $${values.length}`; }
  if (supervisor)           { values.push(`%${supervisor}%`);           f += ` AND mv.supervisor ILIKE $${values.length}`; }
  if (estadoNetlife)        { values.push(`%${estadoNetlife}%`);        f += ` AND mv.estado_venta ILIKE $${values.length}`; }
  if (estadoRegularizacion) { values.push(`%${estadoRegularizacion}%`); f += ` AND mv.estado_regularizacion ILIKE $${values.length}`; }
  if (etapaCRM)             { values.push(`%${etapaCRM}%`);             f += ` AND mv.etapa_crm ILIKE $${values.length}`; }
  if (etapaJotform)         { values.push(`%${etapaJotform}%`);         f += ` AND mv.estado_venta ILIKE $${values.length}`; }
  return f;
}

// ── Query KPI por columna de agrupación ──────────────────────────────────────
const queryKPI = (columna, filters) => `
  SELECT
    COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
    COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AS leads_totales,
    COUNT(*) FILTER (
      WHERE (mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
          OR mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date)
      AND mv.etapa_crm IN ${ETAPAS_GESTIONABLES}
    ) AS gestionables,
    COUNT(*) FILTER (
      WHERE mv.etapa_crm = 'Venta Subida'
      AND mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
    ) AS ventas_crm,
    COUNT(*) FILTER (WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date) AS ingresos_reales,
    COUNT(*) FILTER (
      WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date
      AND mv.estado_venta = ${ESTADO_ACTIVO}
    ) AS real_mes,
    COUNT(*) FILTER (
      WHERE mv.etapa_crm IN ${ETAPAS_DESCARTE}
      AND mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
    ) AS descarte_count,
    COUNT(*) FILTER (
      WHERE mv.forma_pago ILIKE '%TARJETA DE CREDITO%'
      AND mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date
    ) AS tarjeta_credito,
    COUNT(*) FILTER (
      WHERE mv.aplica_descuento ILIKE '%TERCERA EDAD%'
      AND mv.estado_venta = ${ESTADO_ACTIVO}
      AND mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date
    ) AS tercera_edad,
    COUNT(*) FILTER (
      WHERE mv.estado_regularizacion ILIKE '%REGULARIZAR%'
      AND mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date
    ) AS regularizacion
  FROM ${MV}
  WHERE (
    mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
    OR mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date
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
    AND mv.fecha_registro_jotform IS NOT NULL
    AND mv.fecha_registro_jotform::date < $1::date
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
    const bk    = map[r.nombre_grupo] || 0;
    return {
      ...r,
      backlog:                    bk,
      total_activas_calculada:    activ + bk,
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

    // Valores para queries principales (usan $1=desde, $2=hasta)
    const valuesMain = [desde, hasta];
    const filters    = buildFilters(req.query, valuesMain);

    // Valores para backlog (solo $1=desde)
    const valuesBk  = [desde];
    const filtersBk = buildFilters(req.query, valuesBk);

    const qEstados = `
      SELECT COALESCE(NULLIF(TRIM(mv.estado_venta),''),'SIN ESTADO') AS estado, COUNT(*)::int AS total
      FROM ${MV}
      WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date ${filters}
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
        mv.fecha_registro_jotform::date::text AS fecha,
        EXTRACT(DAY FROM mv.fecha_registro_jotform::date)::int AS dia,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO})::int AS activos
      FROM ${MV}
      WHERE mv.fecha_registro_jotform IS NOT NULL
        AND mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY 1 ORDER BY 1 ASC
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
      WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date ${filters}
    `;
    const qTarjeta = `
      SELECT
        COUNT(*) FILTER (WHERE mv.forma_pago ILIKE '%TARJETA DE CREDITO%') AS total_tarjeta,
        COUNT(*) AS total_jotform
      FROM ${MV}
      WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date ${filters}
    `;

    const [
      resSup, resAses, resBkSup, resBkAses,
      resEstados, resEmbudo, resDia,
      resEtapasCRM, resEtapasJot, resTercera, resTarjeta,
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
      estadosNetlife:   resEstados.rows.map(r => ({ estado: r.estado, total: Number(r.total) })),
      graficoEmbudo:    resEmbudo.rows,
      graficoBarrasDia: resDia.rows,
      etapasCRM:        resEtapasCRM.rows.map(r => r.etapa),
      etapasJotform:    resEtapasJot.rows.map(r => r.estado_venta),
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
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date = $2::date AND mv.etapa_crm IN ${ETAPAS_GESTIONABLES}) AS real_dia_leads,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AS crm_acumulado,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date = $2::date) AS crm_dia,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date = $2::date AND mv.etapa_crm = 'Venta Subida') AS v_subida_crm_hoy,
        COUNT(*) FILTER (WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date AND mv.etapa_crm IN ${ETAPAS_GESTIONABLES}) AS gestionables
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
        AND mv.fecha_registro_jotform::date = $1::date
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
        COUNT(*) FILTER (WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date) AS ingresos_jot,
        COUNT(*) FILTER (WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date AND mv.estado_venta = ${ESTADO_ACTIVO}) AS ventas_activas,
        ROUND(COALESCE(
          COUNT(*) FILTER (WHERE mv.etapa_crm IN ${ETAPAS_DESCARTE} AND mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE (mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date OR mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AND mv.etapa_crm IN ${ETAPAS_GESTIONABLES}),0)
        ,0)*100,2) AS pct_descarte,
        ROUND(COALESCE(
          COUNT(*) FILTER (WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE (mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date OR mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date) AND mv.etapa_crm IN ${ETAPAS_GESTIONABLES}),0)
        ,0)*100,2) AS pct_efectividad,
        ROUND(COALESCE(
          COUNT(*) FILTER (WHERE mv.aplica_descuento ILIKE '%TERCERA EDAD%' AND mv.estado_venta = ${ESTADO_ACTIVO} AND mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date)::numeric
          / NULLIF(COUNT(*) FILTER (WHERE mv.estado_venta = ${ESTADO_ACTIVO} AND mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date),0)
        ,0)*100,2) AS pct_tercera_edad
      FROM ${MV}
      WHERE (mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date OR mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date) ${filters}
    `;
    const qEmbudoCRM = `
      SELECT COALESCE(mv.etapa_crm,'SIN ETAPA') AS etapa, COUNT(*)::int AS total
      FROM ${MV} WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY mv.etapa_crm ORDER BY total DESC
    `;
    const qEmbudoJot = `
      SELECT COALESCE(mv.estado_venta,'SIN ESTADO') AS etapa, COUNT(*)::int AS total
      FROM ${MV} WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date ${filters}
      GROUP BY mv.estado_venta ORDER BY total DESC
    `;
    const qMapaCalor = `
      SELECT mv.fecha_registro_jotform::date::text AS fecha, COALESCE(mv.ciudad,'SIN CIUDAD') AS ciudad, COUNT(*)::int AS total
      FROM ${MV}
      WHERE mv.fecha_registro_jotform IS NOT NULL AND mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date
        AND mv.ciudad IS NOT NULL AND TRIM(mv.ciudad) != '' ${filters}
      GROUP BY 1,2 ORDER BY 1 ASC, 3 DESC
    `;

    const [resKPIs, resEmbCRM, resEmbJot, resMapa] = await Promise.all([
      pool.query(qKPIs,      values),
      pool.query(qEmbudoCRM, values),
      pool.query(qEmbudoJot, values),
      pool.query(qMapaCalor, values),
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
      mapaCalor:     resMapa.rows,
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
          OR mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date)
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
      WHERE mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date ${filters}
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
        AND mv.fecha_registro_jotform::date < $1::date
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

module.exports = {
  getIndicadoresDashboardVelsa,
  getMonitoreoDiarioVelsa,
  getReporte180Velsa,
  getConsultaDescargaVelsa,
  getStatusMaterializedView,
  getDetalleCRMData,
  getActivasVelsa,
  getBacklogVelsa,
};
