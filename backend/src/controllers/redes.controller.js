const pool = require('../config/db');

// ─── Helper: parsea fechas del query ────────────────────────────────────────
const getFiltroFechas = (query) => {
  const hoy = new Date().toISOString().split('T')[0];
  const fechaDesde = query.fechaDesde || hoy;
  const fechaHasta = query.fechaHasta || hoy;
  return { fechaDesde, fechaHasta };
};

// ─── MAPEO HARDCODEADO: Origen Bitrix → Canal Publicidad ────────────────────
// Columna izquierda  = b_origen en mestra_bitrix
// Columna derecha    = canal_publicidad en mv_monitoreo_publicidad
const ORIGEN_A_CANAL = {
  'Base 593-979083368':      'ARTS - Base 593-979083368',
  'Base 593-995211968':      'ARTS FACEBOOK - Base 593-995211968',
  'Base 593-992827793':      'ARTS GOOGLE - Base 593-992827793',
  'Fomulario Landing 3':     'ARTS GOOGLE - Fomulario Landing 3',
  'Llamada Landing 3':       'ARTS GOOGLE - Llamada Landing 3',
  'Por Recomendación':       'POR RECOMENDACIÓN - Por Recomendación',
  'Referido Personal':       'POR RECOMENDACIÓN - Referido Personal',
  'Tienda online':           'POR RECOMENDACIÓN - Tienda online',
  'Base 593-958993371':      'REMARKETING - Base 593-958993371',
  'BASE 593-984414273':      'REMARKETING - BASE 593-984414273',
  'Base 593-995967355':      'REMARKETING - Base 593-995967355',
  'Whatsapp 593958993371':   'REMARKETING - Whatsapp 593958993371',
  'Base 593-987133635':      'VIDIKA GOOGLE',
  'BASE API 593963463480':   'VIDIKA GOOGLE',
  'Formulario Landing 4':    'VIDIKA GOOGLE',
  'Llamada':                 'VIDIKA GOOGLE',
  'Llamada Landing 4':       'VIDIKA GOOGLE',
  'Base 593-962881280':      'VIDIKA GOOGLE',
};

// Inverso automático: canal → [lista de orígenes de bitrix]
const CANAL_A_ORIGENES = Object.entries(ORIGEN_A_CANAL).reduce((acc, [origen, canal]) => {
  if (!acc[canal]) acc[canal] = [];
  acc[canal].push(origen);
  return acc;
}, {});

// Lista de canales únicos (para devolver al frontend como "canales_disponibles")
const CANALES_DISPONIBLES = Object.keys(CANAL_A_ORIGENES).sort();

// ─── Helper: resuelve canales seleccionados → orígenes bitrix + canales pub ──
// canales = array de strings con nombres de canal (ej: ['VIDIKA GOOGLE', 'ARTS GOOGLE - ...'])
// retorna:
//   origenesBitrix      → para filtrar mestra_bitrix por b_origen
//   canalesPublicidad   → para filtrar mv_monitoreo_publicidad por canal_publicidad
const resolverFiltroCanales = (canales = []) => {
  if (canales.length === 0) return { origenesBitrix: [], canalesPublicidad: [] };
  const origenesBitrix    = [];
  const canalesPublicidad = new Set();
  canales.forEach(canal => {
    (CANAL_A_ORIGENES[canal] || []).forEach(o => origenesBitrix.push(o));
    canalesPublicidad.add(canal);
  });
  return { origenesBitrix, canalesPublicidad: [...canalesPublicidad] };
};

// ─── Helper: construye cláusula WHERE + params para un array de valores ──────
const buildInWhere = (valores, offsetInicial, field) => {
  if (!valores || valores.length === 0) return { where: '', params: [] };
  const ph = valores.map((_, i) => `$${offsetInicial + i + 1}`).join(', ');
  return { where: `AND ${field} IN (${ph})`, params: valores };
};


// ─── 1. MONITOREO REDES GENERAL ─────────────────────────────────────────────
const getMonitoreoRedes = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);

    // Soporte filtro por canal
    const canalesRaw = req.query.canales || '';
    const canalesSel = canalesRaw ? canalesRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
    const { canalesPublicidad } = resolverFiltroCanales(canalesSel);
    const { where: canalWhere, params: canalParams } = buildInWhere(canalesPublicidad, 2, 'canal_publicidad');

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
        ${canalWhere}
    `, [fechaDesde, fechaHasta, ...canalParams]);

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
        ${canalWhere}
      ORDER BY fecha DESC
    `, [fechaDesde, fechaHasta, ...canalParams]);

    res.json({
      success: true,
      totales: totalesResult.rows[0],
      data: detalleResult.rows,
      // Devuelve la estructura de canales para que el frontend pueda armar el selector
      canales_disponibles: CANALES_DISPONIBLES.map(canal => ({
        canal,
        lineas: CANAL_A_ORIGENES[canal],
      })),
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

    // ── Nuevo: recibe ?canales=VIDIKA GOOGLE,ARTS GOOGLE - ... ───────────────
    const canalesRaw = req.query.canales || '';
    const canalesSel = canalesRaw ? canalesRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
    const { origenesBitrix, canalesPublicidad } = resolverFiltroCanales(canalesSel);

    // ── Fecha WHERE ───────────────────────────────────────────────────────────
    let fechaWhere, fechaParams;
    if (modo === 'mes') {
      fechaWhere  = `b_creado_el_fecha LIKE $1`;
      fechaParams = [`%${desde.slice(0, 7)}%`];
    } else {
      fechaWhere  = `b_creado_el_fecha::date BETWEEN $1::date AND $2::date`;
      fechaParams = [desde, hasta];
    }

    // ── Filtro orígenes en mestra_bitrix ─────────────────────────────────────
    const offsetBit = fechaParams.length;
    const { where: bitrixWhere, params: bitrixParams } = buildInWhere(origenesBitrix, offsetBit, 'b_origen');
    const allParamsBitrix = [...fechaParams, ...bitrixParams];

    // ── Query mestra_bitrix agrupado por b_origen ─────────────────────────────
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
      WHERE ${fechaWhere} ${bitrixWhere}
      GROUP BY b_origen ORDER BY total_leads DESC
    `, allParamsBitrix);

    // ── Inversión: UNA SOLA VEZ por canal (sin multiplicar por líneas) ────────
    // Filtramos mv_monitoreo_publicidad por canal_publicidad, NO por b_origen
    const { where: pubWhere, params: pubParams } = buildInWhere(canalesPublicidad, 2, 'canal_publicidad');
    let inversionPorCanal = {};
    try {
      const invRes = await pool.query(`
        SELECT canal_publicidad, SUM(inversion_usd) AS inversion_usd
        FROM public.mv_monitoreo_publicidad
        WHERE fecha BETWEEN $1::date AND $2::date
          ${pubWhere}
        GROUP BY canal_publicidad
      `, [desde, hasta, ...pubParams]);
      invRes.rows.forEach(r => {
        inversionPorCanal[r.canal_publicidad] = Number(r.inversion_usd || 0);
      });
    } catch (_) {}

    // ── Construir respuesta: agrupar por canal, listar líneas debajo ──────────
    // Agrupar los rows de bitrix por canal usando el mapeo
    const canalMap = {};
    totalesRes.rows.forEach(r => {
      const canal = ORIGEN_A_CANAL[r.b_origen] || r.b_origen; // fallback al origen si no está en el mapa
      if (!canalMap[canal]) {
        canalMap[canal] = {
          canal,
          inversion_usd: inversionPorCanal[canal] || 0,
          lineas: [],
          // acumuladores del canal
          total_leads: 0, leads_sac: 0, venta_subida: 0, ingreso_jot: 0,
        };
      }
      const total  = Number(r.total_leads  || 0);
      const sac    = Number(r.leads_sac    || 0);
      const ventas = Number(r.venta_subida || 0);
      const jot    = Number(r.ingreso_jot  || 0);
      const calidad = total - sac;

      // Acumular en el canal
      canalMap[canal].total_leads  += total;
      canalMap[canal].leads_sac    += sac;
      canalMap[canal].venta_subida += ventas;
      canalMap[canal].ingreso_jot  += jot;

      // Línea individual
      canalMap[canal].lineas.push({
        origen: r.b_origen,
        total_leads: total,
        leads_sac: sac,
        leads_calidad: calidad,
        venta_subida: ventas,
        ingreso_jot: jot,
        pct_sac:        total > 0 ? (sac    / total) * 100 : 0,
        pct_calidad:    total > 0 ? (calidad / total) * 100 : 0,
        pct_ventas:     total > 0 ? (ventas  / total) * 100 : 0,
        pct_ventas_jot: total > 0 ? (jot     / total) * 100 : 0,
      });
    });

    // Calcular métricas finales por canal (inversión dividida una sola vez)
    const canales = Object.values(canalMap).map(c => {
      const { total_leads, leads_sac, venta_subida, ingreso_jot, inversion_usd } = c;
      const leads_calidad = total_leads - leads_sac;
      return {
        canal:          c.canal,
        inversion_usd,
        total_leads,
        leads_sac,
        leads_calidad,
        venta_subida,
        ingreso_jot,
        lineas:         c.lineas,   // <-- las líneas aparecen debajo del canal
        pct_sac:        total_leads > 0 ? (leads_sac     / total_leads) * 100 : 0,
        pct_calidad:    total_leads > 0 ? (leads_calidad / total_leads) * 100 : 0,
        pct_ventas:     total_leads > 0 ? (venta_subida  / total_leads) * 100 : 0,
        pct_ventas_jot: total_leads > 0 ? (ingreso_jot   / total_leads) * 100 : 0,
        // CPL / CPA calculados sobre la inversión del canal completo (no multiplicada)
        cpl:      total_leads   > 0 && inversion_usd > 0 ? inversion_usd / total_leads   : null,
        cpl_gest: leads_calidad > 0 && inversion_usd > 0 ? inversion_usd / leads_calidad : null,
        cpa:      venta_subida  > 0 && inversion_usd > 0 ? inversion_usd / venta_subida  : null,
        cpa_jot:  ingreso_jot   > 0 && inversion_usd > 0 ? inversion_usd / ingreso_jot   : null,
      };
    });

    // ── Canales disponibles para el selector del frontend ─────────────────────
    const canalesDisponibles = CANALES_DISPONIBLES.map(canal => ({
      canal,
      lineas: CANAL_A_ORIGENES[canal],
    }));

    res.json({ success: true, canales, canales_disponibles: canalesDisponibles });
  } catch (error) {
    console.error('Error en getMonitoreoMetas:', error);
    res.status(500).json({ success: false, message: 'Error al obtener metas', error: error.message });
  }
};

// ─── 7. REPORTE DATA ─────────────────────────────────────────────────────────
const getReporteData = async (req, res) => {
  try {
    const { anio, mes } = req.query;
    const hoy  = new Date();
    const y    = parseInt(anio  || hoy.getFullYear());
    const m    = parseInt(mes   || (hoy.getMonth() + 1));
    const desde = `${y}-${String(m).padStart(2,'0')}-01`;
    const hasta  = `${y}-${String(m).padStart(2,'0')}-31`;

    // ── Nuevo: recibe ?canales=... en lugar de ?origenes=... ─────────────────
    const canalesRaw = req.query.canales || '';
    const canalesSel = canalesRaw ? canalesRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
    const { origenesBitrix, canalesPublicidad } = resolverFiltroCanales(canalesSel);

    // ── Helpers para construir WHERE según fuente ─────────────────────────────
    // Para mv_monitoreo_publicidad → filtra por canal_publicidad
    const buildPubWhere = (offset) => buildInWhere(canalesPublicidad, offset, 'canal_publicidad');
    // Para mestra_bitrix → filtra por b_origen
    const buildBitWhere = (offset) => buildInWhere(origenesBitrix, offset, 'b_origen');

    // ── BLOQUE 1: Inversión diaria desde mv_monitoreo_publicidad ─────────────
    const { where: invOrigenWhere, params: invOrigenParams } = buildPubWhere(2);
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
    const { where: bitOrigenWhere, params: bitOrigenParams } = buildBitWhere(2);
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

    // ── BLOQUE 3: Estatus ventas JOT por día ─────────────────────────────────
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

    const atcTotRes = await pool.query(`
      SELECT motivo_atc, SUM(cantidad) AS cantidad
      FROM public.mv_monitoreo_atc
      WHERE fecha BETWEEN $1::date AND $2::date
      GROUP BY motivo_atc ORDER BY cantidad DESC
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
      // Devuelve estructura canal → lineas para el selector
      canales_disponibles: CANALES_DISPONIBLES.map(canal => ({
        canal,
        lineas: CANAL_A_ORIGENES[canal],
      })),
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