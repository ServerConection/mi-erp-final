const pool = require('../config/db');
const { construirFiltroOrigenes, normalizarOrigenSql, canalOrigenSql } = require('../shared/origenesRedes');


// ─────────────────────────────────────────────────────────────────────────────
// TABLA OFICIAL DE ETAPAS (GESTIONABLE / DESCARTE / LEADS TOTALES)
// FUENTE ÚNICA DE VERDAD: backend/src/shared/etapas.js
// NO redefinir las listas aquí: si divergen, cada pantalla muestra un número
// distinto para el mismo indicador (fue exactamente lo que pasó con las etapas
// DUPLICADO / REMARKETING / REGULARIZACION).
// ─────────────────────────────────────────────────────────────────────────────
const {
    esLeadTotalExpr,
    esGestionableExpr,
    esDescarteExpr,
    ETAPAS_NO_GESTIONABLES,
    esPorRegularizarExpr
} = require('../shared/etapas');

  const getFiltroFechas = (query) => {
    const hoy = new Date().toISOString().split('T')[0];
    return { fechaDesde: query.fechaDesde || hoy, fechaHasta: query.fechaHasta || hoy };
  };

  // ─── Mapeo origen → canal (igual que el frontend) ────────────────────────────
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

  // Todos los orígenes conocidos (para el WHERE de exclusión de MAL INGRESO)
  const TODOS_ORIGENES_CONOCIDOS = Object.keys(ORIGEN_A_CANAL_INV);

  const buildInWhere = (valores, offsetInicial, field) => {
    if (!valores || valores.length === 0) return { where: '', params: [] };
    const ph = valores.map((_, i) => `$${offsetInicial + i + 1}`).join(', ');
    return { where: `AND ${field} IN (${ph})`, params: valores };
  };

  const resolverGrupos = (gruposSel = []) => {
    if (gruposSel.length === 0) return { origenesBitrix: [], canalesInversion: [] };
    const origenesBitrix = [], canalesInversion = new Set();
    gruposSel.forEach(g => {
      (GRUPO_A_ORIGENES[g] || []).forEach(o => origenesBitrix.push(o));
      (GRUPO_A_CANAL_INV[g] || []).forEach(c => canalesInversion.add(c));
    });
    return { origenesBitrix: [...new Set(origenesBitrix)], canalesInversion: [...canalesInversion] };
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. MONITOREO REDES GENERAL
  // FIX: Reescrito para usar mestra_bitrix directamente (datos siempre frescos).
  //      mv_monitoreo_publicidad se consultaba antes pero puede estar desactualizada;
  //      ahora solo se usa para obtener inversion_usd (dato externo).
  // ─────────────────────────────────────────────────────────────────────────────
  const getMonitoreoRedes = async (req, res) => {
    try {
      const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);
      const gruposRaw = req.query.canales || '';
      const gruposSel = gruposRaw ? gruposRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
      const { origenesBitrix, canalesInversion } = resolverGrupos(gruposSel);

      // Sin canal se muestran TODOS los orígenes vivos del webhook. Un origen
      // nuevo nunca debe desaparecer solo por no estar en el catálogo histórico.
      const { where: origWhere, params: origParams } = construirFiltroOrigenes(
        gruposSel.length > 0 ? origenesBitrix : [], 2, 'w.source'
      );
      const origenNormalizadoExpr = normalizarOrigenSql('w.source');
      const etapaWebhookExpr = `CASE
        WHEN LOWER(TRIM(COALESCE(w.etapa, ''))) IN ('inegociable', 'innegociable') THEN 'INNEGOCIABLE'
        WHEN LOWER(TRIM(COALESCE(w.etapa, ''))) = 'regularizacion' THEN 'REGULARIZACION'
        ELSE UPPER(TRIM(COALESCE(w.etapa_bitrix, w.etapa, '')))
      END`;

      // Los orígenes históricos mantienen su grupo; cualquier origen nuevo se
      // conserva con su propio nombre normalizado en vez de ocultarse.
      const canalExpr = canalOrigenSql('w.source');

      // ── Detalle CRM: fuente oficial en vivo del webhook de Bitrix ───────────
      const detalleResult = await pool.query(`
        SELECT
          fecha,
          dia_semana,
          canal_inversion,
          canal_inversion AS canal_publicidad,
          SUM(n_leads)               AS n_leads,
          SUM(atc_soporte)           AS atc_soporte,
          SUM(fuera_cobertura)       AS fuera_cobertura,
          SUM(zonas_peligrosas)      AS zonas_peligrosas,
          SUM(innegociable)          AS innegociable,
          SUM(negociables)           AS negociables,
          SUM(venta_subida_bitrix)   AS venta_subida_bitrix,
          SUM(seguimiento_negociacion) AS seguimiento_negociacion,
          0::bigint AS otro_proveedor,
          0::bigint AS no_interesa_costo,
          0::bigint AS desiste_compra,
          0::bigint AS duplicado,
          0::bigint AS cliente_discapacidad,
          0::bigint AS ingreso_jot,
          0::bigint AS ingreso_bitrix_mismo_dia,
          0::bigint AS activo_backlog,
          0::bigint AS activos_mes,
          0::bigint AS estado_activo_netlife,
          0::bigint AS desiste_servicio_jot,
          0::bigint AS pago_cuenta,
          0::bigint AS pago_efectivo,
          0::bigint AS pago_tarjeta,
          0::bigint AS pago_cuenta_activa,
          0::bigint AS pago_efectivo_activa,
          0::bigint AS pago_tarjeta_activa,
          0::bigint AS ciclo_0_dias,
          0::bigint AS ciclo_1_dia,
          0::bigint AS ciclo_2_dias,
          0::bigint AS ciclo_3_dias,
          0::bigint AS ciclo_4_dias,
          0::bigint AS ciclo_mas5_dias,
          0::bigint AS regularizados,
          0::bigint AS por_regularizar,
          0::bigint AS total_gestionables,
          0::bigint AS total_ventas_jot,
          0::bigint AS total_ventas_crm,
          0         AS inversion_usd
        FROM (
          SELECT
            (w.created_at AT TIME ZONE 'America/Guayaquil')::date AS fecha,
            CASE EXTRACT(DOW FROM (w.created_at AT TIME ZONE 'America/Guayaquil')::date)
              WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Lunes'   WHEN 2 THEN 'Martes'
              WHEN 3 THEN 'Miércoles' WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes'
              WHEN 6 THEN 'Sábado'
            END AS dia_semana,
            (${canalExpr}) AS canal_inversion,
            -- N LEADS: excluye DUPLICADO / REMARKETING / REGULARIZACION.
            -- Antes usaba ILIKE '%DUPLICADO%' / '%REGULARIZA%' (patrón parcial,
            -- sin REMARKETING). Ahora usa la lista oficial de shared/etapas.js.
            COUNT(DISTINCT w.bitrix_id) FILTER (WHERE ${esLeadTotalExpr(etapaWebhookExpr)}) AS n_leads,
            COUNT(DISTINCT w.bitrix_id) FILTER (WHERE ${etapaWebhookExpr} ILIKE '%ATC%' OR ${etapaWebhookExpr} ILIKE '%SOPORTE%') AS atc_soporte,
            COUNT(DISTINCT w.bitrix_id) FILTER (WHERE ${etapaWebhookExpr} ILIKE '%FUERA DE COBERTURA%') AS fuera_cobertura,
            COUNT(DISTINCT w.bitrix_id) FILTER (WHERE ${etapaWebhookExpr} ILIKE '%ZONA%PELIGRO%' OR ${etapaWebhookExpr} ILIKE '%ZONA PELIGROSA%') AS zonas_peligrosas,
            COUNT(DISTINCT w.bitrix_id) FILTER (WHERE ${etapaWebhookExpr} ILIKE '%INNEGOCIABLE%') AS innegociable,
            COUNT(DISTINCT w.bitrix_id) FILTER (WHERE ${esGestionableExpr(etapaWebhookExpr)}) AS negociables,
            COUNT(DISTINCT w.bitrix_id) FILTER (WHERE ${etapaWebhookExpr} ILIKE '%VENTA SUBIDA%') AS venta_subida_bitrix,
            COUNT(DISTINCT w.bitrix_id) FILTER (WHERE ${etapaWebhookExpr} ILIKE '%SEGUIMIENTO%') AS seguimiento_negociacion
          FROM public.bitrix_webhook_leads w
          WHERE w.empresa = 'novonet'
            AND (w.created_at AT TIME ZONE 'America/Guayaquil')::date BETWEEN $1 AND $2
            AND NULLIF(TRIM(w.source), '') IS NOT NULL
            ${origWhere}
          GROUP BY (w.created_at AT TIME ZONE 'America/Guayaquil')::date, (${canalExpr})
        ) sub
        GROUP BY fecha, dia_semana, canal_inversion
        ORDER BY fecha DESC, canal_inversion ASC
      `, [fechaDesde, fechaHasta, ...origParams]);

      // ── Inversión desde MV (solo inversion_usd, dato externo a mestra_bitrix) ──
      const { where: invCanalWhere, params: invCanalParams } = buildInWhere(
        canalesInversion.length > 0 ? canalesInversion : [],
        2,
        "SPLIT_PART(mv.canal_inversion, ' -', 1)"
      );
      let inversionMap = {}; // clave: "YYYY-MM-DD__CANAL"
      try {
        const invResult = await pool.query(`
          SELECT
            fecha::date                                     AS fecha,
            SPLIT_PART(canal_inversion, ' -', 1)           AS canal,
            MAX(inversion_usd)                              AS inversion_usd
          FROM public.mv_monitoreo_publicidad mv
          WHERE fecha BETWEEN $1 AND $2
            AND canal_inversion NOT IN ('MAL INGRESO','SIN MAPEO')
            ${invCanalWhere}
          GROUP BY fecha::date, SPLIT_PART(canal_inversion, ' -', 1)
        `, [fechaDesde, fechaHasta, ...invCanalParams]);
        invResult.rows.forEach(r => {
          inversionMap[`${r.fecha}__${r.canal}`] = Number(r.inversion_usd || 0);
        });
      } catch (_) { /* MV puede fallar — inversión quedará en 0 */ }

      // ── Merge: attach inversion_usd a cada fila del detalle ──────────────────
      const data = detalleResult.rows.map(row => ({
        ...row,
        inversion_usd: inversionMap[`${row.fecha}__${row.canal_inversion}`] || 0,
      }));

      // ── Totales: agregar desde data (con inversion_usd ya mergeada) ──────────
      const sum = (f) => data.reduce((s, r) => s + Number(r[f] || 0), 0);
      const n_leads        = sum('n_leads');
      const ingreso_jot    = sum('ingreso_jot');
      const activos_mes    = sum('activos_mes');
      const activo_backlog = sum('activo_backlog');
      const negociables    = sum('negociables');
      const inversion_usd  = sum('inversion_usd');

      const totales = {
        n_leads,
        atc_soporte:          sum('atc_soporte'),
        fuera_cobertura:      sum('fuera_cobertura'),
        innegociable:         sum('innegociable'),
        negociables:         sum('negociables' ),
        venta_subida_bitrix:  sum('venta_subida_bitrix'),
        ingreso_jot,
        activo_backlog,
        activos_mes,
        inversion_usd,
        ciclo_0_dias:         sum('ciclo_0_dias'),
        ciclo_1_dia:          sum('ciclo_1_dia'),
        ciclo_2_dias:         sum('ciclo_2_dias'),
        ciclo_3_dias:         sum('ciclo_3_dias'),
        ciclo_4_dias:         sum('ciclo_4_dias'),
        ciclo_mas5_dias:      sum('ciclo_mas5_dias'),
        cpl:                  n_leads > 0 && inversion_usd > 0 ? +(inversion_usd / n_leads).toFixed(2) : 0,
        costo_ingreso_jot:    ingreso_jot > 0 && inversion_usd > 0 ? +(inversion_usd / ingreso_jot).toFixed(2) : 0,
        costo_activa:         activos_mes > 0 && inversion_usd > 0 ? +(inversion_usd / activos_mes).toFixed(2) : 0,
        costo_activa_backlog: activo_backlog > 0 && inversion_usd > 0 ? +(inversion_usd / activo_backlog).toFixed(2) : 0,
        costo_por_negociable: negociables > 0 && inversion_usd > 0 ? +(inversion_usd / negociables).toFixed(2) : 0,
      };

      res.json({
        success: true,
        totales,
        data,
        canales_disponibles: GRUPOS_DISPONIBLES.map(g => ({ canal: g, lineas: GRUPO_A_ORIGENES[g] })),
      });
    } catch (error) {
      console.error('Error en getMonitoreoRedes:', error);
      res.status(500).json({ success: false, message: 'Error al obtener datos', error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. MONITOREO POR CIUDAD
  // mv_monitoreo_ciudad no tiene columna canal → siempre datos globales.
  // Aceptamos el param para consistencia pero no filtramos (la vista no lo permite).
  // ─────────────────────────────────────────────────────────────────────────────
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
      res.status(500).json({ success: false, message: 'Error', error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. MONITOREO POR HORA
  // Cuando llega ?canales=..., filtramos desde mv_monitoreo_publicidad agrupando
  // por EXTRACT(HOUR FROM fecha) — proxy del comportamiento horario.
  // Sin canal: usamos mv_monitoreo_hora (más rápida y precisa).
  // ─────────────────────────────────────────────────────────────────────────────
  const getMonitoreoHora = async (req, res) => {
    try {
      const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);
      const gruposRaw = req.query.canales || '';
      const gruposSel = gruposRaw ? gruposRaw.split(',').map(c => c.trim()).filter(Boolean) : [];

      if (gruposSel.length === 0) {
        // Sin filtro: usar vista materializada (rápida)
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
        return res.json({ success: true, totales: totalesResult.rows, data: detalleResult.rows });
      }

      // Con filtro de canal → query desde mv_monitoreo_publicidad agrupando por hora del día
      // (la vista materializada tiene granularidad fecha×canal, derivamos la hora como día/hora approximado)
      // Usamos mestra_bitrix para obtener datos horarios reales con filtro de origen
      const { origenesBitrix } = resolverGrupos(gruposSel);
      const { where: origWhere, params: origParams } = buildInWhere(origenesBitrix, 2, 'mb.b_origen');

      const totalesResult = await pool.query(`
        SELECT
          EXTRACT(HOUR FROM mb.b_creado_el_hora::time)::int AS hora,
          -- N LEADS por hora: excluye DUPLICADO / REMARKETING / REGULARIZACION
          -- (también en el denominador del % ATC, para que el porcentaje no se
          -- calcule sobre un total inflado).
          COUNT(*) FILTER (WHERE ${esLeadTotalExpr('mb.b_etapa_de_la_negociacion')}) AS n_leads,
          COUNT(*) FILTER (WHERE mb.b_etapa_de_la_negociacion ILIKE '%ATC%' OR mb.b_etapa_de_la_negociacion ILIKE '%SOPORTE%') AS atc,
          ROUND(
            COUNT(*) FILTER (WHERE mb.b_etapa_de_la_negociacion ILIKE '%ATC%' OR mb.b_etapa_de_la_negociacion ILIKE '%SOPORTE%')::numeric
            / NULLIF(COUNT(*) FILTER (WHERE ${esLeadTotalExpr('mb.b_etapa_de_la_negociacion')}), 0) * 100, 1
          ) AS pct_atc_hora
        FROM public.mestra_bitrix mb
        WHERE mb.b_creado_el_fecha::date BETWEEN $1 AND $2
          AND mb.b_creado_el_hora IS NOT NULL
          AND mb.b_creado_el_hora ~ '^[0-2]?[0-9]:[0-5][0-9]'
          ${origWhere}
        GROUP BY hora
        ORDER BY hora ASC
      `, [fechaDesde, fechaHasta, ...origParams]);

      const detalleResult = await pool.query(`
        SELECT
          mb.b_creado_el_fecha AS fecha,
          EXTRACT(HOUR FROM mb.b_creado_el_hora::time)::int AS hora,
          -- N LEADS por hora: excluye DUPLICADO / REMARKETING / REGULARIZACION
          -- (también en el denominador del % ATC, para que el porcentaje no se
          -- calcule sobre un total inflado).
          COUNT(*) FILTER (WHERE ${esLeadTotalExpr('mb.b_etapa_de_la_negociacion')}) AS n_leads,
          COUNT(*) FILTER (WHERE mb.b_etapa_de_la_negociacion ILIKE '%ATC%' OR mb.b_etapa_de_la_negociacion ILIKE '%SOPORTE%') AS atc,
          ROUND(
            COUNT(*) FILTER (WHERE mb.b_etapa_de_la_negociacion ILIKE '%ATC%' OR mb.b_etapa_de_la_negociacion ILIKE '%SOPORTE%')::numeric
            / NULLIF(COUNT(*) FILTER (WHERE ${esLeadTotalExpr('mb.b_etapa_de_la_negociacion')}), 0) * 100, 1
          ) AS pct_atc_hora
        FROM public.mestra_bitrix mb
        WHERE mb.b_creado_el_fecha::date BETWEEN $1 AND $2
          AND mb.b_creado_el_hora IS NOT NULL
          AND mb.b_creado_el_hora ~ '^[0-2]?[0-9]:[0-5][0-9]'
          ${origWhere}
        GROUP BY mb.b_creado_el_fecha, hora
        ORDER BY mb.b_creado_el_fecha DESC, hora ASC
      `, [fechaDesde, fechaHasta, ...origParams]);

      res.json({ success: true, totales: totalesResult.rows, data: detalleResult.rows });
    } catch (error) {
      console.error('Error en getMonitoreoHora:', error);
      res.status(500).json({ success: false, message: 'Error', error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. MONITOREO MOTIVOS ATC
  // Con canal: filtramos desde mestra_bitrix. Sin canal: vista materializada.
  // ─────────────────────────────────────────────────────────────────────────────
  const getMonitoreoAtc = async (req, res) => {
    try {
      const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);
      const gruposRaw = req.query.canales || '';
      const gruposSel = gruposRaw ? gruposRaw.split(',').map(c => c.trim()).filter(Boolean) : [];

      // Siempre consulta mestra_bitrix directamente para garantizar datos frescos
      // (la MV puede estar desactualizada)
      const { origenesBitrix } = resolverGrupos(gruposSel);
      const { where: origWhere, params: origParams } = buildInWhere(origenesBitrix, 2, 'mb.b_origen');

      const totalesResult = await pool.query(`
        SELECT
          COALESCE(NULLIF(TRIM(mb.j_novedades_atc), ''), 'Sin motivo especificado') AS motivo_atc,
          COUNT(*) AS cantidad
        FROM public.mestra_bitrix mb
        WHERE mb.b_creado_el_fecha::date BETWEEN $1 AND $2
          AND mb.j_novedades_atc IS NOT NULL
          AND TRIM(mb.j_novedades_atc) <> ''
          ${origWhere}
        GROUP BY motivo_atc
        ORDER BY cantidad DESC
      `, [fechaDesde, fechaHasta, ...origParams]);

      const detalleResult = await pool.query(`
        SELECT
          mb.b_creado_el_fecha AS fecha,
          COALESCE(NULLIF(TRIM(mb.j_novedades_atc), ''), 'Sin motivo especificado') AS motivo_atc,
          COUNT(*) AS cantidad
        FROM public.mestra_bitrix mb
        WHERE mb.b_creado_el_fecha::date BETWEEN $1 AND $2
          AND mb.j_novedades_atc IS NOT NULL
          AND TRIM(mb.j_novedades_atc) <> ''
          ${origWhere}
        GROUP BY mb.b_creado_el_fecha, motivo_atc
        ORDER BY mb.b_creado_el_fecha DESC, cantidad DESC
      `, [fechaDesde, fechaHasta, ...origParams]);

      res.json({ success: true, totales: totalesResult.rows, data: detalleResult.rows });
    } catch (error) {
      console.error('Error en getMonitoreoAtc:', error);
      res.status(500).json({ success: false, message: 'Error', error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. MONITOREO COSTO
  // ─────────────────────────────────────────────────────────────────────────────
  const getMonitoreoCosto = async (req, res) => {
    res.json({ success: true, data: [], message: 'En desarrollo' });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. MONITOREO METAS vs LOGROS
  // FIX: SPLIT_PART para normalizar canal_inversion antes del match con grupo
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

      // Leads y etapas desde Bitrix — solo filas de leads (j_id_bitrix IS NULL)
      const totalesRes = await pool.query(`
        SELECT b_origen,
          -- Excluye DUPLICADO / REMARKETING / REGULARIZACION del total de leads.
          COUNT(*) FILTER (WHERE ${esLeadTotalExpr('b_etapa_de_la_negociacion')}) AS total_leads,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%ATC%'
            OR b_etapa_de_la_negociacion ILIKE '%SOPORTE%'
            OR b_etapa_de_la_negociacion ILIKE '%FUERA DE COBERTURA%'
            OR b_etapa_de_la_negociacion ILIKE '%ZONA%PELIGRO%'
            OR b_etapa_de_la_negociacion ILIKE '%INNEGOCIABLE%'
          ) AS leads_sac,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%VENTA SUBIDA%') AS venta_subida,
          COUNT(*) FILTER (WHERE j_id_bitrix IS NOT NULL) AS ingreso_jot
        FROM public.mestra_bitrix
        WHERE ${fechaWhere}
          AND j_id_bitrix IS NULL
          ${bitrixWhere}
        GROUP BY b_origen ORDER BY total_leads DESC
      `, allParamsBitrix);

      // FIX: Inversión real del período — SPLIT_PART para normalizar canal_inversion
      let inversionPorGrupo = {};
      try {
        const { where: invWhere, params: invParams } = buildInWhere(canalesInversion, 2, 'SPLIT_PART(canal_inversion, \' -\', 1)');
        const invRes = await pool.query(`
          SELECT canal_normalizado, SUM(max_inv) AS inversion_usd
          FROM (
            SELECT SPLIT_PART(canal_inversion, ' -', 1) AS canal_normalizado, fecha, MAX(inversion_usd) AS max_inv
            FROM public.mv_monitoreo_publicidad
            WHERE fecha BETWEEN $1::date AND $2::date
              AND canal_inversion NOT IN ('MAL INGRESO','SIN MAPEO')
              ${invWhere}
            GROUP BY SPLIT_PART(canal_inversion, ' -', 1), fecha
          ) sub
          GROUP BY canal_normalizado
        `, [desde, hasta, ...invParams]);
        invRes.rows.forEach(r => { inversionPorGrupo[r.canal_normalizado] = Number(r.inversion_usd || 0); });
      } catch (_) {}

      // Agrupar por canal
      const grupoMap = {};
      totalesRes.rows.forEach(r => {
        const origenRaw = (r.b_origen || '').trim();
        const grupo = ORIGEN_A_CANAL_INV[origenRaw] || ORIGEN_A_CANAL_INV[origenRaw.toUpperCase()] || 'SIN MAPEO';
        if (!grupoMap[grupo]) {
          grupoMap[grupo] = { canal: grupo, inversion_usd: inversionPorGrupo[grupo] || 0, lineas: [], total_leads: 0, leads_sac: 0, venta_subida: 0, ingreso_jot: 0 };
        }
        const total = Number(r.total_leads||0), sac = Number(r.leads_sac||0);
        const ventas = Number(r.venta_subida||0), jot = Number(r.ingreso_jot||0);
        const calidad = Math.max(0, total - sac);
        grupoMap[grupo].total_leads  += total;
        grupoMap[grupo].leads_sac    += sac;
        grupoMap[grupo].venta_subida += ventas;
        grupoMap[grupo].ingreso_jot  += jot;
        grupoMap[grupo].lineas.push({
          origen: r.b_origen, total_leads: total, leads_sac: sac, leads_calidad: calidad,
          venta_subida: ventas, ingreso_jot: jot,
          pct_sac: total>0?(sac/total)*100:0, pct_calidad: total>0?(calidad/total)*100:0,
          pct_ventas: total>0?(ventas/total)*100:0, pct_ventas_jot: total>0?(jot/total)*100:0,
        });
      });

      const canales = Object.values(grupoMap)
        .filter(c => c.canal !== 'SIN MAPEO')
        .map(c => {
          const { total_leads, leads_sac, venta_subida, ingreso_jot, inversion_usd } = c;
          const leads_calidad = Math.max(0, total_leads - leads_sac);
          return {
            canal: c.canal, inversion_usd, total_leads, leads_sac, leads_calidad,
            venta_subida, ingreso_jot, lineas: c.lineas,
            pct_sac:        total_leads>0?(leads_sac/total_leads)*100:0,
            pct_calidad:    total_leads>0?(leads_calidad/total_leads)*100:0,
            pct_ventas:     total_leads>0?(venta_subida/total_leads)*100:0,
            pct_ventas_jot: total_leads>0?(ingreso_jot/total_leads)*100:0,
            cpl:      total_leads>0   && inversion_usd>0 ? inversion_usd/total_leads   : null,
            cpl_gest: leads_calidad>0 && inversion_usd>0 ? inversion_usd/leads_calidad : null,
            cpa:      venta_subida>0  && inversion_usd>0 ? inversion_usd/venta_subida  : null,
            cpa_jot:  ingreso_jot>0   && inversion_usd>0 ? inversion_usd/ingreso_jot   : null,
          };
        });

      // Canales disponibles para el período
      let canalesDisponibles = [];
      try {
        const origenesDispRes = await pool.query(`
          SELECT DISTINCT b_origen FROM public.mestra_bitrix
          WHERE ${fechaWhere} AND b_origen IS NOT NULL AND b_origen<>'' AND j_id_bitrix IS NULL
          ORDER BY b_origen ASC
        `, fechaParams);
        const gruposEncontrados = new Set();
        origenesDispRes.rows.forEach(r => {
          const origenRaw = (r.b_origen||'').trim();
          const g = ORIGEN_A_CANAL_INV[origenRaw] || ORIGEN_A_CANAL_INV[origenRaw.toUpperCase()];
          if (g) gruposEncontrados.add(g);
        });
        canalesDisponibles = [...gruposEncontrados].sort().map(g => ({ canal: g, lineas: GRUPO_A_ORIGENES[g]||[] }));
      } catch (_) {
        canalesDisponibles = GRUPOS_DISPONIBLES.map(g => ({ canal: g, lineas: GRUPO_A_ORIGENES[g] }));
      }

      res.json({ success: true, canales, canales_disponibles: canalesDisponibles });
    } catch (error) {
      console.error('Error en getMonitoreoMetas:', error);
      res.status(500).json({ success: false, message: 'Error al obtener metas', error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. REPORTE DATA
  // FIX: SPLIT_PART para normalizar canal_inversion en query de inversión diaria
  // FIX: activos_mes = activados DENTRO del rango (j_fecha_activacion_netlife)
  // FIX: activo_backlog = registrados ANTES del rango y activados DENTRO del rango
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

      const invWhereClause = canalesInversion.length>0 ? buildInWhere(canalesInversion,2,'SPLIT_PART(canal_inversion, \' -\', 1)').where  : '';
      const invParamsExtra = canalesInversion.length>0 ? buildInWhere(canalesInversion,2,'SPLIT_PART(canal_inversion, \' -\', 1)').params : [];
      const bitWhereClause = origenesBitrix.length>0   ? buildInWhere(origenesBitrix,  2,'b_origen').where        : '';
      const bitParamsExtra = origenesBitrix.length>0   ? buildInWhere(origenesBitrix,  2,'b_origen').params       : [];

      // FIX: Inversión diaria — SPLIT_PART para normalizar canal antes de agrupar
      const inversionRes = await pool.query(`
        SELECT EXTRACT(DAY FROM fecha)::int AS dia, SUM(max_inv) AS inversion_usd
        FROM (
          SELECT fecha, SPLIT_PART(canal_inversion, ' -', 1) AS canal_normalizado, MAX(inversion_usd) AS max_inv
          FROM public.mv_monitoreo_publicidad
          WHERE fecha BETWEEN $1::date AND $2::date
            AND canal_inversion NOT IN ('MAL INGRESO','SIN MAPEO')
            ${invWhereClause}
          GROUP BY fecha, SPLIT_PART(canal_inversion, ' -', 1)
        ) sub
        GROUP BY EXTRACT(DAY FROM fecha)::int
        ORDER BY dia ASC
      `, [desde, hasta, ...invParamsExtra]);

      // ── Leads + Etapas Bitrix ─────────────────────────────────────────────────
      const etapasRes = await pool.query(`
        SELECT EXTRACT(DAY FROM b_creado_el_fecha::date)::int AS dia,
          -- Excluye DUPLICADO / REMARKETING / REGULARIZACION del total de leads.
          COUNT(*) FILTER (WHERE ${esLeadTotalExpr('b_etapa_de_la_negociacion')}) AS total_leads,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%ATC%' OR b_etapa_de_la_negociacion ILIKE '%SOPORTE%') AS atc_soporte,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%FUERA DE COBERTURA%') AS fuera_cobertura,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%ZONA%PELIGRO%') AS zonas_peligrosas,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%INNEGOCIABLE%') AS innegociable,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%VENTA SUBIDA%') AS venta_subida,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%SEGUIMIENTO%') AS seguimiento,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%GESTIÓN DIARIA%' OR b_etapa_de_la_negociacion ILIKE '%GESTION DIARIA%') AS gestion_diaria,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%DOCUMENTOS PENDIENTES%') AS doc_pendientes,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%VOLVER A LLAMAR%') AS volver_llamar,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%MANTIENE PROVEEDOR%') AS mantiene_proveedor,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%OTRO PROVEEDOR%') AS otro_proveedor,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%NO VOLVER A CONTACTAR%') AS no_volver_contactar,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%NO INTERESA%COSTO%') AS no_interesa_costo,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%DESISTE%') AS desiste_compra,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%CLIENTE DISCAPACIDAD%') AS cliente_discapacidad,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%OPORTUNIDADES%') AS oportunidades,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%DUPLICADO%') AS duplicado,
          COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion ILIKE '%CONTRATO NETLIFE%') AS contrato_netlife
        FROM public.mestra_bitrix
        WHERE b_creado_el_fecha::date BETWEEN $1::date AND $2::date
          AND j_id_bitrix IS NULL
          ${bitWhereClause}
        GROUP BY dia ORDER BY dia ASC
      `, [desde, hasta, ...bitParamsExtra]);

      // ── JOT denominadores — CORREGIDO ────────────────────────────────────────
      // activos_mes  = ACTIVO + fecha_activacion DENTRO del rango (igual que dashboards.js)
      // activo_backlog = ACTIVO + registrado ANTES del rango + activado DENTRO del rango
      const jotOrigenWhere = origenesBitrix.length>0
        ? `AND t2.b_origen IN (${origenesBitrix.map((_,i)=>`$${3+i}`).join(', ')})`
        : '';

      const jotDenomsRes = await pool.query(`
        SELECT
          EXTRACT(DAY FROM COALESCE(
            CASE WHEN t1.j_fecha_registro_sistema IS NOT NULL AND t1.j_fecha_registro_sistema <> ''
              AND TO_DATE(t1.j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
              THEN TO_DATE(t1.j_fecha_registro_sistema, 'YYYY-MM-DD')
            END,
            CASE WHEN t1.j_fecha_activacion_netlife IS NOT NULL AND t1.j_fecha_activacion_netlife <> ''
              AND TO_DATE(t1.j_fecha_activacion_netlife, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
              THEN TO_DATE(t1.j_fecha_activacion_netlife, 'YYYY-MM-DD')
            END
          ))::int AS dia,

          COUNT(*) FILTER (
            WHERE t1.j_fecha_registro_sistema IS NOT NULL AND t1.j_fecha_registro_sistema <> ''
            AND TO_DATE(t1.j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
          ) AS ingreso_jot,

          COUNT(*) FILTER (
            WHERE t1.j_fecha_registro_sistema IS NOT NULL AND t1.j_fecha_registro_sistema <> ''
            AND TO_DATE(t1.j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
            AND t2.b_creado_el_fecha IS NOT NULL
            AND TO_DATE(t1.j_fecha_registro_sistema, 'YYYY-MM-DD') = t2.b_creado_el_fecha::date
          ) AS ingreso_bitrix_mismo_dia,

          -- ✅ ACTIVOS MES: estado ACTIVO + activación dentro del rango
          COUNT(*) FILTER (
            WHERE t1.j_netlife_estatus_real ILIKE 'ACTIVO'
            AND t1.j_fecha_activacion_netlife IS NOT NULL AND t1.j_fecha_activacion_netlife <> ''
            AND TO_DATE(t1.j_fecha_activacion_netlife, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
          ) AS activos_mes,

          -- ✅ BACKLOG: estado ACTIVO + registrado ANTES del rango + activado DENTRO del rango
          COUNT(*) FILTER (
            WHERE t1.j_netlife_estatus_real ILIKE 'ACTIVO'
            AND t1.j_fecha_registro_sistema IS NOT NULL AND t1.j_fecha_registro_sistema <> ''
            AND TO_DATE(t1.j_fecha_registro_sistema, 'YYYY-MM-DD') < $1::date
            AND t1.j_fecha_activacion_netlife IS NOT NULL AND t1.j_fecha_activacion_netlife <> ''
            AND TO_DATE(t1.j_fecha_activacion_netlife, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
          ) AS activo_backlog,

          COUNT(*) FILTER (
            WHERE (t1.j_netlife_estatus_real ILIKE '%PREPLANIFICADO%' OR t1.j_netlife_estatus_real ILIKE '%REPLANIFICADO%')
            AND t1.j_fecha_registro_sistema IS NOT NULL AND t1.j_fecha_registro_sistema <> ''
            AND TO_DATE(t1.j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
          ) AS preplaneados,

          COUNT(*) FILTER (
            WHERE t1.j_netlife_estatus_real ILIKE '%ASIGNADO%'
            AND t1.j_fecha_registro_sistema IS NOT NULL AND t1.j_fecha_registro_sistema <> ''
            AND TO_DATE(t1.j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
          ) AS asignados,

          COUNT(*) FILTER (
            WHERE t1.j_netlife_estatus_real ILIKE '%PRESERVICIO%'
            AND t1.j_fecha_registro_sistema IS NOT NULL AND t1.j_fecha_registro_sistema <> ''
            AND TO_DATE(t1.j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
          ) AS preservicio

        FROM public.mestra_bitrix t1
        JOIN public.mestra_bitrix t2 ON t1.j_id_bitrix = t2.b_id
        WHERE t1.j_id_bitrix IS NOT NULL
          AND (
            -- registrado dentro del rango
            (t1.j_fecha_registro_sistema IS NOT NULL AND t1.j_fecha_registro_sistema <> ''
              AND TO_DATE(t1.j_fecha_registro_sistema, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date)
            OR
            -- registrado ANTES pero activado DENTRO (backlog)
            (t1.j_fecha_activacion_netlife IS NOT NULL AND t1.j_fecha_activacion_netlife <> ''
              AND TO_DATE(t1.j_fecha_activacion_netlife, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date
              AND t1.j_fecha_registro_sistema IS NOT NULL AND t1.j_fecha_registro_sistema <> ''
              AND TO_DATE(t1.j_fecha_registro_sistema, 'YYYY-MM-DD') < $1::date)
          )
          ${jotOrigenWhere}
        GROUP BY dia ORDER BY dia ASC
      `, [desde, hasta, ...bitParamsExtra]);

      // ── Estatus JOT ───────────────────────────────────────────────────────────
      const statusJotRes = await pool.query(`
        SELECT EXTRACT(DAY FROM TO_DATE(t1.j_fecha_registro_sistema,'YYYY-MM-DD'))::int AS dia,
          COUNT(*) AS ingreso_jot,
          COUNT(*) FILTER (WHERE t2.b_creado_el_fecha IS NOT NULL
            AND TO_DATE(t1.j_fecha_registro_sistema,'YYYY-MM-DD')=t2.b_creado_el_fecha::date) AS ingreso_bitrix,
          COUNT(*) FILTER (WHERE t1.j_netlife_estatus_real ILIKE 'ACTIVO') AS activo_backlog,
          COUNT(*) FILTER (WHERE t1.j_netlife_estatus_real ILIKE 'ACTIVO'
            AND t1.j_fecha_activacion_netlife IS NOT NULL AND t1.j_fecha_activacion_netlife<>''
            AND TO_DATE(t1.j_fecha_activacion_netlife,'YYYY-MM-DD') BETWEEN $1::date AND $2::date) AS activos,
          COUNT(*) AS total_ventas_jot,
          COUNT(*) FILTER (WHERE t1.j_netlife_estatus_real ILIKE '%DESISTE%') AS desiste_servicio_jot,
          COUNT(*) FILTER (WHERE t1.j_estatus_regularizacion ILIKE '%REGULARIZADO%'
            AND t1.j_estatus_regularizacion NOT ILIKE '%NO REQUIERE%'
            AND NOT ${esPorRegularizarExpr('t1.j_estatus_regularizacion')}) AS regularizados,
          COUNT(*) FILTER (WHERE ${esPorRegularizarExpr('t1.j_estatus_regularizacion')}) AS por_regularizar
        FROM public.mestra_bitrix t1
        JOIN public.mestra_bitrix t2 ON t1.j_id_bitrix=t2.b_id
        WHERE t1.j_id_bitrix IS NOT NULL
          AND t1.j_fecha_registro_sistema IS NOT NULL AND t1.j_fecha_registro_sistema<>''
          AND TO_DATE(t1.j_fecha_registro_sistema,'YYYY-MM-DD') BETWEEN $1::date AND $2::date
          ${jotOrigenWhere}
        GROUP BY dia ORDER BY dia ASC
      `, [desde, hasta, ...bitParamsExtra]);

      // ── Forma de pago ─────────────────────────────────────────────────────────
      const pagoRes = await pool.query(`
        SELECT EXTRACT(DAY FROM TO_DATE(t1.j_fecha_registro_sistema,'YYYY-MM-DD'))::int AS dia,
          SUM(CASE WHEN t1.j_forma_pago ILIKE '%CUENTA%'   THEN 1 ELSE 0 END) AS pago_cuenta,
          SUM(CASE WHEN t1.j_forma_pago ILIKE '%EFECTIVO%' THEN 1 ELSE 0 END) AS pago_efectivo,
          SUM(CASE WHEN t1.j_forma_pago ILIKE '%TARJETA%'  THEN 1 ELSE 0 END) AS pago_tarjeta,
          SUM(CASE WHEN t1.j_forma_pago ILIKE '%CUENTA%'   AND t1.j_netlife_estatus_real ILIKE 'ACTIVO'
            AND t1.j_fecha_activacion_netlife IS NOT NULL AND t1.j_fecha_activacion_netlife<>''
            AND TO_DATE(t1.j_fecha_activacion_netlife,'YYYY-MM-DD') BETWEEN $1::date AND $2::date THEN 1 ELSE 0 END) AS pago_cuenta_activa,
          SUM(CASE WHEN t1.j_forma_pago ILIKE '%EFECTIVO%' AND t1.j_netlife_estatus_real ILIKE 'ACTIVO'
            AND t1.j_fecha_activacion_netlife IS NOT NULL AND t1.j_fecha_activacion_netlife<>''
            AND TO_DATE(t1.j_fecha_activacion_netlife,'YYYY-MM-DD') BETWEEN $1::date AND $2::date THEN 1 ELSE 0 END) AS pago_efectivo_activa,
          SUM(CASE WHEN t1.j_forma_pago ILIKE '%TARJETA%'  AND t1.j_netlife_estatus_real ILIKE 'ACTIVO'
            AND t1.j_fecha_activacion_netlife IS NOT NULL AND t1.j_fecha_activacion_netlife<>''
            AND TO_DATE(t1.j_fecha_activacion_netlife,'YYYY-MM-DD') BETWEEN $1::date AND $2::date THEN 1 ELSE 0 END) AS pago_tarjeta_activa
        FROM public.mestra_bitrix t1
        JOIN public.mestra_bitrix t2 ON t1.j_id_bitrix=t2.b_id
        WHERE t1.j_id_bitrix IS NOT NULL
          AND t1.j_fecha_registro_sistema IS NOT NULL AND t1.j_fecha_registro_sistema<>''
          AND TO_DATE(t1.j_fecha_registro_sistema,'YYYY-MM-DD') BETWEEN $1::date AND $2::date
          ${jotOrigenWhere}
        GROUP BY dia ORDER BY dia ASC
      `, [desde, hasta, ...bitParamsExtra]);

      // ── Ciclo de venta ────────────────────────────────────────────────────────
      const cicloRes = await pool.query(`
        SELECT EXTRACT(DAY FROM fecha_creacion)::int AS dia,
          COUNT(*) FILTER (WHERE diff=0) AS ciclo_0, COUNT(*) FILTER (WHERE diff=1) AS ciclo_1,
          COUNT(*) FILTER (WHERE diff=2) AS ciclo_2, COUNT(*) FILTER (WHERE diff=3) AS ciclo_3,
          COUNT(*) FILTER (WHERE diff=4) AS ciclo_4, COUNT(*) FILTER (WHERE diff>=5) AS ciclo_mas5
        FROM (
          SELECT TO_DATE(t1.j_fecha_activacion_netlife,'YYYY-MM-DD')-t2.b_creado_el_fecha::date AS diff,
            t2.b_creado_el_fecha::date AS fecha_creacion
          FROM public.mestra_bitrix t1 JOIN public.mestra_bitrix t2 ON t1.j_id_bitrix=t2.b_id
          WHERE t1.j_id_bitrix IS NOT NULL
            AND t1.j_fecha_activacion_netlife IS NOT NULL AND t1.j_fecha_activacion_netlife<>''
            AND t2.b_creado_el_fecha IS NOT NULL
            AND t2.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
            ${jotOrigenWhere}
        ) t GROUP BY dia ORDER BY dia ASC
      `, [desde, hasta, ...bitParamsExtra]);

      // ── Ciudad ────────────────────────────────────────────────────────────────
      const ciudadRes = await pool.query(`
        SELECT ciudad, provincia,
          SUM(total_leads) AS total_leads, SUM(activos) AS activos, SUM(ingresos_jot) AS ingresos_jot,
          ROUND(SUM(activos)::numeric/NULLIF(SUM(total_leads),0)*100,1) AS pct_activos
        FROM public.mv_monitoreo_ciudad WHERE fecha BETWEEN $1::date AND $2::date
        GROUP BY ciudad, provincia ORDER BY activos DESC NULLS LAST
      `, [desde, hasta]);

      const ciudadDiaRes = await pool.query(`
        SELECT ciudad, EXTRACT(DAY FROM fecha)::int AS dia, SUM(activos) AS activos, SUM(ingresos_jot) AS ingresos_jot
        FROM public.mv_monitoreo_ciudad WHERE fecha BETWEEN $1::date AND $2::date
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
        WHERE fecha BETWEEN $1::date AND $2::date GROUP BY motivo_atc ORDER BY cantidad DESC
      `, [desde, hasta]);

      // ── Canales disponibles ───────────────────────────────────────────────────
      const origenesDispRes = await pool.query(`
        SELECT DISTINCT b_origen FROM public.mestra_bitrix
        WHERE b_creado_el_fecha::date BETWEEN $1::date AND $2::date
          AND b_origen IS NOT NULL AND b_origen<>'' AND j_id_bitrix IS NULL
        ORDER BY b_origen ASC
      `, [desde, hasta]);

      const gruposEncontrados = new Set();
      origenesDispRes.rows.forEach(r => {
        const origenRaw = (r.b_origen||'').trim();
        const g = ORIGEN_A_CANAL_INV[origenRaw] || ORIGEN_A_CANAL_INV[origenRaw.toUpperCase()];
        if (g) gruposEncontrados.add(g);
      });
      const canalesDisponibles = [...gruposEncontrados].sort().map(g => ({ canal: g, lineas: GRUPO_A_ORIGENES[g]||[] }));

      // ── Días del mes ──────────────────────────────────────────────────────────
      const diasMes = [];
      const DIAS_NOMBRE = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
      for (let d=1; d<=ultimoDia; d++) diasMes.push({ dia: d, nombre: DIAS_NOMBRE[new Date(y,m-1,d).getDay()] });

      // ── Combinar en finalArray ────────────────────────────────────────────────
      const invMap = {};
      inversionRes.rows.forEach(r => { const dia=Number(r.dia); invMap[dia]={ dia, inversion_usd: Number(r.inversion_usd||0) }; });
      etapasRes.rows.forEach(r => {
        const dia=Number(r.dia);
        if (!invMap[dia]) invMap[dia]={ dia, inversion_usd:0 };
        const sac=Number(r.atc_soporte||0)+Number(r.fuera_cobertura||0)+Number(r.zonas_peligrosas||0)+Number(r.innegociable||0);
        invMap[dia].n_leads=Number(r.total_leads||0);
        invMap[dia].negociables=Math.max(0,Number(r.total_leads||0)-sac);
        invMap[dia].venta_subida=Number(r.venta_subida||0);
      });
      jotDenomsRes.rows.forEach(r => {
        const dia=Number(r.dia);
        if (!invMap[dia]) invMap[dia]={ dia, inversion_usd:0 };
        invMap[dia].activos_mes    = Number(r.activos_mes||0);
        invMap[dia].activo_backlog = Number(r.activo_backlog||0);
        invMap[dia].ingreso_jot    = Number(r.ingreso_jot||0);
        invMap[dia].ingreso_bitrix = Number(r.ingreso_bitrix_mismo_dia||0);
        invMap[dia].preplaneados   = Number(r.preplaneados||0);
        invMap[dia].asignados      = Number(r.asignados||0);
        invMap[dia].preservicio    = Number(r.preservicio||0);
      });

      const allDaysMap = {};
      for (let d=1; d<=ultimoDia; d++) {
        allDaysMap[d]={ dia:d, inversion_usd:0, n_leads:0, venta_subida:0, negociables:0,
          activos_mes:0, activo_backlog:0, ingreso_jot:0, ingreso_bitrix:0,
          preplaneados:0, asignados:0, preservicio:0 };
      }
      Object.values(invMap).forEach(day => { allDaysMap[day.dia]={ ...allDaysMap[day.dia], ...day }; });
      const finalArray = Object.values(allDaysMap).sort((a,b)=>a.dia-b.dia);

      res.json({
        success: true,
        meta: { anio: y, mes: m, dias: diasMes },
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
      res.status(500).json({ success: false, message: 'Error al generar reporte', error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // CATÁLOGO DE AGENCIAS (origen -> agencia) — NOVONET
  // (2026-08-20) Mismo pedido que ya se resolvió para VELSA (ver
  // redesVelsa.controller.js): agrupar los orígenes reales de Bitrix bajo el
  // nombre de la AGENCIA de publicidad que los genera, pero editable desde el
  // ERP (pestaña "Agencias") en vez de hardcodeado.
  //
  // IMPORTANTE: esto NO reemplaza ORIGEN_A_CANAL_INV / GRUPO_A_ORIGENES de
  // arriba — esos mapeos siguen intactos y los sigue usando "Metas vs Logros"
  // y el Forecast (mv_monitoreo_publicidad). Este catálogo es un mecanismo
  // NUEVO, aditivo, con su propia tabla (novonet_lineas_canal) y su propia
  // inversión cargada por origen (novonet_inversion_redes) — no toca nada de
  // lo que ya funciona.
  //
  // Tabla novonet_lineas_canal: un registro por ORIGEN (único), con la AGENCIA
  // asignada. Ver migración CATALOGO_AGENCIAS_NOVONET.sql.
  //
  // Los orígenes salen EN VIVO de public.mestra_bitrix (igual razón que VELSA:
  // no depender de una vista materializada que puede estar desactualizada).
  // ─────────────────────────────────────────────────────────────────────────────

  // 8. Catálogo actual: cada origen real, con su agencia asignada hoy (null si
  //    todavía no se asignó).
  // FUENTE (2026-08-21): bitrix_webhook_leads EN VIVO (empresa='novonet'),
  // NO mestra_bitrix. mestra_bitrix dejó de recibir leads nuevos (se quedó
  // congelada a inicios de agosto — es la tabla vieja); bitrix_webhook_leads
  // es la que sí se actualiza con cada webhook de Bitrix, para las dos
  // empresas (columna "empresa" las distingue). Mismo patrón que ya usa
  // Redes VELSA en este mismo archivo.
  const getAgenciasCanal = async (req, res) => {
    try {
      let result;
      let catalogoDisponible = true;
      try {
        result = await pool.query(
          `SELECT NULLIF(BTRIM(w.source), '') AS origen,
                  COUNT(*) AS n_leads,
                  MAX(m.agencia) AS agencia
           FROM bitrix_webhook_leads w
           LEFT JOIN novonet_lineas_canal m ON m.origen = NULLIF(BTRIM(w.source), '')
           WHERE w.empresa = 'novonet'
             AND NULLIF(BTRIM(w.source), '') IS NOT NULL
           GROUP BY NULLIF(BTRIM(w.source), '')
           ORDER BY n_leads DESC`
        );
      } catch (err) {
        if (err.code !== '42P01') throw err;
        catalogoDisponible = false;
        console.warn('⚠️  getAgenciasCanal: novonet_lineas_canal no existe todavía (corre CATALOGO_AGENCIAS_NOVONET.sql) — orígenes sin agencia por ahora.');
        result = await pool.query(
          `SELECT NULLIF(BTRIM(w.source), '') AS origen,
                  COUNT(*) AS n_leads,
                  NULL AS agencia
           FROM bitrix_webhook_leads w
           WHERE w.empresa = 'novonet'
             AND NULLIF(BTRIM(w.source), '') IS NOT NULL
           GROUP BY NULLIF(BTRIM(w.source), '')
           ORDER BY n_leads DESC`
        );
      }
      res.json({ success: true, origenes: result.rows, catalogoDisponible });
    } catch (error) {
      console.error('Error en getAgenciasCanal:', error);
      res.status(500).json({ success: false, message: 'Error al obtener catálogo de agencias', error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message), codigo: error.code || null });
    }
  };

  // 9. Asignar/reasignar un origen a una agencia (upsert por origen).
  // Body acepta un solo registro { origen, agencia } o { items: [...] }.
  // agencia = '' o null borra la asignación (vuelve a "sin agencia").
  const upsertAgenciaCanal = async (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
    const creadoPor = req.user?.usuario || 'desconocido';

    if (!items.length) {
      return res.status(400).json({ success: false, message: 'No se recibieron datos para guardar' });
    }
    for (const item of items) {
      if (!item.origen) {
        return res.status(400).json({ success: false, message: 'Cada registro requiere origen' });
      }
    }

    try {
      const guardados = [];
      for (const item of items) {
        const agencia = (item.agencia || '').trim();
        if (!agencia) {
          await pool.query(`DELETE FROM novonet_lineas_canal WHERE origen = $1`, [item.origen]);
          guardados.push({ origen: item.origen, agencia: null });
          continue;
        }
        const result = await pool.query(
          `INSERT INTO novonet_lineas_canal (origen, agencia, creado_por, actualizado_en)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (origen) DO UPDATE SET
             agencia        = EXCLUDED.agencia,
             creado_por     = EXCLUDED.creado_por,
             actualizado_en = now()
           RETURNING origen, agencia, creado_por, actualizado_en`,
          [item.origen, agencia, creadoPor]
        );
        guardados.push(result.rows[0]);
      }
      res.json({ success: true, data: guardados });
    } catch (error) {
      console.error('Error en upsertAgenciaCanal:', error);
      res.status(500).json({ success: false, message: 'Error al guardar agencia', error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message), codigo: error.code || null });
    }
  };

  // 10. Inversión / pauta cargada por origen — lectura por rango.
  //     Se llena manualmente desde la pestaña "Agencias" O automáticamente
  //     por el sync de WinTracker (ver services/wintracker.service.js) —
  //     misma tabla, columna "fuente" distingue el origen del dato.
  const getInversionAgencias = async (req, res) => {
    try {
      const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);
      const result = await pool.query(
        `SELECT id, fecha, origen, monto_usd, fuente, creado_por, updated_at
         FROM novonet_inversion_redes
         WHERE fecha BETWEEN $1 AND $2
         ORDER BY fecha DESC, origen ASC`,
        [fechaDesde, fechaHasta]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error('Error en getInversionAgencias:', error);
      res.status(500).json({ success: false, message: 'Error al obtener inversión', error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message), codigo: error.code || null });
    }
  };

  // 11. Inversión — carga manual (upsert por fecha + origen).
  // Body acepta un solo registro { fecha, origen, monto_usd } o un arreglo
  // { items: [...] }.
  const upsertInversionAgencias = async (req, res) => {
    const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
    const creadoPor = req.user?.usuario || 'desconocido';

    if (!items.length) {
      return res.status(400).json({ success: false, message: 'No se recibieron datos para guardar' });
    }
    for (const item of items) {
      if (!item.fecha || !item.origen || item.monto_usd === undefined || item.monto_usd === null) {
        return res.status(400).json({ success: false, message: 'Cada registro requiere fecha, origen y monto_usd' });
      }
      if (Number.isNaN(Number(item.monto_usd)) || Number(item.monto_usd) < 0) {
        return res.status(400).json({ success: false, message: `monto_usd inválido para ${item.origen} (${item.fecha})` });
      }
    }

    try {
      const guardados = [];
      for (const item of items) {
        const result = await pool.query(
          `INSERT INTO novonet_inversion_redes (fecha, origen, monto_usd, fuente, creado_por, updated_at)
           VALUES ($1, $2, $3, 'manual', $4, now())
           ON CONFLICT (fecha, origen) DO UPDATE SET
             monto_usd  = EXCLUDED.monto_usd,
             fuente     = 'manual',
             creado_por = EXCLUDED.creado_por,
             updated_at = now()
           RETURNING id, fecha, origen, monto_usd, fuente, creado_por, updated_at`,
          [item.fecha, item.origen, Number(item.monto_usd), creadoPor]
        );
        guardados.push(result.rows[0]);
      }
      res.json({ success: true, data: guardados });
    } catch (error) {
      console.error('Error en upsertInversionAgencias:', error);
      res.status(500).json({ success: false, message: 'Error al guardar inversión', error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message), codigo: error.code || null });
    }
  };

  // 12. Resumen agregado por agencia: leads en vivo (bitrix_webhook_leads) +
  //     inversión (novonet_inversion_redes), unidos vía novonet_lineas_canal.
  //     Los orígenes sin agencia asignada se agrupan bajo "SIN AGENCIA ASIGNADA"
  //     para que no se pierdan del total.
  //
  // FUENTE (2026-08-21): bitrix_webhook_leads (empresa='novonet') EN VIVO, NO
  // mestra_bitrix. mestra_bitrix dejó de recibir leads nuevos hace semanas —
  // por eso filtrando "hoy" siempre daba cero aunque hubiera leads reales
  // entrando. bitrix_webhook_leads sí se actualiza con cada webhook.
  const getResumenPorAgencia = async (req, res) => {
    try {
      const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);

      // Leads/gestionables/ventas SIEMPRE deben poder verse, con o sin el
      // catálogo novonet_lineas_canal (que puede no existir todavía si la
      // migración CATALOGO_AGENCIAS_NOVONET.sql no corrió en esta base) —
      // si el JOIN falla por tabla inexistente (42P01), reintenta sin él:
      // todo cae en "SIN AGENCIA ASIGNADA" pero el conteo real no se pierde.
      const leadsQuery = (conCatalogo) => `
        SELECT
           ${conCatalogo ? "COALESCE(m.agencia, 'SIN AGENCIA ASIGNADA')" : "'SIN AGENCIA ASIGNADA'"} AS agencia,
           COUNT(*) FILTER (WHERE ${esLeadTotalExpr('w.etapa_bitrix')}) AS n_leads,
           COUNT(*) FILTER (WHERE ${esGestionableExpr('w.etapa_bitrix')}) AS gestionables,
           COUNT(*) FILTER (WHERE w.etapa_bitrix ILIKE '%ATC%'
             OR w.etapa_bitrix ILIKE '%SOPORTE%'
             OR w.etapa_bitrix ILIKE '%FUERA DE COBERTURA%'
             OR w.etapa_bitrix ILIKE '%ZONA%PELIGRO%'
             OR w.etapa_bitrix ILIKE '%INNEGOCIABLE%'
           ) AS atc,
           COUNT(*) FILTER (WHERE w.etapa_bitrix ILIKE '%VENTA SUBIDA%') AS venta_subida
         FROM bitrix_webhook_leads w
         ${conCatalogo ? "LEFT JOIN novonet_lineas_canal m ON m.origen = NULLIF(BTRIM(w.source), '')" : ""}
         WHERE w.empresa = 'novonet'
           AND w.created_at_ecuador::date BETWEEN $1::date AND $2::date
         GROUP BY ${conCatalogo ? "COALESCE(m.agencia, 'SIN AGENCIA ASIGNADA')" : "1"}
         ORDER BY n_leads DESC`;

      let leadsRes;
      let catalogoDisponible = true;
      try {
        leadsRes = await pool.query(leadsQuery(true), [fechaDesde, fechaHasta]);
      } catch (err) {
        if (err.code !== '42P01') throw err;
        catalogoDisponible = false;
        console.warn('⚠️  getResumenPorAgencia: novonet_lineas_canal no existe todavía (corre CATALOGO_AGENCIAS_NOVONET.sql) — mostrando leads sin desglose por agencia.');
        leadsRes = await pool.query(leadsQuery(false), [fechaDesde, fechaHasta]);
      }

      let inversionPorAgencia = {};
      if (catalogoDisponible) {
        try {
          const inversionRes = await pool.query(
            `SELECT
               COALESCE(m.agencia, 'SIN AGENCIA ASIGNADA') AS agencia,
               SUM(i.monto_usd) AS inversion
             FROM novonet_inversion_redes i
             LEFT JOIN novonet_lineas_canal m ON m.origen = i.origen
             WHERE i.fecha BETWEEN $1 AND $2
             GROUP BY COALESCE(m.agencia, 'SIN AGENCIA ASIGNADA')`,
            [fechaDesde, fechaHasta]
          );
          inversionRes.rows.forEach((r) => { inversionPorAgencia[r.agencia] = Number(r.inversion || 0); });
        } catch (err) {
          if (err.code !== '42P01') throw err;
          console.warn('⚠️  getResumenPorAgencia: novonet_inversion_redes no existe todavía — inversión queda en 0.');
        }
      }

      const porAgencia = leadsRes.rows.map((row) => {
        const n_leads = Number(row.n_leads || 0);
        const venta_subida = Number(row.venta_subida || 0);
        const inversion = inversionPorAgencia[row.agencia] || 0;
        return {
          agencia: row.agencia,
          n_leads,
          gestionables: Number(row.gestionables || 0),
          atc: Number(row.atc || 0),
          venta_subida,
          pct_venta_subida: n_leads > 0 ? +((venta_subida / n_leads) * 100).toFixed(1) : 0,
          inversion,
          cpl: n_leads > 0 && inversion > 0 ? +(inversion / n_leads).toFixed(2) : null,
          costo_venta: venta_subida > 0 && inversion > 0 ? +(inversion / venta_subida).toFixed(2) : null,
        };
      });

      res.json({ success: true, porAgencia, catalogoDisponible });
    } catch (error) {
      console.error('Error en getResumenPorAgencia:', error);
      res.status(500).json({ success: false, message: 'Error al obtener resumen por agencia', error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message), codigo: error.code || null });
    }
  };

  module.exports = {
    getMonitoreoRedes, getMonitoreoCiudad, getMonitoreoHora,
    getMonitoreoAtc, getMonitoreoCosto, getMonitoreoMetas, getReporteData,
    getAgenciasCanal, upsertAgenciaCanal,
    getInversionAgencias, upsertInversionAgencias,
    getResumenPorAgencia,
  };