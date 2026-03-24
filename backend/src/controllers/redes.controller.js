const pool = require('../config/db');

// ─── Helper: parsea fechas del query ────────────────────────────────────────
const getFiltroFechas = (query) => {
  const hoy = new Date().toISOString().split('T')[0];
  const fechaDesde = query.fechaDesde || hoy;
  const fechaHasta = query.fechaHasta || hoy;
  return { fechaDesde, fechaHasta };
};

// ─── 1. MONITOREO REDES GENERAL ─────────────────────────────────────────────
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
        fecha, dia_semana, n_leads, atc_soporte, fuera_cobertura, zonas_peligrosas,
        innegociable, negociables, venta_subida_bitrix, seguimiento_negociacion,
        otro_proveedor, no_interesa_costo, desiste_compra, duplicado, cliente_discapacidad,
        ingreso_jot, ingreso_bitrix_mismo_dia, activo_backlog, activos_mes,
        estado_activo_netlife, desiste_servicio_jot, pago_cuenta, pago_efectivo,
        pago_tarjeta, pago_cuenta_activa, pago_efectivo_activa, pago_tarjeta_activa,
        ciclo_0_dias, ciclo_1_dia, ciclo_2_dias, ciclo_3_dias, ciclo_4_dias,
        ciclo_mas5_dias, regularizados, por_regularizar, total_gestionables,
        total_ventas_jot, total_ventas_crm, inversion_usd, canal_publicidad,
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

    res.json({ success: true, totales: totalesResult.rows[0], data: detalleResult.rows });
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
      SELECT ciudad, provincia,
        SUM(total_leads) AS total_leads, SUM(activos) AS activos,
        SUM(ingresos_jot) AS ingresos_jot,
        ROUND(SUM(activos)::numeric / NULLIF(SUM(total_leads), 0) * 100, 1) AS pct_activos
      FROM public.mv_monitoreo_ciudad
      WHERE fecha BETWEEN $1 AND $2
      GROUP BY ciudad, provincia ORDER BY activos DESC
    `, [fechaDesde, fechaHasta]);

    const detalleResult = await pool.query(`
      SELECT fecha, ciudad, provincia, total_leads, activos, ingresos_jot,
             ROUND(pct_activos::numeric * 100, 1) AS pct_activos
      FROM public.mv_monitoreo_ciudad
      WHERE fecha BETWEEN $1 AND $2
      ORDER BY fecha DESC, activos DESC
    `, [fechaDesde, fechaHasta]);

    res.json({ success: true, totales: totalesResult.rows, data: detalleResult.rows });
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
      SELECT hora, SUM(n_leads) AS n_leads, SUM(atc) AS atc,
        ROUND(SUM(atc)::numeric / NULLIF(SUM(n_leads), 0) * 100, 1) AS pct_atc_hora
      FROM public.mv_monitoreo_hora
      WHERE fecha BETWEEN $1 AND $2
      GROUP BY hora ORDER BY hora ASC
    `, [fechaDesde, fechaHasta]);

    const detalleResult = await pool.query(`
      SELECT fecha, hora, n_leads, atc,
             ROUND(pct_atc_hora::numeric * 100, 1) AS pct_atc_hora
      FROM public.mv_monitoreo_hora
      WHERE fecha BETWEEN $1 AND $2
      ORDER BY fecha DESC, hora ASC
    `, [fechaDesde, fechaHasta]);

    res.json({ success: true, totales: totalesResult.rows, data: detalleResult.rows });
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
      SELECT motivo_atc, SUM(cantidad) AS cantidad
      FROM public.mv_monitoreo_atc
      WHERE fecha BETWEEN $1 AND $2
      GROUP BY motivo_atc ORDER BY cantidad DESC
    `, [fechaDesde, fechaHasta]);

    const detalleResult = await pool.query(`
      SELECT fecha, motivo_atc, cantidad
      FROM public.mv_monitoreo_atc
      WHERE fecha BETWEEN $1 AND $2
      ORDER BY fecha DESC, cantidad DESC
    `, [fechaDesde, fechaHasta]);

    res.json({ success: true, totales: totalesResult.rows, data: detalleResult.rows });
  } catch (error) {
    console.error('Error en getMonitoreoAtc:', error);
    res.status(500).json({ success: false, message: 'Error al obtener motivos ATC', error: error.message });
  }
};

// ─── 5. MONITOREO COSTO (placeholder) ───────────────────────────────────────
const getMonitoreoCosto = async (req, res) => {
  try {
    res.json({ success: true, data: [], message: 'En desarrollo' });
  } catch (error) {
    console.error('Error en getMonitoreoCosto:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos de costos', error: error.message });
  }
};

// ─── 6. MONITOREO METAS vs LOGROS ────────────────────────────────────────────
const getMonitoreoMetas = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta, modo } = req.query;
    const hoy   = new Date().toISOString().split('T')[0];
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    const origenesRaw = req.query.origenes || '';
    const origenes    = origenesRaw ? origenesRaw.split(',').map(o => o.trim()).filter(Boolean) : [];

    let fechaWhere, fechaParams;
    if (modo === 'mes') {
      fechaWhere  = `b_creado_el_fecha LIKE $1`;
      fechaParams = [`%${desde.slice(0, 7)}%`];
    } else {
      fechaWhere  = `b_creado_el_fecha::date BETWEEN $1::date AND $2::date`;
      fechaParams = [desde, hasta];
    }

    const offset = fechaParams.length;
    let origenWhere = '', origenParams = [];
    if (origenes.length > 0) {
      origenWhere  = `AND b_origen IN (${origenes.map((_, i) => `$${offset + i + 1}`).join(', ')})`;
      origenParams = origenes;
    }

    const allParams = [...fechaParams, ...origenParams];

    const totalesRes = await pool.query(`
      SELECT
        b_origen,
        COUNT(*) AS total_leads,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion IN (
          'ATC/SOPORTE','FUERA DE COBERTURA','ZONAS PELIGROSAS','INNEGOCIABLE'
        )) AS leads_sac,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'VENTA SUBIDA') AS venta_subida,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion IN ('INGRESO JOT','VENTA JOT')) AS ingreso_jot
      FROM public.mestra_bitrix
      WHERE ${fechaWhere} ${origenWhere}
      GROUP BY b_origen ORDER BY total_leads DESC
    `, allParams);

    let inversionPorOrigen = {};
    try {
      const invRes = await pool.query(`
        SELECT canal_publicidad, SUM(inversion_usd) AS inversion_usd
        FROM public.mv_monitoreo_publicidad
        WHERE fecha BETWEEN $1::date AND $2::date
        GROUP BY canal_publicidad
      `, [desde, hasta]);
      invRes.rows.forEach(r => { inversionPorOrigen[r.canal_publicidad] = Number(r.inversion_usd || 0); });
    } catch (_) {}

    const origenesDispRes = await pool.query(`
      SELECT DISTINCT b_origen FROM public.mestra_bitrix
      WHERE ${fechaWhere} AND b_origen IS NOT NULL AND b_origen <> ''
      ORDER BY b_origen ASC
    `, fechaParams);

    const canales = totalesRes.rows.map(r => {
      const total = Number(r.total_leads || 0), sac = Number(r.leads_sac || 0);
      const ventas = Number(r.venta_subida || 0), jot = Number(r.ingreso_jot || 0);
      const calidad = total - sac, inversion = inversionPorOrigen[r.b_origen] || 0;
      return {
        origen: r.b_origen, total_leads: total, leads_sac: sac,
        leads_calidad: calidad, venta_subida: ventas, ingreso_jot: jot, inversion_usd: inversion,
        pct_sac:        total > 0 ? (sac    / total) * 100 : 0,
        pct_calidad:    total > 0 ? (calidad/ total) * 100 : 0,
        pct_ventas:     total > 0 ? (ventas / total) * 100 : 0,
        pct_ventas_jot: total > 0 ? (jot    / total) * 100 : 0,
        cpl:     total   > 0 && inversion > 0 ? inversion / total   : null,
        cpl_gest:calidad > 0 && inversion > 0 ? inversion / calidad : null,
        cpa:     ventas  > 0 && inversion > 0 ? inversion / ventas  : null,
        cpa_jot: jot     > 0 && inversion > 0 ? inversion / jot     : null,
      };
    });

    res.json({ success: true, canales, origenes_disponibles: origenesDispRes.rows.map(r => r.b_origen) });
  } catch (error) {
    console.error('Error en getMonitoreoMetas:', error);
    res.status(500).json({ success: false, message: 'Error al obtener metas', error: error.message });
  }
};

// ─── 7. REPORTE DATA ─────────────────────────────────────────────────────────
// Retorna todos los bloques del Excel por día del mes, filtrable por origen
const getReporteData = async (req, res) => {
  try {
    const { anio, mes } = req.query;
    const hoy  = new Date();
    const y    = parseInt(anio  || hoy.getFullYear());
    const m    = parseInt(mes   || (hoy.getMonth() + 1));
    const desde = `${y}-${String(m).padStart(2,'0')}-01`;
    const hasta  = `${y}-${String(m).padStart(2,'0')}-31`;

    const origenesRaw = req.query.origenes || '';
    const origenes    = origenesRaw ? origenesRaw.split(',').map(o => o.trim()).filter(Boolean) : [];

    // WHERE origen para mestra_bitrix
    const buildOrigenWhere = (offset, field = 'b_origen') => {
      if (origenes.length === 0) return { where: '', params: [] };
      const ph = origenes.map((_, i) => `$${offset + i + 1}`).join(', ');
      return { where: `AND ${field} IN (${ph})`, params: origenes };
    };

    // ── BLOQUE 1: Inversión diaria desde mv_monitoreo_publicidad ─────────────
    const { where: invOrigenWhere, params: invOrigenParams } = buildOrigenWhere(2, 'canal_publicidad');
    const inversionRes = await pool.query(`
      SELECT
        EXTRACT(DAY FROM fecha)::int AS dia,
        SUM(inversion_usd)           AS inversion_usd,
        SUM(n_leads)                 AS n_leads,
        SUM(ingreso_jot)             AS ingreso_jot,
        SUM(ingreso_bitrix_mismo_dia) AS ingreso_bitrix,
        SUM(activos_mes)             AS activos,
        SUM(activo_backlog)          AS activo_backlog,
        SUM(negociables)             AS negociables,
        ROUND(AVG(cpl)::numeric, 2)                  AS cpl,
        ROUND(AVG(costo_ingreso_bitrix)::numeric, 2) AS costo_ingreso_bitrix,
        ROUND(AVG(costo_ingreso_jot)::numeric, 2)    AS costo_ingreso_jot,
        ROUND(AVG(costo_activa)::numeric, 2)         AS costo_activa,
        ROUND(AVG(costo_activa_backlog)::numeric, 2) AS costo_activa_backlog,
        ROUND(AVG(costo_por_negociable)::numeric, 2) AS costo_por_negociable
      FROM public.mv_monitoreo_publicidad
      WHERE fecha BETWEEN $1::date AND $2::date
        ${invOrigenWhere}
      GROUP BY dia ORDER BY dia ASC
    `, [desde, hasta, ...invOrigenParams]);

    // ── BLOQUE 2: Leads + Etapas por día (mestra_bitrix) ────────────────────
    const { where: bitOrigenWhere, params: bitOrigenParams } = buildOrigenWhere(2);
    const etapasRes = await pool.query(`
      SELECT
        EXTRACT(DAY FROM b_creado_el_fecha::date)::int AS dia,
        COUNT(*)                                         AS total_leads,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'ATC/SOPORTE')          AS atc_soporte,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'FUERA DE COBERTURA')   AS fuera_cobertura,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'ZONAS PELIGROSAS')     AS zonas_peligrosas,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'INNEGOCIABLE')         AS innegociable,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'VENTA SUBIDA')         AS venta_subida,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'SEGUIMIENTO NEGOCIACIÓN') AS seguimiento,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'GESTIÓN DIARIA')       AS gestion_diaria,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'DOCUMENTOS PENDIENTES') AS doc_pendientes,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'VOLVER A LLAMAR')      AS volver_llamar,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'MANTIENE PROVEEDOR')   AS mantiene_proveedor,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'OTRO PROVEEDOR')       AS otro_proveedor,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'NO VOLVER A CONTACTAR') AS no_volver_contactar,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'NO INTERESA COSTO PLAN') AS no_interesa_costo,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'DESISTE DE COMPRA')    AS desiste_compra,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'ZONAS PELIGROSAS')     AS zonas_pel2,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'CLIENTE DISCAPACIDAD') AS cliente_discapacidad,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'OPORTUNIDADES')        AS oportunidades,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'DUPLICADO')            AS duplicado,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'CONTRATO NETLIFE')     AS contrato_netlife
      FROM public.mestra_bitrix
      WHERE b_creado_el_fecha::date BETWEEN $1::date AND $2::date
        ${bitOrigenWhere}
      GROUP BY dia ORDER BY dia ASC
    `, [desde, hasta, ...bitOrigenParams]);

    // ── BLOQUE 3: Estatus ventas JOT por día (mv_monitoreo_publicidad) ───────
    const statusJotRes = await pool.query(`
      SELECT
        EXTRACT(DAY FROM fecha)::int AS dia,
        SUM(ingreso_jot)             AS ingreso_jot,
        SUM(ingreso_bitrix_mismo_dia) AS ingreso_bitrix,
        SUM(activo_backlog)          AS activo_backlog,
        SUM(activos_mes)             AS activos,
        SUM(total_ventas_jot)        AS total_ventas_jot,
        SUM(desiste_servicio_jot)    AS desiste_servicio_jot,
        SUM(regularizados)           AS regularizados,
        SUM(por_regularizar)         AS por_regularizar
      FROM public.mv_monitoreo_publicidad
      WHERE fecha BETWEEN $1::date AND $2::date
        ${invOrigenWhere}
      GROUP BY dia ORDER BY dia ASC
    `, [desde, hasta, ...invOrigenParams]);

    // ── BLOQUE 4: Forma de pago por día ──────────────────────────────────────
    const pagoRes = await pool.query(`
      SELECT
        EXTRACT(DAY FROM fecha)::int AS dia,
        SUM(pago_cuenta)          AS pago_cuenta,
        SUM(pago_efectivo)        AS pago_efectivo,
        SUM(pago_tarjeta)         AS pago_tarjeta,
        SUM(pago_cuenta_activa)   AS pago_cuenta_activa,
        SUM(pago_efectivo_activa) AS pago_efectivo_activa,
        SUM(pago_tarjeta_activa)  AS pago_tarjeta_activa
      FROM public.mv_monitoreo_publicidad
      WHERE fecha BETWEEN $1::date AND $2::date
        ${invOrigenWhere}
      GROUP BY dia ORDER BY dia ASC
    `, [desde, hasta, ...invOrigenParams]);

    // ── BLOQUE 5: Activos e Ingresos por ciudad ───────────────────────────────
    const ciudadRes = await pool.query(`
      SELECT ciudad, provincia,
        SUM(total_leads) AS total_leads,
        SUM(activos)     AS activos,
        SUM(ingresos_jot) AS ingresos_jot,
        ROUND(SUM(activos)::numeric / NULLIF(SUM(total_leads),0)*100,1) AS pct_activos
      FROM public.mv_monitoreo_ciudad
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY ciudad, provincia ORDER BY activos DESC NULLS LAST
    `, [desde, hasta]);

    // Ciudad por día (para columnas diarias)
    const ciudadDiaRes = await pool.query(`
      SELECT ciudad, EXTRACT(DAY FROM fecha)::int AS dia,
        SUM(activos) AS activos, SUM(ingresos_jot) AS ingresos_jot
      FROM public.mv_monitoreo_ciudad
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY ciudad, dia ORDER BY ciudad, dia
    `, [desde, hasta]);

    // ── BLOQUE 6: Leads por hora ──────────────────────────────────────────────
    const horaRes = await pool.query(`
      SELECT hora, SUM(n_leads) AS n_leads, SUM(atc) AS atc,
        ROUND(SUM(atc)::numeric / NULLIF(SUM(n_leads),0)*100,1) AS pct_atc
      FROM public.mv_monitoreo_hora
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY hora ORDER BY hora ASC
    `, [desde, hasta]);

    // Leads por hora por día (para la tabla cruzada hora×día)
    const horaDiaRes = await pool.query(`
      SELECT EXTRACT(DAY FROM fecha)::int AS dia, hora,
        SUM(n_leads) AS n_leads, SUM(atc) AS atc
      FROM public.mv_monitoreo_hora
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY dia, hora ORDER BY dia, hora
    `, [desde, hasta]);

    // ── BLOQUE 7: Ciclo de venta por día ─────────────────────────────────────
    const cicloRes = await pool.query(`
      SELECT
        EXTRACT(DAY FROM fecha)::int AS dia,
        SUM(ciclo_0_dias)    AS ciclo_0,
        SUM(ciclo_1_dia)     AS ciclo_1,
        SUM(ciclo_2_dias)    AS ciclo_2,
        SUM(ciclo_3_dias)    AS ciclo_3,
        SUM(ciclo_4_dias)    AS ciclo_4,
        SUM(ciclo_mas5_dias) AS ciclo_mas5
      FROM public.mv_monitoreo_publicidad
      WHERE fecha BETWEEN $1::date AND $2::date
        ${invOrigenWhere}
      GROUP BY dia ORDER BY dia ASC
    `, [desde, hasta, ...invOrigenParams]);

    // ── BLOQUE 8: Motivos ATC por día ─────────────────────────────────────────
    const atcRes = await pool.query(`
      SELECT motivo_atc,
        EXTRACT(DAY FROM fecha)::int AS dia,
        SUM(cantidad) AS cantidad
      FROM public.mv_monitoreo_atc
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY motivo_atc, dia ORDER BY motivo_atc, dia
    `, [desde, hasta]);

    // Totales motivos ATC
    const atcTotRes = await pool.query(`
      SELECT motivo_atc, SUM(cantidad) AS cantidad
      FROM public.mv_monitoreo_atc
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY motivo_atc ORDER BY cantidad DESC
    `, [desde, hasta]);

    // ── Orígenes disponibles ──────────────────────────────────────────────────
    const origenesDispRes = await pool.query(`
      SELECT DISTINCT b_origen FROM public.mestra_bitrix
      WHERE b_creado_el_fecha::date BETWEEN $1::date AND $2::date
        AND b_origen IS NOT NULL AND b_origen <> ''
      ORDER BY b_origen ASC
    `, [desde, hasta]);

    // ── Días del mes con nombre ───────────────────────────────────────────────
    const diasMes = [];
    const diasEnMes = new Date(y, m, 0).getDate();
    const DIAS_NOMBRE = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
    for (let d = 1; d <= diasEnMes; d++) {
      const fecha = new Date(y, m - 1, d);
      diasMes.push({ dia: d, nombre: DIAS_NOMBRE[fecha.getDay()] });
    }

    res.json({
      success: true,
      meta: { anio: y, mes: m, dias: diasMes },
      origenes_disponibles: origenesDispRes.rows.map(r => r.b_origen),
      inversion:   inversionRes.rows,
      etapas:      etapasRes.rows,
      status_jot:  statusJotRes.rows,
      pago:        pagoRes.rows,
      ciudad:      ciudadRes.rows,
      ciudad_dia:  ciudadDiaRes.rows,
      hora:        horaRes.rows,
      hora_dia:    horaDiaRes.rows,
      ciclo:       cicloRes.rows,
      atc_motivos: atcRes.rows,
      atc_totales: atcTotRes.rows,
    });

  } catch (error) {
    console.error('Error en getReporteData:', error);
    res.status(500).json({ success: false, message: 'Error al generar reporte', error: error.message });
  }
};

module.exports = {
  getMonitoreoRedes,
  getMonitoreoCiudad,
  getMonitoreoHora,
  getMonitoreoAtc,
  getMonitoreoCosto,
  getMonitoreoMetas,
  getReporteData,
};