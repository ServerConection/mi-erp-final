const pool = require('../config/db');
const {
  ensureAtcNotificationSchema,
} = require('./atcNotificationQueue.service');
const { sanitizeError } = require('../shared/atcNotificationUtils');

const LINE_NAME = 'NOTIFICACIONES_ATC';
const MAX_SEND_ATTEMPTS = 5;
const POLL_MS = 5000;

class AtcNotificationWorker {
  constructor(baileysManager) {
    this.baileysManager = baileysManager;
    this.interval = null;
    this.running = false;
  }

  async start() {
    await ensureAtcNotificationSchema();
    // Recupera trabajos cuyo proceso murió después de reclamarlos.
    await pool.query(
      `UPDATE public.atc_notification_queue
          SET status = 'retry', processing_started_at = NULL,
              next_attempt_at = NOW(), updated_at = NOW(),
              last_error = 'Reintento tras interrupción del worker'
        WHERE status = 'processing'
          AND processing_started_at < NOW() - INTERVAL '10 minutes'`
    );
    this.interval = setInterval(() => this.tick().catch((error) => {
      console.error('[ATC Notifications] Error de ciclo:', sanitizeError(error));
    }), POLL_MS);
    this.interval.unref?.();
    setTimeout(() => this.tick().catch(() => {}), 1500).unref?.();
    console.log(`[ATC Notifications] Worker iniciado; línea exclusiva: ${LINE_NAME}`);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      // Procesamiento deliberadamente secuencial para respetar la rotación y
      // no generar ráfagas desde una línea de atención.
      for (let processed = 0; processed < 5; processed += 1) {
        const item = await this.claimNext();
        if (!item) break;
        await this.process(item);
      }
    } finally {
      this.running = false;
    }
  }

  async claimNext() {
    return pool.transaction(async (client) => {
      const selected = await client.query(
        `SELECT id
           FROM public.atc_notification_queue
          WHERE status IN ('pending', 'retry')
            AND next_attempt_at <= NOW()
            AND attempts < $1
          ORDER BY created_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1`,
        [MAX_SEND_ATTEMPTS]
      );
      if (!selected.rows.length) return null;
      const claimed = await client.query(
        `UPDATE public.atc_notification_queue
            SET status = 'processing', processing_started_at = NOW(), updated_at = NOW()
          WHERE id = $1
          RETURNING id, empresa, bitrix_id, phone_normalized, message_body,
                    template_key, attempts`,
        [selected.rows[0].id]
      );
      return claimed.rows[0];
    });
  }

  async findNotificationLine() {
    const result = await pool.query(
      `SELECT id, status
         FROM public.lines
        WHERE UPPER(BTRIM(name)) = $1
          AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 2`,
      [LINE_NAME]
    );
    if (result.rows.length > 1) {
      throw new Error(`Existe más de una línea activa llamada ${LINE_NAME}`);
    }
    return result.rows[0] || null;
  }

  async postponeWithoutAttempt(item, reason, seconds = 60) {
    await pool.query(
      `UPDATE public.atc_notification_queue
          SET status = 'retry', processing_started_at = NULL,
              next_attempt_at = NOW() + ($2 * INTERVAL '1 second'),
              last_error = $3, updated_at = NOW()
        WHERE id = $1 AND status = 'processing'`,
      [item.id, seconds, sanitizeError(reason)]
    );
  }

  async registerFailure(item, error) {
    const attempts = Number(item.attempts || 0) + 1;
    const terminal = attempts >= MAX_SEND_ATTEMPTS;
    const delaySeconds = Math.min(900, 30 * (2 ** Math.max(0, attempts - 1)));
    await pool.query(
      `UPDATE public.atc_notification_queue
          SET status = $2, attempts = $3, processing_started_at = NULL,
              next_attempt_at = NOW() + ($4 * INTERVAL '1 second'),
              last_error = $5, updated_at = NOW()
        WHERE id = $1 AND status = 'processing'`,
      [item.id, terminal ? 'failed' : 'retry', attempts, delaySeconds, sanitizeError(error)]
    );
  }

  async process(item) {
    try {
      if (!item.phone_normalized || !/^5939\d{8}$/.test(item.phone_normalized)) {
        throw new Error('Teléfono ecuatoriano ausente o inválido');
      }
      const line = await this.findNotificationLine();
      if (!line) {
        await this.postponeWithoutAttempt(item, `La línea ${LINE_NAME} aún no existe`, 60);
        return;
      }

      if (this.baileysManager.getStatus(line.id) !== 'connected') {
        const connected = await this.baileysManager.ensureConnected(line.id, 12000);
        if (!connected) {
          await this.postponeWithoutAttempt(item, `La línea ${LINE_NAME} está desconectada`, 60);
          return;
        }
      }

      // ID determinista: reduce el riesgo de duplicado si el proceso cae justo
      // después de que WhatsApp acepta el mensaje y antes del UPDATE final.
      const messageId = `ATC${String(item.id).padStart(12, '0')}`;
      const sent = await this.baileysManager.sendText(
        line.id,
        item.phone_normalized,
        item.message_body,
        { messageId }
      );
      await pool.query(
        `UPDATE public.atc_notification_queue
            SET status = 'sent', line_id = $2, attempts = attempts + 1,
                processing_started_at = NULL, sent_at = NOW(),
                wa_message_id = $3, last_error = NULL, updated_at = NOW()
          WHERE id = $1 AND status = 'processing'`,
        [item.id, line.id, sent?.key?.id || messageId]
      );
      console.log(
        `[ATC Notifications] Enviado queue_id=${item.id} empresa=${item.empresa}` +
        ` bitrix_id=${item.bitrix_id} plantilla=${item.template_key}`
      );
    } catch (error) {
      console.warn(
        `[ATC Notifications] Falló queue_id=${item.id} empresa=${item.empresa}` +
        ` bitrix_id=${item.bitrix_id}: ${sanitizeError(error)}`
      );
      await this.registerFailure(item, error);
    }
  }
}

module.exports = AtcNotificationWorker;
