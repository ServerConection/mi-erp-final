// PATCH para monitoreoController.js
// El problema: la vista tiene una fila por origen×día
// La inversión viene igual en todas las filas del mismo canal×día
// Solución: en getMonitoreoRedes, agregar primero por canal_inversion×fecha
// antes de calcular totales, para no duplicar la inversión

const pool = require('../config/db');

const getFiltroFechas = (query) => {
  const hoy = new Date().toISOString().split('T')[0];
  return {
    fechaDesde: query.fechaDesde || hoy,
    fechaHasta: query.fechaHasta || hoy,
  };
};

// ─── 1. MONITOREO REDES GENERAL ──────────────────────────────────────────────
const getMonitoreoRedes = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);

    // ── TOTALES correctos ──
    // Primero agrupamos por canal_inversion×fecha para tomar la inversión UNA SOLA VEZ
    // luego sumamos leads, negociables, etc. de todas las líneas de ese canal
    const totalesResult = await pool.query(`
      WITH por_canal_dia AS (
        SELECT
          fecha,
          canal_inversion,
          -- Leads: suma de todas las líneas del canal
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
          -- Inversión: MAX porque todas las filas del canal tienen el mismo valor
          -- MAX equivale a "tomar una sola vez" ya que son iguales
          MAX(inversion_usd)        AS inversion_usd
        FROM public.mv_monitoreo_publicidad
        WHERE fecha BETWEEN $1 AND $2
          AND canal_inversion NOT IN ('MAL INGRESO', 'SIN MAPEO')
        GROUP BY fecha, canal_inversion
      )
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
        -- CPL y costos calculados sobre totales correctos
        ROUND(CASE WHEN SUM(n_leads) > 0 AND SUM(inversion_usd) > 0
          THEN SUM(inversion_usd) / SUM(n_leads) ELSE 0 END::numeric, 2) AS cpl,
        ROUND(CASE WHEN SUM(ingreso_bitrix_mismo_dia) > 0 AND SUM(inversion_usd) > 0
          THEN SUM(inversion_usd) / SUM(ingreso_bitrix_mismo_dia) ELSE 0 END::numeric, 2) AS costo_ingreso_bitrix,
        ROUND(CASE WHEN SUM(ingreso_jot) > 0 AND SUM(inversion_usd) > 0
          THEN SUM(inversion_usd) / SUM(ingreso_jot) ELSE 0 END::numeric, 2) AS costo_ingreso_jot,
        ROUND(CASE WHEN SUM(activos_mes) > 0 AND SUM(inversion_usd) > 0
          THEN SUM(inversion_usd) / SUM(activos_mes) ELSE 0 END::numeric, 2) AS costo_activa,
        ROUND(CASE WHEN SUM(activo_backlog) > 0 AND SUM(inversion_usd) > 0
          THEN SUM(inversion_usd) / SUM(activo_backlog) ELSE 0 END::numeric, 2) AS costo_activa_backlog,
        ROUND(CASE WHEN SUM(negociables) > 0 AND SUM(inversion_usd) > 0
          THEN SUM(inversion_usd) / SUM(negociables) ELSE 0 END::numeric, 2) AS costo_por_negociable,
        ROUND(AVG(CASE WHEN n_leads > 0 THEN atc_soporte::numeric / n_leads END) * 100, 1) AS pct_atc,
        ROUND(AVG(CASE WHEN n_leads > 0 THEN fuera_cobertura::numeric / n_leads END) * 100, 1) AS pct_fuera_cobertura,
        ROUND(AVG(CASE WHEN n_leads > 0 THEN innegociable::numeric / n_leads END) * 100, 1) AS pct_innegociable,
        ROUND(AVG(CASE WHEN n_leads > 0 THEN negociables::numeric / n_leads END) * 100, 1) AS pct_negociable,
        ROUND(CASE WHEN SUM(n_leads) > 0 THEN SUM(activos_mes)::numeric / SUM(n_leads) * 100 ELSE 0 END::numeric, 1) AS efectividad_total,
        ROUND(CASE WHEN SUM(negociables) > 0 THEN SUM(activos_mes)::numeric / SUM(negociables) * 100 ELSE 0 END::numeric, 1) AS efectividad_negociables
      FROM por_canal_dia
    `, [fechaDesde, fechaHasta]);

    // ── DETALLE: una fila por canal_inversion×fecha (no por origen) ──
    // Así el frontend recibe datos ya limpios sin duplicar inversión
    const detalleResult = await pool.query(`
      SELECT
        fecha,
        MIN(dia_semana) AS dia_semana,
        canal_inversion,
        canal_inversion AS canal_publicidad,
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
        -- Inversión: MAX = tomar UNA vez el valor del canal (todas las filas son iguales)
        MAX(inversion_usd)        AS inversion_usd,
        ROUND(CASE WHEN SUM(n_leads) > 0 AND MAX(inversion_usd) > 0
          THEN MAX(inversion_usd) / SUM(n_leads) ELSE 0 END::numeric, 2) AS cpl,
        ROUND(CASE WHEN SUM(ingreso_bitrix_mismo_dia) > 0 AND MAX(inversion_usd) > 0
          THEN MAX(inversion_usd) / SUM(ingreso_bitrix_mismo_dia) ELSE 0 END::numeric, 2) AS costo_ingreso_bitrix,
        ROUND(CASE WHEN SUM(ingreso_jot) > 0 AND MAX(inversion_usd) > 0
          THEN MAX(inversion_usd) / SUM(ingreso_jot) ELSE 0 END::numeric, 2) AS costo_ingreso_jot,
        ROUND(CASE WHEN SUM(activos_mes) > 0 AND MAX(inversion_usd) > 0
          THEN MAX(inversion_usd) / SUM(activos_mes) ELSE 0 END::numeric, 2) AS costo_activa,
        ROUND(CASE WHEN SUM(activo_backlog) > 0 AND MAX(inversion_usd) > 0
          THEN MAX(inversion_usd) / SUM(activo_backlog) ELSE 0 END::numeric, 2) AS costo_activa_backlog,
        ROUND(CASE WHEN SUM(negociables) > 0 AND MAX(inversion_usd) > 0
          THEN MAX(inversion_usd) / SUM(negociables) ELSE 0 END::numeric, 2) AS costo_por_negociable,
        ROUND(CASE WHEN SUM(n_leads) > 0
          THEN SUM(atc_soporte)::numeric / SUM(n_leads) * 100 ELSE 0 END::numeric, 1) AS pct_atc,
        ROUND(CASE WHEN SUM(n_leads) > 0
          THEN SUM(fuera_cobertura)::numeric / SUM(n_leads) * 100 ELSE 0 END::numeric, 1) AS pct_fuera_cobertura,
        ROUND(CASE WHEN SUM(n_leads) > 0
          THEN SUM(innegociable)::numeric / SUM(n_leads) * 100 ELSE 0 END::numeric, 1) AS pct_innegociable,
        ROUND(CASE WHEN SUM(n_leads) > 0
          THEN SUM(negociables)::numeric / SUM(n_leads) * 100 ELSE 0 END::numeric, 1) AS pct_negociable,
        ROUND(CASE WHEN SUM(n_leads) > 0
          THEN SUM(activos_mes)::numeric / SUM(n_leads) * 100 ELSE 0 END::numeric, 1) AS efectividad_total,
        ROUND(CASE WHEN SUM(negociables) > 0
          THEN SUM(activos_mes)::numeric / SUM(negociables) * 100 ELSE 0 END::numeric, 1) AS efectividad_negociables
      FROM public.mv_monitoreo_publicidad
      WHERE fecha BETWEEN $1 AND $2
        AND canal_inversion NOT IN ('MAL INGRESO', 'SIN MAPEO')
      GROUP BY fecha, canal_inversion
      ORDER BY fecha DESC, canal_inversion ASC
    `, [fechaDesde, fechaHasta]);

    res.json({ success: true, totales: totalesResult.rows[0], data: detalleResult.rows });
  } catch (error) {
    console.error('Error en getMonitoreoRedes:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos', error: error.message });
  }
};

// ─── 2. MONITOREO POR CIUDAD ──────────────────────────────────────────────────
const getMonitoreoCiudad = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);

    const totalesResult = await pool.query(`
      SELECT ciudad, provincia,
        SUM(total_leads) AS total_leads,
        SUM(activos)     AS activos,
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

    res.json({ success: true, totales: totalesResult.rows, data: detalleResult.rows });
  } catch (error) {
    console.error('Error en getMonitoreoCiudad:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos por ciudad', error: error.message });
  }
};

// ─── 3. MONITOREO POR HORA ────────────────────────────────────────────────────
const getMonitoreoHora = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);

    const totalesResult = await pool.query(`
      SELECT hora,
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

    res.json({ success: true, totales: totalesResult.rows, data: detalleResult.rows });
  } catch (error) {
    console.error('Error en getMonitoreoHora:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos por hora', error: error.message });
  }
};

// ─── 4. MONITOREO MOTIVOS ATC ─────────────────────────────────────────────────
const getMonitoreoAtc = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);

    const totalesResult = await pool.query(`
      SELECT motivo_atc, SUM(cantidad) AS cantidad
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

    res.json({ success: true, totales: totalesResult.rows, data: detalleResult.rows });
  } catch (error) {
    console.error('Error en getMonitoreoAtc:', error);
    res.status(500).json({ success: false, message: 'Error al obtener motivos ATC', error: error.message });
  }
};

// ─── 5. MONITOREO COSTO (placeholder) ────────────────────────────────────────
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
      GROUP BY b_origen
      ORDER BY total_leads DESC
    `, allParams);

    // Inversión correcta: agrupar por canal_inversion para no duplicar
    let inversionPorOrigen = {};
    try {
      const invRes = await pool.query(`
        SELECT canal_inversion, MAX(inversion_usd) AS inversion_usd_dia, fecha
        FROM public.mv_monitoreo_publicidad
        WHERE fecha BETWEEN $1::date AND $2::date
          AND canal_inversion NOT IN ('MAL INGRESO', 'SIN MAPEO')
        GROUP BY canal_inversion, fecha
      `, [desde, hasta]);
      // Suma por canal (ya sin duplicar por día)
      invRes.rows.forEach(r => {
        const canal = r.canal_inversion;
        inversionPorOrigen[canal] = (inversionPorOrigen[canal] || 0) + Number(r.inversion_usd_dia || 0);
      });
    } catch (_) {}

    const origenesDispRes = await pool.query(`
      SELECT DISTINCT b_origen FROM public.mestra_bitrix
      WHERE ${fechaWhere} AND b_origen IS NOT NULL AND b_origen <> ''
      ORDER BY b_origen ASC
    `, fechaParams);

    // Mapeo origen → canal (mismo que frontend)
    const ORIGEN_CANAL_MAP = {
      "BASE 593-979083368": "ARTS - Base 593-979083368",
      "BASE 593-995211968": "ARTS FACEBOOK - Base 593-995211968",
      "BASE 593-992827793": "ARTS GOOGLE - Base 593-992827793",
      "FORMULARIO LANDING 3": "ARTS GOOGLE - Base 593-992827793",
      "LLAMADA LANDING 3": "ARTS GOOGLE - Base 593-992827793",
      "POR RECOMENDACIÓN": "POR RECOMENDACIÓN - Por Recomendación",
      "REFERIDO PERSONAL": "POR RECOMENDACIÓN - Referido Personal",
      "TIENDA ONLINE": "POR RECOMENDACIÓN - Tienda online",
      "BASE 593-958993371": "REMARKETING - Base 593-958993371",
      "BASE 593-984414273": "REMARKETING - BASE 593-984414273",
      "BASE 593-995967355": "REMARKETING - Base 593-995967355",
      "WHATSAPP 593958993371": "REMARKETING - Whatsapp 593958993371",
      "BASE 593-962881280": "VIDIKA GOOGLE",
      "BASE 593-987133635": "VIDIKA GOOGLE",
      "BASE API 593963463480": "VIDIKA GOOGLE",
      "FORMULARIO LANDING 4": "VIDIKA GOOGLE",
      "LLAMADA": "VIDIKA GOOGLE",
      "LLAMADA LANDING 4": "VIDIKA GOOGLE",
    };

    const canales = totalesRes.rows.map(r => {
      const total    = Number(r.total_leads || 0);
      const sac      = Number(r.leads_sac || 0);
      const ventas   = Number(r.venta_subida || 0);
      const jot      = Number(r.ingreso_jot || 0);
      const calidad  = total - sac;
      const canalInv = ORIGEN_CANAL_MAP[r.b_origen?.toUpperCase()] || ORIGEN_CANAL_MAP[r.b_origen] || r.b_origen;
      const inversion = inversionPorOrigen[canalInv] || 0;

      return {
        origen:         r.b_origen,
        total_leads:    total,
        leads_sac:      sac,
        leads_calidad:  calidad,
        venta_subida:   ventas,
        ingreso_jot:    jot,
        inversion_usd:  inversion,
        pct_sac:        total > 0 ? (sac     / total) * 100 : 0,
        pct_calidad:    total > 0 ? (calidad / total) * 100 : 0,
        pct_ventas:     total > 0 ? (ventas  / total) * 100 : 0,
        pct_ventas_jot: total > 0 ? (jot     / total) * 100 : 0,
        cpl:      total   > 0 && inversion > 0 ? inversion / total   : null,
        cpl_gest: calidad > 0 && inversion > 0 ? inversion / calidad : null,
        cpa:      ventas  > 0 && inversion > 0 ? inversion / ventas  : null,
        cpa_jot:  jot     > 0 && inversion > 0 ? inversion / jot     : null,
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

// ─── 7. REPORTE DATA ──────────────────────────────────────────────────────────
const getReporteData = async (req, res) => {
  try {
    const { anio, mes } = req.query;
    const hoy   = new Date();
    const y     = parseInt(anio || hoy.getFullYear());
    const m     = parseInt(mes  || (hoy.getMonth() + 1));
    const desde = `${y}-${String(m).padStart(2, '0')}-01`;
    const hasta  = `${y}-${String(m).padStart(2, '0')}-31`;

    // ── Soporte doble: ?canales= (nuevo) o ?origenes= (legado) ───────────────
    // El frontend puede enviar cualquiera de los dos.
    // Si viene ?canales= se mapea automáticamente a orígenes/canal_inversion.
    const ORIGEN_CANAL_MAP = {
      'BASE 593-979083368': 'ARTS', 'BASE 593-995211968': 'ARTS FACEBOOK',
      'BASE 593-992827793': 'ARTS GOOGLE', 'FORMULARIO LANDING 3': 'ARTS GOOGLE',
      'LLAMADA LANDING 3': 'ARTS GOOGLE', 'POR RECOMENDACIÓN': 'POR RECOMENDACIÓN',
      'REFERIDO PERSONAL': 'POR RECOMENDACIÓN', 'TIENDA ONLINE': 'POR RECOMENDACIÓN',
      'BASE 593-958993371': 'REMARKETING', 'BASE 593-984414273': 'REMARKETING',
      'BASE 593-995967355': 'REMARKETING', 'WHATSAPP 593958993371': 'REMARKETING',
      'BASE 593-962881280': 'VIDIKA GOOGLE', 'BASE 593-987133635': 'VIDIKA GOOGLE',
      'BASE API 593963463480': 'VIDIKA GOOGLE', 'FORMULARIO LANDING 4': 'VIDIKA GOOGLE',
      'LLAMADA': 'VIDIKA GOOGLE', 'LLAMADA LANDING 4': 'VIDIKA GOOGLE',
    };

    // Construir lista de orígenes y canales de publicidad a filtrar
    let origenes = [], canalesPublicidad = [];

    const canalesRaw = req.query.canales || '';
    const origenesRaw = req.query.origenes || '';

    if (canalesRaw) {
      // Nuevo: filtro por canal → mapear a orígenes automáticamente
      const canalesSel = canalesRaw.split(',').map(c => c.trim()).filter(Boolean);
      origenes = Object.entries(ORIGEN_CANAL_MAP)
        .filter(([, canal]) => canalesSel.includes(canal))
        .map(([origen]) => origen);
      canalesPublicidad = canalesSel;
    } else if (origenesRaw) {
      // Legado: filtro por origen
      origenes = origenesRaw.split(',').map(o => o.trim()).filter(Boolean);
      canalesPublicidad = [...new Set(origenes.map(o => ORIGEN_CANAL_MAP[o]).filter(Boolean))];
    }
    // Si ninguno → sin filtro = todos

    const buildWhere = (offset, field, values) => {
      if (!values || values.length === 0) return { where: '', params: [] };
      const ph = values.map((_, i) => `$${offset + i + 1}`).join(', ');
      return { where: `AND ${field} IN (${ph})`, params: values };
    };

    // ── BLOQUE 1: Inversión — MAX por canal×día (sin duplicar) ───────────────
    // Nuevos campos: preplaneados, asignados, preservicio desde vista_jotform / mv
    const { where: invWhere, params: invParams } = buildWhere(2, 'canal_inversion', canalesPublicidad);
    const inversionRes = await pool.query(`
      SELECT
        EXTRACT(DAY FROM fecha)::int AS dia,
        SUM(MAX_inv)        AS inversion_usd,
        SUM(n_leads_s)      AS n_leads,
        SUM(venta_subida_s) AS venta_subida,
        SUM(jot_s)          AS ingreso_jot,
        SUM(activos_s)      AS activos_mes,
        SUM(backlog_s)      AS activo_backlog,
        SUM(negoc_s)        AS negociables,
        SUM(preplan_s)      AS preplaneados,
        SUM(asig_s)         AS asignados,
        SUM(preserv_s)      AS preservicio
      FROM (
        SELECT
          fecha, canal_inversion,
          MAX(inversion_usd)             AS MAX_inv,
          SUM(n_leads)                   AS n_leads_s,
          SUM(venta_subida_bitrix)       AS venta_subida_s,
          SUM(ingreso_jot)               AS jot_s,
          SUM(activos_mes)               AS activos_s,
          SUM(activo_backlog)            AS backlog_s,
          SUM(negociables)               AS negoc_s,
          -- Preplaneados = PREPLANEADO + REPLANIFICADO en netlife_estatus_real
          COALESCE(SUM(preplaneados), 0) AS preplan_s,
          -- Asignados = ASIGNADO
          COALESCE(SUM(asignados), 0)    AS asig_s,
          -- Preservicio = PRESERVICIO
          COALESCE(SUM(preservicio), 0)  AS preserv_s
        FROM public.mv_monitoreo_publicidad
        WHERE fecha BETWEEN $1::date AND $2::date
          ${invWhere}
        GROUP BY fecha, canal_inversion
      ) sub
      GROUP BY EXTRACT(DAY FROM fecha)::int
      ORDER BY dia ASC
    `, [desde, hasta, ...invParams]);

    // ── BLOQUE 2: Leads + Etapas (mestra_bitrix) ──────────────────────────────
    const { where: bitWhere, params: bitParams } = buildWhere(2, 'b_origen', origenes);
    const etapasRes = await pool.query(`
      SELECT
        EXTRACT(DAY FROM b_creado_el_fecha::date)::int AS dia,
        COUNT(*)                                        AS total_leads,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'ATC/SOPORTE')            AS atc_soporte,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'FUERA DE COBERTURA')     AS fuera_cobertura,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'ZONAS PELIGROSAS')       AS zonas_peligrosas,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'INNEGOCIABLE')           AS innegociable,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'VENTA SUBIDA')           AS venta_subida,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'SEGUIMIENTO NEGOCIACIÓN') AS seguimiento,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'GESTIÓN DIARIA')         AS gestion_diaria,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'DOCUMENTOS PENDIENTES')  AS doc_pendientes,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'VOLVER A LLAMAR')        AS volver_llamar,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'MANTIENE PROVEEDOR')     AS mantiene_proveedor,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'OTRO PROVEEDOR')         AS otro_proveedor,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'NO VOLVER A CONTACTAR')  AS no_volver_contactar,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'NO INTERESA COSTO PLAN') AS no_interesa_costo,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'DESISTE DE COMPRA')      AS desiste_compra,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'CLIENTE DISCAPACIDAD')   AS cliente_discapacidad,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'OPORTUNIDADES')          AS oportunidades,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'DUPLICADO')              AS duplicado,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'CONTRATO NETLIFE')       AS contrato_netlife
      FROM public.mestra_bitrix
      WHERE b_creado_el_fecha::date BETWEEN $1::date AND $2::date
        ${bitWhere}
      GROUP BY dia ORDER BY dia ASC
    `, [desde, hasta, ...bitParams]);

    // ── BLOQUE 3: Estatus ventas JOT ─────────────────────────────────────────
    const statusJotRes = await pool.query(`
      SELECT
        EXTRACT(DAY FROM fecha)::int AS dia,
        SUM(jot_s)      AS ingreso_jot,
        SUM(bitrix_s)   AS ingreso_bitrix,
        SUM(backlog_s)  AS activo_backlog,
        SUM(activos_s)  AS activos,
        SUM(tvj_s)      AS total_ventas_jot,
        SUM(dsj_s)      AS desiste_servicio_jot,
        SUM(reg_s)      AS regularizados,
        SUM(preg_s)     AS por_regularizar
      FROM (
        SELECT fecha, canal_inversion,
          SUM(ingreso_jot)               AS jot_s,
          SUM(ingreso_bitrix_mismo_dia)  AS bitrix_s,
          SUM(activo_backlog)            AS backlog_s,
          SUM(activos_mes)               AS activos_s,
          SUM(total_ventas_jot)          AS tvj_s,
          SUM(desiste_servicio_jot)      AS dsj_s,
          SUM(regularizados)             AS reg_s,
          SUM(por_regularizar)           AS preg_s
        FROM public.mv_monitoreo_publicidad
        WHERE fecha BETWEEN $1::date AND $2::date ${invWhere}
        GROUP BY fecha, canal_inversion
      ) sub
      GROUP BY EXTRACT(DAY FROM fecha)::int ORDER BY dia ASC
    `, [desde, hasta, ...invParams]);

    // ── BLOQUE 4: Forma de pago ───────────────────────────────────────────────
    const pagoRes = await pool.query(`
      SELECT EXTRACT(DAY FROM fecha)::int AS dia,
        SUM(pago_cuenta) AS pago_cuenta, SUM(pago_efectivo) AS pago_efectivo,
        SUM(pago_tarjeta) AS pago_tarjeta, SUM(pago_cuenta_activa) AS pago_cuenta_activa,
        SUM(pago_efectivo_activa) AS pago_efectivo_activa, SUM(pago_tarjeta_activa) AS pago_tarjeta_activa
      FROM (
        SELECT fecha, canal_inversion,
          SUM(pago_cuenta) AS pago_cuenta, SUM(pago_efectivo) AS pago_efectivo,
          SUM(pago_tarjeta) AS pago_tarjeta, SUM(pago_cuenta_activa) AS pago_cuenta_activa,
          SUM(pago_efectivo_activa) AS pago_efectivo_activa, SUM(pago_tarjeta_activa) AS pago_tarjeta_activa
        FROM public.mv_monitoreo_publicidad
        WHERE fecha BETWEEN $1::date AND $2::date ${invWhere}
        GROUP BY fecha, canal_inversion
      ) sub
      GROUP BY EXTRACT(DAY FROM fecha)::int ORDER BY dia ASC
    `, [desde, hasta, ...invParams]);

    // ── BLOQUE 5: Ciudad ──────────────────────────────────────────────────────
    const ciudadRes = await pool.query(`
      SELECT ciudad, provincia,
        SUM(total_leads) AS total_leads, SUM(activos) AS activos, SUM(ingresos_jot) AS ingresos_jot,
        ROUND(SUM(activos)::numeric / NULLIF(SUM(total_leads), 0) * 100, 1) AS pct_activos
      FROM public.mv_monitoreo_ciudad
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY ciudad, provincia ORDER BY activos DESC NULLS LAST
    `, [desde, hasta]);

    const ciudadDiaRes = await pool.query(`
      SELECT ciudad, EXTRACT(DAY FROM fecha)::int AS dia,
        SUM(activos) AS activos, SUM(ingresos_jot) AS ingresos_jot
      FROM public.mv_monitoreo_ciudad
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY ciudad, dia ORDER BY ciudad, dia
    `, [desde, hasta]);

    // ── BLOQUE 6: Hora ────────────────────────────────────────────────────────
    const horaRes = await pool.query(`
      SELECT hora, SUM(n_leads) AS n_leads, SUM(atc) AS atc,
        ROUND(SUM(atc)::numeric / NULLIF(SUM(n_leads), 0) * 100, 1) AS pct_atc
      FROM public.mv_monitoreo_hora
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY hora ORDER BY hora ASC
    `, [desde, hasta]);

    const horaDiaRes = await pool.query(`
      SELECT EXTRACT(DAY FROM fecha)::int AS dia, hora,
        SUM(n_leads) AS n_leads, SUM(atc) AS atc
      FROM public.mv_monitoreo_hora
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY dia, hora ORDER BY dia, hora
    `, [desde, hasta]);

    // ── BLOQUE 7: Ciclo ───────────────────────────────────────────────────────
    const cicloRes = await pool.query(`
      SELECT EXTRACT(DAY FROM fecha)::int AS dia,
        SUM(ciclo_0) AS ciclo_0, SUM(ciclo_1) AS ciclo_1, SUM(ciclo_2) AS ciclo_2,
        SUM(ciclo_3) AS ciclo_3, SUM(ciclo_4) AS ciclo_4, SUM(ciclo_mas5) AS ciclo_mas5
      FROM (
        SELECT fecha, canal_inversion,
          SUM(ciclo_0_dias) AS ciclo_0, SUM(ciclo_1_dia) AS ciclo_1,
          SUM(ciclo_2_dias) AS ciclo_2, SUM(ciclo_3_dias) AS ciclo_3,
          SUM(ciclo_4_dias) AS ciclo_4, SUM(ciclo_mas5_dias) AS ciclo_mas5
        FROM public.mv_monitoreo_publicidad
        WHERE fecha BETWEEN $1::date AND $2::date ${invWhere}
        GROUP BY fecha, canal_inversion
      ) sub
      GROUP BY EXTRACT(DAY FROM fecha)::int ORDER BY dia ASC
    `, [desde, hasta, ...invParams]);

    // ── BLOQUE 8: Motivos ATC ─────────────────────────────────────────────────
    const atcRes = await pool.query(`
      SELECT motivo_atc, EXTRACT(DAY FROM fecha)::int AS dia, SUM(cantidad) AS cantidad
      FROM public.mv_monitoreo_atc
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY motivo_atc, dia ORDER BY motivo_atc, dia
    `, [desde, hasta]);

    const atcTotRes = await pool.query(`
      SELECT motivo_atc, SUM(cantidad) AS cantidad
      FROM public.mv_monitoreo_atc
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY motivo_atc ORDER BY cantidad DESC
    `, [desde, hasta]);

    // ── Canales disponibles (para el selector del frontend) ───────────────────
    const origenesDispRes = await pool.query(`
      SELECT DISTINCT b_origen FROM public.mestra_bitrix
      WHERE b_creado_el_fecha::date BETWEEN $1::date AND $2::date
        AND b_origen IS NOT NULL AND b_origen <> ''
      ORDER BY b_origen ASC
    `, [desde, hasta]);

    // Canales únicos derivados de los orígenes disponibles
    const canalesDisponibles = [...new Set(
      origenesDispRes.rows
        .map(r => ORIGEN_CANAL_MAP[r.b_origen])
        .filter(Boolean)
    )].sort().map(canal => ({
      canal,
      lineas: Object.entries(ORIGEN_CANAL_MAP)
        .filter(([, c]) => c === canal)
        .map(([o]) => o),
    }));

    // ── Días del mes ──────────────────────────────────────────────────────────
    const diasMes = [];
    const diasEnMes = new Date(y, m, 0).getDate();
    const DIAS_NOMBRE = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
    for (let d = 1; d <= diasEnMes; d++) {
      diasMes.push({ dia: d, nombre: DIAS_NOMBRE[new Date(y, m - 1, d).getDay()] });
    }

    res.json({
      success: true,
      meta:                { anio: y, mes: m, dias: diasMes },
      origenes_disponibles: origenesDispRes.rows.map(r => r.b_origen),
      canales_disponibles:  canalesDisponibles,
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