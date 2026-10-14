// Módulo de configuración: cuentas WhatsApp, asesores y parámetros
const router = require('express').Router();
const crypto = require('crypto');
const { q, getSetting, setSetting } = require('../db');
const { encrypt, mask, decrypt } = require('../security');
const { requireRole, invalidate } = require('../auth');
const meta = require('../meta');

const adminOnly = requireRole('admin');
const staff = requireRole('admin', 'supervisor');

const publicAccount = a => ({
  id: a.id, name: a.name, waba_id: a.waba_id, phone_number_id: a.phone_number_id,
  display_phone: a.display_phone, verified_name: a.verified_name, api_version: a.api_version,
  rate_per_min: Number(a.rate_per_min), currency: a.currency, active: a.active,
  verify_token: a.verify_token, token_hint: mask(decryptSafe(a.token_enc)),
  has_app_secret: !!a.app_secret_enc, updated_at: a.updated_at,
});

function decryptSafe(v) { try { return decrypt(v); } catch { return ''; } }

const webhookUrl = req => `${(process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')}/webhook`;

async function loadAccount(id) {
  const r = await q('SELECT * FROM calls_accounts WHERE id=$1', [id]);
  return r.rows[0];
}

/* ---------- Cuentas WhatsApp ---------- */
router.get('/accounts', staff, async (req, res) => {
  const r = await q('SELECT * FROM calls_accounts ORDER BY id');
  res.json({ webhook_url: webhookUrl(req), accounts: r.rows.map(publicAccount) });
});

router.post('/accounts', adminOnly, async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.phone_number_id || !b.token)
    return res.status(400).json({ error: 'Nombre, Phone Number ID y Access Token son obligatorios' });
  const r = await q(
    `INSERT INTO calls_accounts(name, waba_id, phone_number_id, token_enc, app_secret_enc, verify_token, api_version, rate_per_min, currency)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.name.trim(), b.waba_id || null, String(b.phone_number_id).trim(), encrypt(b.token.trim()),
     b.app_secret ? encrypt(b.app_secret.trim()) : null,
     b.verify_token || `novo_${crypto.randomBytes(8).toString('hex')}`,
     b.api_version || 'v25.0', Number(b.rate_per_min) || 0.01392, b.currency || 'USD']
  ).catch(e => { if (e.code === '23505') e.publicMsg = 'Ese Phone Number ID ya está registrado'; throw e; });
  res.json(publicAccount(r.rows[0]));
});

router.put('/accounts/:id', adminOnly, async (req, res) => {
  const a = await loadAccount(req.params.id);
  if (!a) return res.status(404).json({ error: 'Cuenta no encontrada' });
  const b = req.body || {};
  const r = await q(
    `UPDATE calls_accounts SET name=$2, waba_id=$3, api_version=$4, rate_per_min=$5, currency=$6, active=$7,
       token_enc=COALESCE($8, token_enc), app_secret_enc=COALESCE($9, app_secret_enc), updated_at=now()
     WHERE id=$1 RETURNING *`,
    [a.id, b.name ?? a.name, b.waba_id ?? a.waba_id, b.api_version ?? a.api_version,
     b.rate_per_min ?? a.rate_per_min, b.currency ?? a.currency, b.active ?? a.active,
     b.token ? encrypt(b.token.trim()) : null, b.app_secret ? encrypt(b.app_secret.trim()) : null]
  );
  res.json(publicAccount(r.rows[0]));
});

// Probar conexión: valida token + número y guarda nombre verificado
router.post('/accounts/:id/test', adminOnly, async (req, res) => {
  const a = await loadAccount(req.params.id);
  if (!a) return res.status(404).json({ error: 'Cuenta no encontrada' });
  const info = await meta.phoneInfo(a);
  let calling = null, callingError = null;
  try { calling = await meta.getCallSettings(a); } catch (e) { callingError = e.message; }
  await q('UPDATE calls_accounts SET display_phone=$2, verified_name=$3, updated_at=now() WHERE id=$1',
    [a.id, info.display_phone_number, info.verified_name]);
  res.json({ ok: true, info, calling: calling?.calling || null, callingError });
});

router.post('/accounts/:id/enable-calling', adminOnly, async (req, res) => {
  const a = await loadAccount(req.params.id);
  if (!a) return res.status(404).json({ error: 'Cuenta no encontrada' });
  res.json(await meta.enableCalling(a));
});

/* ---------- Asesores (usuarios del ERP) ---------- */
// Lista usuarios activos del ERP con su habilitación para llamar
router.get('/agents', staff, async (req, res) => {
  const p = [];
  let where = `u.activo = 'SI'`;
  if (req.query.empresa) { p.push(String(req.query.empresa).toUpperCase()); where += ` AND upper(u.empresa) = $${p.length}`; }
  if (req.query.search) {
    p.push(`%${req.query.search}%`);
    where += ` AND (u.usuario ILIKE $${p.length} OR u.nombres ILIKE $${p.length} OR u.apellidos ILIKE $${p.length})`;
  }
  if (req.query.solo_habilitados === '1') where += ' AND a.habilitado';
  const r = await q(
    `SELECT u.id, u.usuario AS username, trim(coalesce(u.nombres,'') || ' ' || coalesce(u.apellidos,'')) AS name,
            upper(u.empresa) AS empresa, upper(u.perfil) AS perfil,
            coalesce(a.habilitado, false) AS habilitado, a.account_id, c.name AS account_name
       FROM usuarios u
       LEFT JOIN calls_agents a ON a.usuario_id = u.id
       LEFT JOIN calls_accounts c ON c.id = a.account_id
      WHERE ${where}
      ORDER BY coalesce(a.habilitado,false) DESC, u.nombres NULLS LAST
      LIMIT 300`, p);
  res.json(r.rows);
});

// Habilitar/deshabilitar un usuario para llamar y asignarle la cuenta (línea) de WhatsApp
router.put('/agents/:usuarioId', adminOnly, async (req, res) => {
  const { habilitado, account_id } = req.body || {};
  const u = await q(`SELECT id FROM usuarios WHERE id=$1`, [req.params.usuarioId]);
  if (!u.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado en el ERP' });
  const r = await q(
    `INSERT INTO calls_agents(usuario_id, account_id, habilitado, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (usuario_id) DO UPDATE SET account_id=EXCLUDED.account_id, habilitado=EXCLUDED.habilitado,
       updated_by=EXCLUDED.updated_by, updated_at=now()
     RETURNING *`,
    [req.params.usuarioId, account_id || null, !!habilitado, req.agent.id]
  );
  invalidate(req.params.usuarioId);
  res.json(r.rows[0]);
});

/* ---------- Parámetros ---------- */
router.get('/settings', async (req, res) => {
  res.json({ outcomes: await getSetting('outcomes'), general: await getSetting('general') });
});

router.put('/settings', adminOnly, async (req, res) => {
  const { outcomes, general } = req.body || {};
  if (Array.isArray(outcomes)) {
    const clean = outcomes.filter(o => o && o.label).map(o => ({
      key: (o.key || o.label).toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      label: String(o.label).trim(), positive: !!o.positive,
    }));
    await setSetting('outcomes', clean);
  }
  if (general && typeof general === 'object') await setSetting('general', { ...(await getSetting('general')), ...general });
  res.json({ outcomes: await getSetting('outcomes'), general: await getSetting('general') });
});

module.exports = router;
