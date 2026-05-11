/**
 * 🔄 VERSIÓN CON FULL OUTER JOIN: negociaciones_reporteria + vw_jotform_velsa_netlife_completo
 * Fecha de actualización: 2026-05-11
 *
 * ESTRUCTURA:
 * ✅ FULL OUTER JOIN: negociaciones_reporteria (nr) + vw_jotform_velsa_netlife_completo (jf)
 * ✅ Columna JOIN: nr.id = jf.id_bitrix
 * ✅ Datos de negociaciones: etapa, responsable, fecha_creación, modificado_en
 * ✅ Datos de Jotform: estado_venta, fecha_activación, forma_pago, descuento_3era_edad, estado_regularización
 * ✅ LEFT JOIN employees para supervisores
 */

const pool = require('../config/db');

const getFechaEcuador = () => {
    const ahora = new Date();
    return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
};

const ESTADO_ACTIVO = `'ACTIVO'`;

const ETAPAS_GESTIONABLES = `('VOLVER A LLAMAR','NO INTERESA COSTO DEL PLAN','SEGUIMIENTO SIN CONTACTO','SEGUIMIENTO NEGOCIACION','VENTA SUBIDA','CONTACTO NUEVO','CLIENTE DISCAPACIDAD','CLIENTE DICAPACIDAD','DOCUMENTOS PENDIENTES','CERRAR NEGOCIACION','INNEGOCIABLE','NUNCA CONTESTO','GESTION DIARIA','MANTIENE PROVEEDOR','NO INTERESA COSTO DE INSTALACION','CONTRATA NETLIFE OTRO CANAL','CONTRATO OTRO PROVEEDOR','REFIRIO','RECEPCION DE DOCUMENTOS','RMKT AUTOMÁTICO','SEGUIMIENTO','CONTRATA NETLIFE OTRO DISTRIBUIDOR','INCONTACTABLE','NO INTERESA COSTO DE PLAN','NO INTERESA COSTO DE INSTALACIÓN','OPORTUNIDADES','DUPLICADO','NO VOLVER A CONTACTAR','LEADS NOVONET','POSTVENTA VELSA','RMKT AUTOMATICO')`;

const ETAPAS_DESCARTE = `('NO INTERESA COSTO PLAN','INNEGOCIABLE','CONTRATO NETLIFE','CLIENTE DISCAPACIDAD','OTRO ASESOR NOVONET','MANTIENE PROVEEDOR','DESISTE DE COMPRA','OTRO PROVEEDOR','NO VOLVER A CONTACTAR','NO INTERESA COSTO INSTALACIÓN','VENTA ECUANET DIRECTA','CONTRATO NETLIFE POR OTRO CANAL','CONTRATO NETLIFE OTRO ASESOR COMPAÑERO','INCONTACTABLE','NO INTERESA COSTO INSTALACION','CONTRATO NETLIFE OTRO CANAL','CONTRATO OTRO PROVEEDOR')`;

// ============================================================
// ENDPOINT 1: DASHBOARD KPIs
// ============================================================

async function getIndicadoresDashboardVelsa(req, res) {
  try {
    const { asesor, supervisor, fechaDesde, fechaHasta, estadoNetlife, estadoRegularizacion, etapaCRM } = req.query;

    const hoy = getFechaEcuador();
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    let values = [desde, hasta];
    let filters = "";

    if (asesor) { values.push(`%${asesor}%`); filters += ` AND nr.responsable_nombre ILIKE $${values.length}`; }
    if (supervisor) { values.push(`%${supervisor}%`); filters += ` AND emp.nombre ILIKE $${values.length}`; }
    if (estadoNetlife) { values.push(`%${estadoNetlife}%`); filters += ` AND jf.estado_venta_netlife ILIKE $${values.length}`; }
    if (estadoRegularizacion) { values.push(`%${estadoRegularizacion}%`); filters += ` AND jf.estado_regularizacion ILIKE $${values.length}`; }
    if (etapaCRM) { values.push(`%${etapaCRM}%`); filters += ` AND nr.etapa ILIKE $${values.length}`; }

    const queryKPI = (columna) => `
      SELECT
        COALESCE(${columna}, 'SIN ASIGNAR') AS nombre_grupo,
        COUNT(DISTINCT COALESCE(nr.id, jf.id_bitrix)) AS total_registros,
        COUNT(DISTINCT CASE WHEN nr.creado_en::date BETWEEN $1::date AND $2::date THEN nr.id END) AS leads_crm,
        COUNT(DISTINCT CASE WHEN jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date THEN jf.id_bitrix END) AS ingresos_jotform,
        COUNT(DISTINCT CASE WHEN jf.estado_venta_netlife = ${ESTADO_ACTIVO} THEN jf.id_bitrix END) AS activos,
        COUNT(DISTINCT CASE WHEN jf.forma_pago ILIKE '%TARJETA DE CREDITO%' THEN jf.id_bitrix END) AS tarjeta_credito,
        COUNT(DISTINCT CASE WHEN jf.descuento_3era_edad ILIKE '%TERCERA EDAD%' THEN jf.id_bitrix END) AS tercera_edad,
        COUNT(DISTINCT CASE WHEN jf.estado_regularizacion = 'POR REGULARIZAR' THEN jf.id_bitrix END) AS por_regularizar,
        COUNT(DISTINCT CASE WHEN nr.etapa IN ${ETAPAS_DESCARTE} THEN nr.id END) AS descartados,
        ROUND(
          CASE WHEN COUNT(DISTINCT nr.id) > 0
            THEN (COUNT(DISTINCT CASE WHEN jf.estado_venta_netlife = ${ESTADO_ACTIVO} THEN jf.id_bitrix END)::numeric / COUNT(DISTINCT nr.id) * 100)
            ELSE 0
          END, 2
        ) AS tasa_efectividad
      FROM public.negociaciones_reporteria nr
      FULL OUTER JOIN public.vw_jotform_velsa_netlife_completo jf ON nr.id = jf.id_bitrix
      LEFT JOIN employees emp ON nr.responsable_id = emp.id
      WHERE (nr.creado_en::date BETWEEN $1::date AND $2::date OR jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date) ${filters}
      GROUP BY 1
      ORDER BY total_registros DESC
    `;

    const queryCRM = `
      SELECT
        nr.id AS "ID_CRM",
        nr.etapa AS "ETAPA",
        nr.creado_en::date AS "FECHA_CREACION",
        nr.responsable_nombre AS "ASESOR",
        emp.nombre AS "SUPERVISOR",
        nr.modificado_en::date AS "FECHA_MODIFICACION",
        nr.fuente AS "ORIGEN",
        jf.estado_venta_netlife AS "ESTADO_NETLIFE",
        jf.fecha_activacion AS "FECHA_ACTIVACION",
        jf.forma_pago AS "FORMA_PAGO",
        jf.estado_regularizacion AS "ESTADO_REGULARIZACION",
        jf.descuento_3era_edad AS "DESCUENTO_3ERA_EDAD"
      FROM public.negociaciones_reporteria nr
      FULL OUTER JOIN public.vw_jotform_velsa_netlife_completo jf ON nr.id = jf.id_bitrix
      LEFT JOIN employees emp ON nr.responsable_id = emp.id
      WHERE (nr.creado_en::date BETWEEN $1::date AND $2::date OR jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date) ${filters}
      LIMIT 6000
    `;

    const queryEstados = `
      SELECT DISTINCT jf.estado_venta_netlife AS estado, COUNT(*) AS total
      FROM public.vw_jotform_velsa_netlife_completo jf
      WHERE jf.estado_venta_netlife IS NOT NULL
      GROUP BY jf.estado_venta_netlife
      ORDER BY total DESC
    `;

    const queryEtapas = `
      SELECT DISTINCT nr.etapa, COUNT(*) AS total
      FROM public.negociaciones_reporteria nr
      WHERE nr.etapa IS NOT NULL
      GROUP BY nr.etapa
      ORDER BY total DESC
    `;

    const [kpiResult, crmData, estadosData, etapasData] = await Promise.all([
      pool.query(queryKPI('COALESCE(nr.responsable_nombre, jf.id_bitrix::text)'), values),
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
    console.error('[INDICADORES-VELSA] Error:', err);
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
        DATE(COALESCE(nr.creado_en, jf.fecha_registro_sistema)) AS fecha,
        COUNT(DISTINCT nr.id) AS leads_crm,
        COUNT(DISTINCT jf.id_bitrix) AS registros_jotform,
        COUNT(DISTINCT CASE WHEN jf.estado_venta_netlife = ${ESTADO_ACTIVO} THEN jf.id_bitrix END) AS activos_dia,
        COUNT(DISTINCT CASE WHEN nr.etapa IN ${ETAPAS_DESCARTE} THEN nr.id END) AS descartados_dia
      FROM public.negociaciones_reporteria nr
      FULL OUTER JOIN public.vw_jotform_velsa_netlife_completo jf ON nr.id = jf.id_bitrix
      WHERE (nr.creado_en::date BETWEEN $1::date AND $2::date OR jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date)
      GROUP BY DATE(COALESCE(nr.creado_en, jf.fecha_registro_sistema))
      ORDER BY fecha DESC
    `;

    const result = await pool.query(query, values);
    res.json({ success: true, datos_diarios: result.rows });

  } catch (err) {
    console.error('[MONITOREO-DIARIO] Error:', err);
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
        COUNT(DISTINCT nr.id) AS total_leads_crm,
        COUNT(DISTINCT jf.id_bitrix) AS total_registros_jotform,
        COUNT(DISTINCT CASE WHEN jf.estado_venta_netlife = ${ESTADO_ACTIVO} THEN jf.id_bitrix END) AS total_activos,
        COUNT(DISTINCT CASE WHEN nr.etapa IN ${ETAPAS_DESCARTE} THEN nr.id END) AS total_descartados,
        COUNT(DISTINCT CASE WHEN jf.forma_pago ILIKE '%TARJETA DE CREDITO%' THEN jf.id_bitrix END) AS pago_tarjeta,
        COUNT(DISTINCT CASE WHEN jf.descuento_3era_edad ILIKE '%TERCERA EDAD%' THEN jf.id_bitrix END) AS tercera_edad,
        ROUND(
          CASE WHEN COUNT(DISTINCT nr.id) > 0
            THEN (COUNT(DISTINCT CASE WHEN jf.estado_venta_netlife = ${ESTADO_ACTIVO} THEN jf.id_bitrix END)::numeric / COUNT(DISTINCT nr.id) * 100)
            ELSE 0
          END, 2
        ) AS efectividad_general
      FROM public.negociaciones_reporteria nr
      FULL OUTER JOIN public.vw_jotform_velsa_netlife_completo jf ON nr.id = jf.id_bitrix
      WHERE (nr.creado_en::date BETWEEN $1::date AND $2::date OR jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date)
    `;

    const result = await pool.query(query, values);
    res.json({ success: true, resumen_180: result.rows[0] || {} });

  } catch (err) {
    console.error('[REPORTE-180] Error:', err);
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
      filters += ` AND nr.responsable_nombre ILIKE $${values.length}`;
    }

    if (estado) {
      values.push(`%${estado}%`);
      filters += ` AND jf.estado_venta_netlife ILIKE $${values.length}`;
    }

    const query = `
      SELECT
        COALESCE(nr.id, jf.id_bitrix) AS id_consulta,
        nr.id AS id_crm,
        jf.id_bitrix AS id_jotform,
        nr.responsable_nombre AS asesor,
        nr.etapa AS etapa_crm,
        nr.creado_en AS fecha_creacion_crm,
        jf.fecha_registro_sistema AS fecha_registro_jotform,
        jf.estado_venta_netlife AS estado_venta,
        jf.fecha_activacion AS fecha_activacion,
        jf.forma_pago AS forma_pago,
        jf.estado_regularizacion AS estado_regularizacion,
        jf.descuento_3era_edad AS descuento_3era_edad
      FROM public.negociaciones_reporteria nr
      FULL OUTER JOIN public.vw_jotform_velsa_netlife_completo jf ON nr.id = jf.id_bitrix
      WHERE (nr.creado_en::date BETWEEN $1::date AND $2::date OR jf.fecha_registro_sistema::date BETWEEN $1::date AND $2::date) ${filters}
      LIMIT 50000
    `;

    const result = await pool.query(query, values);
    res.json({ success: true, registros: result.rows, total: result.rows.length });

  } catch (err) {
    console.error('[CONSULTA-DESCARGA] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ============================================================
// ENDPOINT 5: DEBUG DE FECHAS
// ============================================================

async function getDebugFechasVelsa(req, res) {
  try {
    const query = `
      SELECT
        'negociaciones_reporteria' AS tabla,
        COUNT(*) AS total_registros,
        MIN(creado_en::date) AS fecha_minima,
        MAX(creado_en::date) AS fecha_maxima
      FROM public.negociaciones_reporteria
      UNION ALL
      SELECT
        'vw_jotform_velsa_netlife_completo' AS tabla,
        COUNT(*) AS total_registros,
        MIN(fecha_registro_sistema::date) AS fecha_minima,
        MAX(fecha_registro_sistema::date) AS fecha_maxima
      FROM public.vw_jotform_velsa_netlife_completo
    `;

    const result = await pool.query(query);
    res.json({ success: true, debug_fechas: result.rows });

  } catch (err) {
    console.error('[DEBUG-FECHAS] Error:', err);
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
  getDebugFechasVelsa,
};
