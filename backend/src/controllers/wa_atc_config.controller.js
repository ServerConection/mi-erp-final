const pool = require('../config/db');
const { ensureAtcNotificationSchema } = require('../services/atcNotificationQueue.service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BIGINT_RE = /^\d{1,19}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateFilter(value) {
  const date = String(value || '').trim();
  if (!date) return null;
  if (!DATE_RE.test(date)) return undefined;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date
    ? undefined
    : date;
}

function isAdmin(req) {
  return String(req.user?.perfil || '').trim().toUpperCase() === 'ADMINISTRADOR';
}

function adminOnly(req, res) {
  if (isAdmin(req)) return true;
  res.status(403).json({ success: false, error: 'Acceso exclusivo para administradores' });
  return false;
}

function sendError(res, error, publicMessage = 'No se pudo procesar la configuración ATC') {
  console.error('[ATC Config]', error?.message || error);
  return res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? publicMessage : String(error?.message || error),
  });
}

function cleanName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 120) return null;
  return name;
}

function cleanBody(value) {
  const body = String(value || '').trim();
  if (!body || body.length > 4000) return null;
  return body;
}

async function getOverview(req, res) {
  if (!adminOnly(req, res)) return;
  try {
    await ensureAtcNotificationSchema();
    const status = String(req.query.status || '').trim().toLowerCase();
    const dateFrom = parseDateFilter(req.query.date_from);
    const dateTo = parseDateFilter(req.query.date_to);
    if (dateFrom === undefined || dateTo === undefined || (dateFrom && dateTo && dateFrom > dateTo)) {
      return res.status(400).json({ success: false, error: 'Rango de fechas inválido' });
    }
    const allowedStatuses = new Set(['pending', 'processing', 'retry', 'sent', 'failed']);
    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(10, Number.parseInt(req.query.limit || '30', 10) || 30));
    const offset = (page - 1) * limit;
    const filters = [];
    const params = [];
    if (allowedStatuses.has(status)) {
      params.push(status);
      filters.push(`q.status = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      filters.push(`q.created_at >= ($${params.length}::date AT TIME ZONE 'America/Guayaquil')`);
    }
    if (dateTo) {
      params.push(dateTo);
      filters.push(`q.created_at < (($${params.length}::date + 1) AT TIME ZONE 'America/Guayaquil')`);
    }
    const historyWhere = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const dateFilters = filters.filter((filter) => !filter.startsWith('q.status'));
    const dateParams = params.slice(allowedStatuses.has(status) ? 1 : 0);
    const statsWhere = dateFilters.length
      ? `WHERE ${dateFilters.map((filter, index) => filter.replace(/\$(\d+)/g, () => `$${index + 1}`)).join(' AND ')}`
      : '';
    const filterParamCount = params.length;
    params.push(limit, offset);

    const [configResult, linesResult, templatesResult, statsResult, queueResult, countResult] = await Promise.all([
      pool.query(`SELECT * FROM public.atc_notification_config WHERE id = 1`),
      pool.query(
        `SELECT id, name, phone_number, status, last_connected
           FROM public.lines
          WHERE deleted_at IS NULL
          ORDER BY LOWER(name), created_at ASC`
      ),
      pool.query(
        `SELECT id, template_key, COALESCE(name, template_key) AS name, body,
                sort_order, active, created_at, updated_at
           FROM public.atc_notification_templates
          WHERE archived_at IS NULL
          ORDER BY sort_order ASC, id ASC`
      ),
      pool.query(
        `SELECT status, COUNT(*)::int AS total
           FROM public.atc_notification_queue
          ${statsWhere}
          GROUP BY status`
        , dateParams
      ),
      pool.query(
        `SELECT q.id, q.empresa, q.bitrix_id, q.transition_number,
                q.previous_stage, q.phone_normalized, q.template_key,
                q.status, q.attempts, q.last_error, q.created_at, q.sent_at,
                l.name AS line_name
           FROM public.atc_notification_queue q
           LEFT JOIN public.lines l ON l.id = q.line_id
           ${historyWhere}
          ORDER BY q.created_at DESC, q.id DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total
           FROM public.atc_notification_queue q ${historyWhere}`,
        params.slice(0, filterParamCount)
      ),
    ]);

    const bm = req.app.get('baileysManager');
    const lines = linesResult.rows.map((line) => ({
      ...line,
      rt_status: bm?.instances?.[line.id]
        ? bm.getStatus(line.id)
        : (line.status === 'connected' ? 'connecting' : line.status),
    }));
    const stats = Object.fromEntries(statsResult.rows.map((row) => [row.status, row.total]));
    res.json({
      success: true,
      data: {
        config: configResult.rows[0],
        lines,
        templates: templatesResult.rows,
        stats,
        history: queueResult.rows,
        pagination: { page, limit, total: countResult.rows[0]?.total || 0 },
      },
    });
  } catch (error) {
    sendError(res, error, 'No se pudo cargar Configuración ATC');
  }
}

async function updateConfig(req, res) {
  if (!adminOnly(req, res)) return;
  try {
    await ensureAtcNotificationSchema();
    const enabled = req.body?.enabled === true;
    const lineId = req.body?.line_id == null || req.body?.line_id === ''
      ? null
      : String(req.body.line_id);
    if (lineId && !UUID_RE.test(lineId)) {
      return res.status(400).json({ success: false, error: 'Línea inválida' });
    }
    if (lineId) {
      const line = await pool.query(
        `SELECT id FROM public.lines WHERE id = $1 AND deleted_at IS NULL`,
        [lineId]
      );
      if (!line.rows.length) {
        return res.status(400).json({ success: false, error: 'La línea seleccionada no existe o fue eliminada' });
      }
    }
    if (enabled && !lineId) {
      return res.status(400).json({ success: false, error: 'Seleccione una línea antes de activar' });
    }
    if (enabled) {
      const active = await pool.query(
        `SELECT COUNT(*)::int AS total
           FROM public.atc_notification_templates
          WHERE active = TRUE AND archived_at IS NULL`
      );
      if (!active.rows[0]?.total) {
        return res.status(400).json({ success: false, error: 'Debe existir al menos una variante activa' });
      }
    }
    const updated = await pool.query(
      `UPDATE public.atc_notification_config
          SET enabled = $1, line_id = $2, updated_by = $3, updated_at = NOW()
        WHERE id = 1
        RETURNING *`,
      [enabled, lineId, String(req.user.id || '').slice(0, 80) || null]
    );
    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    sendError(res, error);
  }
}

async function createTemplate(req, res) {
  if (!adminOnly(req, res)) return;
  try {
    await ensureAtcNotificationSchema();
    const name = cleanName(req.body?.name);
    const body = cleanBody(req.body?.body);
    if (!name || !body) {
      return res.status(400).json({ success: false, error: 'Nombre y mensaje son obligatorios (máximo 120 y 4000 caracteres)' });
    }
    const created = await pool.transaction(async (client) => {
      const order = await client.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order
           FROM public.atc_notification_templates WHERE archived_at IS NULL`
      );
      const keyResult = await client.query(
        `SELECT nextval('public.atc_notification_template_key_seq')::bigint AS value`
      );
      const templateKey = `ATC_CUSTOM_${keyResult.rows[0].value}`;
      const result = await client.query(
        `INSERT INTO public.atc_notification_templates
           (template_key, name, body, sort_order, active)
         VALUES ($1,$2,$3,$4,TRUE)
         RETURNING *`,
        [templateKey, name, body, Number(order.rows[0].next_order)]
      );
      return result.rows[0];
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    sendError(res, error, 'No se pudo crear la variante');
  }
}

async function updateTemplate(req, res) {
  if (!adminOnly(req, res)) return;
  const id = String(req.params.id || '');
  if (!BIGINT_RE.test(id)) return res.status(400).json({ success: false, error: 'Variante inválida' });
  try {
    await ensureAtcNotificationSchema();
    const name = cleanName(req.body?.name);
    const body = cleanBody(req.body?.body);
    const active = req.body?.active !== false;
    if (!name || !body) {
      return res.status(400).json({ success: false, error: 'Nombre y mensaje son obligatorios (máximo 120 y 4000 caracteres)' });
    }
    if (!active) {
      const activeCount = await pool.query(
        `SELECT COUNT(*)::int AS total
           FROM public.atc_notification_templates
          WHERE active = TRUE AND archived_at IS NULL AND id <> $1`,
        [id]
      );
      const config = await pool.query(`SELECT enabled FROM public.atc_notification_config WHERE id = 1`);
      if (config.rows[0]?.enabled && !activeCount.rows[0]?.total) {
        return res.status(400).json({ success: false, error: 'No puede desactivar la última variante mientras la automatización está activa' });
      }
    }
    const updated = await pool.query(
      `UPDATE public.atc_notification_templates
          SET name = $1, body = $2, active = $3, updated_at = NOW()
        WHERE id = $4 AND archived_at IS NULL
        RETURNING *`,
      [name, body, active, id]
    );
    if (!updated.rows.length) return res.status(404).json({ success: false, error: 'Variante no encontrada' });
    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    sendError(res, error, 'No se pudo actualizar la variante');
  }
}

async function removeTemplate(req, res) {
  if (!adminOnly(req, res)) return;
  const id = String(req.params.id || '');
  if (!BIGINT_RE.test(id)) return res.status(400).json({ success: false, error: 'Variante inválida' });
  try {
    await ensureAtcNotificationSchema();
    const result = await pool.transaction(async (client) => {
      const config = await client.query(`SELECT enabled FROM public.atc_notification_config WHERE id = 1 FOR UPDATE`);
      if (config.rows[0]?.enabled) {
        const count = await client.query(
          `SELECT COUNT(*)::int AS total
             FROM public.atc_notification_templates
            WHERE active = TRUE AND archived_at IS NULL AND id <> $1`,
          [id]
        );
        if (!count.rows[0]?.total) {
          const error = new Error('No puede eliminar la última variante mientras la automatización está activa');
          error.status = 400;
          throw error;
        }
      }
      const archived = await client.query(
        `UPDATE public.atc_notification_templates
            SET active = FALSE, archived_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND archived_at IS NULL RETURNING id`,
        [id]
      );
      return archived.rows[0];
    });
    if (!result) return res.status(404).json({ success: false, error: 'Variante no encontrada' });
    res.json({ success: true });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    sendError(res, error, 'No se pudo eliminar la variante');
  }
}

async function reorderTemplates(req, res) {
  if (!adminOnly(req, res)) return;
  const order = req.body?.order;
  if (!Array.isArray(order) || order.length > 100 || order.some((id) => !BIGINT_RE.test(String(id)))) {
    return res.status(400).json({ success: false, error: 'Orden de variantes inválido' });
  }
  if (new Set(order.map(String)).size !== order.length) {
    return res.status(400).json({ success: false, error: 'El orden contiene variantes repetidas' });
  }
  try {
    await ensureAtcNotificationSchema();
    await pool.transaction(async (client) => {
      const existing = await client.query(
        `SELECT id::text AS id FROM public.atc_notification_templates
          WHERE archived_at IS NULL ORDER BY sort_order, id FOR UPDATE`
      );
      const existingIds = existing.rows.map((row) => row.id);
      if (existingIds.length !== order.length || existingIds.some((id) => !order.map(String).includes(id))) {
        const error = new Error('Debe enviar todas las variantes visibles');
        error.status = 400;
        throw error;
      }
      for (let index = 0; index < order.length; index += 1) {
        await client.query(
          `UPDATE public.atc_notification_templates SET sort_order = $1, updated_at = NOW() WHERE id = $2`,
          [index + 1, String(order[index])]
        );
      }
    });
    res.json({ success: true });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    sendError(res, error, 'No se pudieron ordenar las variantes');
  }
}

async function retryQueueItem(req, res) {
  if (!adminOnly(req, res)) return;
  const id = String(req.params.id || '');
  if (!BIGINT_RE.test(id)) return res.status(400).json({ success: false, error: 'Registro inválido' });
  try {
    await ensureAtcNotificationSchema();
    const updated = await pool.query(
      `UPDATE public.atc_notification_queue
          SET status = 'retry', attempts = 0, next_attempt_at = NOW(),
              processing_started_at = NULL, last_error = NULL, updated_at = NOW()
        WHERE id = $1 AND status = 'failed'
        RETURNING id`,
      [id]
    );
    if (!updated.rows.length) {
      return res.status(409).json({ success: false, error: 'Solo se pueden reintentar envíos fallidos' });
    }
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, 'No se pudo reintentar el mensaje');
  }
}

module.exports = {
  getOverview,
  updateConfig,
  createTemplate,
  updateTemplate,
  removeTemplate,
  reorderTemplates,
  retryQueueItem,
};
