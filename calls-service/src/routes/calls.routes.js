// Llamadas: salientes, entrantes, permisos, tipificación e historial
const router = require('express').Router();
const { q, getSetting } = require('../db');
const meta = require('../meta');
const hub = require('../hub');
const { canCall } = require('../auth');

const normPhone = p => String(p || '').replace(/\D/g, '');

// Cuenta a usar: la asignada al asesor; admin/supervisor pueden elegir
async function resolveAccount(agent, requestedId) {
  const id = agent.role !== 'asesor' && requestedId ? requestedId : agent.account_id;
  const r = id
    ? await q('SELECT * FROM calls_accounts WHERE id=$1 AND active', [id])
    : await q('SELECT * FROM calls_accounts WHERE active ORDER BY id LIMIT 1');
  if (!r.rows[0]) {
    const e = new Error('No hay una cuenta de WhatsApp activa asignada. Configúrala en Configuración → Cuentas.');
    e.status = 400; throw e;
  }
  return r.rows[0];
}

async function loadCall(waCallId) {
  const r = await q(`SELECT c.*, row_to_json(a.*) AS account FROM calls_log c
                     JOIN calls_accounts a ON a.id=c.account_id WHERE c.wa_call_id=$1`, [waCallId]);
  return r.rows[0];
}

const canTouch = (agent, call) => agent.role !== 'asesor' || call.agent_id === agent.id;

// Cuentas visibles para el softphone (sin datos sensibles)
router.get('/accounts', async (req, res) => {
  const r = req.agent.role === 'asesor'
    ? await q('SELECT id, name, display_phone FROM calls_accounts WHERE active AND id=$1', [req.agent.account_id])
    : await q('SELECT id, name, display_phone FROM calls_accounts WHERE active ORDER BY id');
  res.json(r.rows);
});

// Estado del permiso de llamada del cliente
router.get('/permission', canCall, async (req, res) => {
  const acc = await resolveAccount(req.agent, req.query.account_id);
  res.json(await meta.checkPermission(acc, normPhone(req.query.to)));
});

// Enviar solicitud de permiso de llamada (mensaje interactivo de WhatsApp)
router.post('/permission', canCall, async (req, res) => {
  const acc = await resolveAccount(req.agent, req.body.account_id);
  const general = await getSetting('general');
  const text = (req.body.text || general?.permission_text || '').slice(0, 1024);
  res.json(await meta.requestPermission(acc, normPhone(req.body.to), text));
});

// Llamada saliente: el navegador manda su SDP offer
router.post('/outbound', canCall, async (req, res) => {
  const { to, sdp, name, external_ref, account_id } = req.body || {};
  const phone = normPhone(to);
  if (phone.length < 8 || !sdp) return res.status(400).json({ error: 'Número o audio (SDP) inválido' });
  const acc = await resolveAccount(req.agent, account_id);
  let data;
  try {
    data = await meta.connect(acc, phone, sdp);
  } catch (e) {
    await q(`INSERT INTO calls_log(account_id, agent_id, agent_name, direction, phone, contact_name, external_ref, status, ended_at, error)
             VALUES ($1,$2,$3,'outbound',$4,$5,$6,'failed',now(),$7)`,
      [acc.id, req.agent.id, req.agent.name, phone, name || null, external_ref || null, e.message]);
    throw e;
  }
  const callId = data?.calls?.[0]?.id;
  const r = await q(
    `INSERT INTO calls_log(wa_call_id, account_id, agent_id, agent_name, direction, phone, contact_name, external_ref, status)
     VALUES ($1,$2,$3,$4,'outbound',$5,$6,$7,'initiated') RETURNING *`,
    [callId, acc.id, req.agent.id, req.agent.name, phone, name || null, external_ref || null]
  );
  res.json({ call: r.rows[0] });
});

// Contestar una entrante: el primero que la toma se queda con ella
router.post('/:id/accept', canCall, async (req, res) => {
  const { sdp } = req.body || {};
  if (!sdp) return res.status(400).json({ error: 'Falta SDP answer' });
  const claim = await q(
    `UPDATE calls_log SET agent_id=$2, agent_name=$3 WHERE wa_call_id=$1 AND direction='inbound' AND agent_id IS NULL
       AND status IN ('ringing','initiated') RETURNING *`,
    [req.params.id, req.agent.id, req.agent.name]
  );
  if (!claim.rows[0]) return res.status(409).json({ error: 'Otro asesor ya tomó esta llamada o ya terminó' });
  const call = await loadCall(req.params.id);
  hub.publish('claimed', { wa_call_id: call.wa_call_id, agent: req.agent.name });
  try {
    await meta.preAccept(call.account, call.wa_call_id, sdp);
    await meta.accept(call.account, call.wa_call_id, sdp);
  } catch (e) {
    await q(`UPDATE calls_log SET status='failed', error=$2, ended_at=now() WHERE wa_call_id=$1`, [call.wa_call_id, e.message]);
    throw e;
  }
  await q(`UPDATE calls_log SET status='accepted', connected_at=now() WHERE wa_call_id=$1`, [call.wa_call_id]);
  res.json({ ok: true });
});

router.post('/:id/reject', canCall, async (req, res) => {
  const call = await loadCall(req.params.id);
  if (!call) return res.status(404).json({ error: 'Llamada no encontrada' });
  await meta.reject(call.account, call.wa_call_id);
  await q(`UPDATE calls_log SET status='rejected', ended_at=now(), agent_id=COALESCE(agent_id,$2), agent_name=COALESCE(agent_name,$3) WHERE wa_call_id=$1`, [call.wa_call_id, req.agent.id, req.agent.name]);
  hub.publish('claimed', { wa_call_id: call.wa_call_id, agent: req.agent.name });
  res.json({ ok: true });
});

router.post('/:id/terminate', async (req, res) => {
  const call = await loadCall(req.params.id);
  if (!call) return res.status(404).json({ error: 'Llamada no encontrada' });
  if (!canTouch(req.agent, call)) return res.status(403).json({ error: 'No es tu llamada' });
  try { await meta.terminate(call.account, call.wa_call_id); } catch (e) { /* ya pudo haber terminado */ }
  res.json({ ok: true });
});

// Tipificación comercial (resultado + notas)
router.patch('/log/:logId', async (req, res) => {
  const r0 = await q('SELECT * FROM calls_log WHERE id=$1', [req.params.logId]);
  const call = r0.rows[0];
  if (!call) return res.status(404).json({ error: 'Llamada no encontrada' });
  if (!canTouch(req.agent, call)) return res.status(403).json({ error: 'No es tu llamada' });
  const { outcome, notes, contact_name } = req.body || {};
  const r = await q(
    `UPDATE calls_log SET outcome=COALESCE($2,outcome), notes=COALESCE($3,notes), contact_name=COALESCE($4,contact_name)
     WHERE id=$1 RETURNING *`,
    [call.id, outcome || null, notes ?? null, contact_name || null]
  );
  res.json(r.rows[0]);
});

// Historial con filtros (asesor ve solo lo suyo)
function buildFilters(req) {
  const where = [], p = [];
  const add = (sql, v) => { p.push(v); where.push(sql.replace('$?', `$${p.length}`)); };
  if (req.query.from) add('c.started_at >= $?::date', req.query.from);
  if (req.query.to) add(`c.started_at < ($?::date + interval '1 day')`, req.query.to);
  if (req.agent.role === 'asesor') add('c.agent_id = $?', req.agent.id);
  else if (req.query.agent_id) add('c.agent_id = $?', req.query.agent_id);
  if (req.query.account_id) add('c.account_id = $?', req.query.account_id);
  if (req.query.direction) add('c.direction = $?', req.query.direction);
  if (req.query.outcome) add('c.outcome = $?', req.query.outcome);
  if (req.query.phone) add('c.phone LIKE $?', `%${normPhone(req.query.phone)}%`);
  return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', p };
}

router.get('/', async (req, res) => {
  const { where, p } = buildFilters(req);
  const limit = Math.min(Number(req.query.limit) || 200, 2000);
  const r = await q(`SELECT c.*, a.name AS account_name FROM calls_log c
                     LEFT JOIN calls_accounts a ON a.id=c.account_id
                     ${where} ORDER BY c.started_at DESC LIMIT ${limit}`, p);
  res.json(r.rows);
});

router.get('/export.csv', async (req, res) => {
  const { where, p } = buildFilters(req);
  const r = await q(`SELECT c.started_at, c.direction, c.phone, c.contact_name, c.agent_name AS asesor, a.name AS cuenta,
                       c.status, c.duration_sec, c.pulses, c.cost, c.outcome, c.notes, c.external_ref
                     FROM calls_log c LEFT JOIN calls_accounts a ON a.id=c.account_id
                     ${where} ORDER BY c.started_at DESC LIMIT 50000`, p);
  const cols = ['started_at', 'direction', 'phone', 'contact_name', 'asesor', 'cuenta', 'status', 'duration_sec', 'pulses', 'cost', 'outcome', 'notes', 'external_ref'];
  const esc = v => (v == null ? '' : `"${(v instanceof Date ? v.toISOString() : String(v)).replace(/"/g, '""')}"`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="llamadas.csv"');
  res.send('﻿' + [cols.join(';'), ...r.rows.map(row => cols.map(c => esc(row[c])).join(';'))].join('\n'));
});

module.exports = { router, buildFilters };
