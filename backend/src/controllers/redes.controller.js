const pool = require('../config/db');

// ─── Helper: parsea fechas del query ────────────────────────────────────────
const getFiltroFechas = (query) => {
  const hoy = new Date().toISOString().split('T')[0];
  const fechaDesde = query.fechaDesde || hoy;
  const fechaHasta = query.fechaHasta || hoy;
  return { fechaDesde, fechaHasta };
};

// ─── 1. MONITOREO REDES GENERAL (tabla principal) ───────────────────────────
const getMonitoreoRedes = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);

    // Totales del período
    const totalesResult = await pool.query(`
      SELECT
        SUM(n_leads)              AS n_leads,
        SUM(atc_soporte)          AS atc_soporte,
        SUM(fuera_cobertura)      AS fuera_cobertura,
        SUM(zonas_peligrosas)     AS zonas_peligrosas,
        SUM(innegociable)         AS innegociable,
        SUM(negociables)          AS negociables,
        SUM(venta_subida_bitrix)  AS venta_subida_bitrix,
        SUM(seguimiento_negociacion) AS seguimiento_negociacion,
        SUM(otro_proveedor)       AS otro_proveedor,
        SUM(no_interesa_costo)    AS no_interesa_costo,
        SUM(desiste_compra)       AS desiste_compra,
        SUM(duplicado)            AS duplicado,
        SUM(cliente_discapacidad) AS cliente_discapacidad,
        SUM(ingreso_jot)          AS ingreso_jot,
        SUM(ingreso_bitrix_mismo_dia) AS ingreso_bitrix_mismo_dia,
        SUM(activo_backlog)       AS activo_backlog,
        SUM(activos_mes)          AS activos_mes,
        SUM(estado_activo_netlife) AS estado_activo_netlife,
        SUM(desiste_servicio_jot) AS desiste_servicio_jot,
        SUM(pago_cuenta)          AS pago_cuenta,
        SUM(pago_efectivo)        AS pago_efectivo,
        SUM(pago_tarjeta)         AS pago_tarjeta,
        SUM(pago_cuenta_activa)   AS pago_cuenta_activa,
        SUM(pago_efectivo_activa) AS pago_efectivo_activa,
        SUM(pago_tarjeta_activa)  AS pago_tarjeta_activa,
        SUM(ciclo_0_dias)         AS ciclo_0_dias,
        SUM(ciclo_1_dia)          AS ciclo_1_dia,
        SUM(ciclo_2_dias)         AS ciclo_2_dias,
        SUM(ciclo_3_dias)         AS ciclo_3_dias,
        SUM(ciclo_4_dias)         AS ciclo_4_dias,
        SUM(ciclo_mas5_dias)      AS ciclo_mas5_dias,
        SUM(regularizados)        AS regularizados,
        SUM(por_regularizar)      AS por_regularizar,
        SUM(total_gestionables)   AS total_gestionables,
        SUM(total_ventas_jot)     AS total_ventas_jot,
        SUM(total_ventas_crm)     AS total_ventas_crm,
        SUM(inversion_usd)        AS inversion_usd,
        ROUND(AVG(cpl)::numeric, 2)                  AS cpl,
        ROUND(AVG(costo_ingreso_bitrix)::numeric, 2) AS costo_ingreso_bitrix,
        ROUND(AVG(costo_ingreso_jot)::numeric, 2)    AS costo_ingreso_jot,
        ROUND(AVG(costo_activa)::numeric, 2)         AS costo_activa,
        ROUND(AVG(costo_activa_backlog)::numeric, 2) AS costo_activa_backlog,
        ROUND(AVG(costo_por_negociable)::numeric, 2) AS costo_por_negociable,
        ROUND(AVG(pct_atc)::numeric * 100, 1)              AS pct_atc,
        ROUND(AVG(pct_fuera_cobertura)::numeric * 100, 1)  AS pct_fuera_cobertura,
        ROUND(AVG(pct_innegociable)::numeric * 100, 1)     AS pct_innegociable,
        ROUND(AVG(pct_negociable)::numeric * 100, 1)       AS pct_negociable,
        ROUND(AVG(efectividad_total)::numeric * 100, 1)    AS efectividad_total,
        ROUND(AVG(efectividad_negociables)::numeric * 100, 1) AS efectividad_negociables
      FROM public.mv_monitoreo_publicidad
      WHERE fecha BETWEEN $1 AND $2
    `, [fechaDesde, fechaHasta]);

    // Detalle por día (orden descendente)
    const detalleResult = await pool.query(`
      SELECT
        fecha,
        dia_semana,
        n_leads,
        atc_soporte,
        fuera_cobertura,
        zonas_peligrosas,
        innegociable,
        negociables,
        venta_subida_bitrix,
        seguimiento_negociacion,
        otro_proveedor,
        no_interesa_costo,
        desiste_compra,
        duplicado,
        cliente_discapacidad,
        ingreso_jot,
        ingreso_bitrix_mismo_dia,
        activo_backlog,
        activos_mes,
        estado_activo_netlife,
        desiste_servicio_jot,
        pago_cuenta,
        pago_efectivo,
        pago_tarjeta,
        pago_cuenta_activa,
        pago_efectivo_activa,
        pago_tarjeta_activa,
        ciclo_0_dias,
        ciclo_1_dia,
        ciclo_2_dias,
        ciclo_3_dias,
        ciclo_4_dias,
        ciclo_mas5_dias,
        regularizados,
        por_regularizar,
        total_gestionables,
        total_ventas_jot,
        total_ventas_crm,
        inversion_usd,
        canal_publicidad,
        ROUND(cpl::numeric, 2)                  AS cpl,
        ROUND(costo_ingreso_bitrix::numeric, 2)  AS costo_ingreso_bitrix,
        ROUND(costo_ingreso_jot::numeric, 2)     AS costo_ingreso_jot,
        ROUND(costo_activa::numeric, 2)          AS costo_activa,
        ROUND(costo_activa_backlog::numeric, 2)  AS costo_activa_backlog,
        ROUND(costo_por_negociable::numeric, 2)  AS costo_por_negociable,
        ROUND(pct_atc::numeric * 100, 1)              AS pct_atc,
        ROUND(pct_fuera_cobertura::numeric * 100, 1)  AS pct_fuera_cobertura,
        ROUND(pct_innegociable::numeric * 100, 1)     AS pct_innegociable,
        ROUND(pct_negociable::numeric * 100, 1)       AS pct_negociable,
        ROUND(efectividad_total::numeric * 100, 1)    AS efectividad_total,
        ROUND(efectividad_negociables::numeric * 100, 1) AS efectividad_negociables
      FROM public.mv_monitoreo_publicidad
      WHERE fecha BETWEEN $1 AND $2
      ORDER BY fecha DESC
    `, [fechaDesde, fechaHasta]);

    res.json({
      success: true,
      totales: totalesResult.rows[0],
      data: detalleResult.rows,
    });

  } catch (error) {
    console.error('Error en getMonitoreoRedes:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos', error: error.message });
  }
};

// ─── 2. MONITOREO POR CIUDAD ─────────────────────────────────────────────────
const getMonitoreoCiudad = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);

    const totalesResult = await pool.query(`
      SELECT
        ciudad, provincia,
        SUM(total_leads)  AS total_leads,
        SUM(activos)      AS activos,
        SUM(ingresos_jot) AS ingresos_jot,
        ROUND(SUM(activos)::numeric / NULLIF(SUM(total_leads), 0) * 100, 1) AS pct_activos
      FROM public.mv_monitoreo_ciudad
      WHERE fecha BETWEEN $1 AND $2
      GROUP BY ciudad, provincia
      ORDER BY activos DESC
    `, [fechaDesde, fechaHasta]);

    const detalleResult = await pool.query(`
      SELECT fecha, ciudad, provincia, total_leads, activos, ingresos_jot,
             ROUND(pct_activos::numeric * 100, 1) AS pct_activos
      FROM public.mv_monitoreo_ciudad
      WHERE fecha BETWEEN $1 AND $2
      ORDER BY fecha DESC, activos DESC
    `, [fechaDesde, fechaHasta]);

    res.json({
      success: true,
      totales: totalesResult.rows,
      data: detalleResult.rows,
    });

  } catch (error) {
    console.error('Error en getMonitoreoCiudad:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos por ciudad', error: error.message });
  }
};

// ─── 3. MONITOREO POR HORA ───────────────────────────────────────────────────
const getMonitoreoHora = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);

    const totalesResult = await pool.query(`
      SELECT
        hora,
        SUM(n_leads) AS n_leads,
        SUM(atc)     AS atc,
        ROUND(SUM(atc)::numeric / NULLIF(SUM(n_leads), 0) * 100, 1) AS pct_atc_hora
      FROM public.mv_monitoreo_hora
      WHERE fecha BETWEEN $1 AND $2
      GROUP BY hora
      ORDER BY hora ASC
    `, [fechaDesde, fechaHasta]);

    const detalleResult = await pool.query(`
      SELECT fecha, hora, n_leads, atc,
             ROUND(pct_atc_hora::numeric * 100, 1) AS pct_atc_hora
      FROM public.mv_monitoreo_hora
      WHERE fecha BETWEEN $1 AND $2
      ORDER BY fecha DESC, hora ASC
    `, [fechaDesde, fechaHasta]);

    res.json({
      success: true,
      totales: totalesResult.rows,
      data: detalleResult.rows,
    });

  } catch (error) {
    console.error('Error en getMonitoreoHora:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos por hora', error: error.message });
  }
};

// ─── 4. MONITOREO MOTIVOS ATC ────────────────────────────────────────────────
const getMonitoreoAtc = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);

    const totalesResult = await pool.query(`
      SELECT
        motivo_atc,
        SUM(cantidad) AS cantidad
      FROM public.mv_monitoreo_atc
      WHERE fecha BETWEEN $1 AND $2
      GROUP BY motivo_atc
      ORDER BY cantidad DESC
    `, [fechaDesde, fechaHasta]);

    const detalleResult = await pool.query(`
      SELECT fecha, motivo_atc, cantidad
      FROM public.mv_monitoreo_atc
      WHERE fecha BETWEEN $1 AND $2
      ORDER BY fecha DESC, cantidad DESC
    `, [fechaDesde, fechaHasta]);

    res.json({
      success: true,
      totales: totalesResult.rows,
      data: detalleResult.rows,
    });

  } catch (error) {
    console.error('Error en getMonitoreoAtc:', error);
    res.status(500).json({ success: false, message: 'Error al obtener motivos ATC', error: error.message });
  }
};

// ─── 5. MONITOREO COSTO (placeholder) ───────────────────────────────────────
const getMonitoreoCosto = async (req, res) => {
  try {
    res.json({
      success: true,
      data: [],
      message: 'Módulo de Monitoreo Costo General - En desarrollo',
    });
  } catch (error) {
    console.error('Error en getMonitoreoCosto:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos de costos', error: error.message });
  }
};

// ─── 6. MONITOREO METAS vs LOGROS (mestra_bitrix) ────────────────────────────
const getMonitoreoMetas = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta, modo } = req.query;
    const hoy = new Date().toISOString().split('T')[0];
    const desde = fechaDesde || hoy;
    const hasta  = fechaHasta || hoy;

    // origenes puede venir como "GOOGLE,META" separado por comas
    const origenesRaw = req.query.origenes || '';
    const origenes = origenesRaw
      ? origenesRaw.split(',').map((o) => o.trim()).filter(Boolean)
      : [];

    // ── WHERE de fecha ────────────────────────────────────────────────────────
    // modo = 'mes'   → LIKE '%YYYY-MM%'
    // modo = 'rango' → BETWEEN (por defecto)
    let fechaWhere;
    let fechaParams;

    if (modo === 'mes') {
      const mes = desde.slice(0, 7); // "2026-03"
      fechaWhere  = `b_creado_el_fecha LIKE $1`;
      fechaParams = [`%${mes}%`];
    } else {
      fechaWhere  = `b_creado_el_fecha::date BETWEEN $1::date AND $2::date`;
      fechaParams = [desde, hasta];
    }

    const paramOffset = fechaParams.length;

    // ── WHERE de orígenes ─────────────────────────────────────────────────────
    let origenWhere  = '';
    let origenParams = [];

    if (origenes.length > 0) {
      const placeholders = origenes.map((_, i) => `$${paramOffset + i + 1}`).join(', ');
      origenWhere  = `AND b_origen IN (${placeholders})`;
      origenParams = origenes;
    }

    const allParams = [...fechaParams, ...origenParams];

    // ── Etapas por origen ─────────────────────────────────────────────────────
    const etapasResult = await pool.query(`
      SELECT
        b_origen,
        b_etapa_de_la_negociacion,
        COUNT(*) AS total
      FROM public.mestra_bitrix
      WHERE ${fechaWhere}
        ${origenWhere}
      GROUP BY b_origen, b_etapa_de_la_negociacion
      ORDER BY b_origen, total DESC
    `, allParams);

    // ── Totales por origen ────────────────────────────────────────────────────
    const totalesResult = await pool.query(`
      SELECT
        b_origen,
        COUNT(*) AS total_leads
      FROM public.mestra_bitrix
      WHERE ${fechaWhere}
        ${origenWhere}
      GROUP BY b_origen
      ORDER BY total_leads DESC
    `, allParams);

    // ── Orígenes disponibles (para el selector del frontend) ─────────────────
    const origenesDisp = await pool.query(`
      SELECT DISTINCT b_origen
      FROM public.mestra_bitrix
      WHERE ${fechaWhere}
        AND b_origen IS NOT NULL
        AND b_origen <> ''
      ORDER BY b_origen ASC
    `, fechaParams);

    // ── Agrupación por origen ─────────────────────────────────────────────────
    const byOrigen = {};

    totalesResult.rows.forEach((r) => {
      byOrigen[r.b_origen] = {
        origen:           r.b_origen,
        total_leads:      Number(r.total_leads),
        inversion_usd:    0,
        atc_soporte:      0,
        fuera_cobertura:  0,
        zonas_peligrosas: 0,
        innegociable:     0,
        venta_subida:     0,
        ingreso_jot:      0,
      };
    });

    etapasResult.rows.forEach((r) => {
      const o = byOrigen[r.b_origen];
      if (!o) return;
      const etapa = (r.b_etapa_de_la_negociacion || '').toUpperCase().trim();
      const n = Number(r.total);

      if (etapa === 'ATC/SOPORTE')        o.atc_soporte      += n;
      if (etapa === 'FUERA DE COBERTURA') o.fuera_cobertura  += n;
      if (etapa === 'ZONAS PELIGROSAS')   o.zonas_peligrosas += n;
      if (etapa === 'INNEGOCIABLE')       o.innegociable     += n;
      if (etapa === 'VENTA SUBIDA')       o.venta_subida     += n;
      if (etapa === 'INGRESO JOT' || etapa === 'VENTA JOT') o.ingreso_jot += n;
    });

    // ── Métricas derivadas ────────────────────────────────────────────────────
    const canales = Object.values(byOrigen).map((o) => {
      const sac     = o.atc_soporte + o.fuera_cobertura + o.zonas_peligrosas + o.innegociable;
      const calidad = o.total_leads - sac;
      return {
        ...o,
        leads_sac:      sac,
        leads_calidad:  calidad,
        pct_sac:        o.total_leads > 0 ? (sac            / o.total_leads) * 100 : 0,
        pct_calidad:    o.total_leads > 0 ? (calidad         / o.total_leads) * 100 : 0,
        pct_ventas:     o.total_leads > 0 ? (o.venta_subida  / o.total_leads) * 100 : 0,
        pct_ventas_jot: o.total_leads > 0 ? (o.ingreso_jot   / o.total_leads) * 100 : 0,
      };
    });

    res.json({
      success: true,
      canales,
      origenes_disponibles: origenesDisp.rows.map((r) => r.b_origen),
    });

  } catch (error) {
    console.error('Error en getMonitoreoMetas:', error);
    res.status(500).json({ success: false, message: 'Error al obtener metas', error: error.message });
  }
};

module.exports = {
  getMonitoreoRedes,
  getMonitoreoCiudad,
  getMonitoreoHora,
  getMonitoreoAtc,
  getMonitoreoCosto,
  getMonitoreoMetas,
};