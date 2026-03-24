const pool = require('../config/db');

const getFiltroFechas = (query) => {
  const hoy = new Date().toISOString().split('T')[0];
  return {
    fechaDesde: query.fechaDesde || hoy,
    fechaHasta: query.fechaHasta || hoy,
  };
};

// ─── MAPEO REAL según velsa_lineas_canal ──────────────────────────────────────
const ORIGEN_CANAL_MAP = {
  'BASE 593-979083368':                   'ARTS - Base 593-979083368',
  'BASE 593-995211968':                   'ARTS FACEBOOK - Base 593-995211968',
  'BASE 593-992827793':                   'ARTS GOOGLE - Base 593-992827793',
  'FORMULARIO LANDING 3':                 'ARTS GOOGLE - Base 593-992827793',
  'LLAMADA LANDING 3':                    'ARTS GOOGLE - Base 593-992827793',
  'POR RECOMENDACIÓN':                    'POR RECOMENDACIÓN - Por Recomendación',
  'REFERIDO PERSONAL':                    'POR RECOMENDACIÓN - Referido Personal',
  'TIENDA ONLINE':                        'POR RECOMENDACIÓN - Tienda online',
  'BASE 593-958993371':                   'REMARKETING - Base 593-958993371',
  'BASE 593-984414273':                   'REMARKETING - BASE 593-984414273',
  'BASE 593-995967355':                   'REMARKETING - Base 593-995967355',
  'WHATSAPP 593958993371':                'REMARKETING - Whatsapp 593958993371',
  'BASE 593-962881280':                   'VIDIKA GOOGLE',
  'BASE 593-987133635':                   'VIDIKA GOOGLE',
  'BASE API 593963463480':                'VIDIKA GOOGLE',
  'FORMULARIO LANDING 4':                 'VIDIKA GOOGLE',
  'LLAMADA':                              'VIDIKA GOOGLE',
  'LLAMADA LANDING 4':                    'VIDIKA GOOGLE',
  'BASE 593-958688121':                   'MAL INGRESO',
  'CONTRATO NETLIFE':                     'MAL INGRESO',
  'NO VOLVER A CONTACTAR':                'MAL INGRESO',
  'OPORTUNIDADES':                        'MAL INGRESO',
  'WAZZUP: WHATSAPP - ECUANET REGESTION': 'MAL INGRESO',
  'ZONAS PELIGROSAS':                     'MAL INGRESO',
  'VENTA ECUANET DIRECTA':                'MAL INGRESO',
};

// Grupos visuales del frontend → canales BD (canal_inversion en la vista)
const GRUPO_CANALES_BD = {
  'ARTS':              ['ARTS - Base 593-979083368'],
  'ARTS FACEBOOK':     ['ARTS FACEBOOK - Base 593-995211968'],
  'ARTS GOOGLE':       ['ARTS GOOGLE - Base 593-992827793','ARTS GOOGLE - Fomulario Landing 3','ARTS GOOGLE - Llamada Landing 3'],
  'REMARKETING':       ['REMARKETING - Base 593-958993371','REMARKETING - BASE 593-984414273','REMARKETING - Base 593-995967355','REMARKETING - Whatsapp 593958993371'],
  'VIDIKA GOOGLE':     ['VIDIKA GOOGLE'],
  'POR RECOMENDACIÓN': ['POR RECOMENDACIÓN - Por Recomendación','POR RECOMENDACIÓN - Referido Personal','POR RECOMENDACIÓN - Tienda online'],
};

// Grupos visuales → orígenes (b_origen en mestra_bitrix)
const GRUPO_ORIGENES = {
  'ARTS':              ['BASE 593-979083368'],
  'ARTS FACEBOOK':     ['BASE 593-995211968'],
  'ARTS GOOGLE':       ['BASE 593-992827793','FORMULARIO LANDING 3','LLAMADA LANDING 3'],
  'REMARKETING':       ['BASE 593-958993371','BASE 593-984414273','BASE 593-995967355','WHATSAPP 593958993371'],
  'VIDIKA GOOGLE':     ['BASE 593-962881280','BASE 593-987133635','BASE API 593963463480','FORMULARIO LANDING 4','LLAMADA','LLAMADA LANDING 4'],
  'POR RECOMENDACIÓN': ['POR RECOMENDACIÓN','REFERIDO PERSONAL','TIENDA ONLINE'],
};

// ─── 1. MONITOREO REDES GENERAL ──────────────────────────────────────────────
const getMonitoreoRedes = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);

    const totalesResult = await pool.query(`
      WITH por_canal_dia AS (
        SELECT fecha, canal_inversion,
          SUM(n_leads) AS n_leads, SUM(atc_soporte) AS atc_soporte,
          SUM(fuera_cobertura) AS fuera_cobertura, SUM(zonas_peligrosas) AS zonas_peligrosas,
          SUM(innegociable) AS innegociable, SUM(negociables) AS negociables,
          SUM(venta_subida_bitrix) AS venta_subida_bitrix, SUM(seguimiento_negociacion) AS seguimiento_negociacion,
          SUM(otro_proveedor) AS otro_proveedor, SUM(no_interesa_costo) AS no_interesa_costo,
          SUM(desiste_compra) AS desiste_compra, SUM(duplicado) AS duplicado,
          SUM(cliente_discapacidad) AS cliente_discapacidad,
          SUM(ingreso_jot) AS ingreso_jot, SUM(ingreso_bitrix_mismo_dia) AS ingreso_bitrix_mismo_dia,
          SUM(activo_backlog) AS activo_backlog, SUM(activos_mes) AS activos_mes,
          SUM(estado_activo_netlife) AS estado_activo_netlife, SUM(desiste_servicio_jot) AS desiste_servicio_jot,
          SUM(pago_cuenta) AS pago_cuenta, SUM(pago_efectivo) AS pago_efectivo, SUM(pago_tarjeta) AS pago_tarjeta,
          SUM(pago_cuenta_activa) AS pago_cuenta_activa, SUM(pago_efectivo_activa) AS pago_efectivo_activa,
          SUM(pago_tarjeta_activa) AS pago_tarjeta_activa,
          SUM(ciclo_0_dias) AS ciclo_0_dias, SUM(ciclo_1_dia) AS ciclo_1_dia,
          SUM(ciclo_2_dias) AS ciclo_2_dias, SUM(ciclo_3_dias) AS ciclo_3_dias,
          SUM(ciclo_4_dias) AS ciclo_4_dias, SUM(ciclo_mas5_dias) AS ciclo_mas5_dias,
          SUM(regularizados) AS regularizados, SUM(por_regularizar) AS por_regularizar,
          SUM(total_gestionables) AS total_gestionables, SUM(total_ventas_jot) AS total_ventas_jot,
          SUM(total_ventas_crm) AS total_ventas_crm, MAX(inversion_usd) AS inversion_usd
        FROM public.mv_monitoreo_publicidad
        WHERE fecha BETWEEN $1 AND $2 AND canal_inversion NOT IN ('MAL INGRESO','SIN MAPEO')
        GROUP BY fecha, canal_inversion
      )
      SELECT
        SUM(n_leads) AS n_leads, SUM(atc_soporte) AS atc_soporte,
        SUM(fuera_cobertura) AS fuera_cobertura, SUM(zonas_peligrosas) AS zonas_peligrosas,
        SUM(innegociable) AS innegociable, SUM(negociables) AS negociables,
        SUM(venta_subida_bitrix) AS venta_subida_bitrix, SUM(seguimiento_negociacion) AS seguimiento_negociacion,
        SUM(otro_proveedor) AS otro_proveedor, SUM(no_interesa_costo) AS no_interesa_costo,
        SUM(desiste_compra) AS desiste_compra, SUM(duplicado) AS duplicado,
        SUM(cliente_discapacidad) AS cliente_discapacidad,
        SUM(ingreso_jot) AS ingreso_jot, SUM(ingreso_bitrix_mismo_dia) AS ingreso_bitrix_mismo_dia,
        SUM(activo_backlog) AS activo_backlog, SUM(activos_mes) AS activos_mes,
        SUM(estado_activo_netlife) AS estado_activo_netlife, SUM(desiste_servicio_jot) AS desiste_servicio_jot,
        SUM(pago_cuenta) AS pago_cuenta, SUM(pago_efectivo) AS pago_efectivo, SUM(pago_tarjeta) AS pago_tarjeta,
        SUM(pago_cuenta_activa) AS pago_cuenta_activa, SUM(pago_efectivo_activa) AS pago_efectivo_activa,
        SUM(pago_tarjeta_activa) AS pago_tarjeta_activa,
        SUM(ciclo_0_dias) AS ciclo_0_dias, SUM(ciclo_1_dia) AS ciclo_1_dia,
        SUM(ciclo_2_dias) AS ciclo_2_dias, SUM(ciclo_3_dias) AS ciclo_3_dias,
        SUM(ciclo_4_dias) AS ciclo_4_dias, SUM(ciclo_mas5_dias) AS ciclo_mas5_dias,
        SUM(regularizados) AS regularizados, SUM(por_regularizar) AS por_regularizar,
        SUM(total_gestionables) AS total_gestionables, SUM(total_ventas_jot) AS total_ventas_jot,
        SUM(total_ventas_crm) AS total_ventas_crm, SUM(inversion_usd) AS inversion_usd,
        ROUND(CASE WHEN SUM(n_leads)>0 AND SUM(inversion_usd)>0 THEN SUM(inversion_usd)/SUM(n_leads) ELSE 0 END::numeric,2) AS cpl,
        ROUND(CASE WHEN SUM(ingreso_bitrix_mismo_dia)>0 AND SUM(inversion_usd)>0 THEN SUM(inversion_usd)/SUM(ingreso_bitrix_mismo_dia) ELSE 0 END::numeric,2) AS costo_ingreso_bitrix,
        ROUND(CASE WHEN SUM(ingreso_jot)>0 AND SUM(inversion_usd)>0 THEN SUM(inversion_usd)/SUM(ingreso_jot) ELSE 0 END::numeric,2) AS costo_ingreso_jot,
        ROUND(CASE WHEN SUM(activos_mes)>0 AND SUM(inversion_usd)>0 THEN SUM(inversion_usd)/SUM(activos_mes) ELSE 0 END::numeric,2) AS costo_activa,
        ROUND(CASE WHEN SUM(activo_backlog)>0 AND SUM(inversion_usd)>0 THEN SUM(inversion_usd)/SUM(activo_backlog) ELSE 0 END::numeric,2) AS costo_activa_backlog,
        ROUND(CASE WHEN SUM(negociables)>0 AND SUM(inversion_usd)>0 THEN SUM(inversion_usd)/SUM(negociables) ELSE 0 END::numeric,2) AS costo_por_negociable,
        ROUND(AVG(CASE WHEN n_leads>0 THEN atc_soporte::numeric/n_leads END)*100,1) AS pct_atc,
        ROUND(AVG(CASE WHEN n_leads>0 THEN fuera_cobertura::numeric/n_leads END)*100,1) AS pct_fuera_cobertura,
        ROUND(AVG(CASE WHEN n_leads>0 THEN innegociable::numeric/n_leads END)*100,1) AS pct_innegociable,
        ROUND(AVG(CASE WHEN n_leads>0 THEN negociables::numeric/n_leads END)*100,1) AS pct_negociable,
        ROUND(CASE WHEN SUM(n_leads)>0 THEN SUM(activos_mes)::numeric/SUM(n_leads)*100 ELSE 0 END::numeric,1) AS efectividad_total,
        ROUND(CASE WHEN SUM(negociables)>0 THEN SUM(activos_mes)::numeric/SUM(negociables)*100 ELSE 0 END::numeric,1) AS efectividad_negociables
      FROM por_canal_dia
    `, [fechaDesde, fechaHasta]);

    const detalleResult = await pool.query(`
      SELECT fecha, MIN(dia_semana) AS dia_semana, canal_inversion, canal_inversion AS canal_publicidad,
        SUM(n_leads) AS n_leads, SUM(atc_soporte) AS atc_soporte, SUM(fuera_cobertura) AS fuera_cobertura,
        SUM(zonas_peligrosas) AS zonas_peligrosas, SUM(innegociable) AS innegociable,
        SUM(negociables) AS negociables, SUM(venta_subida_bitrix) AS venta_subida_bitrix,
        SUM(seguimiento_negociacion) AS seguimiento_negociacion, SUM(otro_proveedor) AS otro_proveedor,
        SUM(no_interesa_costo) AS no_interesa_costo, SUM(desiste_compra) AS desiste_compra,
        SUM(duplicado) AS duplicado, SUM(cliente_discapacidad) AS cliente_discapacidad,
        SUM(ingreso_jot) AS ingreso_jot, SUM(ingreso_bitrix_mismo_dia) AS ingreso_bitrix_mismo_dia,
        SUM(activo_backlog) AS activo_backlog, SUM(activos_mes) AS activos_mes,
        SUM(estado_activo_netlife) AS estado_activo_netlife, SUM(desiste_servicio_jot) AS desiste_servicio_jot,
        SUM(pago_cuenta) AS pago_cuenta, SUM(pago_efectivo) AS pago_efectivo, SUM(pago_tarjeta) AS pago_tarjeta,
        SUM(pago_cuenta_activa) AS pago_cuenta_activa, SUM(pago_efectivo_activa) AS pago_efectivo_activa,
        SUM(pago_tarjeta_activa) AS pago_tarjeta_activa,
        SUM(ciclo_0_dias) AS ciclo_0_dias, SUM(ciclo_1_dia) AS ciclo_1_dia,
        SUM(ciclo_2_dias) AS ciclo_2_dias, SUM(ciclo_3_dias) AS ciclo_3_dias,
        SUM(ciclo_4_dias) AS ciclo_4_dias, SUM(ciclo_mas5_dias) AS ciclo_mas5_dias,
        SUM(regularizados) AS regularizados, SUM(por_regularizar) AS por_regularizar,
        SUM(total_gestionables) AS total_gestionables, SUM(total_ventas_jot) AS total_ventas_jot,
        SUM(total_ventas_crm) AS total_ventas_crm, MAX(inversion_usd) AS inversion_usd,
        ROUND(CASE WHEN SUM(n_leads)>0 AND MAX(inversion_usd)>0 THEN MAX(inversion_usd)/SUM(n_leads) ELSE 0 END::numeric,2) AS cpl,
        ROUND(CASE WHEN SUM(negociables)>0 AND MAX(inversion_usd)>0 THEN MAX(inversion_usd)/SUM(negociables) ELSE 0 END::numeric,2) AS costo_por_negociable,
        ROUND(CASE WHEN SUM(n_leads)>0 THEN SUM(atc_soporte)::numeric/SUM(n_leads)*100 ELSE 0 END::numeric,1) AS pct_atc,
        ROUND(CASE WHEN SUM(n_leads)>0 THEN SUM(negociables)::numeric/SUM(n_leads)*100 ELSE 0 END::numeric,1) AS pct_negociable,
        ROUND(CASE WHEN SUM(n_leads)>0 THEN SUM(activos_mes)::numeric/SUM(n_leads)*100 ELSE 0 END::numeric,1) AS efectividad_total,
        ROUND(CASE WHEN SUM(negociables)>0 THEN SUM(activos_mes)::numeric/SUM(negociables)*100 ELSE 0 END::numeric,1) AS efectividad_negociables
      FROM public.mv_monitoreo_publicidad
      WHERE fecha BETWEEN $1 AND $2 AND canal_inversion NOT IN ('MAL INGRESO','SIN MAPEO')
      GROUP BY fecha, canal_inversion ORDER BY fecha DESC, canal_inversion ASC
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
        SUM(total_leads) AS total_leads, SUM(activos) AS activos, SUM(ingresos_jot) AS ingresos_jot,
        ROUND(SUM(activos)::numeric/NULLIF(SUM(total_leads),0)*100,1) AS pct_activos
      FROM public.mv_monitoreo_ciudad WHERE fecha BETWEEN $1 AND $2
      GROUP BY ciudad, provincia ORDER BY activos DESC
    `, [fechaDesde, fechaHasta]);
    const detalleResult = await pool.query(`
      SELECT fecha, ciudad, provincia, total_leads, activos, ingresos_jot,
        ROUND(pct_activos::numeric*100,1) AS pct_activos
      FROM public.mv_monitoreo_ciudad WHERE fecha BETWEEN $1 AND $2
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
      SELECT hora, SUM(n_leads) AS n_leads, SUM(atc) AS atc,
        ROUND(SUM(atc)::numeric/NULLIF(SUM(n_leads),0)*100,1) AS pct_atc_hora
      FROM public.mv_monitoreo_hora WHERE fecha BETWEEN $1 AND $2
      GROUP BY hora ORDER BY hora ASC
    `, [fechaDesde, fechaHasta]);
    const detalleResult = await pool.query(`
      SELECT fecha, hora, n_leads, atc, ROUND(pct_atc_hora::numeric*100,1) AS pct_atc_hora
      FROM public.mv_monitoreo_hora WHERE fecha BETWEEN $1 AND $2
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
      SELECT motivo_atc, SUM(cantidad) AS cantidad FROM public.mv_monitoreo_atc
      WHERE fecha BETWEEN $1 AND $2 GROUP BY motivo_atc ORDER BY cantidad DESC
    `, [fechaDesde, fechaHasta]);
    const detalleResult = await pool.query(`
      SELECT fecha, motivo_atc, cantidad FROM public.mv_monitoreo_atc
      WHERE fecha BETWEEN $1 AND $2 ORDER BY fecha DESC, cantidad DESC
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
      SELECT b_origen, COUNT(*) AS total_leads,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion IN ('ATC/SOPORTE','FUERA DE COBERTURA','ZONAS PELIGROSAS','INNEGOCIABLE')) AS leads_sac,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'VENTA SUBIDA') AS venta_subida,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion IN ('INGRESO JOT','VENTA JOT')) AS ingreso_jot
      FROM public.mestra_bitrix WHERE ${fechaWhere} ${origenWhere}
      GROUP BY b_origen ORDER BY total_leads DESC
    `, allParams);

    let inversionPorCanal = {};
    try {
      const invRes = await pool.query(`
        SELECT canal_inversion, MAX(inversion_usd) AS inversion_usd_dia, fecha
        FROM public.mv_monitoreo_publicidad
        WHERE fecha BETWEEN $1::date AND $2::date AND canal_inversion NOT IN ('MAL INGRESO','SIN MAPEO')
        GROUP BY canal_inversion, fecha
      `, [desde, hasta]);
      invRes.rows.forEach(r => {
        inversionPorCanal[r.canal_inversion] = (inversionPorCanal[r.canal_inversion] || 0) + Number(r.inversion_usd_dia || 0);
      });
    } catch (_) {}

    const origenesDispRes = await pool.query(`
      SELECT DISTINCT b_origen FROM public.mestra_bitrix
      WHERE ${fechaWhere} AND b_origen IS NOT NULL AND b_origen <> ''
      ORDER BY b_origen ASC
    `, fechaParams);

    const canales = totalesRes.rows.map(r => {
      const total    = Number(r.total_leads || 0);
      const sac      = Number(r.leads_sac || 0);
      const ventas   = Number(r.venta_subida || 0);
      const jot      = Number(r.ingreso_jot || 0);
      const calidad  = total - sac;
      const canalInv = ORIGEN_CANAL_MAP[r.b_origen] || 'SIN MAPEO';
      const inversion = inversionPorCanal[canalInv] || 0;
      return {
        origen: r.b_origen, total_leads: total, leads_sac: sac,
        leads_calidad: calidad, venta_subida: ventas, ingreso_jot: jot,
        inversion_usd: inversion,
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

    res.json({ success: true, canales, origenes_disponibles: origenesDispRes.rows.map(r => r.b_origen) });
  } catch (error) {
    console.error('Error en getMonitoreoMetas:', error);
    res.status(500).json({ success: false, message: 'Error al obtener metas', error: error.message });
  }
};

// ─── 7. REPORTE DATA ──────────────────────────────────────────────────────────
const getReporteData = async (req, res) => {
  try {
    const { anio, mes } = req.query;
    const hoy  = new Date();
    const y    = parseInt(anio || hoy.getFullYear());
    const m    = parseInt(mes  || (hoy.getMonth() + 1));
    const desde = `${y}-${String(m).padStart(2, '0')}-01`;
    const hasta  = `${y}-${String(m).padStart(2, '0')}-31`;

    let origenes = [], canalesPublicidad = [];
    const canalesRaw = req.query.canales || '';

    if (canalesRaw) {
      const gruposSel = canalesRaw.split(',').map(c => c.trim()).filter(Boolean);
      gruposSel.forEach(g => {
        if (GRUPO_ORIGENES[g])   origenes          = [...origenes,          ...GRUPO_ORIGENES[g]];
        if (GRUPO_CANALES_BD[g]) canalesPublicidad = [...canalesPublicidad, ...GRUPO_CANALES_BD[g]];
      });
      origenes          = [...new Set(origenes)];
      canalesPublicidad = [...new Set(canalesPublicidad)];
    }

    const buildWhere = (offset, field, values) => {
      if (!values || values.length === 0) return { where: '', params: [] };
      const ph = values.map((_, i) => `$${offset + i + 1}`).join(', ');
      return { where: `AND ${field} IN (${ph})`, params: values };
    };

    const { where: invWhere, params: invParams } = buildWhere(2, 'canal_inversion', canalesPublicidad);
    const { where: bitWhere, params: bitParams } = buildWhere(2, 'b_origen', origenes);

    // ── Inversión (MAX por canal×día) ─────────────────────────────────────────
    const inversionRes = await pool.query(`
      SELECT EXTRACT(DAY FROM fecha)::int AS dia, SUM(MAX_inv) AS inversion_usd
      FROM (
        SELECT fecha, canal_inversion, MAX(inversion_usd) AS MAX_inv
        FROM public.mv_monitoreo_publicidad
        WHERE fecha BETWEEN $1::date AND $2::date ${invWhere}
        GROUP BY fecha, canal_inversion
      ) sub
      GROUP BY EXTRACT(DAY FROM fecha)::int ORDER BY dia ASC
    `, [desde, hasta, ...invParams]);

    // ── Leads + Etapas (mestra_bitrix) ────────────────────────────────────────
    const etapasRes = await pool.query(`
      SELECT EXTRACT(DAY FROM b_creado_el_fecha::date)::int AS dia,
        COUNT(*) AS total_leads,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'ATC/SOPORTE')             AS atc_soporte,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'FUERA DE COBERTURA')      AS fuera_cobertura,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'ZONAS PELIGROSAS')        AS zonas_peligrosas,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'INNEGOCIABLE')            AS innegociable,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'VENTA SUBIDA')            AS venta_subida,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'SEGUIMIENTO NEGOCIACIÓN') AS seguimiento,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'GESTIÓN DIARIA')          AS gestion_diaria,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'DOCUMENTOS PENDIENTES')   AS doc_pendientes,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'VOLVER A LLAMAR')         AS volver_llamar,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'MANTIENE PROVEEDOR')      AS mantiene_proveedor,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'OTRO PROVEEDOR')          AS otro_proveedor,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'NO VOLVER A CONTACTAR')   AS no_volver_contactar,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'NO INTERESA COSTO PLAN')  AS no_interesa_costo,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'DESISTE DE COMPRA')       AS desiste_compra,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'CLIENTE DISCAPACIDAD')    AS cliente_discapacidad,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'OPORTUNIDADES')           AS oportunidades,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'DUPLICADO')               AS duplicado,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'CONTRATO NETLIFE')        AS contrato_netlife
      FROM public.mestra_bitrix
      WHERE b_creado_el_fecha::date BETWEEN $1::date AND $2::date ${bitWhere}
      GROUP BY dia ORDER BY dia ASC
    `, [desde, hasta, ...bitParams]);

    // ── Denominadores JOT reales ──────────────────────────────────────────────
    const jotDenomsRes = await pool.query(`
      SELECT EXTRACT(DAY FROM b.b_creado_el_fecha::date)::int AS dia,
        COUNT(j.submission_id) FILTER (WHERE j.netlife_estatus ~~* '%ACTIVO%' AND j.fecha_activacion_date IS NOT NULL) AS activos_mes,
        COUNT(j.submission_id) FILTER (WHERE j.netlife_estatus ~~* '%ACTIVO%') AS activo_backlog,
        COUNT(j.submission_id) FILTER (WHERE j.fecha_ingreso_date IS NOT NULL) AS ingreso_jot,
        COUNT(j.submission_id) FILTER (WHERE j.fecha_ingreso_date = b.b_creado_el_fecha::date) AS ingreso_bitrix_mismo_dia,
        COUNT(j.submission_id) FILTER (WHERE j.netlife_estatus ~~* '%PREPLANEADO%' OR j.netlife_estatus ~~* '%REPLANIFICADO%') AS preplaneados,
        COUNT(j.submission_id) FILTER (WHERE j.netlife_estatus ~~* '%ASIGNADO%') AS asignados,
        COUNT(j.submission_id) FILTER (WHERE j.netlife_estatus ~~* '%PRESERVICIO%') AS preservicio
      FROM public.mestra_bitrix b
      JOIN public.vw_jotform_submissions_parsed j ON j.id_bitrix = b.b_id::text
      WHERE b.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
        AND j.id_bitrix IS NOT NULL AND TRIM(j.id_bitrix) <> '' ${bitWhere}
      GROUP BY dia ORDER BY dia ASC
    `, [desde, hasta, ...bitParams]);

    // ── Combinar en inversionFinal ─────────────────────────────────────────────
    const invMap = {};
    inversionRes.rows.forEach(r => {
      invMap[Number(r.dia)] = { dia: Number(r.dia), inversion_usd: Number(r.inversion_usd || 0) };
    });
    etapasRes.rows.forEach(r => {
      const dia = Number(r.dia);
      if (!invMap[dia]) invMap[dia] = { dia, inversion_usd: 0 };
      const sac = Number(r.atc_soporte||0)+Number(r.fuera_cobertura||0)+Number(r.zonas_peligrosas||0)+Number(r.innegociable||0);
      invMap[dia].n_leads      = Number(r.total_leads || 0);
      invMap[dia].venta_subida = Number(r.venta_subida || 0);
      invMap[dia].negociables  = Math.max(0, Number(r.total_leads||0) - sac);
    });
    jotDenomsRes.rows.forEach(r => {
      const dia = Number(r.dia);
      if (!invMap[dia]) invMap[dia] = { dia, inversion_usd: 0 };
      invMap[dia].activos_mes   = Number(r.activos_mes || 0);
      invMap[dia].activo_backlog = Number(r.activo_backlog || 0);
      invMap[dia].ingreso_jot   = Number(r.ingreso_jot || 0);
      invMap[dia].ingreso_bitrix = Number(r.ingreso_bitrix_mismo_dia || 0);
      invMap[dia].preplaneados  = Number(r.preplaneados || 0);
      invMap[dia].asignados     = Number(r.asignados || 0);
      invMap[dia].preservicio   = Number(r.preservicio || 0);
    });
    const inversionFinal = Object.values(invMap).sort((a, b) => a.dia - b.dia);

    // ── Estatus JOT ───────────────────────────────────────────────────────────
    const statusJotRes = await pool.query(`
      SELECT EXTRACT(DAY FROM b.b_creado_el_fecha::date)::int AS dia,
        COUNT(j.submission_id) FILTER (WHERE j.fecha_ingreso_date IS NOT NULL) AS ingreso_jot,
        COUNT(j.submission_id) FILTER (WHERE j.fecha_ingreso_date = b.b_creado_el_fecha::date) AS ingreso_bitrix,
        COUNT(j.submission_id) FILTER (WHERE j.netlife_estatus ~~* '%ACTIVO%') AS activo_backlog,
        COUNT(j.submission_id) FILTER (WHERE j.netlife_estatus ~~* '%ACTIVO%' AND j.fecha_activacion_date IS NOT NULL) AS activos,
        COUNT(j.submission_id) AS total_ventas_jot,
        COUNT(j.submission_id) FILTER (WHERE j.netlife_estatus ~~* '%DESISTE%') AS desiste_servicio_jot,
        COUNT(j.submission_id) FILTER (WHERE j.regularizado ~~* '%REGULARIZADO%' AND j.regularizado !~~* '%NO REQUIERE%' AND j.regularizado !~~* '%POR REGULARIZAR%') AS regularizados,
        COUNT(j.submission_id) FILTER (WHERE j.regularizado ~~* '%POR REGULARIZAR%') AS por_regularizar
      FROM public.mestra_bitrix b
      JOIN public.vw_jotform_submissions_parsed j ON j.id_bitrix = b.b_id::text
      WHERE b.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
        AND j.id_bitrix IS NOT NULL AND TRIM(j.id_bitrix) <> '' ${bitWhere}
      GROUP BY dia ORDER BY dia ASC
    `, [desde, hasta, ...bitParams]);

    // ── Forma de pago ─────────────────────────────────────────────────────────
    const pagoRes = await pool.query(`
      SELECT EXTRACT(DAY FROM b.b_creado_el_fecha::date)::int AS dia,
        SUM(CASE WHEN j.forma_pago ~~* '%CUENTA%'   THEN 1 ELSE 0 END) AS pago_cuenta,
        SUM(CASE WHEN j.forma_pago ~~* '%EFECTIVO%' THEN 1 ELSE 0 END) AS pago_efectivo,
        SUM(CASE WHEN j.forma_pago ~~* '%TARJETA%'  THEN 1 ELSE 0 END) AS pago_tarjeta,
        SUM(CASE WHEN j.forma_pago ~~* '%CUENTA%'   AND j.netlife_estatus ~~* '%ACTIVO%' AND j.fecha_activacion_date IS NOT NULL THEN 1 ELSE 0 END) AS pago_cuenta_activa,
        SUM(CASE WHEN j.forma_pago ~~* '%EFECTIVO%' AND j.netlife_estatus ~~* '%ACTIVO%' AND j.fecha_activacion_date IS NOT NULL THEN 1 ELSE 0 END) AS pago_efectivo_activa,
        SUM(CASE WHEN j.forma_pago ~~* '%TARJETA%'  AND j.netlife_estatus ~~* '%ACTIVO%' AND j.fecha_activacion_date IS NOT NULL THEN 1 ELSE 0 END) AS pago_tarjeta_activa
      FROM public.mestra_bitrix b
      JOIN public.vw_jotform_submissions_parsed j ON j.id_bitrix = b.b_id::text
      WHERE b.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
        AND j.id_bitrix IS NOT NULL AND TRIM(j.id_bitrix) <> '' ${bitWhere}
      GROUP BY dia ORDER BY dia ASC
    `, [desde, hasta, ...bitParams]);

    // ── Ciclo de venta ────────────────────────────────────────────────────────
    const cicloRes = await pool.query(`
      SELECT EXTRACT(DAY FROM b.b_creado_el_fecha::date)::int AS dia,
        SUM(CASE WHEN j.fecha_activacion_date IS NOT NULL AND (j.fecha_activacion_date-b.b_creado_el_fecha::date)=0  THEN 1 ELSE 0 END) AS ciclo_0,
        SUM(CASE WHEN j.fecha_activacion_date IS NOT NULL AND (j.fecha_activacion_date-b.b_creado_el_fecha::date)=1  THEN 1 ELSE 0 END) AS ciclo_1,
        SUM(CASE WHEN j.fecha_activacion_date IS NOT NULL AND (j.fecha_activacion_date-b.b_creado_el_fecha::date)=2  THEN 1 ELSE 0 END) AS ciclo_2,
        SUM(CASE WHEN j.fecha_activacion_date IS NOT NULL AND (j.fecha_activacion_date-b.b_creado_el_fecha::date)=3  THEN 1 ELSE 0 END) AS ciclo_3,
        SUM(CASE WHEN j.fecha_activacion_date IS NOT NULL AND (j.fecha_activacion_date-b.b_creado_el_fecha::date)=4  THEN 1 ELSE 0 END) AS ciclo_4,
        SUM(CASE WHEN j.fecha_activacion_date IS NOT NULL AND (j.fecha_activacion_date-b.b_creado_el_fecha::date)>=5 THEN 1 ELSE 0 END) AS ciclo_mas5
      FROM public.mestra_bitrix b
      JOIN public.vw_jotform_submissions_parsed j ON j.id_bitrix = b.b_id::text
      WHERE b.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
        AND j.id_bitrix IS NOT NULL AND TRIM(j.id_bitrix) <> '' ${bitWhere}
      GROUP BY dia ORDER BY dia ASC
    `, [desde, hasta, ...bitParams]);

    // ── Ciudad, Hora, ATC ─────────────────────────────────────────────────────
    const ciudadRes = await pool.query(`
      SELECT ciudad, provincia, SUM(total_leads) AS total_leads, SUM(activos) AS activos,
        SUM(ingresos_jot) AS ingresos_jot,
        ROUND(SUM(activos)::numeric/NULLIF(SUM(total_leads),0)*100,1) AS pct_activos
      FROM public.mv_monitoreo_ciudad WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY ciudad, provincia ORDER BY activos DESC NULLS LAST
    `, [desde, hasta]);

    const ciudadDiaRes = await pool.query(`
      SELECT ciudad, EXTRACT(DAY FROM fecha)::int AS dia, SUM(activos) AS activos, SUM(ingresos_jot) AS ingresos_jot
      FROM public.mv_monitoreo_ciudad WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY ciudad, dia ORDER BY ciudad, dia
    `, [desde, hasta]);

    const horaRes = await pool.query(`
      SELECT hora, SUM(n_leads) AS n_leads, SUM(atc) AS atc,
        ROUND(SUM(atc)::numeric/NULLIF(SUM(n_leads),0)*100,1) AS pct_atc
      FROM public.mv_monitoreo_hora WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY hora ORDER BY hora ASC
    `, [desde, hasta]);

    const horaDiaRes = await pool.query(`
      SELECT EXTRACT(DAY FROM fecha)::int AS dia, hora, SUM(n_leads) AS n_leads, SUM(atc) AS atc
      FROM public.mv_monitoreo_hora WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY dia, hora ORDER BY dia, hora
    `, [desde, hasta]);

    const atcRes = await pool.query(`
      SELECT motivo_atc, EXTRACT(DAY FROM fecha)::int AS dia, SUM(cantidad) AS cantidad
      FROM public.mv_monitoreo_atc WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY motivo_atc, dia ORDER BY motivo_atc, dia
    `, [desde, hasta]);

    const atcTotRes = await pool.query(`
      SELECT motivo_atc, SUM(cantidad) AS cantidad FROM public.mv_monitoreo_atc
      WHERE fecha BETWEEN $1::date AND $2::date GROUP BY motivo_atc ORDER BY cantidad DESC
    `, [desde, hasta]);

    // ── Canales disponibles agrupados ─────────────────────────────────────────
    const origenesDispRes = await pool.query(`
      SELECT DISTINCT b_origen FROM public.mestra_bitrix
      WHERE b_creado_el_fecha::date BETWEEN $1::date AND $2::date
        AND b_origen IS NOT NULL AND b_origen <> ''
      ORDER BY b_origen ASC
    `, [desde, hasta]);

    const gruposEncontrados = new Set();
    origenesDispRes.rows.forEach(r => {
      for (const [grupo, origs] of Object.entries(GRUPO_ORIGENES)) {
        if (origs.includes(r.b_origen)) gruposEncontrados.add(grupo);
      }
    });
    const canalesDisponibles = [...gruposEncontrados].sort().map(grupo => ({
      canal: grupo,
      lineas: GRUPO_ORIGENES[grupo] || [],
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
      meta:                 { anio: y, mes: m, dias: diasMes },
      origenes_disponibles: origenesDispRes.rows.map(r => r.b_origen),
      canales_disponibles:  canalesDisponibles,
      inversion:   inversionFinal,
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