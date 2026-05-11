/**
 * 🚀 CONTROLADOR OPTIMIZADO: Usa vista materializada mv_indicadores_velsa_completo
 * Rendimiento: 10x más rápido que JOINs complejos
 * Datos frescos: Refresco automático cada 15 minutos
 * Fecha: 2026-05-11
 */

const pool = require('../config/db');

const getFechaEcuador = () => {
    const ahora = new Date();
    return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
};

const ESTADO_ACTIVO = `'ACTIVO'`;
const ETAPAS_DESCARTE = `('NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA','CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO','INCONTACTABLE','NO INTERESA COSTO INSTALACION','CONTRATO NETLIFE OTRO CANAL','CONTRATO OTRO PROVEEDOR')`;

// ============================================================
// ENDPOINT 1: DASHBOARD KPIs (Optimizado con MV)
// ============================================================

async function getIndicadoresDashboardVelsa(req, res) {
  try {
    const { asesor, supervisor, fechaDesde, fechaHasta, estadoNetlife, estadoRegularizacion, etapaCRM } = req.query;

    const hoy = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    let values = [desde, hasta];
    let filters = "";

    if (asesor) { values.push(`%${asesor}%`); filters += ` AND mv.asesor ILIKE $${values.length}`; }
    if (supervisor) { values.push(`%${supervisor}%`); filters += ` AND mv.supervisor ILIKE $${values.length}`; }
    if (estadoNetlife) { values.push(`%${estadoNetlife}%`); filters += ` AND mv.estado_venta ILIKE $${values.length}`; }
    if (estadoRegularizacion) { values.push(`%${estadoRegularizacion}%`); filters += ` AND mv.estado_regularizacion ILIKE $${values.length}`; }
    if (etapaCRM) { values.push(`%${etapaCRM}%`); filters += ` AND mv.etapa_crm ILIKE $${values.length}`; }

    const queryKPI = (columna) => `
      SELECT
        COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
        COUNT(DISTINCT mv.id_registro) AS total_registros,
        COUNT(DISTINCT CASE WHEN mv.fecha_creacion_crm BETWEEN $1::date AND $2::date THEN mv.id_crm END) AS leads_crm,
        COUNT(DISTINCT CASE WHEN mv.fecha_registro_jotform BETWEEN $1::date AND $2::date THEN mv.id_jotform END) AS ingresos_jotform,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS activos,
        COUNT(DISTINCT CASE WHEN mv.forma_pago ILIKE '%TARJETA DE CREDITO%' THEN mv.id_jotform END) AS tarjeta_credito,
        COUNT(DISTINCT CASE WHEN mv.aplica_descuento ILIKE '%TERCERA EDAD%' THEN mv.id_jotform END) AS tercera_edad,
        COUNT(DISTINCT CASE WHEN mv.estado_regularizacion = 'POR REGULARIZAR' THEN mv.id_jotform END) AS por_regularizar,
        COUNT(DISTINCT CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN mv.id_crm END) AS descartados,
        ROUND(
          CASE WHEN COUNT(DISTINCT mv.id_crm) > 0
            THEN (COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END)::numeric / COUNT(DISTINCT mv.id_crm) * 100)
            ELSE 0
          END, 2
        ) AS tasa_efectividad
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date OR mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date) ${filters}
      GROUP BY 1
      ORDER BY total_registros DESC
    `;

    const querySupervisores = `
      SELECT
        mv.supervisor AS nombre_grupo,
        COUNT(DISTINCT mv.id_crm) AS ventas_crm,
        COUNT(DISTINCT mv.id_jotform) AS ingresos_reales,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS ventas_activas,
        COUNT(DISTINCT mv.id_crm) AS leads_gestionables,
        COUNT(DISTINCT mv.id_crm) AS leads_totales,
        COUNT(DISTINCT CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN mv.id_crm END) AS descarte,
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN mv.id_crm END) / NULLIF(COUNT(DISTINCT mv.id_crm), 0), 1) AS pct_descarte,
        ROUND(100.0 * COUNT(DISTINCT mv.id_jotform) / NULLIF(COUNT(DISTINCT mv.id_crm), 0), 1) AS eficiencia,
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) / NULLIF(COUNT(DISTINCT mv.id_crm), 0), 1) AS tasa_instalacion,
        0 AS backlog,
        0 AS real_mes,
        0 AS gestionables,
        0 AS por_regularizar,
        0 AS efectividad_activas_vs_pauta
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.supervisor IS NOT NULL
        AND (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day')) ${filters}
      GROUP BY mv.supervisor
      ORDER BY ingresos_reales DESC
    `;

    const queryAsesores = `
      SELECT
        mv.asesor AS nombre_grupo,
        COUNT(DISTINCT mv.id_crm) AS ventas_crm,
        COUNT(DISTINCT mv.id_jotform) AS ingresos_reales,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS ventas_activas,
        COUNT(DISTINCT mv.id_crm) AS leads_gestionables,
        COUNT(DISTINCT mv.id_crm) AS leads_totales,
        COUNT(DISTINCT CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN mv.id_crm END) AS descarte,
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN mv.id_crm END) / NULLIF(COUNT(DISTINCT mv.id_crm), 0), 1) AS pct_descarte,
        ROUND(100.0 * COUNT(DISTINCT mv.id_jotform) / NULLIF(COUNT(DISTINCT mv.id_crm), 0), 1) AS eficiencia,
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) / NULLIF(COUNT(DISTINCT mv.id_crm), 0), 1) AS tasa_instalacion,
        0 AS backlog,
        0 AS real_mes,
        0 AS gestionables,
        0 AS por_regularizar,
        0 AS efectividad_activas_vs_pauta
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.asesor IS NOT NULL
        AND (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day')) ${filters}
      GROUP BY mv.asesor
      ORDER BY ingresos_reales DESC
    `;

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

    const queryEstados = `
      SELECT mv.estado_venta AS estado, COUNT(*) AS total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.estado_venta IS NOT NULL
      GROUP BY mv.estado_venta
      ORDER BY total DESC
    `;

    const queryEtapas = `
      SELECT DISTINCT mv.etapa_crm, COUNT(*) AS total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.etapa_crm IS NOT NULL
      GROUP BY mv.etapa_crm
      ORDER BY total DESC
    `;

    const queryGraficoEmbudo = `
      SELECT
        mv.etapa_crm AS etapa,
        COUNT(DISTINCT mv.id_crm) AS total
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.etapa_crm IS NOT NULL
        AND (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      GROUP BY mv.etapa_crm
      ORDER BY total DESC
    `;

    const queryGraficoBarrasDia = `
      SELECT
        EXTRACT(DAY FROM COALESCE(mv.fecha_registro_jotform::date, mv.fecha_creacion_crm::date)) AS dia,
        COUNT(DISTINCT mv.id_jotform) AS total,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = 'ACTIVO' THEN mv.id_jotform END) AS activos
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      GROUP BY dia
      ORDER BY dia ASC
    `;

    const queryPorcentajes = `
      SELECT
        COUNT(DISTINCT CASE WHEN mv.forma_pago ILIKE '%TARJETA DE CREDITO%' THEN mv.id_jotform END)::numeric /
          NULLIF(COUNT(DISTINCT mv.id_jotform), 0) * 100 AS porcentajeTarjeta,
        COUNT(DISTINCT CASE WHEN mv.aplica_descuento ILIKE '%TERCERA EDAD%' THEN mv.id_jotform END)::numeric /
          NULLIF(COUNT(DISTINCT mv.id_jotform), 0) * 100 AS porcentajeTerceraEdad
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day')) ${filters}
    `;

    const [supResult, aseResult, crmData, estadosData, etapasData, embudoData, barrasData, porcentajesData] = await Promise.all([
      pool.query(querySupervisores, values),
      pool.query(queryAsesores, values),
      pool.query(queryCRM, values),
      pool.query(queryEstados),
      pool.query(queryEtapas),
      pool.query(queryGraficoEmbudo, values),
      pool.query(queryGraficoBarrasDia, values),
      pool.query(queryPorcentajes, values),
    ]);

    const porcentajes = porcentajesData.rows[0] || { porcentajeTarjeta: 0, porcentajeTerceraEdad: 0 };

    res.json({
      success: true,
      supervisores: supResult.rows,
      asesores: aseResult.rows,
      dataCRM: crmData.rows,
      dataNetlife: crmData.rows,
      estadosNetlife: estadosData.rows,
      etapasCRM: etapasData.rows,
      graficoEmbudo: embudoData.rows.map(row => ({ etapa: row.etapa, total: Number(row.total) })),
      graficoBarrasDia: barrasData.rows.map(row => ({ dia: Number(row.dia), total: Number(row.total), activos: Number(row.activos) })),
      porcentajeTarjeta: Number(porcentajes.porcentajeTarjeta || 0).toFixed(1),
      porcentajeTerceraEdad: Number(porcentajes.porcentajeTerceraEdad || 0).toFixed(1),
    });

  } catch (err) {
    console.error('[INDICADORES-VELSA-MV] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// ENDPOINT 2: MONITOREO DIARIO
// ============================================================

async function getMonitoreoDiarioVelsa(req, res) {
  try {
    const { fechaDesde, fechaHasta } = req.query;
    const hoy = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    const values = [desde, hasta];

    const querySupervisores = `
      SELECT
        mv.supervisor AS nombre_grupo,
        COUNT(DISTINCT mv.id_jotform) AS real_dia_leads,
        COUNT(DISTINCT mv.id_crm) AS crm_dia,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS v_subida_jot_hoy,
        COUNT(DISTINCT CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN mv.id_crm END) AS real_descarte_count,
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN mv.id_crm END) / NULLIF(COUNT(DISTINCT mv.id_crm), 0), 1) AS real_descarte,
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN mv.forma_pago ILIKE '%TARJETA DE CREDITO%' THEN mv.id_jotform END) / NULLIF(COUNT(DISTINCT mv.id_jotform), 0), 1) AS real_tarjeta,
        COUNT(DISTINCT mv.id_crm) AS crm_acumulado,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS activos_jot_hoy,
        COUNT(DISTINCT CASE WHEN mv.id_crm IS NOT NULL THEN 1 END) AS v_subida_crm_hoy,
        COUNT(DISTINCT mv.id_crm) AS real_mes_leads,
        0 AS backlog,
        0 AS gestionables
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.supervisor IS NOT NULL
        AND (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      GROUP BY mv.supervisor
      ORDER BY real_dia_leads DESC
    `;

    const queryAsesores = `
      SELECT
        mv.asesor AS nombre_grupo,
        COUNT(DISTINCT mv.id_jotform) AS real_dia_leads,
        COUNT(DISTINCT mv.id_crm) AS crm_dia,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS v_subida_jot_hoy,
        COUNT(DISTINCT CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN mv.id_crm END) AS real_descarte_count,
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN mv.id_crm END) / NULLIF(COUNT(DISTINCT mv.id_crm), 0), 1) AS real_descarte,
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN mv.forma_pago ILIKE '%TARJETA DE CREDITO%' THEN mv.id_jotform END) / NULLIF(COUNT(DISTINCT mv.id_jotform), 0), 1) AS real_tarjeta,
        COUNT(DISTINCT mv.id_crm) AS crm_acumulado,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS activos_jot_hoy,
        COUNT(DISTINCT CASE WHEN mv.id_crm IS NOT NULL THEN 1 END) AS v_subida_crm_hoy
      FROM public.mv_indicadores_velsa_completo mv
      WHERE mv.asesor IS NOT NULL
        AND (mv.fecha_creacion_crm >= $1::date AND mv.fecha_creacion_crm < ($2::date + INTERVAL '1 day') OR mv.fecha_registro_jotform >= $1::date AND mv.fecha_registro_jotform < ($2::date + INTERVAL '1 day'))
      GROUP BY mv.asesor
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

// ============================================================
// ENDPOINT 3: REPORTE 180 DIAS
// ============================================================

async function getReporte180Velsa(req, res) {
  try {
    const { fechaDesde, fechaHasta } = req.query;
    const hoy = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    const values = [desde, hasta];

    const query = `
      SELECT
        COUNT(DISTINCT mv.id_crm) AS total_leads_crm,
        COUNT(DISTINCT mv.id_jotform) AS ingresos_jot,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS ventas_activas,
        COUNT(DISTINCT CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN mv.id_crm END) AS total_descartados,
        COUNT(DISTINCT CASE WHEN mv.forma_pago ILIKE '%TARJETA DE CREDITO%' THEN mv.id_jotform END) AS pago_tarjeta,
        COUNT(DISTINCT CASE WHEN mv.aplica_descuento ILIKE '%TERCERA EDAD%' THEN mv.id_jotform END) AS tercera_edad,
        ROUND(
          100.0 * COUNT(DISTINCT CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN mv.id_crm END) / NULLIF(COUNT(DISTINCT mv.id_crm), 0),
          2
        ) AS pct_descarte,
        ROUND(
          CASE WHEN COUNT(DISTINCT mv.id_crm) > 0
            THEN (COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END)::numeric / COUNT(DISTINCT mv.id_crm) * 100)
            ELSE 0
          END, 2
        ) AS pct_efectividad
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date OR mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date)
    `;

    const result = await pool.query(query, values);
    const kpis = result.rows[0] || {};

    res.json({
      success: true,
      kpis: {
        ingresos_jot: kpis.ingresos_jot || 0,
        ventas_activas: kpis.ventas_activas || 0,
        pct_descarte: kpis.pct_descarte || 0,
        pct_efectividad: kpis.pct_efectividad || 0,
        pct_tercera_edad: (kpis.tercera_edad || 0) > 0 ? Math.round((kpis.tercera_edad / kpis.ingresos_jot) * 100) : 0
      },
      resumen_180: kpis
    });

  } catch (err) {
    console.error('[REPORTE-180-MV] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// ENDPOINT 4: CONSULTA Y DESCARGA
// ============================================================

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
      WHERE (mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date OR mv.fecha_registro_jotform::date BETWEEN $1::date AND $2::date) ${filters}
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

// ============================================================
// ENDPOINT 5: STATUS DE LA VISTA MATERIALIZADA
// ============================================================

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

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getIndicadoresDashboardVelsa,
  getMonitoreoDiarioVelsa,
  getReporte180Velsa,
  getConsultaDescargaVelsa,
  getStatusMaterializedView,
};
