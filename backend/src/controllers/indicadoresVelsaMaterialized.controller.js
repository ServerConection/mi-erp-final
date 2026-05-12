/**
 * 🚀 CONTROLADOR VELSA OPTIMIZADO - Reestructurado 2026-05-11
 * Basado en patrones de Novonet: caché, 2 lotes de queries, cálculos reales
 * Usa vista materializada mv_indicadores_velsa_completo
 */

const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// CACHÉ DE DASHBOARD (2 minutos por combinación de parámetros)
// ─────────────────────────────────────────────────────────────────────────────
const _cacheDashboard = new Map();
const CACHE_DASH_TTL_MS = 2 * 60 * 1000; // 2 minutos

const getDashboardCache = (key) => {
    const entry = _cacheDashboard.get(key);
    if (entry && Date.now() < entry.ttl) return entry.data;
    _cacheDashboard.delete(key);
    return null;
};

const setDashboardCache = (key, data) => {
    _cacheDashboard.set(key, { data, ttl: Date.now() + CACHE_DASH_TTL_MS });
    if (_cacheDashboard.size > 100) {
        const ahora = Date.now();
        for (const [k, v] of _cacheDashboard) if (ahora > v.ttl) _cacheDashboard.delete(k);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const getFechaEcuador = () => {
    const ahora = new Date();
    return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
};

const getPrimerDiaMesEcuador = () => {
    const ahora = new Date();
    const fechaEcuador = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
    return `${fechaEcuador.getFullYear()}-${String(fechaEcuador.getMonth() + 1).padStart(2, '0')}-01`;
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

const ETAPAS_DESCARTE = `(
    'NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD',
    'OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR',
    'NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA',
    'CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO','DESCARTE'
)`;

// ✅ ETAPAS GESTIONABLES - Incluye ambas variaciones (mayúsculas y mixed case) para máxima eficiencia
const ETAPAS_GESTIONABLES = `(
    'CLIENTE 2 HORAS',
    'CLIENTE 4 HORAS',
    'CLIENTE 6 HORAS',
    'CLIENTE 8 HORAS',
    'CLIENTE 12 HORAS',
    'CLIENTE CON ACUERDO',
    'CONTACTO NUEVO',
    'DESCARTE',
    'DOCUMENTOS PENDIENTES',
    'GESTION DIARIA / PENDIENTE CIERRE',
    'OPORTUNIDADES SUPERVISOR',
    'VENTA SUBIDA',
    'Venta Subida',
    'Descarte'
)`;

const ESTADO_ACTIVO = "'ACTIVO'";

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 1: DASHBOARD KPIs
// ─────────────────────────────────────────────────────────────────────────────

async function getIndicadoresDashboardVelsa(req, res) {
  try {
    const { asesor, supervisor, fechaDesde, fechaHasta, estadoNetlife, estadoRegularizacion, etapaCRM } = req.query;

    const hoy = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    // ── CACHÉ DESACTIVADO POR AHORA (para datos frescos) ──
    // const cacheKey = JSON.stringify({ asesor, supervisor, desde, hasta, estadoNetlife, estadoRegularizacion, etapaCRM });
    // const cached = getDashboardCache(cacheKey);
    // if (cached) {
    //     console.log(`[DASHBOARD-VELSA] Cache hit → ${desde}~${hasta}`);
    //     return res.json(cached);
    // }

    let values = [desde, hasta];
    let filters = "";

    if (asesor) { values.push(`%${asesor}%`); filters += ` AND mv.asesor ILIKE $${values.length}`; }
    if (supervisor) { values.push(`%${supervisor}%`); filters += ` AND mv.supervisor ILIKE $${values.length}`; }
    if (estadoNetlife) { values.push(`%${estadoNetlife}%`); filters += ` AND mv.estado_venta ILIKE $${values.length}`; }
    if (estadoRegularizacion) { values.push(`%${estadoRegularizacion}%`); filters += ` AND mv.estado_regularizacion ILIKE $${values.length}`; }
    if (etapaCRM) { values.push(`%${etapaCRM}%`); filters += ` AND mv.etapa_crm ILIKE $${values.length}`; }

    // ── LOTE 1: KPIs y agregaciones (6 queries) ──────────────────────────────
    const querySupervisores = `
      WITH base AS MATERIALIZED (
        SELECT
          mv.id_crm, mv.id_jotform, mv.supervisor,
          mv.estado_venta, mv.etapa_crm, mv.estado_regularizacion,
          mv.fecha_registro_jotform,
          CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN 1 ELSE 0 END AS es_descarte
        FROM public.mv_indicadores_velsa_completo mv
        WHERE mv.supervisor IS NOT NULL
          AND (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day')
               OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day')) ${filters}
      )
      SELECT
        base.supervisor AS nombre_grupo,
        COUNT(DISTINCT base.id_crm) AS ventas_crm,
        COUNT(*) FILTER (WHERE base.id_jotform IS NOT NULL) AS ingresos_reales,
        COUNT(*) FILTER (WHERE base.estado_venta = ${ESTADO_ACTIVO}) AS ventas_activas,
        COUNT(DISTINCT base.id_crm) AS leads_gestionables,
        COUNT(DISTINCT base.id_crm) AS leads_totales,
        COUNT(*) FILTER (WHERE base.es_descarte = 1) AS descarte,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.es_descarte = 1) / NULLIF(COUNT(DISTINCT base.id_crm), 0), 1) AS pct_descarte,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.id_jotform IS NOT NULL) / NULLIF(COUNT(DISTINCT base.id_crm), 0), 1) AS eficiencia,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.estado_venta = ${ESTADO_ACTIVO}) / NULLIF(COUNT(DISTINCT base.id_crm), 0), 1) AS tasa_instalacion,
        COUNT(*) FILTER (WHERE base.id_jotform IS NOT NULL AND base.fecha_registro_jotform < $1::date) AS backlog,
        COUNT(*) FILTER (WHERE base.estado_venta = ${ESTADO_ACTIVO}) AS real_mes,
        COUNT(DISTINCT base.id_crm) FILTER (WHERE base.etapa_crm IN ${ETAPAS_GESTIONABLES}) AS gestionables,
        COUNT(*) FILTER (WHERE base.estado_regularizacion = 'POR REGULARIZAR') AS por_regularizar,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.estado_venta = ${ESTADO_ACTIVO}) / NULLIF(COUNT(DISTINCT base.id_crm), 0), 1) AS efectividad_activas_vs_pauta
      FROM base
      GROUP BY base.supervisor
      ORDER BY ingresos_reales DESC
    `;

    const queryAsesores = `
      WITH base AS MATERIALIZED (
        SELECT
          mv.id_crm, mv.id_jotform, mv.asesor,
          mv.estado_venta, mv.etapa_crm, mv.estado_regularizacion,
          mv.fecha_registro_jotform,
          CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN 1 ELSE 0 END AS es_descarte
        FROM public.mv_indicadores_velsa_completo mv
        WHERE mv.asesor IS NOT NULL
          AND (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day')
               OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day')) ${filters}
      )
      SELECT
        base.asesor AS nombre_grupo,
        COUNT(DISTINCT base.id_crm) AS ventas_crm,
        COUNT(*) FILTER (WHERE base.id_jotform IS NOT NULL) AS ingresos_reales,
        COUNT(*) FILTER (WHERE base.estado_venta = ${ESTADO_ACTIVO}) AS ventas_activas,
        COUNT(DISTINCT base.id_crm) AS leads_gestionables,
        COUNT(DISTINCT base.id_crm) AS leads_totales,
        COUNT(*) FILTER (WHERE base.es_descarte = 1) AS descarte,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.es_descarte = 1) / NULLIF(COUNT(DISTINCT base.id_crm), 0), 1) AS pct_descarte,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.id_jotform IS NOT NULL) / NULLIF(COUNT(DISTINCT base.id_crm), 0), 1) AS eficiencia,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.estado_venta = ${ESTADO_ACTIVO}) / NULLIF(COUNT(DISTINCT base.id_crm), 0), 1) AS tasa_instalacion,
        COUNT(*) FILTER (WHERE base.id_jotform IS NOT NULL AND base.fecha_registro_jotform < $1::date) AS backlog,
        COUNT(*) FILTER (WHERE base.estado_venta = ${ESTADO_ACTIVO}) AS real_mes,
        COUNT(DISTINCT base.id_crm) FILTER (WHERE base.etapa_crm IN ${ETAPAS_GESTIONABLES}) AS gestionables,
        COUNT(*) FILTER (WHERE base.estado_regularizacion = 'POR REGULARIZAR') AS por_regularizar,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.estado_venta = ${ESTADO_ACTIVO}) / NULLIF(COUNT(DISTINCT base.id_crm), 0), 1) AS efectividad_activas_vs_pauta
      FROM base
      GROUP BY base.asesor
      ORDER BY ingresos_reales DESC
    `;

    const queryEstados = `
      SELECT mv.estado_venta AS estado, COUNT(*) AS total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.estado_venta IS NOT NULL
        AND (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      GROUP BY mv.estado_venta
      ORDER BY total DESC
    `;

    const queryEmbudo = `
      SELECT
        COALESCE(mv.etapa_crm, 'SIN ETAPA') AS etapa,
        COUNT(DISTINCT mv.id_crm) AS total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      GROUP BY mv.etapa_crm
      ORDER BY total DESC
    `;

    const queryPorDia = `
      SELECT
        EXTRACT(DAY FROM COALESCE(mv.fecha_registro_jotform::date, mv.fecha_creacion_crm::date)) AS dia,
        COUNT(DISTINCT mv.id_jotform) AS total,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS activos
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      GROUP BY dia
      ORDER BY dia ASC
    `;

    const queryMetasGlobales = `
      SELECT
        COUNT(DISTINCT CASE WHEN mv.aplica_descuento = 'TERCERA EDAD' AND mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS total_tercera_edad,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS total_activos,
        COUNT(DISTINCT CASE WHEN mv.forma_pago ILIKE '%TARJETA DE CREDITO%' THEN mv.id_jotform END) AS total_tarjeta,
        COUNT(DISTINCT mv.id_jotform) AS total_jotform
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day')) ${filters}
    `;

    const [resSup, resAses, resEstados, resEmbudo, resDia, resMetasGlobales] = await Promise.all([
      pool.query(querySupervisores, values),
      pool.query(queryAsesores, values),
      pool.query(queryEstados, values),
      pool.query(queryEmbudo, values),
      pool.query(queryPorDia, values),
      pool.query(queryMetasGlobales, values),
    ]);

    // ── LOTE 2: Tablas detalle (espera al lote 1 para no saturar pool) ──────
    const queryCRM = `
      SELECT
        mv.id_crm AS "ID_CRM",
        mv.etapa_crm AS "ETAPA",
        mv.fecha_creacion_crm AS "FECHA_CREACION",
        mv.asesor AS "ASESOR",
        mv.supervisor AS "SUPERVISOR",
        mv.fecha_modificacion_crm AS "FECHA_MODIFICACION",
        mv.origen AS "ORIGEN",
        mv.estado_venta AS "ESTADO_NETLIFE",
        mv.fecha_activacion AS "FECHA_ACTIVACION",
        mv.forma_pago AS "FORMA_PAGO",
        mv.estado_regularizacion AS "ESTADO_REGULARIZACION",
        mv.aplica_descuento AS "APLICA_DESCUENTO"
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day')) ${filters}
      LIMIT 6000
    `;

    const queryEtapas = `
      SELECT mv.etapa_crm AS etapa, COUNT(*) AS total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day')) ${filters}
      GROUP BY mv.etapa_crm
      ORDER BY total DESC
    `;

    const [resCRM, resEtapas] = await Promise.all([
      pool.query(queryCRM, values),
      pool.query(queryEtapas, values),
    ]);

    // ── Calcular porcentajes ──────────────────────────────────────────────────
    const rowMetas = resMetasGlobales.rows[0] || {};
    const totalTerceraEdad    = Number(rowMetas.total_tercera_edad || 0);
    const totalActivosTercera = Number(rowMetas.total_activos       || 0);
    const totalTarjeta        = Number(rowMetas.total_tarjeta       || 0);
    const totalJotformTarjeta = Number(rowMetas.total_jotform       || 0);

    const porcentajeTerceraEdad = totalActivosTercera > 0 ? Number(((totalTerceraEdad / totalActivosTercera) * 100).toFixed(2)) : 0;
    const porcentajeTarjeta = totalJotformTarjeta > 0 ? Number(((totalTarjeta / totalJotformTarjeta) * 100).toFixed(2)) : 0;

    // ── Formatear respuesta ──────────────────────────────────────────────────
    const estadosNetlife = resEstados.rows.map(r => ({
      estado: r.estado,
      total: Number(r.total || 0),
    }));

    const graficoEmbudo = resEmbudo.rows.map(r => ({
      name: r.etapa,
      value: Number(r.total || 0),
      etapa: r.etapa,
      total: Number(r.total || 0),
    }));

    const graficoBarrasDia = resDia.rows.map(r => ({
      dia: Number(r.dia),
      total: Number(r.total),
      activos: Number(r.activos),
    }));

    const resultado = {
      success: true,
      supervisores: resSup.rows,
      asesores: resAses.rows,
      dataCRM: resCRM.rows,
      dataNetlife: resCRM.rows,
      estadosNetlife,
      etapasCRM: resEtapas.rows,
      graficoEmbudo,
      graficoBarrasDia,
      porcentajeTarjeta: Number(porcentajeTarjeta).toFixed(1),
      porcentajeTerceraEdad: Number(porcentajeTerceraEdad).toFixed(1),
    };

    // ── Guardar en caché (DESACTIVADO POR AHORA) ─────────────────────────────
    // setDashboardCache(cacheKey, resultado);
    console.log(`[DASHBOARD-VELSA] Supervisores: ${resSup.rows.length} | Asesores: ${resAses.rows.length} | CRM: ${resCRM.rows.length} | Etapas: ${resEtapas.rows.length} | 3ra Edad: ${porcentajeTerceraEdad}% | Tarjeta: ${porcentajeTarjeta}%`);
    res.json(resultado);

  } catch (err) {
    console.error('[INDICADORES-VELSA-MV] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 2: MONITOREO DIARIO
// ─────────────────────────────────────────────────────────────────────────────

async function getMonitoreoDiarioVelsa(req, res) {
  try {
    const { fechaDesde, fechaHasta } = req.query;
    const hoy = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    const values = [desde, hasta];

    const querySupervisores = `
      WITH base AS MATERIALIZED (
        SELECT
          mv.id_crm, mv.id_jotform, mv.supervisor,
          mv.estado_venta, mv.etapa_crm, mv.forma_pago,
          mv.fecha_registro_jotform,
          CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN 1 ELSE 0 END AS es_descarte
        FROM public.mv_indicadores_velsa_completo mv
        WHERE mv.supervisor IS NOT NULL
          AND (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day')
               OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      )
      SELECT
        base.supervisor AS nombre_grupo,
        COUNT(DISTINCT base.id_jotform) AS real_dia_leads,
        COUNT(DISTINCT base.id_crm) AS crm_dia,
        COUNT(*) FILTER (WHERE base.estado_venta = ${ESTADO_ACTIVO}) AS v_subida_jot_hoy,
        COUNT(*) FILTER (WHERE base.es_descarte = 1) AS real_descarte_count,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.es_descarte = 1) / NULLIF(COUNT(DISTINCT base.id_crm), 0), 1) AS real_descarte,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.forma_pago ILIKE '%TARJETA DE CREDITO%') / NULLIF(COUNT(DISTINCT base.id_jotform), 0), 1) AS real_tarjeta,
        COUNT(DISTINCT base.id_crm) AS crm_acumulado,
        COUNT(*) FILTER (WHERE base.estado_venta = ${ESTADO_ACTIVO}) AS activos_jot_hoy,
        COUNT(DISTINCT base.id_crm) AS v_subida_crm_hoy,
        COUNT(DISTINCT base.id_crm) AS real_mes_leads,
        COUNT(*) FILTER (WHERE base.id_jotform IS NOT NULL AND base.fecha_registro_jotform < $1::date) AS backlog,
        COUNT(DISTINCT base.id_crm) FILTER (WHERE base.etapa_crm IN ${ETAPAS_GESTIONABLES}) AS gestionables
      FROM base
      GROUP BY base.supervisor
      ORDER BY real_dia_leads DESC
    `;

    const queryAsesores = `
      WITH base AS MATERIALIZED (
        SELECT
          mv.id_crm, mv.id_jotform, mv.asesor,
          mv.estado_venta, mv.etapa_crm, mv.forma_pago,
          mv.fecha_registro_jotform,
          CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN 1 ELSE 0 END AS es_descarte
        FROM public.mv_indicadores_velsa_completo mv
        WHERE mv.asesor IS NOT NULL
          AND (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day')
               OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      )
      SELECT
        base.asesor AS nombre_grupo,
        COUNT(DISTINCT base.id_jotform) AS real_dia_leads,
        COUNT(DISTINCT base.id_crm) AS crm_dia,
        COUNT(*) FILTER (WHERE base.estado_venta = ${ESTADO_ACTIVO}) AS v_subida_jot_hoy,
        COUNT(*) FILTER (WHERE base.es_descarte = 1) AS real_descarte_count,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.es_descarte = 1) / NULLIF(COUNT(DISTINCT base.id_crm), 0), 1) AS real_descarte,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.forma_pago ILIKE '%TARJETA DE CREDITO%') / NULLIF(COUNT(DISTINCT base.id_jotform), 0), 1) AS real_tarjeta,
        COUNT(DISTINCT base.id_crm) AS crm_acumulado,
        COUNT(*) FILTER (WHERE base.estado_venta = ${ESTADO_ACTIVO}) AS activos_jot_hoy,
        COUNT(DISTINCT base.id_crm) AS v_subida_crm_hoy,
        COUNT(DISTINCT base.id_crm) AS real_mes_leads,
        COUNT(*) FILTER (WHERE base.id_jotform IS NOT NULL AND base.fecha_registro_jotform < $1::date) AS backlog,
        COUNT(DISTINCT base.id_crm) FILTER (WHERE base.etapa_crm IN ${ETAPAS_GESTIONABLES}) AS gestionables
      FROM base
      GROUP BY base.asesor
      ORDER BY real_dia_leads DESC
    `;

    const [supResult, aseResult] = await Promise.all([
      pool.query(querySupervisores, values),
      pool.query(queryAsesores, values)
    ]);

    res.json({
      success: true,
      supervisores: supResult.rows,
      asesores: aseResult.rows
    });

  } catch (err) {
    console.error('[MONITOREO-DIARIO-MV] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 3: REPORTE 180 DIAS (estructura completa: supervisores, asesores, dataCRM, gráficos)
// ─────────────────────────────────────────────────────────────────────────────

async function getReporte180Velsa(req, res) {
  try {
    const { fechaDesde, fechaHasta } = req.query;
    const hoy = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    const values = [desde, hasta];

    // ── LOTE 1: KPIs y agregaciones ──────────────────────────────
    const querySupervisores = `
      WITH base AS MATERIALIZED (
        SELECT
          mv.id_crm, mv.id_jotform, mv.supervisor,
          mv.estado_venta, mv.etapa_crm, mv.forma_pago, mv.aplica_descuento,
          CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN 1 ELSE 0 END AS es_descarte
        FROM public.mv_indicadores_velsa_completo mv
        WHERE mv.supervisor IS NOT NULL
          AND (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day')
               OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      )
      SELECT
        base.supervisor AS nombre_grupo,
        COUNT(DISTINCT base.id_crm) AS ventas_crm,
        COUNT(*) FILTER (WHERE base.id_jotform IS NOT NULL) AS ingresos_reales,
        COUNT(*) FILTER (WHERE base.estado_venta = ${ESTADO_ACTIVO}) AS ventas_activas,
        COUNT(DISTINCT base.id_crm) AS leads_gestionables,
        COUNT(DISTINCT base.id_crm) AS leads_totales,
        COUNT(*) FILTER (WHERE base.es_descarte = 1) AS descarte,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.es_descarte = 1) / NULLIF(COUNT(DISTINCT base.id_crm), 0), 1) AS pct_descarte,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.id_jotform IS NOT NULL) / NULLIF(COUNT(DISTINCT base.id_crm), 0), 1) AS eficiencia,
        COUNT(*) FILTER (WHERE base.forma_pago ILIKE '%TARJETA DE CREDITO%') AS tarjeta,
        COUNT(*) FILTER (WHERE base.aplica_descuento = 'TERCERA EDAD') AS tercera_edad
      FROM base
      GROUP BY base.supervisor
      ORDER BY ventas_crm DESC
    `;

    const queryAsesores = `
      WITH base AS MATERIALIZED (
        SELECT
          mv.id_crm, mv.id_jotform, mv.asesor,
          mv.estado_venta, mv.etapa_crm, mv.forma_pago, mv.aplica_descuento,
          CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN 1 ELSE 0 END AS es_descarte
        FROM public.mv_indicadores_velsa_completo mv
        WHERE mv.asesor IS NOT NULL
          AND (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day')
               OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      )
      SELECT
        base.asesor AS nombre_grupo,
        COUNT(DISTINCT base.id_crm) AS ventas_crm,
        COUNT(*) FILTER (WHERE base.id_jotform IS NOT NULL) AS ingresos_reales,
        COUNT(*) FILTER (WHERE base.estado_venta = ${ESTADO_ACTIVO}) AS ventas_activas,
        COUNT(DISTINCT base.id_crm) AS leads_gestionables,
        COUNT(DISTINCT base.id_crm) AS leads_totales,
        COUNT(*) FILTER (WHERE base.es_descarte = 1) AS descarte,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.es_descarte = 1) / NULLIF(COUNT(DISTINCT base.id_crm), 0), 1) AS pct_descarte,
        ROUND(100.0 * COUNT(*) FILTER (WHERE base.id_jotform IS NOT NULL) / NULLIF(COUNT(DISTINCT base.id_crm), 0), 1) AS eficiencia,
        COUNT(*) FILTER (WHERE base.forma_pago ILIKE '%TARJETA DE CREDITO%') AS tarjeta,
        COUNT(*) FILTER (WHERE base.aplica_descuento = 'TERCERA EDAD') AS tercera_edad
      FROM base
      GROUP BY base.asesor
      ORDER BY ventas_crm DESC
    `;

    const queryEstados = `
      SELECT
        mv.estado_venta AS estado,
        COUNT(*) AS total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      GROUP BY mv.estado_venta
      ORDER BY total DESC
    `;

    const queryEmbudo = `
      SELECT
        mv.etapa_crm AS etapa,
        COUNT(*) AS total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      GROUP BY mv.etapa_crm
      ORDER BY total DESC
    `;

    const queryPorDia = `
      SELECT
        EXTRACT(DAY FROM mv.fecha_creacion_crm)::INT AS dia,
        COUNT(DISTINCT mv.id_crm) AS total,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS activos
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      GROUP BY EXTRACT(DAY FROM mv.fecha_creacion_crm)
      ORDER BY dia
    `;

    const queryMetasGlobales = `
      SELECT
        COUNT(DISTINCT CASE WHEN mv.aplica_descuento = 'TERCERA EDAD' AND mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS total_tercera_edad,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS total_activos,
        COUNT(DISTINCT CASE WHEN mv.forma_pago ILIKE '%TARJETA DE CREDITO%' THEN mv.id_jotform END) AS total_tarjeta,
        COUNT(DISTINCT mv.id_jotform) AS total_jotform
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
    `;

    const [resSup, resAses, resEstados, resEmbudo, resDia, resMetasGlobales] = await Promise.all([
      pool.query(querySupervisores, values),
      pool.query(queryAsesores, values),
      pool.query(queryEstados, values),
      pool.query(queryEmbudo, values),
      pool.query(queryPorDia, values),
      pool.query(queryMetasGlobales, values),
    ]);

    // ── LOTE 2: Tablas detalle ──────
    const queryCRM = `
      SELECT
        mv.id_crm AS "ID_CRM",
        mv.etapa_crm AS "ETAPA",
        mv.fecha_creacion_crm AS "FECHA_CREACION",
        mv.asesor AS "ASESOR",
        mv.supervisor AS "SUPERVISOR",
        mv.fecha_modificacion_crm AS "FECHA_MODIFICACION",
        mv.origen AS "ORIGEN",
        mv.estado_venta AS "ESTADO_NETLIFE",
        mv.fecha_activacion AS "FECHA_ACTIVACION",
        mv.forma_pago AS "FORMA_PAGO",
        mv.estado_regularizacion AS "ESTADO_REGULARIZACION",
        mv.aplica_descuento AS "APLICA_DESCUENTO"
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      LIMIT 6000
    `;

    const [resCRM] = await Promise.all([
      pool.query(queryCRM, values),
    ]);

    // ── Calcular porcentajes ──────────────────────────────────────────────────
    const rowMetas = resMetasGlobales.rows[0] || {};
    const totalTerceraEdad    = Number(rowMetas.total_tercera_edad || 0);
    const totalActivosTercera = Number(rowMetas.total_activos       || 0);
    const totalTarjeta        = Number(rowMetas.total_tarjeta       || 0);
    const totalJotformTarjeta = Number(rowMetas.total_jotform       || 0);

    const porcentajeTerceraEdad = totalActivosTercera > 0 ? Number(((totalTerceraEdad / totalActivosTercera) * 100).toFixed(2)) : 0;
    const porcentajeTarjeta = totalJotformTarjeta > 0 ? Number(((totalTarjeta / totalJotformTarjeta) * 100).toFixed(2)) : 0;

    // ── Formatear respuesta ──────────────────────────────────────────────────
    const estadosNetlife = resEstados.rows.map(r => ({
      estado: r.estado,
      total: Number(r.total || 0),
    }));

    const graficoEmbudo = resEmbudo.rows.map(r => ({
      name: r.etapa,
      value: Number(r.total || 0),
      etapa: r.etapa,
      total: Number(r.total || 0),
    }));

    const graficoBarrasDia = resDia.rows.map(r => ({
      dia: Number(r.dia),
      total: Number(r.total),
      activos: Number(r.activos),
    }));

    const resultado = {
      success: true,
      supervisores: resSup.rows,
      asesores: resAses.rows,
      dataCRM: resCRM.rows,
      dataNetlife: resCRM.rows,
      estadosNetlife,
      graficoEmbudo,
      graficoBarrasDia,
      porcentajeTarjeta: Number(porcentajeTarjeta).toFixed(1),
      porcentajeTerceraEdad: Number(porcentajeTerceraEdad).toFixed(1),
    };

    console.log(`[REPORTE-180-VELSA] Supervisores: ${resSup.rows.length} | Asesores: ${resAses.rows.length} | CRM: ${resCRM.rows.length} | 3ra Edad: ${porcentajeTerceraEdad}% | Tarjeta: ${porcentajeTarjeta}%`);
    res.json(resultado);

  } catch (err) {
    console.error('[REPORTE-180-MV] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 4: CONSULTA Y DESCARGA
// ─────────────────────────────────────────────────────────────────────────────

async function getConsultaDescargaVelsa(req, res) {
  try {
    const { fechaDesde, fechaHasta, asesor, estado } = req.query;
    const hoy = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    let values = [desde, hasta];
    let filters = "";

    if (asesor) {
      values.push(`%${asesor}%`);
      filters += ` AND mv.asesor ILIKE $${values.length}`;
    }

    if (estado) {
      values.push(`%${estado}%`);
      filters += ` AND mv.estado_venta ILIKE $${values.length}`;
    }

    const query = `
      SELECT
        mv.id_registro AS id_consulta,
        mv.id_crm,
        mv.id_jotform,
        mv.asesor,
        mv.supervisor,
        mv.etapa_crm,
        mv.fecha_creacion_crm AS fecha_creacion_crm,
        mv.fecha_registro_jotform AS fecha_registro_jotform,
        mv.estado_venta,
        mv.fecha_activacion AS fecha_activacion,
        mv.forma_pago,
        mv.estado_regularizacion,
        mv.aplica_descuento
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day')) ${filters}
      ORDER BY mv.fecha_creacion_crm DESC NULLS LAST
      LIMIT 50000
    `;

    const result = await pool.query(query, values);
    res.json({
      success: true,
      registros: result.rows,
      total: result.rows.length,
      dataNetlife: result.rows
    });

  } catch (err) {
    console.error('[CONSULTA-DESCARGA-MV] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 5: STATUS DE LA VISTA MATERIALIZADA
// ─────────────────────────────────────────────────────────────────────────────

async function getStatusMaterializedView(req, res) {
  try {
    const query = `
      SELECT
        COUNT(*) AS total_registros,
        COUNT(DISTINCT id_crm) AS total_leads_crm,
        COUNT(DISTINCT id_jotform) AS total_registros_jotform,
        MIN(refresh_timestamp) AS first_refresh,
        MAX(refresh_timestamp) AS last_refresh,
        CURRENT_TIMESTAMP AS current_time
      FROM public.mv_indicadores_velsa_completo
    `;

    const result = await pool.query(query);
    const row = result.rows[0];
    res.json({
      success: true,
      status: {
        total_registros: row.total_registros,
        total_leads_crm: row.total_leads_crm,
        total_registros_jotform: row.total_registros_jotform,
        last_refresh: row.last_refresh,
        current_time: row.current_time
      }
    });

  } catch (err) {
    console.error('[STATUS-MV] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT 6: DETALLE CRM DATA (Solo CRM, sin Jotform)
// ─────────────────────────────────────────────────────────────────────────────

async function getDetalleCRMData(req, res) {
  try {
    const { fechaDesde, fechaHasta, asesor, supervisor, estadoNetlife, estadoRegularizacion, etapaCRM } = req.query;

    const hoy = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    let values = [desde, hasta];
    let filters = "";

    if (asesor) {
      values.push(`%${asesor}%`);
      filters += ` AND mv.asesor ILIKE $${values.length}`;
    }

    if (supervisor) {
      values.push(`%${supervisor}%`);
      filters += ` AND mv.supervisor ILIKE $${values.length}`;
    }

    if (estadoNetlife) {
      values.push(`%${estadoNetlife}%`);
      filters += ` AND mv.estado_venta ILIKE $${values.length}`;
    }

    if (estadoRegularizacion) {
      values.push(`%${estadoRegularizacion}%`);
      filters += ` AND mv.estado_regularizacion ILIKE $${values.length}`;
    }

    if (etapaCRM) {
      values.push(`%${etapaCRM}%`);
      filters += ` AND mv.etapa_crm ILIKE $${values.length}`;
    }

    // ✅ QUERY SOLO CRM - Filtrado ÚNICAMENTE por fecha_creacion_crm
    const query = `
      SELECT
        mv.id_crm AS "ID_CRM",
        mv.etapa_crm AS "ETAPA",
        mv.fecha_creacion_crm AS "FECHA_CREACION",
        mv.asesor AS "ASESOR",
        mv.supervisor AS "SUPERVISOR",
        mv.fecha_modificacion_crm AS "FECHA_MODIFICACION",
        mv.origen AS "ORIGEN",
        mv.estado_venta AS "ESTADO_NETLIFE",
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

    console.log(`[DETALLE-CRM] Período: ${desde}~${hasta} | Registros: ${result.rows.length}`);

    res.json({
      success: true,
      registros: result.rows,
      total: result.rows.length,
      periodo: { desde, hasta }
    });

  } catch (err) {
    console.error('[DETALLE-CRM] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  getIndicadoresDashboardVelsa,
  getMonitoreoDiarioVelsa,
  getReporte180Velsa,
  getConsultaDescargaVelsa,
  getStatusMaterializedView,
  getDetalleCRMData,
};
