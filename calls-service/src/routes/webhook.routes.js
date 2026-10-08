// Webhook de Meta: eventos de llamadas (connect / terminate) y estados (RINGING / ACCEPTED / REJECTED)
const router = require('express').Router();
const crypto = require('crypto');
const { q } = require('../db');
const { decrypt } = require('../security');
const hub = require('../hub');

// Verificación (GET) — acepta el verify_token de cualquier cuenta registrada
router.get('/', async (req, res) => {
  if (req.query['hub.mode'] !== 'subscribe') return res.sendStatus(400);
  const r = await q('SELECT 1 FROM calls_accounts WHERE verify_token=$1', [req.query['hub.verify_token'] || '']);
  if (!r.rows[0]) return res.sendStatus(403);
  res.status(200).send(req.query['hub.challenge']);
});

function validSignature(req, appSecretEnc) {
  if (!appSecretEnc) return true; // sin App Secret configurado no se valida
  const sig = req.get('x-hub-signature-256') || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', decrypt(appSecretEnc)).update(req.rawBody || '').digest('hex');
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

const ts = v => (v ? new Date(Number(v) * 1000) : new Date());
const forAccount = (accId, agentId) => a =>
  (agentId ? a.id === agentId : false) || a.role !== 'asesor' || a.account_id === accId;

async function onCall(acc, c, contacts) {
  const id = c.id;
  if (c.event === 'connect') {
    if (c.direction === 'USER_INITIATED') {
      const name = contacts.find(x => x.wa_id === c.from)?.profile?.name || null;
      const r = await q(
        `INSERT INTO calls_log(wa_call_id, account_id, direction, phone, contact_name, status, started_at)
         VALUES ($1,$2,'inbound',$3,$4,'ringing',$5) ON CONFLICT (wa_call_id) DO NOTHING RETURNING *`,
        [id, acc.id, c.from, name, ts(c.timestamp)]
      );
      if (r.rows[0]) hub.publish('incoming', { wa_call_id: id, log_id: r.rows[0].id, phone: c.from, name, sdp: c.session?.sdp, account: acc.name },
        a => a.role === 'admin' || (a.habilitado && a.account_id === acc.id));
    } else {
      const r = await q('SELECT agent_id FROM calls_log WHERE wa_call_id=$1', [id]);
      hub.publish('answer', { wa_call_id: id, sdp: c.session?.sdp }, a => a.id === r.rows[0]?.agent_id);
    }
  }
  if (c.event === 'terminate') {
    const r = await q('SELECT c.*, a.rate_per_min FROM calls_log c JOIN calls_accounts a ON a.id=c.account_id WHERE wa_call_id=$1', [id]);
    const call = r.rows[0];
    if (!call) return;
    const duration = Number(c.duration) || 0;
    const connected = !!call.connected_at || duration > 0;
    let status = call.status;
    if (connected) status = 'completed';
    else if (c.status === 'FAILED') status = 'failed';
    else if (status !== 'rejected') status = call.direction === 'inbound' ? 'missed' : 'no_answer';
    // Solo se cobran las llamadas iniciadas por la empresa, en pulsos de 6 s
    const pulses = call.direction === 'outbound' && connected ? Math.ceil(duration / 6) : 0;
    const cost = (pulses * Number(call.rate_per_min)) / 10;
    await q(
      `UPDATE calls_log SET status=$2, duration_sec=$3, pulses=$4, cost=$5, ended_at=$6,
         connected_at=COALESCE(connected_at, CASE WHEN $3 > 0 THEN $7::timestamptz END)
       WHERE wa_call_id=$1`,
      [id, status, duration, pulses, cost, c.end_time ? ts(c.end_time) : new Date(), c.start_time ? ts(c.start_time) : null]
    );
    hub.publish('ended', { wa_call_id: id, log_id: call.id, status, duration }, forAccount(acc.id, call.agent_id));
  }
}

async function onStatus(acc, s) {
  const map = { RINGING: 'ringing', ACCEPTED: 'accepted', REJECTED: 'rejected' };
  const status = map[s.status];
  if (!status) return;
  const r = await q(
    `UPDATE calls_log SET status=$2,
       connected_at = CASE WHEN $2='accepted' THEN COALESCE(connected_at, $3) ELSE connected_at END
     WHERE wa_call_id=$1 AND status NOT IN ('completed','no_answer','missed','failed') RETURNING agent_id`,
    [s.id, status, ts(s.timestamp)]
  );
  if (r.rows[0]) hub.publish('status', { wa_call_id: s.id, status }, a => a.id === r.rows[0].agent_id);
}

router.post('/', async (req, res) => {
  const body = req.body || {};
  for (const entry of body.entry || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const pnid = v.metadata?.phone_number_id;
      if (!pnid || (!v.calls && !v.statuses)) continue;
      const r = await q('SELECT * FROM calls_accounts WHERE phone_number_id=$1', [pnid]);
      const acc = r.rows[0];
      if (!acc) continue;
      if (!validSignature(req, acc.app_secret_enc)) return res.sendStatus(401);
      for (const c of v.calls || []) {
        await q('INSERT INTO calls_events(wa_call_id, kind, payload) VALUES ($1,$2,$3)', [c.id, `call:${c.event}`, c]);
        await onCall(acc, c, v.contacts || []).catch(e => console.error('[webhook call]', e.message));
      }
      for (const s of v.statuses || []) {
        if (s.type && s.type !== 'call') continue;
        await q('INSERT INTO calls_events(wa_call_id, kind, payload) VALUES ($1,$2,$3)', [s.id, `status:${s.status}`, s]);
        await onStatus(acc, s).catch(e => console.error('[webhook status]', e.message));
      }
    }
  }
  res.sendStatus(200);
});

module.exports = router;
