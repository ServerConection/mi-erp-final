// src/routes/pilotoLlamadas.routes.js
// ============================================================================
// PILOTO LLAMADAS PC — llamadas WhatsApp Desktop ocultas, solo para asesores piloto.
//   GET  /api/piloto-llamadas/mi-estado              ¿el usuario logueado está en el piloto?
//   GET  /api/piloto-llamadas/admin                  lista del piloto            (ADMINISTRADOR)
//   GET  /api/piloto-llamadas/admin/usuarios?q=      buscar usuarios             (ADMINISTRADOR)
//   POST /api/piloto-llamadas/admin/activar          {usuario_id} → clave PC     (ADMINISTRADOR)
//   POST /api/piloto-llamadas/admin/desactivar       {usuario_id}                (ADMINISTRADOR)
//   GET  /api/piloto-llamadas/agente/numero/:convId  SOLO el agente de la PC: JWT del asesor + X-Device-Key
// Nadie fuera del piloto ve cambios. Tablas nuevas, creadas solas (IF NOT EXISTS).
// ============================================================================
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../config/db');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { isAdminOnlyNumber } = require('../services/waPrivacy');

let _tablas = null;
function asegurarTablas() {
  if (!_tablas) {
    _tablas = pool.query(`
      CREATE TABLE IF NOT EXISTS piloto_llamadas_pc (
        usuario_id     TEXT PRIMARY KEY,
        activo         BOOLEAN NOT NULL DEFAULT false,
        clave_hash     TEXT,
        actualizado_por TEXT,
        actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS piloto_llamadas_log (
        id              BIGSERIAL PRIMARY KEY,
        usuario_id      TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `).catch((e) => { _tablas = null; throw e; });
  }
  return _tablas;
}

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const iguales = (a, b) => {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};
const error500 = (res, e) => {
  console.error('[piloto-llamadas]', e.message);
  res.status(500).json({ success: false, error: 'Error interno' });
};

// Exportado para que otros módulos sepan si un usuario está en el piloto.
async function enPiloto(usuarioId) {
  await asegurarTablas();
  const r = await pool.query(
    'SELECT activo FROM piloto_llamadas_pc WHERE usuario_id = $1', [String(usuarioId)]);
  return !!r.rows[0]?.activo;
}

router.use(verificarToken);

// ── Usuario logueado ────────────────────────────────────────────────────────
router.get('/mi-estado', async (req, res) => {
  try {
    res.json({ success: true, activo: await enPiloto(req.user.id) });
  } catch (e) { error500(res, e); }
});

// ── Agente de la PC del asesor ──────────────────────────────────────────────
router.get('/agente/numero/:convId', async (req, res) => {
  try {
    await asegurarTablas();
    const uid = String(req.user.id);
    const p = await pool.query(
      'SELECT activo, clave_hash FROM piloto_llamadas_pc WHERE usuario_id = $1', [uid]);
    const fila = p.rows[0];
    if (!fila?.activo) return res.status(403).json({ success: false, error: 'Usuario fuera del piloto' });
    if (!iguales(sha256(req.get('x-device-key') || ''), fila.clave_hash)) {
      return res.status(401).json({ success: false, error: 'Clave de PC inválida' });
    }
    const c = await pool.query(
      `SELECT c.wa_number, l.created_by
         FROM conversations c LEFT JOIN lines l ON l.id = c.line_id
        WHERE c.id::text = $1`, [String(req.params.convId)]);
    const conv = c.rows[0];
    // Solo conversaciones de líneas del propio asesor.
    if (!conv || String(conv.created_by) !== uid || isAdminOnlyNumber(conv.wa_number)) {
      return res.status(404).json({ success: false, error: 'Conversación no encontrada' });
    }
    const numero = String(conv.wa_number || '').replace(/\D/g, '');
    if (!numero) return res.status(404).json({ success: false, error: 'Sin número' });
    await pool.query(
      'INSERT INTO piloto_llamadas_log (usuario_id, conversation_id) VALUES ($1, $2)',
      [uid, String(req.params.convId)]);
    res.json({ success: true, numero });
  } catch (e) { error500(res, e); }
});

// ── Administración (solo ADMINISTRADOR) ─────────────────────────────────────
router.get('/admin', soloAdmin, async (req, res) => {
  try {
    await asegurarTablas();
    const r = await pool.query(`
      SELECT p.usuario_id, p.activo, p.actualizado_en, (p.clave_hash IS NOT NULL) AS tiene_clave,
             u.usuario, TRIM(COALESCE(u.nombres,'') || ' ' || COALESCE(u.apellidos,'')) AS nombre,
             u.empresa, u.perfil,
             (SELECT COUNT(*) FROM piloto_llamadas_log g WHERE g.usuario_id = p.usuario_id)::int AS llamadas,
             (SELECT MAX(creado_en) FROM piloto_llamadas_log g WHERE g.usuario_id = p.usuario_id) AS ultima_llamada
        FROM piloto_llamadas_pc p
        LEFT JOIN usuarios u ON u.id::text = p.usuario_id
       ORDER BY p.activo DESC, nombre`);
    res.json({ success: true, data: r.rows });
  } catch (e) { error500(res, e); }
});

router.get('/admin/usuarios', soloAdmin, async (req, res) => {
  try {
    const q = `%${String(req.query.q || '').trim()}%`;
    const r = await pool.query(`
      SELECT id, usuario, TRIM(COALESCE(nombres,'') || ' ' || COALESCE(apellidos,'')) AS nombre, empresa, perfil
        FROM usuarios
       WHERE activo = 'SI'
         AND (usuario ILIKE $1 OR nombres ILIKE $1 OR apellidos ILIKE $1)
       ORDER BY nombres LIMIT 20`, [q]);
    res.json({ success: true, data: r.rows });
  } catch (e) { error500(res, e); }
});

router.post('/admin/activar', soloAdmin, async (req, res) => {
  try {
    await asegurarTablas();
    const uid = String(req.body?.usuario_id || '').trim();
    if (!uid) return res.status(400).json({ success: false, error: 'usuario_id requerido' });
    const u = await pool.query('SELECT id FROM usuarios WHERE id::text = $1', [uid]);
    if (!u.rows.length) return res.status(404).json({ success: false, error: 'Usuario no existe' });
    const clave = crypto.randomBytes(24).toString('hex');   // se muestra UNA sola vez
    await pool.query(`
      INSERT INTO piloto_llamadas_pc (usuario_id, activo, clave_hash, actualizado_por, actualizado_en)
      VALUES ($1, true, $2, $3, now())
      ON CONFLICT (usuario_id) DO UPDATE
        SET activo = true, clave_hash = EXCLUDED.clave_hash,
            actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()`,
      [uid, sha256(clave), String(req.user.id)]);
    res.json({ success: true, clave });
  } catch (e) { error500(res, e); }
});

router.post('/admin/desactivar', soloAdmin, async (req, res) => {
  try {
    await asegurarTablas();
    const uid = String(req.body?.usuario_id || '').trim();
    await pool.query(`
      UPDATE piloto_llamadas_pc SET activo = false, actualizado_por = $2, actualizado_en = now()
       WHERE usuario_id = $1`, [uid, String(req.user.id)]);
    res.json({ success: true });
  } catch (e) { error500(res, e); }
});

module.exports = router;
module.exports.enPiloto = enPiloto;
