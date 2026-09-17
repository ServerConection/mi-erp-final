const { query } = require('../config/db')

const isAdmin = (req) => (req.user?.perfil || '').toUpperCase() === 'ADMINISTRADOR'

// ── Propia (cualquier usuario autenticado) ──────────────────────────

async function getMine(req, res) {
  try {
    const result = await query(
      `SELECT user_id, message_text, media_url, media_type, media_filename, updated_at
       FROM wa_presentations WHERE user_id=$1`,
      [req.user.id]
    )
    res.json({ success: true, data: result.rows[0] || null })
  } catch (err) {
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

async function saveMine(req, res) {
  return upsertForUser(req, res, req.user.id)
}

// ── Administración (solo ADMINISTRADOR) ────────────────────────────

// Lista todos los usuarios (no CONSULTOR) con su presentación, si tienen una.
async function getAll(req, res) {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, error: 'Solo un administrador puede ver esto' })
    const result = await query(`
      SELECT u.id AS user_id, u.usuario, u.nombres, u.apellidos, u.perfil, u.empresa,
             p.message_text, p.media_url, p.media_type, p.media_filename, p.updated_at
      FROM usuarios u
      LEFT JOIN wa_presentations p ON p.user_id = u.id
      WHERE UPPER(u.perfil) <> 'CONSULTOR'
      ORDER BY u.usuario ASC
    `)
    res.json({ success: true, data: result.rows })
  } catch (err) {
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

async function saveForUser(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ success: false, error: 'Solo un administrador puede editar la presentación de otro usuario' })
  const userId = Number(req.params.userId)
  if (!userId) return res.status(400).json({ success: false, error: 'Usuario inválido' })
  return upsertForUser(req, res, userId)
}

// ── Común ───────────────────────────────────────────────────────────

async function upsertForUser(req, res, userId) {
  try {
    const { message_text, media_url, media_type, media_filename } = req.body
    if (!message_text && !media_url) {
      return res.status(400).json({ success: false, error: 'Escribe un texto o adjunta una imagen' })
    }
    const result = await query(
      `INSERT INTO wa_presentations (user_id, message_text, media_url, media_type, media_filename, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         message_text   = EXCLUDED.message_text,
         media_url      = EXCLUDED.media_url,
         media_type     = EXCLUDED.media_type,
         media_filename = EXCLUDED.media_filename,
         updated_at     = NOW()
       RETURNING user_id, message_text, media_url, media_type, media_filename, updated_at`,
      [userId, message_text || null, media_url || null, media_type || null, media_filename || null]
    )
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

module.exports = { getMine, saveMine, getAll, saveForUser }
