// =============================================================================
// BOT AUDITOR - Controlador
// Lee la tabla `auditorias` (poblada por el servicio BotAuditor: Bitrix24 +
// Wazzup + Groq) que vive en la MISMA base de datos Postgres que el ERP.
// Acceso restringido a ADMINISTRADOR y GERENCIA vía requierePermiso('BotAuditor').
// =============================================================================
const pool = require('../config/db');

// Solo se muestran auditorías de leads en ATC o DESCARTE (las dos empresas).
// Las filas con stage_id NULL son auditorías previas a que el bot guardara la
// etapa; se incluyen porque el bot únicamente auditaba esas mismas dos etapas.
const ETAPAS_VISIBLES = (process.env.BOT_AUDITOR_ETAPAS ||
  'C19:UC_U0JYD8,C19:LOSE,C8:UC_Q9LSSI,C8:LOSE')
  .split(',').map((s) => s.trim()).filter(Boolean);

const FILTRO_ETAPA = `(stage_id IS NULL OR stage_id = ANY($__I__))`;

// Un ADMINISTRADOR ve las dos empresas; cualquier otro perfil queda acotado a
// la suya. Sin esto, GERENCIA de VELSA podía leer auditorías de NOVONET.
function empresaVisible(req, empresaSolicitada) {
  const { empresa, perfil } = req.user || {};
  if (perfil === 'ADMINISTRADOR') return empresaSolicitada || null; // null = todas
  return empresa || '__SIN_EMPRESA__';
}

// GET /api/bot-auditor
// Query params: empresa, calificacion, canal, asesor, desde, hasta, q, page, limit
async function listarAuditorias(req, res) {
  try {
    const {
      calificacion,
      canal,
      asesor,
      desde,
      hasta,
      q,
      page = 1,
      limit = 30,
    } = req.query;

    const where = [];
    const params = [];
    let i = 1;

    where.push(FILTRO_ETAPA.replace('$__I__', `$${i++}`));
    params.push(ETAPAS_VISIBLES);

    const empresa = empresaVisible(req, req.query.empresa);
    if (empresa) {
      where.push(`UPPER(empresa) = UPPER($${i++})`);
      params.push(empresa);
    }
    if (calificacion) {
      where.push(`UPPER(calificacion) = UPPER($${i++})`);
      params.push(calificacion);
    }
    if (canal) {
      where.push(`UPPER(tipo_canal) = UPPER($${i++})`);
      params.push(canal);
    }
    if (asesor) {
      where.push(`asesor ILIKE $${i++}`);
      params.push(`%${asesor}%`);
    }
    // Rango por FECHA DE CREACIÓN DEL LEAD. `hasta` es inclusivo del día
    // completo (antes '2026-08-01' cortaba en la medianoche y dejaba fuera
    // todo ese día).
    if (desde) {
      where.push(`fecha_creacion_lead >= $${i++}`);
      params.push(desde);
    }
    if (hasta) {
      where.push(`fecha_creacion_lead < ($${i++}::date + INTERVAL '1 day')`);
      params.push(hasta);
    }
    if (q) {
      where.push(`(id_bitrix ILIKE $${i} OR asesor ILIKE $${i} OR observacion ILIKE $${i})`);
      params.push(`%${q}%`);
      i++;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limitNum = Math.min(parseInt(limit, 10) || 30, 200);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (pageNum - 1) * limitNum;

    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM auditorias ${whereSql}`,
      params
    );
    const total = totalResult.rows[0]?.total || 0;

    const dataResult = await pool.query(
      `SELECT id, id_bitrix, asesor, empresa, tipo_canal, calificacion,
              puntuacion_venta, puntuacion_atc, observacion, stage_id,
              fecha_creacion_lead, fecha_hora_auditada, ultimo_mensaje_at
       FROM auditorias
       ${whereSql}
       ORDER BY fecha_creacion_lead DESC NULLS LAST, id DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limitNum, offset]
    );

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('[botAuditor.controller] listarAuditorias error:', error);
    res.status(500).json({ success: false, error: 'Error al consultar auditorías' });
  }
}

// GET /api/bot-auditor/stats
async function obtenerEstadisticas(req, res) {
  try {
    const { desde, hasta } = req.query;
    const where = [];
    const params = [];
    let i = 1;

    where.push(FILTRO_ETAPA.replace('$__I__', `$${i++}`));
    params.push(ETAPAS_VISIBLES);

    const empresa = empresaVisible(req, req.query.empresa);
    if (empresa) {
      where.push(`UPPER(empresa) = UPPER($${i++})`);
      params.push(empresa);
    }
    if (desde) {
      where.push(`fecha_creacion_lead >= $${i++}`);
      params.push(desde);
    }
    if (hasta) {
      where.push(`fecha_creacion_lead < ($${i++}::date + INTERVAL '1 day')`);
      params.push(hasta);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE UPPER(empresa) = 'NOVONET')::int AS total_novonet,
         COUNT(*) FILTER (WHERE UPPER(empresa) = 'VELSA')::int AS total_velsa,
         COUNT(*) FILTER (WHERE UPPER(calificacion) = 'VENTA')::int AS total_venta,
         COUNT(*) FILTER (WHERE UPPER(calificacion) = 'ATC')::int AS total_atc,
         ROUND(AVG(puntuacion_venta)::numeric, 1) AS promedio_venta,
         ROUND(AVG(puntuacion_atc)::numeric, 1) AS promedio_atc,
         COUNT(*) FILTER (WHERE conversacion_anonimizada IS NULL OR conversacion_anonimizada = '')::int AS sin_conversacion
       FROM auditorias
       ${whereSql}`,
      params
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[botAuditor.controller] obtenerEstadisticas error:', error);
    res.status(500).json({ success: false, error: 'Error al consultar estadísticas' });
  }
}

// GET /api/bot-auditor/:id
async function obtenerDetalle(req, res) {
  try {
    const { id } = req.params;

    const params = [id];
    let scope = '';
    const empresa = empresaVisible(req, null);
    if (empresa) {
      scope = ' AND UPPER(empresa) = UPPER($2)';
      params.push(empresa);
    }

    const result = await pool.query(
      `SELECT * FROM auditorias WHERE id = $1${scope}`,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Auditoría no encontrada' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[botAuditor.controller] obtenerDetalle error:', error);
    res.status(500).json({ success: false, error: 'Error al consultar la auditoría' });
  }
}

module.exports = { listarAuditorias, obtenerEstadisticas, obtenerDetalle };
