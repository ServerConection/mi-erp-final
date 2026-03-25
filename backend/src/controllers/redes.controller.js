const pool = require('../config/db');

const getFiltroFechas = (query) => {
  const hoy = new Date().toISOString().split('T')[0];
  return {
    fechaDesde: query.fechaDesde || hoy,
    fechaHasta: query.fechaHasta || hoy,
  };
};

const ORIGEN_A_CANAL_INV = {
  'BASE 593-979083368':    'ARTS',
  'BASE 593-995211968':    'ARTS FACEBOOK',
  'BASE 593-992827793':    'ARTS GOOGLE',
  'FORMULARIO LANDING 3':  'ARTS GOOGLE',
  'LLAMADA LANDING 3':     'ARTS GOOGLE',
  'POR RECOMENDACIÓN':     'POR RECOMENDACIÓN',
  'REFERIDO PERSONAL':     'POR RECOMENDACIÓN',
  'TIENDA ONLINE':         'POR RECOMENDACIÓN',
  'BASE 593-958993371':    'REMARKETING',
  'BASE 593-984414273':    'REMARKETING',
  'BASE 593-995967355':    'REMARKETING',
  'WHATSAPP 593958993371': 'REMARKETING',
  'BASE 593-962881280':    'VIDIKA GOOGLE',
  'BASE 593-987133635':    'VIDIKA GOOGLE',
  'BASE API 593963463480': 'VIDIKA GOOGLE',
  'FORMULARIO LANDING 4':  'VIDIKA GOOGLE',
  'LLAMADA':               'VIDIKA GOOGLE',
  'LLAMADA LANDING 4':     'VIDIKA GOOGLE',
};

const GRUPO_A_CANAL_INV = {
  'ARTS':              ['ARTS'],
  'ARTS FACEBOOK':     ['ARTS FACEBOOK'],
  'ARTS GOOGLE':       ['ARTS GOOGLE'],
  'REMARKETING':       ['REMARKETING'],
  'VIDIKA GOOGLE':     ['VIDIKA GOOGLE'],
  'POR RECOMENDACIÓN': ['POR RECOMENDACIÓN'],
};

const GRUPO_A_ORIGENES = {
  'ARTS':              ['BASE 593-979083368'],
  'ARTS FACEBOOK':     ['BASE 593-995211968'],
  'ARTS GOOGLE':       ['BASE 593-992827793', 'FORMULARIO LANDING 3', 'LLAMADA LANDING 3'],
  'REMARKETING':       ['BASE 593-958993371', 'BASE 593-984414273', 'BASE 593-995967355', 'WHATSAPP 593958993371'],
  'VIDIKA GOOGLE':     ['BASE 593-962881280', 'BASE 593-987133635', 'BASE API 593963463480', 'FORMULARIO LANDING 4', 'LLAMADA', 'LLAMADA LANDING 4'],
  'POR RECOMENDACIÓN': ['POR RECOMENDACIÓN', 'REFERIDO PERSONAL', 'TIENDA ONLINE'],
};

const GRUPOS_DISPONIBLES = Object.keys(GRUPO_A_ORIGENES);

const buildInWhere = (valores, offsetInicial, field) => {
  if (!valores || valores.length === 0) return { where: '', params: [] };
  const ph = valores.map((_, i) => `$${offsetInicial + i + 1}`).join(', ');
  return { where: `AND ${field} IN (${ph})`, params: valores };
};

const resolverGrupos = (gruposSel = []) => {
  if (gruposSel.length === 0) return { origenesBitrix: [], canalesInversion: [] };
  const origenesBitrix   = [];
  const canalesInversion = new Set();
  gruposSel.forEach(g => {
    (GRUPO_A_ORIGENES[g]  || []).forEach(o => origenesBitrix.push(o));
    (GRUPO_A_CANAL_INV[g] || []).forEach(c => canalesInversion.add(c));
  });
  return { origenesBitrix: [...new Set(origenesBitrix)], canalesInversion: [...canalesInversion] };
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. MONITOREO REDES GENERAL
// ─────────────────────────────────────────────────────────────────────────────
const getMonitoreoRedes = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);
    const gruposRaw = req.query.canales || '';
    const gruposSel = gruposRaw ? gruposRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
    const { origenesBitrix, canalesInversion } = resolverGrupos(gruposSel);
    const { where: canalWhere, params: canalParams } = buildInWhere(canalesInversion, 2, 'canal_inversion');

    // FIX: costo_ingreso_bitrix — el subquery anterior cruzaba t1 con t2 sobre
    // mestra_bitrix comparando j_fecha_registro_sistema = b_creado_el_fecha,
    // pero ese JOIN devolvía 0 porque la condición de b_origen no estaba aplicada
    // correctamente. Ahora se usa ingreso_bitrix_mismo_dia de la MV directamente,
    // que ya tiene ese cálculo pre-agregado y filtrado por fecha/canal.
    const totalesResult = await pool.query(`
      WITH por_canal_dia AS (
        SELECT fecha, canal_inversion,
          SUM(n_leads)                  AS n_leads,
          SUM(atc_soporte)              AS atc_soporte,
          SUM(fuera_cobertura)          AS fuera_cobertura,
          SUM(zonas_peligrosas)         AS zonas_peligrosas,
          SUM(innegociable)             AS innegociable,
          SUM(negociables)              AS negociables,
          SUM(venta_subida_bitrix)      AS venta_subida_bitrix,
          SUM(seguimiento_negociacion)  AS seguimiento_negociacion,
          SUM(otro_proveedor)           AS otro_proveedor,
          SUM(no_interesa_costo)        AS no_interesa_costo,
          SUM(desiste_compra)           AS desiste_compra,
          SUM(duplicado)               AS duplicado,
          SUM(cliente_discapacidad)     AS cliente_discapacidad,
          SUM(ingreso_jot)              AS ingreso_jot,
          SUM(ingreso_bitrix_mismo_dia) AS ingreso_bitrix_mismo_dia,
          SUM(activo_backlog)           AS activo_backlog,
          SUM(activos_mes)              AS activos_mes,
          SUM(estado_activo_netlife)    AS estado_activo_netlife,
          SUM(desiste_servicio_jot)     AS desiste_servicio_jot,
          SUM(pago_cuenta)              AS pago_cuenta,
          SUM(pago_efectivo)            AS pago_efectivo,
          SUM(pago_tarjeta)             AS pago_tarjeta,
          SUM(pago_cuenta_activa)       AS pago_cuenta_activa,
          SUM(pago_efectivo_activa)     AS pago_efectivo_activa,
          SUM(pago_tarjeta_activa)      AS pago_tarjeta_activa,
          SUM(ciclo_0_dias)             AS ciclo_0_dias,
          SUM(ciclo_1_dia)              AS ciclo_1_dia,
          SUM(ciclo_2_dias)             AS ciclo_2_dias,
          SUM(ciclo_3_dias)             AS ciclo_3_dias,
          SUM(ciclo_4_dias)             AS ciclo_4_dias,
          SUM(ciclo_mas5_dias)          AS ciclo_mas5_dias,
          SUM(regularizados)            AS regularizados,
          SUM(por_regularizar)          AS por_regularizar,
          SUM(total_gestionables)       AS total_gestionables,
          SUM(total_ventas_jot)         AS total_ventas_jot,
          SUM(total_ventas_crm)         AS total_ventas_crm,
          MAX(inversion_usd)            AS inversion_usd
        FROM public.mv_monitoreo_publicidad
        WHERE fecha BETWEEN $1 AND $2
          AND canal_inversion NOT IN ('MAL INGRESO','SIN MAPEO')
          ${canalWhere}
        GROUP BY fecha, canal_inversion
      )
      SELECT
        SUM(n_leads)                  AS n_leads,
        SUM(atc_soporte)              AS atc_soporte,
        SUM(fuera_cobertura)          AS fuera_cobertura,
        SUM(zonas_peligrosas)         AS zonas_peligrosas,
        SUM(innegociable)             AS innegociable,
        SUM(negociables)              AS negociables,
        SUM(venta_subida_bitrix)      AS venta_subida_bitrix,
        SUM(seguimiento_negociacion)  AS seguimiento_negociacion,
        SUM(otro_proveedor)           AS otro_proveedor,
        SUM(no_interesa_costo)        AS no_interesa_costo,
        SUM(desiste_compra)           AS desiste_compra,
        SUM(duplicado)               AS duplicado,
        SUM(cliente_discapacidad)     AS cliente_discapacidad,
        SUM(ingreso_jot)              AS ingreso_jot,
        SUM(ingreso_bitrix_mismo_dia) AS ingreso_bitrix_mismo_dia,
        SUM(activo_backlog)           AS activo_backlog,
        SUM(activos_mes)              AS activos_mes,
        SUM(estado_activo_netlife)    AS estado_activo_netlife,
        SUM(desiste_servicio_jot)     AS desiste_servicio_jot,
        SUM(pago_cuenta)              AS pago_cuenta,
        SUM(pago_efectivo)            AS pago_efectivo,
        SUM(pago_tarjeta)             AS pago_tarjeta,
        SUM(pago_cuenta_activa)       AS pago_cuenta_activa,
        SUM(pago_efectivo_activa)     AS pago_efectivo_activa,
        SUM(pago_tarjeta_activa)      AS pago_tarjeta_activa,
        SUM(ciclo_0_dias)             AS ciclo_0_dias,
        SUM(ciclo_1_dia)              AS ciclo_1_dia,
        SUM(ciclo_2_dias)             AS ciclo_2_dias,
        SUM(ciclo_3_dias)             AS ciclo_3_dias,
        SUM(ciclo_4_dias)             AS ciclo_4_dias,
        SUM(ciclo_mas5_dias)          AS ciclo_mas5_dias,
        SUM(regularizados)            AS regularizados,
        SUM(por_regularizar)          AS por_regularizar,
        SUM(total_gestionables)       AS total_gestionables,
        SUM(total_ventas_jot)         AS total_ventas_jot,
        SUM(total_ventas_crm)         AS total_ventas_crm,
        SUM(inversion_usd)            AS inversion_usd,

        -- CPL
        ROUND(CASE WHEN SUM(n_leads) > 0 AND SUM(inversion_usd) > 0
          THEN SUM(inversion_usd) / SUM(n_leads) ELSE 0 END::numeric, 2) AS cpl,

        -- FIX costo_ingreso_bitrix: se usa ingreso_bitrix_mismo_dia de la MV
        -- (leads JOT cuya fecha_registro = fecha_creacion_bitrix, pre-calculado en la MV)
        -- en lugar del subquery con JOIN roto que siempre devolvía 0
        ROUND(CASE WHEN SUM(ingreso_bitrix_mismo_dia) > 0 AND SUM(inversion_usd) > 0
          THEN SUM(inversion_usd) / SUM(ingreso_bitrix_mismo_dia) ELSE 0 END::numeric, 2) AS costo_ingreso_bitrix,

        ROUND(CASE WHEN SUM(ingreso_jot) > 0 AND SUM(inversion_usd) > 0
          THEN SUM(inversion_usd) / SUM(ingreso_jot) ELSE 0 END::numeric, 2) AS costo_ingreso_jot,

        ROUND(CASE WHEN SUM(activos_mes) > 0 AND SUM(inversion_usd) > 0
          THEN SUM(inversion_usd) / SUM(activos_mes) ELSE 0 END::numeric, 2) AS costo_activa,

        ROUND(CASE WHEN SUM(activo_backlog) > 0 AND SUM(inversion_usd) > 0
          THEN SUM(inversion_usd) / SUM(activo_backlog) ELSE 0 END::numeric, 2) AS costo_activa_backlog,

        ROUND(CASE WHEN SUM(negociables) > 0 AND SUM(inversion_usd) > 0
          THEN SUM(inversion_usd) / SUM(negociables) ELSE 0 END::numeric, 2) AS costo_por_negociable

      FROM por_canal_dia
    `, [fechaDesde, fechaHasta, ...canalParams]);

    const detalleResult = await pool.query(`
      SELECT fecha, MIN(dia_semana) AS dia_semana,
        canal_inversion, canal_inversion AS canal_publicidad,
        SUM(n_leads)                  AS n_leads,
        SUM(atc_soporte)              AS atc_soporte,
        SUM(fuera_cobertura)          AS fuera_cobertura,
        SUM(zonas_peligrosas)         AS zonas_peligrosas,
        SUM(innegociable)             AS innegociable,
        SUM(negociables)              AS negociables,
        SUM(venta_subida_bitrix)      AS venta_subida_bitrix,
        SUM(seguimiento_negociacion)  AS seguimiento_negociacion,
        SUM(otro_proveedor)           AS otro_proveedor,
        SUM(no_interesa_costo)        AS no_interesa_costo,
        SUM(desiste_compra)           AS desiste_compra,
        SUM(duplicado)               AS duplicado,
        SUM(cliente_discapacidad)     AS cliente_discapacidad,
        SUM(ingreso_jot)              AS ingreso_jot,
        SUM(ingreso_bitrix_mismo_dia) AS ingreso_bitrix_mismo_dia,
        SUM(activo_backlog)           AS activo_backlog,
        SUM(activos_mes)              AS activos_mes,
        SUM(estado_activo_netlife)    AS estado_activo_netlife,
        SUM(desiste_servicio_jot)     AS desiste_servicio_jot,
        SUM(pago_cuenta)              AS pago_cuenta,
        SUM(pago_efectivo)            AS pago_efectivo,
        SUM(pago_tarjeta)             AS pago_tarjeta,
        SUM(pago_cuenta_activa)       AS pago_cuenta_activa,
        SUM(pago_efectivo_activa)     AS pago_efectivo_activa,
        SUM(pago_tarjeta_activa)      AS pago_tarjeta_activa,
        SUM(ciclo_0_dias)             AS ciclo_0_dias,
        SUM(ciclo_1_dia)              AS ciclo_1_dia,
        SUM(ciclo_2_dias)             AS ciclo_2_dias,
        SUM(ciclo_3_dias)             AS ciclo_3_dias,
        SUM(ciclo_4_dias)             AS ciclo_4_dias,
        SUM(ciclo_mas5_dias)          AS ciclo_mas5_dias,
        SUM(regularizados)            AS regularizados,
        SUM(por_regularizar)          AS por_regularizar,
        SUM(total_gestionables)       AS total_gestionables,
        SUM(total_ventas_jot)         AS total_ventas_jot,
        SUM(total_ventas_crm)         AS total_ventas_crm,
        MAX(inversion_usd)            AS inversion_usd
      FROM public.mv_monitoreo_publicidad
      WHERE fecha BETWEEN $1 AND $2
        AND canal_inversion NOT IN ('MAL INGRESO','SIN MAPEO')
        ${canalWhere}
      GROUP BY fecha, canal_inversion
      ORDER BY fecha DESC, canal_inversion ASC
    `, [fechaDesde, fechaHasta, ...canalParams]);

    res.json({
      success: true,
      totales: totalesResult.rows[0],
      data: detalleResult.rows,
      canales_disponibles: GRUPOS_DISPONIBLES.map(g => ({ canal: g, lineas: GRUPO_A_ORIGENES[g] })),
    });
  } catch (error) {
    console.error('Error en getMonitoreoRedes:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. MONITOREO POR CIUDAD
// ─────────────────────────────────────────────────────────────────────────────
const getMonitoreoCiudad = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);
    const totalesResult = await pool.query(`
      SELECT ciudad, provincia,
        SUM(total_leads) AS total_leads, SUM(activos) AS activos,
        SUM(ingresos_jot) AS ingresos_jot,
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

// ─────────────────────────────────────────────────────────────────────────────
// 3. MONITOREO POR HORA
// ─────────────────────────────────────────────────────────────────────────────
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
      SELECT fecha, hora, n_leads, atc,
        ROUND(pct_atc_hora::numeric*100,1) AS pct_atc_hora
      FROM public.mv_monitoreo_hora WHERE fecha BETWEEN $1 AND $2
      ORDER BY fecha DESC, hora ASC
    `, [fechaDesde, fechaHasta]);
    res.json({ success: true, totales: totalesResult.rows, data: detalleResult.rows });
  } catch (error) {
    console.error('Error en getMonitoreoHora:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos por hora', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. MONITOREO MOTIVOS ATC
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 5. MONITOREO COSTO (placeholder)
// ─────────────────────────────────────────────────────────────────────────────
const getMonitoreoCosto = async (req, res) => {
  try {
    res.json({ success: true, data: [], message: 'En desarrollo' });
  } catch (error) {
    console.error('Error en getMonitoreoCosto:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos de costos', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. MONITOREO METAS vs LOGROS
// ─────────────────────────────────────────────────────────────────────────────
const getMonitoreoMetas = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta, modo } = req.query;
    const hoy   = new Date().toISOString().split('T')[0];
    const desde = fechaDesde || hoy;
    const hasta = fechaHasta || hoy;

    const gruposRaw = req.query.canales || '';
    const gruposSel = gruposRaw ? gruposRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
    const { origenesBitrix, canalesInversion } = resolverGrupos(gruposSel);

    let fechaWhere, fechaParams;
    if (modo === 'mes') {
      fechaWhere  = `b_creado_el_fecha LIKE $1`;
      fechaParams = [`%${desde.slice(0, 7)}%`];
    } else {
      fechaWhere  = `b_creado_el_fecha::date BETWEEN $1::date AND $2::date`;
      fechaParams = [desde, hasta];
    }

    const offsetBit = fechaParams.length;
    const { where: bitrixWhere, params: bitrixParams } = buildInWhere(origenesBitrix, offsetBit, 'b_origen');
    const allParamsBitrix = [...fechaParams, ...bitrixParams];

    const totalesRes = await pool.query(`
      SELECT b_origen,
        COUNT(*) AS total_leads,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion IN (
          'ATC/SOPORTE','FUERA DE COBERTURA','ZONAS PELIGROSAS','INNEGOCIABLE'
        )) AS leads_sac,
        COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion = 'VENTA SUBIDA') AS venta_subida,
        COUNT(*) FILTER (WHERE j_id_bitrix IS NOT NULL) AS ingreso_jot
      FROM public.mestra_bitrix
      WHERE ${fechaWhere} ${bitrixWhere}
      GROUP BY b_origen ORDER BY total_leads DESC
    `, allParamsBitrix);

    let inversionPorGrupo = {};
    try {
      const { where: invWhere, params: invParams } = buildInWhere(canalesInversion, 2, 'canal_inversion');
      const invRes = await pool.query(`
        SELECT canal_inversion, SUM(max_inv) AS inversion_usd
        FROM (
          SELECT canal_inversion, fecha, MAX(inversion_usd) AS max_inv
          FROM public.mv_monitoreo_publicidad
          WHERE fecha BETWEEN $1::date AND $2::date
            AND canal_inversion NOT IN ('MAL INGRESO','SIN MAPEO')
            ${invWhere}
          GROUP BY canal_inversion, fecha
        ) sub
        GROUP BY canal_inversion
      `, [desde, hasta, ...invParams]);
      invRes.rows.forEach(r => {
        inversionPorGrupo[r.canal_inversion] = Number(r.inversion_usd || 0);
      });
    } catch (_) {}

    const grupoMap = {};
    totalesRes.rows.forEach(r => {
      const origenUp = (r.b_origen || '').toUpperCase();
      const grupo    = ORIGEN_A_CANAL_INV[origenUp] || 'SIN MAPEO';
      if (!grupoMap[grupo]) {
        grupoMap[grupo] = { canal: grupo, inversion_usd: inversionPorGrupo[grupo] || 0, lineas: [], total_leads: 0, leads_sac: 0, venta_subida: 0, ingreso_jot: 0 };
      }
      const total   = Number(r.total_leads  || 0);
      const sac     = Number(r.leads_sac    || 0);
      const ventas  = Number(r.venta_subida || 0);
      const jot     = Number(r.ingreso_jot  || 0);
      const calidad = total - sac;
      grupoMap[grupo].total_leads  += total;
      grupoMap[grupo].leads_sac    += sac;
      grupoMap[grupo].venta_subida += ventas;
      grupoMap[grupo].ingreso_jot  += jot;
      grupoMap[grupo].lineas.push({
        origen: r.b_origen, total_leads: total, leads_sac: sac, leads_calidad: calidad,
        venta_subida: ventas, ingreso_jot: jot,
        pct_sac: total > 0 ? (sac / total) * 100 : 0,
        pct_calidad: total > 0 ? (calidad / total) * 100 : 0,
        pct_ventas: total > 0 ? (ventas / total) * 100 : 0,
        pct_ventas_jot: total > 0 ? (jot / total) * 100 : 0,
      });
    });

    const canales = Object.values(grupoMap).map(c => {
      const { total_leads, leads_sac, venta_subida, ingreso_jot, inversion_usd } = c;
      const leads_calidad = total_leads - leads_sac;
      return {
        canal: c.canal, inversion_usd, total_leads, leads_sac, leads_calidad, venta_subida, ingreso_jot, lineas: c.lineas,
        pct_sac:        total_leads > 0 ? (leads_sac     / total_leads) * 100 : 0,
        pct_calidad:    total_leads > 0 ? (leads_calidad / total_leads) * 100 : 0,
        pct_ventas:     total_leads > 0 ? (venta_subida  / total_leads) * 100 : 0,
        pct_ventas_jot: total_leads > 0 ? (ingreso_jot   / total_leads) * 100 : 0,
        cpl:      total_leads   > 0 && inversion_usd > 0 ? inversion_usd / total_leads   : null,
        cpl_gest: leads_calidad > 0 && inversion_usd > 0 ? inversion_usd / leads_calidad : null,
        cpa:      venta_subida  > 0 && inversion_usd > 0 ? inversion_usd / venta_subida  : null,
        cpa_jot:  ingreso_jot   > 0 && inversion_usd > 0 ? inversion_usd / ingreso_jot   : null,
      };
    });

    res.json({ success: true, canales, canales_disponibles: GRUPOS_DISPONIBLES.map(g => ({ canal: g, lineas: GRUPO_A_ORIGENES[g] })) });
  } catch (error) {
    console.error('Error en getMonitoreoMetas:', error);
    res.status(500).json({ success: false, message: 'Error al obtener metas', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. REPORTE DATA
// ─────────────────────────────────────────────────────────────────────────────
const getReporteData = async (req, res) => {
  try {
    const { anio, mes } = req.query;
    const hoy = new Date();
    const y = parseInt(anio || hoy.getFullYear());
    const m = parseInt(mes  || (hoy.getMonth() + 1));

    const desde     = `${y}-${String(m).padStart(2,'0')}-01`;
    const ultimoDia = new Date(y, m, 0).getDate();
    const hasta     = `${y}-${String(m).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;

    const gruposRaw = req.query.canales || '';
    const gruposSel = gruposRaw ? gruposRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
    const { origenesBitrix, canalesInversion } = resolverGrupos(gruposSel);

    const invWhereClause = canalesInversion.length > 0 ? buildInWhere(canalesInversion, 2, 'canal_inversion').where  : '';
    const invParamsExtra = canalesInversion.length > 0 ? buildInWhere(canalesInversion, 2, 'canal_inversion').params : [];

    const bitWhereClause = origenesBitrix.length > 0 ? buildInWhere(origenesBitrix, 2, 'b_origen').where  : '';
    const bitParamsExtra = origenesBitrix.length > 0 ? buildInWhere(origenesBitrix, 2, 'b_origen').params : [];

    // ── Inversión diaria ──────────────────────────────────────────────────────
    const inversionRes = await pool.query(`
      SELECT EXTRACT(DAY FROM fecha)::int AS dia, SUM(max_inv) AS inversion_usd
      FROM (
        SELECT fecha, canal_inversion, MAX(inversion_usd) AS max_inv
        FROM public.mv_monitoreo_publicidad
        WHERE fecha BETWEEN $1::date AND $2::date
          AND canal_inversion NOT IN ('MAL INGRESO','SIN MAPEO')
          ${invWhereClause}
        GROUP BY fecha, canal_inversion
      ) sub
      GROUP BY EXTRACT(DAY FROM fecha)::int
      ORDER BY dia ASC
    `, [desde, hasta, ...invParamsExtra]);

    // ── Leads + Etapas Bitrix ─────────────────────────────────────────────────
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
      WHERE b_creado_el_fecha::date BETWEEN $1::date AND $2::date
        ${bitWhereClause}
      GROUP BY dia ORDER BY dia ASC
    `, [desde, hasta, ...bitParamsExtra]);

    // ── JOT denominadores ─────────────────────────────────────────────────────
    const jotDenomsRes = await pool.query(`
      SELECT
        EXTRACT(DAY FROM TO_DATE(j_fecha_registro_sistema, 'YYYY-MM-DD'))::int AS dia,
        COUNT(*) FILTER (
          WHERE j_fecha_registro_sistema IS NOT NULL AND j_fecha_registro_sistema <> ''
            AND TO_DATE(j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
        ) AS ingreso_jot,
        COUNT(*) FILTER (
          WHERE j_fecha_registro_sistema IS NOT NULL AND j_fecha_registro_sistema <> ''
            AND TO_DATE(j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
            AND TO_DATE(j_fecha_registro_sistema, 'YYYY-MM-DD') = b_creado_el_fecha::date
        ) AS ingreso_bitrix_mismo_dia,
        COUNT(*) FILTER (
          WHERE j_netlife_estatus_real ILIKE 'ACTIVO'
            AND j_fecha_activacion_netlife IS NOT NULL AND j_fecha_activacion_netlife <> ''
            AND TO_DATE(j_fecha_activacion_netlife, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
        ) AS activos_mes,
        COUNT(*) FILTER (
          WHERE j_netlife_estatus_real ILIKE 'ACTIVO'
            AND j_fecha_registro_sistema IS NOT NULL AND j_fecha_registro_sistema <> ''
            AND TO_DATE(j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
        ) AS activo_backlog,
        COUNT(*) FILTER (
          WHERE (j_netlife_estatus_real ILIKE '%PREPLANIFICADO%' OR j_netlife_estatus_real ILIKE '%REPLANIFICADO%')
            AND j_fecha_registro_sistema IS NOT NULL AND j_fecha_registro_sistema <> ''
            AND TO_DATE(j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
        ) AS preplaneados,
        COUNT(*) FILTER (
          WHERE j_netlife_estatus_real ILIKE '%ASIGNADO%'
            AND j_fecha_registro_sistema IS NOT NULL AND j_fecha_registro_sistema <> ''
            AND TO_DATE(j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
        ) AS asignados,
        COUNT(*) FILTER (
          WHERE j_netlife_estatus_real ILIKE '%PRESERVICIO%'
            AND j_fecha_registro_sistema IS NOT NULL AND j_fecha_registro_sistema <> ''
            AND TO_DATE(j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
        ) AS preservicio
      FROM public.mestra_bitrix
      WHERE (
        (j_fecha_registro_sistema IS NOT NULL AND j_fecha_registro_sistema <> ''
          AND TO_DATE(j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date)
        OR
        (j_fecha_activacion_netlife IS NOT NULL AND j_fecha_activacion_netlife <> ''
          AND TO_DATE(j_fecha_activacion_netlife, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date)
      )
      ${bitWhereClause}
      GROUP BY dia ORDER BY dia ASC
    `, [desde, hasta, ...bitParamsExtra]);

    // ── Estatus JOT ───────────────────────────────────────────────────────────
    // FIX 1: ingreso_bitrix (COSTO INGRESO BITRIX en Reporte Data)
    //   El problema era que ${bitWhereClause} filtraba por b_origen pero ese campo
    //   pertenece a t2 (el registro Bitrix) mientras el WHERE estaba aplicado a t1
    //   (el registro JOT). Resultado: el FILTER del JOIN nunca coincidía → siempre 0.
    //   Solución: construir un WHERE con prefijo "t2." para b_origen cuando hay filtro.
    //
    // FIX 2: activos (activos mismo mes)
    //   El FILTER de activos ya estaba correcto en la lógica pero dependía de que
    //   el JOIN t1.j_id_bitrix = t2.b_id funcionara. Con el LEFT JOIN y el WHERE
    //   mal aplicado, muchos registros de t2 quedaban NULL. Al corregir el filtro
    //   de b_origen sobre t2, el JOIN produce las filas correctas.
    //
    // Construcción dinámica del WHERE con prefijo t2 para b_origen:
    const bitWherePrefixT2 = origenesBitrix.length > 0
      ? `AND t2.b_origen IN (${origenesBitrix.map((_, i) => `$${3 + i}`).join(', ')})`
      : '';

    const statusJotRes = await pool.query(`
      SELECT
        EXTRACT(DAY FROM TO_DATE(t1.j_fecha_registro_sistema, 'YYYY-MM-DD'))::int AS dia,

        -- Todos los registros JOT del mes (ya filtrados por WHERE principal)
        COUNT(*) AS ingreso_jot,

        -- FIX: ingreso_bitrix — leads JOT cuya fecha_registro_jot
        -- coincide exactamente con la fecha_creacion del lead en Bitrix.
        -- El filtro de b_origen va sobre t2 (registro Bitrix), no sobre t1.
        COUNT(*) FILTER (
          WHERE t2.b_creado_el_fecha IS NOT NULL
            AND TO_DATE(t1.j_fecha_registro_sistema, 'YYYY-MM-DD')
                = t2.b_creado_el_fecha::date
        ) AS ingreso_bitrix,

        -- Activo backlog: ACTIVO con fecha registro JOT en el mes
        -- (independiente de la fecha de activación — cualquier ACTIVO ingresado en el período)
        COUNT(*) FILTER (
          WHERE t1.j_netlife_estatus_real ILIKE 'ACTIVO'
        ) AS activo_backlog,

        -- FIX: activos mismo mes — ACTIVO cuya fecha_activacion_netlife cae en el período.
        -- La columna j_fecha_activacion_netlife está en t1, no requiere JOIN para este cálculo.
        COUNT(*) FILTER (
          WHERE t1.j_netlife_estatus_real ILIKE 'ACTIVO'
            AND t1.j_fecha_activacion_netlife IS NOT NULL
            AND t1.j_fecha_activacion_netlife <> ''
            AND TO_DATE(t1.j_fecha_activacion_netlife, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
        ) AS activos,

        -- Total ventas JOT = todos los ingresos del período (igual a ingreso_jot)
        COUNT(*) AS total_ventas_jot,

        -- Desiste servicio
        COUNT(*) FILTER (
          WHERE t1.j_netlife_estatus_real ILIKE '%DESISTE%'
        ) AS desiste_servicio_jot,

        -- Regularizados
        COUNT(*) FILTER (
          WHERE t1.j_estatus_regularizacion ILIKE '%REGULARIZADO%'
            AND t1.j_estatus_regularizacion NOT ILIKE '%NO REQUIERE%'
            AND t1.j_estatus_regularizacion NOT ILIKE '%POR REGULARIZAR%'
        ) AS regularizados,

        -- Por regularizar
        COUNT(*) FILTER (
          WHERE t1.j_estatus_regularizacion ILIKE '%POR REGULARIZAR%'
        ) AS por_regularizar

      FROM public.mestra_bitrix t1

      -- JOIN para obtener b_creado_el_fecha y b_origen del registro Bitrix asociado
      LEFT JOIN public.mestra_bitrix t2
        ON t1.j_id_bitrix = t2.b_id

      WHERE t1.j_fecha_registro_sistema IS NOT NULL
        AND t1.j_fecha_registro_sistema <> ''
        AND TO_DATE(t1.j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
        -- FIX: filtro de b_origen aplicado sobre t2 (registro Bitrix), no t1 (JOT)
        ${bitWherePrefixT2}

      GROUP BY dia
      ORDER BY dia ASC
    `, [desde, hasta, ...bitParamsExtra]);

    // ── Forma de pago ─────────────────────────────────────────────────────────
    const pagoRes = await pool.query(`
      SELECT
        EXTRACT(DAY FROM TO_DATE(j_fecha_registro_sistema, 'YYYY-MM-DD'))::int AS dia,
        SUM(CASE WHEN j_forma_pago ILIKE '%CUENTA%'   THEN 1 ELSE 0 END) AS pago_cuenta,
        SUM(CASE WHEN j_forma_pago ILIKE '%EFECTIVO%' THEN 1 ELSE 0 END) AS pago_efectivo,
        SUM(CASE WHEN j_forma_pago ILIKE '%TARJETA%'  THEN 1 ELSE 0 END) AS pago_tarjeta,
        SUM(CASE WHEN j_forma_pago ILIKE '%CUENTA%'   AND j_netlife_estatus_real ILIKE 'ACTIVO'
          AND j_fecha_activacion_netlife IS NOT NULL AND j_fecha_activacion_netlife <> ''
          AND TO_DATE(j_fecha_activacion_netlife, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
          THEN 1 ELSE 0 END) AS pago_cuenta_activa,
        SUM(CASE WHEN j_forma_pago ILIKE '%EFECTIVO%' AND j_netlife_estatus_real ILIKE 'ACTIVO'
          AND j_fecha_activacion_netlife IS NOT NULL AND j_fecha_activacion_netlife <> ''
          AND TO_DATE(j_fecha_activacion_netlife, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
          THEN 1 ELSE 0 END) AS pago_efectivo_activa,
        SUM(CASE WHEN j_forma_pago ILIKE '%TARJETA%'  AND j_netlife_estatus_real ILIKE 'ACTIVO'
          AND j_fecha_activacion_netlife IS NOT NULL AND j_fecha_activacion_netlife <> ''
          AND TO_DATE(j_fecha_activacion_netlife, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
          THEN 1 ELSE 0 END) AS pago_tarjeta_activa
      FROM public.mestra_bitrix
      WHERE j_fecha_registro_sistema IS NOT NULL AND j_fecha_registro_sistema <> ''
        AND TO_DATE(j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
        ${bitWhereClause}
      GROUP BY dia ORDER BY dia ASC
    `, [desde, hasta, ...bitParamsExtra]);

    // ── Ciclo de venta ────────────────────────────────────────────────────────
    const cicloRes = await pool.query(`
      SELECT
        EXTRACT(DAY FROM fecha_creacion)::int AS dia,
        COUNT(*) FILTER (WHERE diff = 0) AS ciclo_0,
        COUNT(*) FILTER (WHERE diff = 1) AS ciclo_1,
        COUNT(*) FILTER (WHERE diff = 2) AS ciclo_2,
        COUNT(*) FILTER (WHERE diff = 3) AS ciclo_3,
        COUNT(*) FILTER (WHERE diff = 4) AS ciclo_4,
        COUNT(*) FILTER (WHERE diff >= 5) AS ciclo_mas5
      FROM (
        SELECT
          TO_DATE(t1.j_fecha_activacion_netlife,'YYYY-MM-DD')
          - TO_DATE(t2.b_creado_el_fecha,'YYYY-MM-DD') AS diff,
          TO_DATE(t2.b_creado_el_fecha,'YYYY-MM-DD') AS fecha_creacion
        FROM public.mestra_bitrix t1
        JOIN public.mestra_bitrix t2
          ON t1.j_id_bitrix = t2.b_id
        WHERE t1.j_fecha_activacion_netlife IS NOT NULL
          AND t2.b_creado_el_fecha IS NOT NULL
          AND TO_DATE(t2.b_creado_el_fecha,'YYYY-MM-DD') BETWEEN $1::date AND $2::date
          -- FIX: filtro de b_origen aplicado sobre t2 (registro Bitrix)
          ${origenesBitrix.length > 0
            ? `AND t2.b_origen IN (${origenesBitrix.map((_, i) => `$${3 + i}`).join(', ')})`
            : ''}
      ) t
      GROUP BY dia
      ORDER BY dia ASC
    `, [desde, hasta, ...bitParamsExtra]);

    // ── Ciudad ────────────────────────────────────────────────────────────────
    const ciudadRes = await pool.query(`
      SELECT ciudad, provincia,
        SUM(total_leads) AS total_leads, SUM(activos) AS activos, SUM(ingresos_jot) AS ingresos_jot,
        ROUND(SUM(activos)::numeric/NULLIF(SUM(total_leads),0)*100,1) AS pct_activos
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

    // ── Hora ──────────────────────────────────────────────────────────────────
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

    // ── ATC ───────────────────────────────────────────────────────────────────
    const atcRes = await pool.query(`
      SELECT motivo_atc, EXTRACT(DAY FROM fecha)::int AS dia, SUM(cantidad) AS cantidad
      FROM public.mv_monitoreo_atc WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY motivo_atc, dia ORDER BY motivo_atc, dia
    `, [desde, hasta]);

    const atcTotRes = await pool.query(`
      SELECT motivo_atc, SUM(cantidad) AS cantidad FROM public.mv_monitoreo_atc
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY motivo_atc ORDER BY cantidad DESC
    `, [desde, hasta]);

    // ── Canales disponibles ───────────────────────────────────────────────────
    const origenesDispRes = await pool.query(`
      SELECT DISTINCT b_origen FROM public.mestra_bitrix
      WHERE b_creado_el_fecha::date BETWEEN $1::date AND $2::date
        AND b_origen IS NOT NULL AND b_origen <> ''
      ORDER BY b_origen ASC
    `, [desde, hasta]);

    const gruposEncontrados = new Set();
    origenesDispRes.rows.forEach(r => {
      const up = (r.b_origen || '').toUpperCase();
      const g  = ORIGEN_A_CANAL_INV[up];
      if (g) gruposEncontrados.add(g);
    });
    const canalesDisponibles = [...gruposEncontrados].sort().map(g => ({ canal: g, lineas: GRUPO_A_ORIGENES[g] || [] }));

    // ── Días del mes ──────────────────────────────────────────────────────────
    const diasMes = [];
    const DIAS_NOMBRE = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
    for (let d = 1; d <= ultimoDia; d++) {
      diasMes.push({ dia: d, nombre: DIAS_NOMBRE[new Date(y, m - 1, d).getDay()] });
    }

    // ── Combinar en finalArray para bloque Inversión & Costos ─────────────────
    const invMap = {};

    inversionRes.rows.forEach(r => {
      const dia = Number(r.dia);
      invMap[dia] = { dia, inversion_usd: Number(r.inversion_usd || 0) };
    });

    etapasRes.rows.forEach(r => {
      const dia = Number(r.dia);
      if (!invMap[dia]) invMap[dia] = { dia, inversion_usd: 0 };
      const sac = Number(r.atc_soporte||0) + Number(r.fuera_cobertura||0)
                + Number(r.zonas_peligrosas||0) + Number(r.innegociable||0);
      invMap[dia].n_leads     = Number(r.total_leads || 0);
      invMap[dia].negociables = Math.max(0, Number(r.total_leads || 0) - sac);
    });

    jotDenomsRes.rows.forEach(r => {
      const dia = Number(r.dia);
      if (!invMap[dia]) invMap[dia] = { dia, inversion_usd: 0 };
      invMap[dia].activos_mes    = Number(r.activos_mes              || 0);
      invMap[dia].activo_backlog = Number(r.activo_backlog           || 0);
      invMap[dia].ingreso_jot    = Number(r.ingreso_jot              || 0);
      invMap[dia].ingreso_bitrix = Number(r.ingreso_bitrix_mismo_dia || 0);
      invMap[dia].preplaneados   = Number(r.preplaneados             || 0);
      invMap[dia].asignados      = Number(r.asignados                || 0);
      invMap[dia].preservicio    = Number(r.preservicio              || 0);
    });

    const allDaysMap = {};
    for (let d = 1; d <= ultimoDia; d++) {
      allDaysMap[d] = { dia: d, inversion_usd: 0, n_leads: 0, negociables: 0, activos_mes: 0, activo_backlog: 0, ingreso_jot: 0, ingreso_bitrix: 0, preplaneados: 0, asignados: 0, preservicio: 0 };
    }
    Object.values(invMap).forEach(day => { allDaysMap[day.dia] = { ...allDaysMap[day.dia], ...day }; });
    const finalArray = Object.values(allDaysMap).sort((a, b) => a.dia - b.dia);

    res.json({
      success: true,
      meta:                { anio: y, mes: m, dias: diasMes },
      canales_disponibles: canalesDisponibles,
      inversion:   finalArray,
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