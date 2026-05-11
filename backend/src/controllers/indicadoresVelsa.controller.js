/**
 * 🔄 VERSIÓN REFACTORIZADA: Bitrix24 + negociaciones_reporteria
 * Fecha de cambio: 2026-05-11
 *
 * CAMBIOS PRINCIPALES:
 * ✅ Tabla base: velsa_netlife_maestra_cons → negociaciones_reporteria
 * ✅ Columnas: b_* / j_* → nr.*
 * ⚠️ Eliminados: supervisor_asignado, j_estado_venta_netlife, j_regularizado, j_forma_pago, j_aplica_descuento
 * 📈 Mejorado: responsable_nombre ahora es legible, etapa ya está mapeada
 */

const pool = require('../config/db');

// ============================================================
// CONSTANTES ACTUALIZADAS CON NOMBRES DE ETAPAS BITRIX24
// ============================================================

// Etapas que pueden avanzar en el pipeline
const ETAPAS_GESTIONABLES = [
  'Contacto',
  'Propuesta',
  'Negociación',
  'Decisión',
  'Ganada',
  // Agregar más según tus etapas reales en Bitrix
];

// Etapas finales (no tienen actividad)
const ETAPAS_DESCARTE = [
  'Descarte',
  'Venta Subida',
  'Otra empresa',
  'Cliente existente',
  'Duplicado',
];

// ============================================================
// CACHE DE DATOS (5 minutos)
// ============================================================
let cacheEtapas = null;
let cacheOrigenes = null;
let cacheEtapasTime = 0;
const CACHE_TTL_ETAPAS = 5 * 60 * 1000; // 5 minutos

async function refreshCachesIfNeeded() {
  const now = Date.now();
  if (now - cacheEtapasTime > CACHE_TTL_ETAPAS) {
    // Cache de etapas (NUEVO: desde negociaciones_reporteria)
    cacheEtapas = (await pool.query(`
      SELECT DISTINCT etapa
      FROM public.negociaciones_reporteria
      WHERE etapa IS NOT NULL
      ORDER BY etapa
    `)).rows.map(r => r.etapa);

    // Cache de orígenes/fuentes (NUEVO: campo 'fuente')
    cacheOrigenes = (await pool.query(`
      SELECT DISTINCT fuente
      FROM public.negociaciones_reporteria
      WHERE fuente IS NOT NULL
      ORDER BY fuente
    `)).rows.map(r => r.fuente);

    cacheEtapasTime = now;
  }
}

// ============================================================
// ENDPOINT 1: DASHBOARD
// ============================================================

async function getIndicadoresDashboardVelsa(req, res) {
  try {
    await refreshCachesIfNeeded();

    const params = {
      responsable: req.query.responsable || null,
      etapa: req.query.etapa || null,
      origen: req.query.origen || null,
      fecha_desde: req.query.fecha_desde || '2026-01-01',
      fecha_hasta: req.query.fecha_hasta || new Date().toISOString().split('T')[0],
    };

    // Construir filtros dinámicos
    let whereClause = 'WHERE nr.creado_en >= $1::DATE AND nr.creado_en <= $2::DATE';
    let queryParams = [params.fecha_desde, params.fecha_hasta];
    let paramCount = 2;

    if (params.responsable) {
      paramCount++;
      whereClause += ` AND nr.responsable_nombre = $${paramCount}`;
      queryParams.push(params.responsable);
    }

    if (params.etapa) {
      paramCount++;
      whereClause += ` AND nr.etapa = $${paramCount}`;
      queryParams.push(params.etapa);
    }

    if (params.origen) {
      paramCount++;
      whereClause += ` AND nr.fuente = $${paramCount}`;
      queryParams.push(params.origen);
    }

    // Obtener KPIs generales
    const kpiQuery = await queryKPI(whereClause, queryParams);

    // Obtener breakdown por responsable
    const byResponsable = await queryByResponsable(whereClause, queryParams);

    // Obtener breakdown por etapa
    const byEtapa = await queryByEtapa(whereClause, queryParams);

    // Obtener gráfico diario
    const diarioData = await queryDiario(whereClause, queryParams);

    // Respuesta compilada
    const respuesta = {
      periodo: {
        desde: params.fecha_desde,
        hasta: params.fecha_hasta,
      },
      kpi: kpiQuery,
      por_responsable: byResponsable,
      por_etapa: byEtapa,
      grafico_diario: diarioData,
      filtros_disponibles: {
        responsables: await queryResponsables(),
        etapas: cacheEtapas,
        origenes: cacheOrigenes,
      },
    };

    res.json(respuesta);
  } catch (err) {
    console.error('[INDICADORES] Error en dashboard:', err);
    res.status(500).json({ error: err.message });
  }
}

// ============================================================
// ENDPOINT 2: MONITOREO DIARIO
// ============================================================

async function getMonitoreoDiarioVelsa(req, res) {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    const data = {
      fecha: hoy,
      indicadores: {
        leads_creados_hoy: 0,
        crm_activas: 0,
        cerradas_hoy: 0,
        promedio_monto: 0,
      },
      detalle_por_responsable: [],
      detalle_por_etapa: [],
    };

    // Leads creados hoy
    const leadsHoy = await pool.query(`
      SELECT COUNT(*) as total
      FROM public.negociaciones_reporteria nr
      WHERE DATE(nr.creado_en) = $1
    `, [hoy]);
    data.indicadores.leads_creados_hoy = parseInt(leadsHoy.rows[0].total);

    // CRM activas (cerrado = 'N')
    const crm = await pool.query(`
      SELECT COUNT(*) as total
      FROM public.negociaciones_reporteria nr
      WHERE nr.cerrado = 'N'
    `);
    data.indicadores.crm_activas = parseInt(crm.rows[0].total);

    // Cerradas hoy (cerrado = 'Y')
    const cerradasHoy = await pool.query(`
      SELECT COUNT(*) as total
      FROM public.negociaciones_reporteria nr
      WHERE DATE(nr.modificado_en) = $1
        AND nr.cerrado = 'Y'
    `, [hoy]);
    data.indicadores.cerradas_hoy = parseInt(cerradasHoy.rows[0].total);

    // Promedio de monto
    const promedio = await pool.query(`
      SELECT AVG(monto) as promedio
      FROM public.negociaciones_reporteria nr
      WHERE DATE(nr.creado_en) = $1
        AND monto > 0
    `, [hoy]);
    data.indicadores.promedio_monto = parseFloat(promedio.rows[0].promedio || 0);

    // Desglose por responsable
    data.detalle_por_responsable = (await pool.query(`
      SELECT
        nr.responsable_nombre,
        COUNT(*) as total_creados,
        COUNT(CASE WHEN nr.cerrado = 'Y' THEN 1 END) as cerradas,
        ROUND(AVG(nr.monto)::numeric, 2) as monto_promedio
      FROM public.negociaciones_reporteria nr
      WHERE DATE(nr.creado_en) = $1
      GROUP BY nr.responsable_nombre
      ORDER BY total_creados DESC
    `, [hoy])).rows;

    // Desglose por etapa
    data.detalle_por_etapa = (await pool.query(`
      SELECT
        nr.etapa,
        COUNT(*) as total,
        COUNT(CASE WHEN nr.cerrado = 'Y' THEN 1 END) as cerradas
      FROM public.negociaciones_reporteria nr
      WHERE DATE(nr.creado_en) = $1
      GROUP BY nr.etapa
      ORDER BY total DESC
    `, [hoy])).rows;

    res.json(data);
  } catch (err) {
    console.error('[MONITOREO] Error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ============================================================
// ENDPOINT 3: REPORTE 180 GRADOS
// ============================================================

async function getReporte180Velsa(req, res) {
  try {
    const params = {
      fecha_desde: req.query.fecha_desde || '2026-01-01',
      fecha_hasta: req.query.fecha_hasta || new Date().toISOString().split('T')[0],
    };

    // KPI general
    const whereClause = 'WHERE nr.creado_en >= $1::DATE AND nr.creado_en <= $2::DATE';
    const queryParams = [params.fecha_desde, params.fecha_hasta];
    const kpi = await queryKPI(whereClause, queryParams);

    // Funnels
    const funnel = await queryFunnel(whereClause, queryParams);

    // Heat map por responsable y etapa
    const heatmap = await queryHeatmap(whereClause, queryParams);

    res.json({
      periodo: params,
      kpi,
      funnel,
      heatmap,
    });
  } catch (err) {
    console.error('[REPORTE180] Error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ============================================================
// ENDPOINT 4: CONSULTA/DESCARGA (REFACTORIZADO)
// ============================================================

async function getConsultaDescargaVelsa(req, res) {
  try {
    const params = {
      responsable: req.query.responsable || null,
      etapa: req.query.etapa || null,
      fecha_desde: req.query.fecha_desde || '2026-01-01',
      fecha_hasta: req.query.fecha_hasta || new Date().toISOString().split('T')[0],
      limit: parseInt(req.query.limit) || 1000,
    };

    let whereClause = 'WHERE nr.creado_en >= $1::DATE AND nr.creado_en <= $2::DATE';
    let queryParams = [params.fecha_desde, params.fecha_hasta];
    let paramCount = 2;

    if (params.responsable) {
      paramCount++;
      whereClause += ` AND nr.responsable_nombre = $${paramCount}`;
      queryParams.push(params.responsable);
    }

    if (params.etapa) {
      paramCount++;
      whereClause += ` AND nr.etapa = $${paramCount}`;
      queryParams.push(params.etapa);
    }

    // ⚠️ NOTA: Los campos específicos de Jotform ya NO están disponibles
    // Si necesitas datos históricos de Jotform, créalos en tabla separada
    const data = await pool.query(`
      SELECT
        nr.id,
        nr.titulo,
        nr.tipo,
        nr.etapa,
        nr.probabilidad,
        nr.monto,
        nr.moneda,
        nr.fecha_cierre,
        nr.responsable_nombre,
        nr.empresa_id,
        nr.contacto_id,
        nr.fuente,
        nr.creado_en,
        nr.modificado_en,
        nr.abierto,
        nr.cerrado,
        nr.comentarios
      FROM public.negociaciones_reporteria nr
      ${whereClause}
      ORDER BY nr.creado_en DESC
      LIMIT $${paramCount + 1}
    `, [...queryParams, params.limit]);

    res.json({
      total: data.rowCount,
      datos: data.rows,
    });
  } catch (err) {
    console.error('[CONSULTA] Error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ============================================================
// ENDPOINT 5: DEBUG
// ============================================================

async function getDebugFechasVelsa(req, res) {
  try {
    const info = {
      tabla_activa: 'negociaciones_reporteria',
      fecha_primer_registro: null,
      fecha_ultimo_registro: null,
      total_registros: 0,
      total_por_etapa: [],
      campos_disponibles: [
        'id', 'titulo', 'tipo', 'etapa', 'etapa_anterior', 'probabilidad',
        'moneda', 'monto', 'es_monto_manual', 'valor_impuesto',
        'lead_id', 'empresa_id', 'contacto_id', 'empresa_propia_id', 'cotizacion_id',
        'fecha_inicio', 'fecha_cierre', 'responsable_id', 'creado_por_id', 'modificado_por_id',
        'creado_en', 'modificado_en', 'abierto', 'cerrado', 'comentarios', 'info_adicional',
        'ubicacion_id', 'categoria_id', 'etapa_nombre', 'es_nuevo', 'es_recurrente',
        'es_cliente_recurrente', 'es_enfoque_repetido', 'fuente', 'descripcion_fuente',
        'originador_id', 'origen_id', 'movido_por_id', 'tiempo_movido', 'tiempo_ultima_actividad',
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'tiempo_ultima_comunicacion', 'id_segmento_reventa', 'ultima_actividad_por',
        'responsable_nombre', 'sincronizado_en'
      ],
    };

    // Fechas extremas
    const fechas = await pool.query(`
      SELECT
        MIN(creado_en) as primer_registro,
        MAX(creado_en) as ultimo_registro,
        COUNT(*) as total
      FROM public.negociaciones_reporteria
    `);

    info.fecha_primer_registro = fechas.rows[0].primer_registro;
    info.fecha_ultimo_registro = fechas.rows[0].ultimo_registro;
    info.total_registros = fechas.rows[0].total;

    // Total por etapa
    info.total_por_etapa = (await pool.query(`
      SELECT etapa, COUNT(*) as total
      FROM public.negociaciones_reporteria
      GROUP BY etapa
      ORDER BY total DESC
    `)).rows;

    res.json(info);
  } catch (err) {
    console.error('[DEBUG] Error:', err);
    res.status(500).json({ error: err.message });
  }
}

// ============================================================
// QUERIES AUXILIARES (REFACTORIZADAS)
// ============================================================

/**
 * Calcula KPIs principales
 * CAMBIOS: Eliminado j_estado_venta_netlife, j_regularizado, j_forma_pago, j_aplica_descuento
 * CAMBIOS: Ahora usa nr.cerrado para determinar si está cerrada
 */
async function queryKPI(whereClause, params) {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total_registros,
      COUNT(CASE WHEN nr.cerrado = 'Y' THEN 1 END) as total_cerradas,
      COUNT(CASE WHEN nr.cerrado = 'N' THEN 1 END) as total_activas,
      ROUND(AVG(nr.monto)::numeric, 2) as monto_promedio,
      ROUND(COALESCE(SUM(nr.monto), 0)::numeric, 2) as monto_total,
      COUNT(CASE WHEN nr.cerrado = 'Y' AND nr.monto > 0 THEN 1 END) as cerradas_con_monto,
      ROUND(COALESCE(AVG(CASE WHEN nr.cerrado = 'Y' THEN nr.monto END), 0)::numeric, 2) as monto_cerradas_promedio,
      ROUND(COALESCE(SUM(CASE WHEN nr.cerrado = 'Y' THEN nr.monto END), 0)::numeric, 2) as monto_cerradas_total
    FROM public.negociaciones_reporteria nr
    ${whereClause}
  `, params);

  const row = result.rows[0];
  return {
    total_registros: parseInt(row.total_registros),
    total_cerradas: parseInt(row.total_cerradas),
    total_activas: parseInt(row.total_activas),
    tasa_cierre: (parseInt(row.total_registros) > 0)
      ? ((parseInt(row.total_cerradas) / parseInt(row.total_registros)) * 100).toFixed(2) + '%'
      : '0%',
    monto_promedio: parseFloat(row.monto_promedio || 0),
    monto_total: parseFloat(row.monto_total || 0),
    cerradas_con_monto: parseInt(row.cerradas_con_monto),
    monto_cerradas_promedio: parseFloat(row.monto_cerradas_promedio || 0),
    monto_cerradas_total: parseFloat(row.monto_cerradas_total || 0),
  };
}

/**
 * Breakdown por responsable
 */
async function queryByResponsable(whereClause, params) {
  return (await pool.query(`
    SELECT
      nr.responsable_nombre,
      COUNT(*) as total,
      COUNT(CASE WHEN nr.cerrado = 'Y' THEN 1 END) as cerradas,
      ROUND(AVG(nr.monto)::numeric, 2) as monto_promedio,
      ROUND(COALESCE(SUM(nr.monto), 0)::numeric, 2) as monto_total
    FROM public.negociaciones_reporteria nr
    ${whereClause}
    GROUP BY nr.responsable_nombre
    ORDER BY total DESC
  `, params)).rows;
}

/**
 * Breakdown por etapa
 */
async function queryByEtapa(whereClause, params) {
  return (await pool.query(`
    SELECT
      nr.etapa,
      COUNT(*) as total,
      COUNT(CASE WHEN nr.cerrado = 'Y' THEN 1 END) as cerradas,
      ROUND(AVG(nr.monto)::numeric, 2) as monto_promedio,
      ROUND(COALESCE(SUM(nr.monto), 0)::numeric, 2) as monto_total
    FROM public.negociaciones_reporteria nr
    ${whereClause}
    GROUP BY nr.etapa
    ORDER BY total DESC
  `, params)).rows;
}

/**
 * Gráfico diario
 */
async function queryDiario(whereClause, params) {
  return (await pool.query(`
    SELECT
      DATE(nr.creado_en) as fecha,
      COUNT(*) as total,
      COUNT(CASE WHEN nr.cerrado = 'Y' THEN 1 END) as cerradas,
      ROUND(AVG(nr.monto)::numeric, 2) as monto_promedio
    FROM public.negociaciones_reporteria nr
    ${whereClause}
    GROUP BY DATE(nr.creado_en)
    ORDER BY fecha ASC
  `, params)).rows;
}

/**
 * Responsables únicos
 */
async function queryResponsables() {
  const result = await pool.query(`
    SELECT DISTINCT responsable_nombre
    FROM public.negociaciones_reporteria
    WHERE responsable_nombre IS NOT NULL
    ORDER BY responsable_nombre
  `);
  return result.rows.map(r => r.responsable_nombre);
}

/**
 * Funnel por etapa
 */
async function queryFunnel(whereClause, params) {
  return (await pool.query(`
    SELECT
      nr.etapa,
      COUNT(*) as cantidad,
      ROUND((COUNT(*) * 100.0 / SUM(COUNT(*)) OVER())::numeric, 2) as porcentaje
    FROM public.negociaciones_reporteria nr
    ${whereClause}
    GROUP BY nr.etapa
    ORDER BY cantidad DESC
  `, params)).rows;
}

/**
 * Heat map: responsable x etapa
 */
async function queryHeatmap(whereClause, params) {
  return (await pool.query(`
    SELECT
      nr.responsable_nombre,
      nr.etapa,
      COUNT(*) as cantidad,
      ROUND(AVG(nr.monto)::numeric, 2) as monto_promedio
    FROM public.negociaciones_reporteria nr
    ${whereClause}
    GROUP BY nr.responsable_nombre, nr.etapa
    ORDER BY nr.responsable_nombre, cantidad DESC
  `, params)).rows;
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
