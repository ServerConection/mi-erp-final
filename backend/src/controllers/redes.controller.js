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

// ─── 6. MONITOREO METAS vs LOGROS ────────────────────────────────────────────
// Verde (desde SQL): leads totales, sac, calidad, ventas, jot, inversion
// Rojo  (formulario): objetivos — los recibe el frontend, no el backend
const getMonitoreoMetas = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta, modo } = req.query;
    const hoy   = new Date().toISOString().split('T')[0];
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    // origenes separados por coma: "FORMULARIO LANDING 4,BASE 593-979083368"
    const origenesRaw = req.query.origenes || '';
    const origenes    = origenesRaw
      ? origenesRaw.split(',').map(o => o.trim()).filter(Boolean)
      : [];

    // ── WHERE fecha ───────────────────────────────────────────────────────────
    let fechaWhere, fechaParams;
    if (modo === 'mes') {
      const mes   = desde.slice(0, 7);           // "2026-03"
      fechaWhere  = `b_creado_el_fecha LIKE $1`;
      fechaParams = [`%${mes}%`];
    } else {
      fechaWhere  = `b_creado_el_fecha::date BETWEEN $1::date AND $2::date`;
      fechaParams = [desde, hasta];
    }

    const offset = fechaParams.length;

    // ── WHERE origenes ────────────────────────────────────────────────────────
    let origenWhere  = '';
    let origenParams = [];
    if (origenes.length > 0) {
      const ph     = origenes.map((_, i) => `$${offset + i + 1}`).join(', ');
      origenWhere  = `AND b_origen IN (${ph})`;
      origenParams = origenes;
    }

    const allParams = [...fechaParams, ...origenParams];

    // ── 1. Totales por origen ─────────────────────────────────────────────────
    const totalesRes = await pool.query(`
      SELECT
        b_origen,
        COUNT(*)                                                        AS total_leads,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion IN (
          'ATC/SOPORTE','FUERA DE COBERTURA',
          'ZONAS PELIGROSAS','INNEGOCIABLE'
        ))                                                              AS leads_sac,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'VENTA SUBIDA') AS venta_subida,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion IN (
          'INGRESO JOT','VENTA JOT'
        ))                                                              AS ingreso_jot
      FROM public.mestra_bitrix
      WHERE ${fechaWhere}
        ${origenWhere}
      GROUP BY b_origen
      ORDER BY total_leads DESC
    `, allParams);

    // ── 2. Inversión desde mv_monitoreo_publicidad filtrada por origen ────────
    // Trae la inversión acumulada del período para cruzar con cada origen
    // (si tu tabla mv_monitoreo_publicidad tiene canal_publicidad = b_origen)
    let inversionPorOrigen = {};
    try {
      const invRes = await pool.query(`
        SELECT
          canal_publicidad,
          SUM(inversion_usd) AS inversion_usd
        FROM public.mv_monitoreo_publicidad
        WHERE fecha BETWEEN $1::date AND $2::date
        GROUP BY canal_publicidad
      `, [desde, hasta]);
      invRes.rows.forEach(r => {
        inversionPorOrigen[r.canal_publicidad] = Number(r.inversion_usd || 0);
      });
    } catch (_) {
      // Si falla, la inversión quedará en 0 — no rompe el resto
    }

    // ── 3. Orígenes disponibles (para el selector del frontend) ──────────────
    const origenesDispRes = await pool.query(`
      SELECT DISTINCT b_origen
      FROM public.mestra_bitrix
      WHERE ${fechaWhere}
        AND b_origen IS NOT NULL
        AND b_origen <> ''
      ORDER BY b_origen ASC
    `, fechaParams);

    // ── 4. Construir respuesta por canal ──────────────────────────────────────
    const canales = totalesRes.rows.map(r => {
      const total     = Number(r.total_leads  || 0);
      const sac       = Number(r.leads_sac    || 0);
      const ventas    = Number(r.venta_subida || 0);
      const jot       = Number(r.ingreso_jot  || 0);
      const calidad   = total - sac;
      const inversion = inversionPorOrigen[r.b_origen] || 0;

      return {
        origen:        r.b_origen,
        total_leads:   total,
        leads_sac:     sac,
        leads_calidad: calidad,
        venta_subida:  ventas,
        ingreso_jot:   jot,
        inversion_usd: inversion,
        // porcentajes precalculados
        pct_sac:       total > 0 ? (sac    / total) * 100 : 0,
        pct_calidad:   total > 0 ? (calidad/ total) * 100 : 0,
        pct_ventas:    total > 0 ? (ventas / total) * 100 : 0,
        pct_ventas_jot:total > 0 ? (jot    / total) * 100 : 0,
        // costos
        cpl:     total   > 0 && inversion > 0 ? inversion / total   : null,
        cpl_gest:calidad > 0 && inversion > 0 ? inversion / calidad : null,
        cpa:     ventas  > 0 && inversion > 0 ? inversion / ventas  : null,
        cpa_jot: jot     > 0 && inversion > 0 ? inversion / jot     : null,
      };
    });

    res.json({
      success: true,
      canales,
      origenes_disponibles: origenesDispRes.rows.map(r => r.b_origen),
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