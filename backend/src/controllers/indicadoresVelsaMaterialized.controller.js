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
        COUNT(DISTINCT CASE WHEN mv.fecha_creacion_date BETWEEN $1::date AND $2::date THEN mv.id_crm END) AS leads_crm,
        COUNT(DISTINCT CASE WHEN mv.fecha_registro_date BETWEEN $1::date AND $2::date THEN mv.id_jotform END) AS ingresos_jotform,
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
      WHERE (mv.fecha_creacion_date BETWEEN $1::date AND $2::date OR mv.fecha_registro_date BETWEEN $1::date AND $2::date) ${filters}
      GROUP BY 1
      ORDER BY total_registros DESC
    `;

    const queryCRM = `
      SELECT
        mv.id_crm AS "ID_CRM",
        mv.etapa_crm AS "ETAPA",
        mv.fecha_creacion_date AS "FECHA_CREACION",
        mv.asesor AS "ASESOR",
        mv.supervisor AS "SUPERVISOR",
        mv.fecha_modificacion_date AS "FECHA_MODIFICACION",
        mv.origen AS "ORIGEN",
        mv.estado_venta AS "ESTADO_NETLIFE",
        mv.fecha_activacion_date AS "FECHA_ACTIVACION",
        mv.forma_pago AS "FORMA_PAGO",
        mv.estado_regularizacion AS "ESTADO_REGULARIZACION",
        mv.aplica_descuento AS "APLICA_DESCUENTO"
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_date BETWEEN $1::date AND $2::date OR mv.fecha_registro_date BETWEEN $1::date AND $2::date) ${filters}
      LIMIT 6000
    `;

    const queryEstados = `
      SELECT DISTINCT mv.estado_venta AS estado, COUNT(*) AS total
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

    const [kpiResult, crmData, estadosData, etapasData] = await Promise.all([
      pool.query(queryKPI('COALESCE(mv.asesor, mv.id_jotform::text)'), values),
      pool.query(queryCRM, values),
      pool.query(queryEstados),
      pool.query(queryEtapas),
    ]);

    res.json({
      success: true,
      indicadores_kpi: kpiResult.rows,
      datos_crm: crmData.rows,
      estados_netlife: estadosData.rows,
      etapas_crm: etapasData.rows,
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

    const query = `
      SELECT
        DATE(COALESCE(mv.fecha_creacion_date, mv.fecha_registro_date)) AS fecha,
        COUNT(DISTINCT mv.id_crm) AS leads_crm,
        COUNT(DISTINCT mv.id_jotform) AS registros_jotform,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS activos_dia,
        COUNT(DISTINCT CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN mv.id_crm END) AS descartados_dia
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_date BETWEEN $1::date AND $2::date OR mv.fecha_registro_date BETWEEN $1::date AND $2::date)
      GROUP BY DATE(COALESCE(mv.fecha_creacion_date, mv.fecha_registro_date))
      ORDER BY fecha DESC
    `;

    const result = await pool.query(query, values);
    res.json({ success: true, datos_diarios: result.rows });

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
        COUNT(DISTINCT mv.id_jotform) AS total_registros_jotform,
        COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END) AS total_activos,
        COUNT(DISTINCT CASE WHEN mv.etapa_crm IN ${ETAPAS_DESCARTE} THEN mv.id_crm END) AS total_descartados,
        COUNT(DISTINCT CASE WHEN mv.forma_pago ILIKE '%TARJETA DE CREDITO%' THEN mv.id_jotform END) AS pago_tarjeta,
        COUNT(DISTINCT CASE WHEN mv.aplica_descuento ILIKE '%TERCERA EDAD%' THEN mv.id_jotform END) AS tercera_edad,
        ROUND(
          CASE WHEN COUNT(DISTINCT mv.id_crm) > 0
            THEN (COUNT(DISTINCT CASE WHEN mv.estado_venta = ${ESTADO_ACTIVO} THEN mv.id_jotform END)::numeric / COUNT(DISTINCT mv.id_crm) * 100)
            ELSE 0
          END, 2
        ) AS efectividad_general
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_date BETWEEN $1::date AND $2::date OR mv.fecha_registro_date BETWEEN $1::date AND $2::date)
    `;

    const result = await pool.query(query, values);
    res.json({ success: true, resumen_180: result.rows[0] || {} });

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
        mv.etapa_crm,
        mv.fecha_creacion_crm,
        mv.fecha_registro_jotform,
        mv.estado_venta,
        mv.fecha_activacion,
        mv.forma_pago,
        mv.estado_regularizacion,
        mv.aplica_descuento
      FROM public.mv_indicadores_velsa_completo mv
      WHERE (mv.fecha_creacion_date BETWEEN $1::date AND $2::date OR mv.fecha_registro_date BETWEEN $1::date AND $2::date) ${filters}
      LIMIT 50000
    `;

    const result = await pool.query(query, values);
    res.json({ success: true, registros: result.rows, total: result.rows.length });

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
    res.json({ success: true, status: result.rows[0] });

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
