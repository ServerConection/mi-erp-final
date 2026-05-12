/**
 * CONTROLADOR VELSA — v3.0 (2026-05-12)
 * Reescrito para corregir: etapasCRM vacío, supervisor IS NOT NULL, backlog separado,
 * campos faltantes en HorizontalTable, reporte180 sin kpis.
 * Basado en el patrón Novonet: getEtapasCache, mergeBacklog, queryKPI, queryBacklog.
 */

const pool = require('../config/db');

// ─── CACHÉ ───────────────────────────────────────────────────────────────────
const _cacheDash   = new Map();
const _cacheEtapas = new Map();
const CACHE_DASH_TTL   = 2 * 60 * 1000;
const CACHE_ETAPAS_TTL = 5 * 60 * 1000;

const getCache = (m, k)        => { const e = m.get(k); if (e && Date.now() < e.ttl) return e.data; m.delete(k); return null; };
const setCache = (m, k, d, t)  => { m.set(k, { data: d, ttl: Date.now() + t }); if (m.size > 100) { const n = Date.now(); for (const [ck, cv] of m) if (n > cv.ttl) m.delete(ck); } };

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const getFechaEcuador = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

// ─── CONSTANTES ──────────────────────────────────────────────────────────────
// Siempre comparar con UPPER(etapa_crm)
const ETAPAS_GESTIONABLES = `(
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
  'DESCARTE PLAN DE 200','SEGUIMIENTO PLAN 200','ATC'
)`;

const ETAPAS_DESCARTE = `(
  'NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD',
  'OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR',
  'NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACION','NO INTERESA COSTO INSTALACIÓN',
  'VENTA ECUANET DIRECTA','VENTA DIRECTA ECUANET',
  'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPANERO',
  'CONTRATO NETLIFE OTRO ASESOR COMPAÑERO',
  'DESCARTE','FUERA DE COBERTURA','ZONA PELIGROSA'
)`;

// ─── CACHÉ DE ETAPAS ─────────────────────────────────────────────────────────
async function getEtapasCache() {
  const cached = getCache(_cacheEtapas, 'velsa_etapas');
  if (cached) return cached;
  const [resCRM, resJOT] = await Promise.all([
    pool.query(`SELECT DISTINCT etapa_crm FROM public.mv_indicadores_velsa_completo WHERE etapa_crm IS NOT NULL ORDER BY etapa_crm`),
    pool.query(`SELECT DISTINCT estado_venta FROM public.mv_indicadores_velsa_completo WHERE estado_venta IS NOT NULL ORDER BY estado_venta`),
  ]);
  const result = {
    etapasCRM:     resCRM.rows.map(r => r.etapa_crm),
    etapasJotform: resJOT.rows.map(r => r.estado_venta),
  };
  setCache(_cacheEtapas, 'velsa_etapas', result, CACHE_ETAPAS_TTL);
  return result;
}

// ─── MERGE BACKLOG ───────────────────────────────────────────────────────────
// Une rows de KPI con rows de backlog y calcula campos derivados para HorizontalTable
function mergeBacklog(kpiRows, backlogRows) {
  const bkMap = {};
  (backlogRows || []).forEach(r => { bkMap[r.nombre_grupo] = Number(r.backlog || 0); });

  return kpiRows.map(r => {
    const gest   = Number(r.gestionables  || 0);
    const jot    = Number(r.ingresos_reales || 0);
    const realMs = Number(r.real_mes       || 0);
    const leads  = Number(r.leads_totales  || 0);
    const desc   = Number(r.descarte_count || 0);
    const bk     = bkMap[r.nombre_grupo]   || 0;
    return {
      nombre_grupo:             r.nombre_grupo,
      leads_totales:            leads,
      gestionables:             gest,
      ventas_crm:               Number(r.ventas_crm      || 0),
      ingresos_reales:          jot,
      real_mes:                 realMs,
      backlog:                  bk,
      total_activas_calculada:  realMs + bk,
      descarte_count:           desc,
      descarte:                 leads  > 0 ? parseFloat(((desc  / leads)  * 100).toFixed(1)) : 0,
      efectividad_real:         gest   > 0 ? parseFloat(((jot   / gest)   * 100).toFixed(1)) : 0,
      tasa_instalacion:         jot    > 0 ? parseFloat(((realMs / jot)   * 100).toFixed(1)) : 0,
      eficiencia:               leads  > 0 ? parseFloat(((realMs / leads) * 100).toFixed(1)) : 0,
      tarjeta_credito:          Number(r.tarjeta_credito || 0),
      tercera_edad:             Number(r.tercera_edad    || 0),
      regularizacion:           Number(r.regularizacion  || 0),
      por_regularizar:          Number(r.regularizacion  || 0),
      pct_descarte:             leads  > 0 ? parseFloat(((desc  / leads)  * 100).toFixed(1)) : 0,
      efectividad_activas_vs_pauta: leads > 0 ? parseFloat(((realMs / leads) * 100).toFixed(1)) : 0,
    };
  });
}

// ─── BUILDERS DE QUERIES ─────────────────────────────────────────────────────
// $1 = desde, $2 = hasta; filtros usan $3, $4, ...
function buildQueryKPI(columna, filters) {
  return `
    WITH base AS MATERIALIZED (
      SELECT
        COALESCE(mv.${columna}, 'SIN ASIGNAR') AS nombre_grupo,
        mv.id_crm, mv.id_jotform,
        mv.etapa_crm, mv.estado_venta, mv.estado_regularizacion,
        mv.fecha_creacion_crm, mv.fecha_registro_jotform,
        mv.forma_pago, mv.aplica_descuento,
        CASE WHEN UPPER(mv.etapa_crm) IN ${ETAPAS_DESCARTE} THEN 1 ELSE 0 END AS es_descarte
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (
        (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day'))
        OR
        (mv.id_jotform IS NOT NULL AND mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      ) ${filters}
    )
    SELECT
      nombre_grupo,
      COUNT(DISTINCT id_crm)                                                                                  AS leads_totales,
      COUNT(DISTINCT CASE WHEN UPPER(etapa_crm) IN ${ETAPAS_GESTIONABLES} THEN id_crm END)                   AS gestionables,
      COUNT(DISTINCT CASE WHEN UPPER(etapa_crm) = 'VENTA SUBIDA'          THEN id_crm END)                   AS ventas_crm,
      COUNT(DISTINCT CASE WHEN id_jotform IS NOT NULL
            AND fecha_registro_jotform >= $1::date AND fecha_registro_jotform < ($2::date + INTERVAL '1 day')
            THEN id_jotform END)                                                                              AS ingresos_reales,
      COUNT(DISTINCT CASE WHEN id_jotform IS NOT NULL
            AND fecha_registro_jotform >= $1::date AND fecha_registro_jotform < ($2::date + INTERVAL '1 day')
            AND estado_venta = 'ACTIVO' THEN id_jotform END)                                                 AS real_mes,
      SUM(es_descarte)                                                                                        AS descarte_count,
      COUNT(DISTINCT CASE WHEN id_jotform IS NOT NULL
            AND fecha_registro_jotform >= $1::date AND fecha_registro_jotform < ($2::date + INTERVAL '1 day')
            AND forma_pago ILIKE '%TARJETA DE CREDITO%' THEN id_jotform END)                                 AS tarjeta_credito,
      COUNT(DISTINCT CASE WHEN id_jotform IS NOT NULL
            AND fecha_registro_jotform >= $1::date AND fecha_registro_jotform < ($2::date + INTERVAL '1 day')
            AND aplica_descuento = 'TERCERA EDAD' AND estado_venta = 'ACTIVO' THEN id_jotform END)           AS tercera_edad,
      COUNT(*) FILTER (WHERE estado_regularizacion = 'POR REGULARIZAR')                                      AS regularizacion
    FROM base
    GROUP BY nombre_grupo
    ORDER BY ingresos_reales DESC, ventas_crm DESC
  `;
}

function buildQueryBacklog(columna, filters) {
  // $1 = desde, $2 = hasta (no usado), $3+ = filtros
  return `
    SELECT
      COALESCE(mv.${columna}, 'SIN ASIGNAR') AS nombre_grupo,
      COUNT(DISTINCT mv.id_jotform) AS backlog
    FROM public.mv_indicadores_velsa_completo mv
    WHERE mv.id_jotform IS NOT NULL
      AND mv.fecha_registro_jotform < $1::date
      AND mv.estado_venta = 'ACTIVO'
      ${filters}
    GROUP BY COALESCE(mv.${columna}, 'SIN ASIGNAR')
    ORDER BY backlog DESC
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 1 — DASHBOARD KPIs
// ─────────────────────────────────────────────────────────────────────────────
async function getIndicadoresDashboardVelsa(req, res) {
  try {
    const { asesor, supervisor, fechaDesde, fechaHasta, estadoNetlife, estadoRegularizacion, etapaCRM } = req.query;
    const hoy   = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    let values  = [desde, hasta];
    let filters = '';
    if (asesor)                { values.push(`%${asesor}%`);                filters += ` AND mv.asesor ILIKE $${values.length}`; }
    if (supervisor)            { values.push(`%${supervisor}%`);            filters += ` AND mv.supervisor ILIKE $${values.length}`; }
    if (estadoNetlife)         { values.push(`%${estadoNetlife}%`);         filters += ` AND mv.estado_venta ILIKE $${values.length}`; }
    if (estadoRegularizacion)  { values.push(`%${estadoRegularizacion}%`);  filters += ` AND mv.estado_regularizacion ILIKE $${values.length}`; }
    if (etapaCRM)              { values.push(`%${etapaCRM}%`);              filters += ` AND mv.etapa_crm ILIKE $${values.length}`; }

    const querySup   = buildQueryKPI('supervisor', filters);
    const queryAse   = buildQueryKPI('asesor',     filters);
    const queryBkSup = buildQueryBacklog('supervisor', filters);
    const queryBkAse = buildQueryBacklog('asesor',     filters);

    const queryEstados = `
      SELECT mv.estado_venta AS estado, COUNT(*) AS total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.estado_venta IS NOT NULL
        AND (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day')
          OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
        ${filters}
      GROUP BY mv.estado_venta ORDER BY total DESC
    `;

    const queryEmbudo = `
      SELECT COALESCE(mv.etapa_crm,'SIN ETAPA') AS etapa, COUNT(DISTINCT mv.id_crm) AS total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day')
        ${filters}
      GROUP BY mv.etapa_crm ORDER BY total DESC
    `;

    const queryPorDia = `
      SELECT
        mv.fecha_registro_jotform::date::text AS fecha,
        EXTRACT(DAY FROM mv.fecha_registro_jotform::date)::INT AS dia,
        COUNT(DISTINCT mv.id_jotform)                          AS total,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = 'ACTIVO' THEN mv.id_jotform END) AS activos
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.id_jotform IS NOT NULL
        AND mv.fecha_registro_jotform >= $1::date
        AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day')
        ${filters}
      GROUP BY mv.fecha_registro_jotform::date
      ORDER BY mv.fecha_registro_jotform::date ASC
    `;

    const queryMetas = `
      SELECT
        COUNT(DISTINCT CASE WHEN mv.aplica_descuento = 'TERCERA EDAD' AND mv.estado_venta = 'ACTIVO' THEN mv.id_jotform END) AS total_tercera_edad,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = 'ACTIVO'                                          THEN mv.id_jotform END) AS total_activos,
        COUNT(DISTINCT CASE WHEN mv.forma_pago ILIKE '%TARJETA DE CREDITO%'                          THEN mv.id_jotform END) AS total_tarjeta,
        COUNT(DISTINCT mv.id_jotform)                                                                                        AS total_jotform
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.id_jotform IS NOT NULL
        AND mv.fecha_registro_jotform >= $1::date
        AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day')
        ${filters}
    `;

    const queryCRM = `
      SELECT
        mv.id_crm AS "ID_CRM", mv.etapa_crm AS "ETAPA",
        mv.fecha_creacion_crm AS "FECHA_CREACION_CRM",
        mv.asesor AS "ASESOR", mv.supervisor AS "SUPERVISOR",
        mv.fecha_modificacion_crm AS "FECHA_MODIFICACION",
        mv.origen AS "ORIGEN", mv.estado_venta AS "ESTADO_NETLIFE",
        mv.fecha_activacion AS "FECHA_ACTIVACION",
        mv.forma_pago AS "FORMA_PAGO",
        mv.estado_regularizacion AS "ESTADO_REGULARIZACION",
        mv.aplica_descuento AS "APLICA_DESCUENTO",
        mv.id_jotform AS "ID_JOTFORM"
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day')
          OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
        ${filters}
      ORDER BY mv.fecha_creacion_crm DESC NULLS LAST
      LIMIT 6000
    `;

    // Ejecutar todo en paralelo
    const [
      resSup, resAse, resBkSup, resBkAse,
      resEstados, resEmbudo, resDia, resMetas, resCRM, etapasData,
    ] = await Promise.all([
      pool.query(querySup,   values),
      pool.query(queryAse,   values),
      pool.query(queryBkSup, values),
      pool.query(queryBkAse, values),
      pool.query(queryEstados, values),
      pool.query(queryEmbudo,  values),
      pool.query(queryPorDia,  values),
      pool.query(queryMetas,   values),
      pool.query(queryCRM,     values),
      getEtapasCache(),
    ]);

    const supervisores = mergeBacklog(resSup.rows, resBkSup.rows);
    const asesores     = mergeBacklog(resAse.rows, resBkAse.rows);

    const rowM = resMetas.rows[0] || {};
    const totTerceraEdad = Number(rowM.total_tercera_edad || 0);
    const totActivos     = Number(rowM.total_activos      || 0);
    const totTarjeta     = Number(rowM.total_tarjeta      || 0);
    const totJOT         = Number(rowM.total_jotform      || 0);
    const porcentajeTerceraEdad = totActivos > 0 ? Number(((totTerceraEdad / totActivos) * 100).toFixed(2)) : 0;
    const porcentajeTarjeta     = totJOT     > 0 ? Number(((totTarjeta     / totJOT)     * 100).toFixed(2)) : 0;

    const graficoBarrasDia = resDia.rows.map(r => ({
      fecha: r.fecha,
      dia:   Number(r.dia),
      total: Number(r.total),
      activos: Number(r.activos),
    }));

    const graficoEmbudo = resEmbudo.rows.map(r => ({
      etapa: r.etapa, total: Number(r.total), name: r.etapa, value: Number(r.total),
    }));

    const estadosNetlife = resEstados.rows.map(r => ({
      estado: r.estado, total: Number(r.total),
    }));

    const resultado = {
      success: true,
      supervisores,
      asesores,
      dataCRM:      resCRM.rows,
      dataNetlife:  resCRM.rows,
      estadosNetlife,
      etapasCRM:    etapasData.etapasCRM,
      etapasJotform: etapasData.etapasJotform,
      graficoEmbudo,
      graficoBarrasDia,
      porcentajeTarjeta:     Number(porcentajeTarjeta).toFixed(1),
      porcentajeTerceraEdad: Number(porcentajeTerceraEdad).toFixed(1),
    };

    console.log(`[DASHBOARD-VELSA] Sup:${supervisores.length} Ase:${asesores.length} CRM:${resCRM.rows.length} 3E:${porcentajeTerceraEdad}% TJC:${porcentajeTarjeta}%`);
    res.json(resultado);

  } catch (err) {
    console.error('[DASHBOARD-VELSA] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 2 — MONITOREO DIARIO
// ─────────────────────────────────────────────────────────────────────────────
async function getMonitoreoDiarioVelsa(req, res) {
  try {
    const { fechaDesde, fechaHasta } = req.query;
    const hoy   = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;
    const values = [desde, hasta];

    const buildMonitoreo = (columna) => `
      WITH base AS MATERIALIZED (
        SELECT
          COALESCE(mv.${columna}, 'SIN ASIGNAR') AS nombre_grupo,
          mv.id_crm, mv.id_jotform,
          mv.estado_venta, mv.etapa_crm, mv.forma_pago,
          mv.fecha_creacion_crm, mv.fecha_registro_jotform,
          CASE WHEN UPPER(mv.etapa_crm) IN ${ETAPAS_DESCARTE} THEN 1 ELSE 0 END AS es_descarte
        FROM public.mv_indicadores_velsa_completo mv
        WHERE (
          (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day'))
          OR
          (mv.id_jotform IS NOT NULL AND mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
        )
      )
      SELECT
        nombre_grupo,
        COUNT(DISTINCT id_crm)   AS real_mes_leads,
        COUNT(DISTINCT CASE WHEN UPPER(etapa_crm) IN ${ETAPAS_GESTIONABLES} THEN id_crm END) AS real_dia_leads,
        COUNT(DISTINCT id_crm)   AS crm_acumulado,
        COUNT(DISTINCT id_crm)   AS crm_dia,
        COUNT(DISTINCT CASE WHEN UPPER(etapa_crm) = 'VENTA SUBIDA' THEN id_crm END)          AS v_subida_crm_hoy,
        COUNT(DISTINCT CASE WHEN id_jotform IS NOT NULL
              AND fecha_registro_jotform >= $1::date AND fecha_registro_jotform < ($2::date + INTERVAL '1 day')
              THEN id_jotform END)                                                              AS v_subida_jot_hoy,
        COUNT(DISTINCT CASE WHEN id_jotform IS NOT NULL
              AND fecha_registro_jotform >= $1::date AND fecha_registro_jotform < ($2::date + INTERVAL '1 day')
              AND estado_venta = 'ACTIVO' THEN id_jotform END)                                 AS activos_jot_hoy,
        ROUND(100.0 * SUM(es_descarte) / NULLIF(COUNT(DISTINCT id_crm), 0), 1)                AS real_descarte,
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN id_jotform IS NOT NULL
              AND fecha_registro_jotform >= $1::date AND fecha_registro_jotform < ($2::date + INTERVAL '1 day')
              AND forma_pago ILIKE '%TARJETA DE CREDITO%' THEN id_jotform END)
          / NULLIF(COUNT(DISTINCT CASE WHEN id_jotform IS NOT NULL
              AND fecha_registro_jotform >= $1::date AND fecha_registro_jotform < ($2::date + INTERVAL '1 day')
              THEN id_jotform END), 0), 1)                                                     AS real_tarjeta,
        COUNT(DISTINCT CASE WHEN UPPER(etapa_crm) IN ${ETAPAS_GESTIONABLES} THEN id_crm END) AS gestionables
      FROM base
      GROUP BY nombre_grupo
      ORDER BY v_subida_jot_hoy DESC
    `;

    const [resSup, resAse] = await Promise.all([
      pool.query(buildMonitoreo('supervisor'), values),
      pool.query(buildMonitoreo('asesor'),     values),
    ]);

    res.json({ success: true, supervisores: resSup.rows, asesores: resAse.rows });

  } catch (err) {
    console.error('[MONITOREO-VELSA] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 3 — REPORTE 180 DÍAS
// ─────────────────────────────────────────────────────────────────────────────
async function getReporte180Velsa(req, res) {
  try {
    const { fechaDesde, fechaHasta, asesor, supervisor, estadoNetlife, etapaCRM } = req.query;
    const hoy   = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    let values  = [desde, hasta];
    let filters = '';
    if (asesor)      { values.push(`%${asesor}%`);      filters += ` AND mv.asesor ILIKE $${values.length}`; }
    if (supervisor)  { values.push(`%${supervisor}%`);  filters += ` AND mv.supervisor ILIKE $${values.length}`; }
    if (estadoNetlife){ values.push(`%${estadoNetlife}%`); filters += ` AND mv.estado_venta ILIKE $${values.length}`; }
    if (etapaCRM)    { values.push(`%${etapaCRM}%`);    filters += ` AND mv.etapa_crm ILIKE $${values.length}`; }

    const querySup   = buildQueryKPI('supervisor', filters);
    const queryAse   = buildQueryKPI('asesor',     filters);
    const queryBkSup = buildQueryBacklog('supervisor', filters);
    const queryBkAse = buildQueryBacklog('asesor',     filters);

    const queryEstados = `
      SELECT mv.estado_venta AS estado, COUNT(*) AS total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.estado_venta IS NOT NULL
        AND (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day')
          OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
        ${filters}
      GROUP BY mv.estado_venta ORDER BY total DESC
    `;

    const queryEmbudo = `
      SELECT COALESCE(mv.etapa_crm,'SIN ETAPA') AS etapa, COUNT(DISTINCT mv.id_crm) AS total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day')
        ${filters}
      GROUP BY mv.etapa_crm ORDER BY total DESC
    `;

    const queryMetas = `
      SELECT
        COUNT(DISTINCT CASE WHEN mv.aplica_descuento = 'TERCERA EDAD' AND mv.estado_venta = 'ACTIVO' THEN mv.id_jotform END) AS total_tercera_edad,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = 'ACTIVO' THEN mv.id_jotform END) AS total_activos,
        COUNT(DISTINCT CASE WHEN mv.forma_pago ILIKE '%TARJETA DE CREDITO%' THEN mv.id_jotform END) AS total_tarjeta,
        COUNT(DISTINCT mv.id_jotform) AS total_jotform
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.id_jotform IS NOT NULL
        AND mv.fecha_registro_jotform >= $1::date
        AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day')
        ${filters}
    `;

    const [resSup, resAse, resBkSup, resBkAse, resEstados, resEmbudo, resMetas] = await Promise.all([
      pool.query(querySup,     values),
      pool.query(queryAse,     values),
      pool.query(queryBkSup,   values),
      pool.query(queryBkAse,   values),
      pool.query(queryEstados, values),
      pool.query(queryEmbudo,  values),
      pool.query(queryMetas,   values),
    ]);

    const supervisores = mergeBacklog(resSup.rows, resBkSup.rows);
    const asesores     = mergeBacklog(resAse.rows, resBkAse.rows);

    const rowM = resMetas.rows[0] || {};
    const totActivos = Number(rowM.total_activos || 0);
    const totJOT     = Number(rowM.total_jotform || 0);
    const totTercera = Number(rowM.total_tercera_edad || 0);
    const totTarjeta = Number(rowM.total_tarjeta || 0);
    const porcentajeTerceraEdad = totActivos > 0 ? Number(((totTercera / totActivos) * 100).toFixed(2)) : 0;
    const porcentajeTarjeta     = totJOT     > 0 ? Number(((totTarjeta / totJOT)     * 100).toFixed(2)) : 0;

    const graficoEmbudo   = resEmbudo.rows.map(r => ({ etapa: r.etapa, total: Number(r.total), name: r.etapa, value: Number(r.total) }));
    const estadosNetlife  = resEstados.rows.map(r => ({ estado: r.estado, total: Number(r.total) }));

    console.log(`[REPORTE-180-VELSA] Sup:${supervisores.length} Ase:${asesores.length} 3E:${porcentajeTerceraEdad}%`);
    res.json({
      success: true,
      supervisores,
      asesores,
      estadosNetlife,
      graficoEmbudo,
      porcentajeTarjeta:     Number(porcentajeTarjeta).toFixed(1),
      porcentajeTerceraEdad: Number(porcentajeTerceraEdad).toFixed(1),
    });

  } catch (err) {
    console.error('[REPORTE-180-VELSA] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 4 — CONSULTA Y DESCARGA
// ─────────────────────────────────────────────────────────────────────────────
async function getConsultaDescargaVelsa(req, res) {
  try {
    const { fechaDesde, fechaHasta, asesor, estado } = req.query;
    const hoy   = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    let values  = [desde, hasta];
    let filters = '';
    if (asesor) { values.push(`%${asesor}%`); filters += ` AND mv.asesor ILIKE $${values.length}`; }
    if (estado) { values.push(`%${estado}%`); filters += ` AND mv.estado_venta ILIKE $${values.length}`; }

    const query = `
      SELECT
        mv.id_registro, mv.id_crm, mv.id_jotform,
        mv.asesor, mv.supervisor, mv.etapa_crm,
        mv.fecha_creacion_crm, mv.fecha_registro_jotform,
        mv.estado_venta, mv.fecha_activacion,
        mv.forma_pago, mv.estado_regularizacion, mv.aplica_descuento, mv.origen
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day')
          OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
        ${filters}
      ORDER BY mv.fecha_creacion_crm DESC NULLS LAST
      LIMIT 50000
    `;

    const result = await pool.query(query, values);
    res.json({ success: true, rows: result.rows, registros: result.rows, total: result.rows.length });

  } catch (err) {
    console.error('[CONSULTA-VELSA] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 5 — STATUS VISTA MATERIALIZADA
// ─────────────────────────────────────────────────────────────────────────────
async function getStatusMaterializedView(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)                 AS total_registros,
        COUNT(DISTINCT id_crm)   AS total_leads_crm,
        COUNT(DISTINCT id_jotform) AS total_registros_jotform,
        MAX(refresh_timestamp)   AS last_refresh,
        CURRENT_TIMESTAMP        AS current_time
      FROM public.mv_indicadores_velsa_completo
    `);
    const row = result.rows[0];
    res.json({ success: true, status: row });
  } catch (err) {
    console.error('[STATUS-MV] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 6 — DETALLE CRM DATA
// ─────────────────────────────────────────────────────────────────────────────
async function getDetalleCRMData(req, res) {
  try {
    const { fechaDesde, fechaHasta, asesor, supervisor, estadoNetlife, estadoRegularizacion, etapaCRM } = req.query;
    const hoy   = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    let values  = [desde, hasta];
    let filters = '';
    if (asesor)               { values.push(`%${asesor}%`);               filters += ` AND mv.asesor ILIKE $${values.length}`; }
    if (supervisor)           { values.push(`%${supervisor}%`);           filters += ` AND mv.supervisor ILIKE $${values.length}`; }
    if (estadoNetlife)        { values.push(`%${estadoNetlife}%`);        filters += ` AND mv.estado_venta ILIKE $${values.length}`; }
    if (estadoRegularizacion) { values.push(`%${estadoRegularizacion}%`); filters += ` AND mv.estado_regularizacion ILIKE $${values.length}`; }
    if (etapaCRM)             { values.push(`%${etapaCRM}%`);             filters += ` AND mv.etapa_crm ILIKE $${values.length}`; }

    const query = `
      SELECT
        mv.id_crm AS "ID_CRM", mv.etapa_crm AS "ETAPA",
        mv.fecha_creacion_crm AS "FECHA_CREACION_CRM",
        mv.asesor AS "ASESOR", mv.supervisor AS "SUPERVISOR",
        mv.fecha_modificacion_crm AS "FECHA_MODIFICACION",
        mv.origen AS "ORIGEN", mv.estado_venta AS "ESTADO_NETLIFE",
        mv.fecha_activacion AS "FECHA_ACTIVACION",
        mv.forma_pago AS "FORMA_PAGO",
        mv.estado_regularizacion AS "ESTADO_REGULARIZACION",
        mv.aplica_descuento AS "APLICA_DESCUENTO",
        mv.id_jotform AS "ID_JOTFORM"
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.fecha_creacion_crm >= $1::date
        AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day')
        ${filters}
      ORDER BY mv.fecha_creacion_crm DESC NULLS LAST
      LIMIT 6000
    `;

    const result = await pool.query(query, values);
    console.log(`[DETALLE-CRM-VELSA] ${desde}~${hasta} | ${result.rows.length} registros`);
    res.json({ success: true, registros: result.rows, total: result.rows.length, periodo: { desde, hasta } });

  } catch (err) {
    console.error('[DETALLE-CRM-VELSA] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 7 — ACTIVAS
// ─────────────────────────────────────────────────────────────────────────────
async function getActivasVelsa(req, res) {
  try {
    const { fechaDesde, fechaHasta, asesor, supervisor } = req.query;
    const hoy   = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    let values  = [desde, hasta];
    let filters = '';
    if (asesor)      { values.push(`%${asesor}%`);      filters += ` AND mv.asesor ILIKE $${values.length}`; }
    if (supervisor)  { values.push(`%${supervisor}%`);  filters += ` AND mv.supervisor ILIKE $${values.length}`; }

    const buildActivas = (col) => `
      SELECT COALESCE(mv.${col},'SIN ASIGNAR') AS nombre_grupo, COUNT(DISTINCT mv.id_jotform) AS activas
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.id_jotform IS NOT NULL
        AND mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day')
        AND mv.estado_venta = 'ACTIVO' ${filters}
      GROUP BY COALESCE(mv.${col},'SIN ASIGNAR') ORDER BY activas DESC
    `;

    const queryGlobal = `
      SELECT COUNT(DISTINCT mv.id_jotform) AS activas_total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.id_jotform IS NOT NULL
        AND mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day')
        AND mv.estado_venta = 'ACTIVO' ${filters}
    `;

    const [resSup, resAse, resGlobal] = await Promise.all([
      pool.query(buildActivas('supervisor'), values),
      pool.query(buildActivas('asesor'),     values),
      pool.query(queryGlobal, values),
    ]);

    res.json({ success: true, supervisores: resSup.rows, asesores: resAse.rows, global: resGlobal.rows[0], periodo: { desde, hasta } });

  } catch (err) {
    console.error('[ACTIVAS-VELSA] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 8 — BACKLOG
// ─────────────────────────────────────────────────────────────────────────────
async function getBacklogVelsa(req, res) {
  try {
    const { fechaDesde, asesor, supervisor } = req.query;
    const desde = fechaDesde || getFechaEcuador();

    let values  = [desde];
    let filters = '';
    if (asesor)      { values.push(`%${asesor}%`);      filters += ` AND mv.asesor ILIKE $${values.length}`; }
    if (supervisor)  { values.push(`%${supervisor}%`);  filters += ` AND mv.supervisor ILIKE $${values.length}`; }

    const buildBkQuery = (col) => `
      SELECT COALESCE(mv.${col},'SIN ASIGNAR') AS nombre_grupo, COUNT(DISTINCT mv.id_jotform) AS backlog
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.id_jotform IS NOT NULL AND mv.fecha_registro_jotform < $1::date AND mv.estado_venta = 'ACTIVO' ${filters}
      GROUP BY COALESCE(mv.${col},'SIN ASIGNAR') ORDER BY backlog DESC
    `;

    const queryGlobal = `
      SELECT COUNT(DISTINCT mv.id_jotform) AS backlog_total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.id_jotform IS NOT NULL AND mv.fecha_registro_jotform < $1::date AND mv.estado_venta = 'ACTIVO' ${filters}
    `;

    const [resSup, resAse, resGlobal] = await Promise.all([
      pool.query(buildBkQuery('supervisor'), values),
      pool.query(buildBkQuery('asesor'),     values),
      pool.query(queryGlobal, values),
    ]);

    res.json({ success: true, supervisores: resSup.rows, asesores: resAse.rows, global: resGlobal.rows[0], periodo: { desde } });

  } catch (err) {
    console.error('[BACKLOG-VELSA] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────
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
