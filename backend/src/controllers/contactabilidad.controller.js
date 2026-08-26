const pool = require('../config/db');
const { obtenerAnalytics } = require('../contactabilidad/contactabilidad.analytics');

async function listar(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const params = [];
    const where = [];
    if (req.query.empresa) { params.push(String(req.query.empresa).toUpperCase()); where.push(`empresa = $${params.length}`); }
    if (req.query.etapa) { params.push(`%${req.query.etapa}%`); where.push(`COALESCE(etapa_nombre, etapa_id, '') ILIKE $${params.length}`); }
    if (req.query.origen) { params.push(`%${req.query.origen}%`); where.push(`COALESCE(origen_nombre, '') ILIKE $${params.length}`); }
    if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(COALESCE(nombre_cliente,'') ILIKE $${params.length} OR COALESCE(asesor_nombre,'') ILIKE $${params.length} OR id_bitrix ILIKE $${params.length})`); }
    if (req.query.pendiente_por) { params.push(String(req.query.pendiente_por).toUpperCase()); where.push(`pendiente_por = $${params.length}`); }
    if (req.query.desde) { params.push(req.query.desde); where.push(`fecha_creacion >= $${params.length}::date`); }
    if (req.query.hasta) { params.push(req.query.hasta); where.push(`fecha_creacion < ($${params.length}::date + INTERVAL '1 day')`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = await pool.query(`SELECT COUNT(*)::int AS total FROM contactabilidad_leads ${whereSql}`, params);
    params.push(limit, (page - 1) * limit);
    const rows = await pool.query(`
      SELECT empresa, id_bitrix, nombre_cliente, asesor_id, asesor_nombre,
             origen_nombre, fecha_creacion, etapa_id,
             COALESCE(etapa_nombre, etapa_id) AS etapa_nombre, etapa_ingreso_at,
             mensajes_cliente_total, mensajes_asesor_total,
             mensajes_cliente_etapa, mensajes_asesor_etapa,
             ultimo_mensaje_cliente_at, ultimo_mensaje_asesor_at,
             pendiente_por, temperatura, ultima_sincronizacion_at
      FROM contactabilidad_leads ${whereSql}
      ORDER BY GREATEST(ultimo_mensaje_cliente_at, ultimo_mensaje_asesor_at) DESC NULLS LAST,
               fecha_creacion DESC NULLS LAST
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    res.json({ success: true, data: rows.rows, pagination: { page, limit, total: total.rows[0].total, pages: Math.ceil(total.rows[0].total / limit) } });
  } catch (error) {
    console.error('[contactabilidad] listar:', error.message);
    res.status(500).json({ success: false, error: 'Error consultando Contactabilidad' });
  }
}

async function stats(req, res) {
  try {
    const params = [];
    const where = [];
    if (req.query.empresa) { params.push(String(req.query.empresa).toUpperCase()); where.push(`empresa = $${params.length}`); }
    if (req.query.pendiente_por) { params.push(String(req.query.pendiente_por).toUpperCase()); where.push(`pendiente_por = $${params.length}`); }
    if (req.query.desde) { params.push(req.query.desde); where.push(`fecha_creacion >= $${params.length}::date`); }
    if (req.query.hasta) { params.push(req.query.hasta); where.push(`fecha_creacion < ($${params.length}::date + INTERVAL '1 day')`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(`
      SELECT COUNT(*)::int AS leads,
             COALESCE(SUM(mensajes_cliente_total),0)::int AS mensajes_cliente,
             COALESCE(SUM(mensajes_asesor_total),0)::int AS mensajes_asesor,
             COUNT(*) FILTER (WHERE mensajes_cliente_total > 0)::int AS contactados,
             COUNT(*) FILTER (WHERE pendiente_por = 'ASESOR')::int AS pendientes_asesor,
             MAX(ultima_sincronizacion_at) AS ultima_sincronizacion
      FROM contactabilidad_leads
      ${whereSql}
    `, params);
    const data = result.rows[0];
    data.tasa_contactabilidad = data.leads ? Number(((data.contactados / data.leads) * 100).toFixed(1)) : 0;
    res.json({ success: true, data });
  } catch (error) {
    console.error('[contactabilidad] stats:', error.message);
    res.status(500).json({ success: false, error: 'Error calculando Contactabilidad' });
  }
}

module.exports = { listar, stats, analytics };


async function analytics(req, res, deps = {}) {
  const obtener = deps.obtener || ((query) => obtenerAnalytics(pool, query));
  try {
    const data = await obtener(req.query);
    res.json({ success: true, data });
  } catch (error) {
    const status = error instanceof TypeError ? 400 : 500;
    console.error('[contactabilidad] analytics:', error.message);
    res.status(status).json({
      success: false,
      error: status === 400
        ? error.message
        : 'Error calculando inteligencia de Contactabilidad',
    });
  }
}
