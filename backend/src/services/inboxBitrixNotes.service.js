const { randomUUID, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const companyOf = (conversation, user) => String(conversation.line_empresa || user.empresa || '').trim().toUpperCase();
const validId = value => /^[1-9]\d{0,14}$/.test(String(value || '').trim());
function eligibleDeal(conversation, user) {
  return companyOf(conversation, user) === 'NOVONET' && validId(conversation.bitrix_deal_id)
    ? String(conversation.bitrix_deal_id).trim() : null;
}
const plain = value => String(value || '').replace(/\[/g, '［').replace(/\]/g, '］');
function buildComment(job) {
  const p = job.payload;
  const date = new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'medium', hour12: false,
  }).format(new Date(job.sent_at));
  return [
    'WhatsApp · Enviado desde Inbox · Registro interno',
    `Asesor: ${plain(p.actor)}`, `Número: +${plain(p.phone)}`,
    `Fecha: ${date} (Ecuador)`, '', plain(p.text),
    p.filename ? `Archivo enviado por WhatsApp: ${plain(p.filename)}` : '',
    '', `Referencia Inbox: ${job.id}`,
  ].filter(x => x !== undefined).join('\n');
}

function createInboxBitrixNotes({ db, env = process.env, request, logger = console }) {
  let schemaReady;
  let timer;
  let running = false;
  const receipts = new Map();
  function configured() {
    try {
      const url = new URL(env.BITRIX_NOVONET_URL);
      return url.protocol === 'https:' && url.hostname === 'novonet.bitrix24.es' && /^\/rest\/\d+\/[^/]+\/?$/.test(url.pathname);
    } catch { return false; }
  }
  async function call(method, params) {
    if (!configured()) throw new Error('BITRIX_NOTES_NOT_CONFIGURED');
    if (request) return request(method, params);
    const base = env.BITRIX_NOVONET_URL.replace(/\/+$/, '');
    const response = await fetch(`${base}/${method}.json`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(params), signal: AbortSignal.timeout(12000), redirect: 'error',
    });
    const body = await response.json();
    if (!response.ok || body.error) {
      const error = new Error('BITRIX_NOTES_REQUEST_FAILED');
      error.code = String(body.error || `HTTP_${response.status}`).replace(/[^A-Z0-9_]/gi,'').slice(0,80);
      throw error;
    }
    return body;
  }
  async function ensureSchema() {
    if (!schemaReady) {
      schemaReady = db.query(fs.readFileSync(path.join(__dirname, '../migrations/inbox_bitrix_notes.sql'), 'utf8'))
        .catch(e => { schemaReady = null; throw e; });
    }
    return schemaReady;
  }
  async function validateDeal(id) {
    if (!validId(id)) throw new Error('ID de negociación inválido');
    const response = await call('crm.deal.get', {id: String(id).trim()});
    if (String(response.result?.ID) !== String(id).trim()) throw new Error('Negociación no encontrada en NOVONET');
    return response.result;
  }
  async function prepare({conversation, user, text, filename}) {
    if (env.WA_INBOX_BITRIX_NOTES === 'false') return null;
    if (companyOf(conversation,user) !== 'NOVONET' || !conversation.bitrix_deal_id) return null;
    const deal = eligibleDeal(conversation,user);
    if (!deal) throw new Error('ID de negociación inválido');
    if (!configured()) throw new Error('BITRIX_NOTES_NOT_CONFIGURED');
    // Bitrix comments have a bounded size; do not silently truncate the copy.
    if (String(text || '').length > 50000) throw new Error('El mensaje supera 50000 caracteres para el registro en Bitrix');
    await ensureSchema();
    // Baileys accepts a caller-supplied messageId. Persist it before sending
    // so later acknowledgements can recover even without a local message row.
    const note = {id: randomUUID(), waMsgId: '3EB0C0DE' + randomBytes(12).toString('hex').toUpperCase()};
    const payload = {
      conversation_id: conversation.id, line_id: conversation.line_id,
      phone: conversation.wa_number, actor_id: user.id,
      actor: user.nombreCompleto || user.usuario || `Usuario ${user.id}`,
      text: text || '', filename: filename || null,
    };
    await db.query('INSERT INTO inbox_bitrix_notes (id, deal_id, payload, wa_msg_id) VALUES ($1,$2,$3::jsonb,$4)',
      [note.id, deal, JSON.stringify(payload), note.waMsgId]);
    return note;
  }
  async function confirm(note, waMsgId) {
    if (!note) return;
    const receipt = {noteId:note.id,waMsgId:waMsgId || note.waMsgId};
    receipts.set(note.id,receipt);
    await saveReceipt(note.id,receipt);
  }
  async function saveReceipt(key, receipt) {
    if (receipt.noteId) {
      await db.query("UPDATE inbox_bitrix_notes SET status='pending', wa_msg_id=COALESCE($2,wa_msg_id), sent_at=NOW(), updated_at=NOW() WHERE id=$1 AND status IN ('waiting_send','failed')", [receipt.noteId,receipt.waMsgId || null]);
    } else {
      await db.query("UPDATE inbox_bitrix_notes SET status='pending', sent_at=NOW(), updated_at=NOW() WHERE payload->>'line_id'=$1 AND wa_msg_id=$2 AND status IN ('waiting_send','failed')", [receipt.lineId,receipt.waMsgId]);
    }
    receipts.delete(key);
  }
  async function recordReceipt(lineId, waMsgId) {
    if (!/^3EB0C0DE[A-F0-9]{24}$/.test(waMsgId || '') || !configured() || env.WA_INBOX_BITRIX_NOTES === 'false') return;
    const key = `${lineId}:${waMsgId}`;
    const receipt = {lineId:String(lineId),waMsgId};
    receipts.set(key,receipt);
    try { await ensureSchema(); await saveReceipt(key,receipt); }
    catch (_) { logger.warn('[Inbox-Bitrix] acuse pendiente de persistencia'); }
  }
  async function fail(note) {
    if (!note) return;
    await db.query("UPDATE inbox_bitrix_notes SET status='failed', last_error='WHATSAPP_SEND_FAILED', updated_at=NOW() WHERE id=$1 AND status='waiting_send'", [note.id]);
  }
  async function existingComment(job) {
    let start = 0;
    // Reconcile every page before retrying an uncertain POST. If bounded work
    // is exhausted, retry later instead of risking a duplicate comment.
    for (let page = 0; page < 100; page++) {
      const response = await call('crm.timeline.comment.list', {
        filter:{ENTITY_TYPE:'deal',ENTITY_ID:job.deal_id},
        select:['ID','COMMENT'], order:{ID:'DESC'}, start,
      });
      if (!Array.isArray(response.result)) throw new Error('INVALID_BITRIX_RESPONSE');
      const match = response.result.find(c => String(c.COMMENT || '').trimEnd().endsWith(`Referencia Inbox: ${job.id}`));
      if (match) return String(match.ID);
      if (response.next === undefined || response.next === null) return null;
      start = response.next;
    }
    throw new Error('RECONCILIATION_PAGE_LIMIT');
  }
  async function deliver(job) {
    try {
      let commentId = job.attempts > 1 ? await existingComment(job) : null;
      if (!commentId) {
        const response = await call('crm.timeline.comment.add', {
          fields:{ENTITY_TYPE:'deal',ENTITY_ID:job.deal_id,COMMENT:buildComment(job)},
        });
        if (!validId(response.result)) throw new Error('INVALID_BITRIX_RESPONSE');
        commentId = String(response.result);
      }
      await db.query("UPDATE inbox_bitrix_notes SET status='sent', bitrix_comment_id=$2, last_error=NULL, updated_at=NOW() WHERE id=$1 AND status='processing'", [job.id,commentId]);
    } catch (e) {
      const delay = Math.min(3600, 15 * 2 ** Math.min(job.attempts,8));
      const code = /^[A-Z0-9_]+$/.test(e.code || '') ? e.code.slice(0,80) : 'BITRIX_SYNC_FAILED';
      await db.query("UPDATE inbox_bitrix_notes SET status='retry', next_attempt_at=NOW()+($2 * INTERVAL '1 second'), last_error=$3, updated_at=NOW() WHERE id=$1 AND status='processing'", [job.id,delay,code]);
      logger.warn(`[Inbox-Bitrix] nota ${job.id} pendiente de reintento: ${code}`);
    }
  }
  async function tick() {
    if (running || !configured() || env.WA_INBOX_BITRIX_NOTES === 'false') return;
    running = true;
    try {
      await ensureSchema();
      for (const [key,receipt] of receipts) await saveReceipt(key,receipt);
      // Recover a crash between saving WhatsApp's receipt and confirming the
      // outbox. The metadata is only written after WhatsApp accepts the send.
      await db.query(`UPDATE inbox_bitrix_notes n SET status='pending', wa_msg_id=m.wa_msg_id,
        sent_at=m.timestamp, updated_at=NOW()
        FROM messages m WHERE n.status IN ('waiting_send','failed') AND n.created_at < NOW()-INTERVAL '2 minutes'
        AND m.line_id=(n.payload->>'line_id')::uuid AND m.timestamp >= n.created_at
        AND m.direction='out' AND (m.wa_msg_id=n.wa_msg_id OR m.metadata->>'inbox_bitrix_note_id'=n.id::text)`);
      for (let i = 0; i < 10; i++) {
        const result = await db.query(`WITH candidate AS (
          SELECT id FROM inbox_bitrix_notes
          WHERE status IN ('pending','retry','processing') AND next_attempt_at <= NOW()
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
        ) UPDATE inbox_bitrix_notes n SET status='processing', attempts=n.attempts+1,
          next_attempt_at=NOW()+INTERVAL '30 minutes', updated_at=NOW()
          FROM candidate WHERE n.id=candidate.id RETURNING n.*`);
        if (!result.rows.length) break;
        await deliver(result.rows[0]);
      }
    } catch (e) {
      logger.warn('[Inbox-Bitrix] cola pendiente; se reintentará en el próximo ciclo');
    } finally { running = false; }
  }
  function start() {
    if (timer || !configured() || env.WA_INBOX_BITRIX_NOTES === 'false') return;
    timer = setInterval(() => { void tick(); }, 5000);
    timer.unref();
    void tick();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  return {prepare,confirm,fail,recordReceipt,validateDeal,ensureSchema,deliver,tick,start,stop,configured};
}

let singleton;
function getInboxBitrixNotes() {
  if (!singleton) singleton = createInboxBitrixNotes({db:require('../config/db')});
  return singleton;
}
module.exports = {createInboxBitrixNotes,getInboxBitrixNotes,eligibleDeal,buildComment,companyOf};
