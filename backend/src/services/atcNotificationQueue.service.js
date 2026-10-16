const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const templates = require('../shared/atcNotificationTemplates');
const { normalizePhone, sanitizeError } = require('../shared/atcNotificationUtils');

let schemaPromise = null;

async function ensureAtcNotificationSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const ddl = fs.readFileSync(
        path.join(__dirname, '../migrations/20261007_atc_whatsapp_automation.sql'),
        'utf8'
      );
      await pool.query(ddl);
      for (let index = 0; index < templates.length; index += 1) {
        const template = templates[index];
        await pool.query(
          `INSERT INTO public.atc_notification_templates
             (template_key, name, body, sort_order, active, updated_at)
           VALUES ($1, $2, $3, $4, TRUE, NOW())
           ON CONFLICT (template_key) DO NOTHING`,
          [template.key, `Variante ${index + 1}`, template.body, index + 1]
        );
      }
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

async function enqueueAtcTransition(client, { empresa, bitrixId, previousStage, phoneRaw }) {
  if (!['novonet', 'velsa'].includes(empresa)) return null;

  const configResult = await client.query(
    `SELECT enabled FROM public.atc_notification_config WHERE id = 1`
  );
  if (!configResult.rows[0]?.enabled) return null;

  const templatesResult = await client.query(
    `SELECT id, template_key, body
       FROM public.atc_notification_templates
      WHERE active = TRUE AND archived_at IS NULL
      ORDER BY sort_order ASC, id ASC`
  );
  if (!templatesResult.rows.length) {
    throw new Error('No hay plantillas ATC activas');
  }

  const rotationResult = await client.query(
    `SELECT nextval('public.atc_notification_rotation_seq')::bigint AS value`
  );
  const rotation = BigInt(rotationResult.rows[0].value);
  const selected = templatesResult.rows[Number((rotation - 1n) % BigInt(templatesResult.rows.length))];
  const transitionResult = await client.query(
    `SELECT COALESCE(MAX(transition_number), 0) + 1 AS next_number
       FROM public.atc_notification_queue
      WHERE empresa = $1 AND bitrix_id = $2`,
    [empresa, bitrixId]
  );
  const transitionNumber = Number(transitionResult.rows[0].next_number);
  const phoneNormalized = normalizePhone(phoneRaw);

  const inserted = await client.query(
    `INSERT INTO public.atc_notification_queue
       (empresa, bitrix_id, transition_number, previous_stage, phone_raw,
        phone_normalized, template_id, template_key, message_body, status,
        next_attempt_at, last_error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11)
     RETURNING id, transition_number, template_key, status`,
    [
      empresa,
      bitrixId,
      transitionNumber,
      previousStage || null,
      String(phoneRaw || '').slice(0, 80) || null,
      phoneNormalized,
      selected.id,
      selected.template_key,
      selected.body,
      phoneNormalized ? 'pending' : 'failed',
      phoneNormalized ? null : 'Teléfono ausente o inválido',
    ]
  );
  return inserted.rows[0];
}

module.exports = {
  ensureAtcNotificationSchema,
  enqueueAtcTransition,
};
