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
              COALESCE(be.nombre, ben.nombre, stage_id) AS etapa,
              fecha_creacion_lead, fecha_hora_auditada, ultimo_mensaje_at
       FROM auditorias
       LEFT JOIN bitrix_etapas         be  ON be.status_id  = stage_id
       LEFT JOIN bitrix_etapas_novonet ben ON ben.status_id = stage_id
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

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG DEL PROMPT (BotAuditor)
// El motor real (Bitrix24 + Wazzup + Groq) es un servicio externo a este repo
// que solo se acopla por Postgres (bot-auditor-service). Esta tabla es la
// única forma en que el admin puede cambiar las reglas de clasificación y
// puntuación sin tocar ese servicio directamente. El esquema JSON de salida
// que espera el servicio queda fijo fuera de esta tabla (no editable), para
// no romper el parseo de la respuesta de Groq.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_REGLAS_CLASIFICACION =
  '- VENTA: el cliente pregunta por planes, precios o quiere contratar el servicio\n' +
  '- ATC: el cliente tiene un problema, reclamo, consulta de factura o soporte técnico';

const DEFAULT_REGLAS_PUNTUACION_VENTA =
  '- Presentó planes con claridad y precios (25 pts)\n' +
  '- Capturó ubicación o verificó cobertura (25 pts)\n' +
  '- Mantuvo al cliente enganchado con seguimiento (25 pts)\n' +
  '- Manejó objeciones o cerró la venta (25 pts)';

const DEFAULT_REGLAS_PUNTUACION_ATC =
  '- Resolvió el problema del cliente (30 pts)\n' +
  '- Dio información correcta y completa (25 pts)\n' +
  '- Fue empático y profesional (25 pts)\n' +
  '- El cliente quedó satisfecho o con próximos pasos claros (20 pts)';

const CREAR_TABLA_CONFIG_SQL = `
  CREATE TABLE IF NOT EXISTS bot_auditor_prompt_config (
    id                       INTEGER PRIMARY KEY DEFAULT 1,
    reglas_clasificacion     TEXT,
    reglas_puntuacion_venta  TEXT,
    reglas_puntuacion_atc    TEXT,
    actualizado_por          VARCHAR(255),
    actualizado_at           TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT bot_auditor_prompt_config_single_row CHECK (id = 1)
  )
`;

// GET /api/bot-auditor/config-prompt
async function obtenerConfigPrompt(req, res) {
  try {
    await pool.query(CREAR_TABLA_CONFIG_SQL);
    const result = await pool.query(`SELECT * FROM bot_auditor_prompt_config WHERE id = 1`);
    const row = result.rows[0];
    res.json({
      success: true,
      data: {
        reglas_clasificacion: row?.reglas_clasificacion || DEFAULT_REGLAS_CLASIFICACION,
        reglas_puntuacion_venta: row?.reglas_puntuacion_venta || DEFAULT_REGLAS_PUNTUACION_VENTA,
        reglas_puntuacion_atc: row?.reglas_puntuacion_atc || DEFAULT_REGLAS_PUNTUACION_ATC,
        actualizado_por: row?.actualizado_por || null,
        actualizado_at: row?.actualizado_at || null,
      },
    });
  } catch (error) {
    console.error('[botAuditor.controller] obtenerConfigPrompt error:', error);
    res.status(500).json({ success: false, error: 'Error al consultar la configuración del prompt' });
  }
}

// PUT /api/bot-auditor/config-prompt — protegido con soloAdmin en las rutas
async function actualizarConfigPrompt(req, res) {
  try {
    const { reglas_clasificacion, reglas_puntuacion_venta, reglas_puntuacion_atc } = req.body || {};
    if (!reglas_clasificacion?.trim() || !reglas_puntuacion_venta?.trim() || !reglas_puntuacion_atc?.trim()) {
      return res.status(400).json({ success: false, error: 'Los tres campos son obligatorios' });
    }

    await pool.query(CREAR_TABLA_CONFIG_SQL);
    await pool.query(
      `INSERT INTO bot_auditor_prompt_config
         (id, reglas_clasificacion, reglas_puntuacion_venta, reglas_puntuacion_atc, actualizado_por, actualizado_at)
       VALUES (1, $1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET
         reglas_clasificacion    = EXCLUDED.reglas_clasificacion,
         reglas_puntuacion_venta = EXCLUDED.reglas_puntuacion_venta,
         reglas_puntuacion_atc   = EXCLUDED.reglas_puntuacion_atc,
         actualizado_por         = EXCLUDED.actualizado_por,
         actualizado_at          = NOW()`,
      [
        reglas_clasificacion.trim(),
        reglas_puntuacion_venta.trim(),
        reglas_puntuacion_atc.trim(),
        req.user?.usuario || 'admin',
      ]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[botAuditor.controller] actualizarConfigPrompt error:', error);
    res.status(500).json({ success: false, error: 'Error al guardar la configuración del prompt' });
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
      scope = ' AND UPPER(a.empresa) = UPPER($2)';
      params.push(empresa);
    }

    const result = await pool.query(
      `SELECT a.*, COALESCE(be.nombre, ben.nombre, a.stage_id) AS etapa
       FROM auditorias a
       LEFT JOIN bitrix_etapas         be  ON be.status_id  = a.stage_id
       LEFT JOIN bitrix_etapas_novonet ben ON ben.status_id = a.stage_id
       WHERE a.id = $1${scope}`,
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

module.exports = {
  listarAuditorias,
  obtenerEstadisticas,
  obtenerDetalle,
  obtenerConfigPrompt,
  actualizarConfigPrompt,
};
