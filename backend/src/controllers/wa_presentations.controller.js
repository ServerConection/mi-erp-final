const { query, transaction } = require('../config/db')

const isAdmin = req => (req.user?.perfil || '').toUpperCase() === 'ADMINISTRADOR'

async function variantsFor(userId, db = { query }) {
  const result = await db.query(
    `SELECT id, user_id, name, message_text, media_url, media_type, media_filename,
            position, is_active, created_at, updated_at
       FROM wa_presentation_variants WHERE user_id=$1
      ORDER BY position ASC, created_at ASC`, [userId])
  return result.rows
}

async function getMine(req, res) {
  try { res.json({ success: true, data: { user_id: req.user.id, variants: await variantsFor(req.user.id) } }) }
  catch (err) { res.status(500).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message }) }
}

async function getAll(req, res) {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, error: 'Solo un administrador puede ver esto' })
    const result = await query(`
      SELECT u.id AS user_id, u.usuario, u.nombres, u.apellidos, u.perfil, u.empresa,
             COUNT(v.id)::int AS variant_count,
             COUNT(v.id) FILTER (WHERE v.is_active)::int AS active_variant_count
        FROM usuarios u LEFT JOIN wa_presentation_variants v ON v.user_id = u.id
       WHERE UPPER(u.perfil) <> 'CONSULTOR'
       GROUP BY u.id, u.usuario, u.nombres, u.apellidos, u.perfil, u.empresa
       ORDER BY u.usuario ASC`)
    res.json({ success: true, data: result.rows })
  } catch (err) { res.status(500).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message }) }
}

async function getForUser(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ success: false, error: 'Solo un administrador puede ver esto' })
  const userId = Number(req.params.userId)
  if (!userId) return res.status(400).json({ success: false, error: 'Usuario inválido' })
  try { res.json({ success: true, data: { user_id: userId, variants: await variantsFor(userId) } }) }
  catch (err) { res.status(500).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message }) }
}

function cleanVariants(body) {
  if (!Array.isArray(body?.variants)) { const e = new Error('Envía una lista de variantes'); e.status = 400; throw e }
  if (body.variants.length > 20) { const e = new Error('Se permiten máximo 20 variantes'); e.status = 400; throw e }
  return body.variants.map((v, index) => {
    const message = String(v.message_text || '').trim()
    const mediaUrl = String(v.media_url || '').trim()
    if (!message && !mediaUrl) { const e = new Error(`La variante ${index + 1} debe tener texto o imagen`); e.status = 400; throw e }
    return {
      id: v.id || null,
      name: String(v.name || `Presentación ${index + 1}`).trim().slice(0, 120),
      message_text: message || null, media_url: mediaUrl || null,
      media_type: mediaUrl ? String(v.media_type || 'image').slice(0, 20) : null,
      media_filename: mediaUrl ? String(v.media_filename || '').slice(0, 255) || null : null,
      is_active: v.is_active !== false, position: index,
    }
  })
}

async function saveFor(userId, body) {
  const variants = cleanVariants(body)
  return transaction(async client => {
    const existing = await client.query('SELECT id FROM wa_presentation_variants WHERE user_id=$1', [userId])
    const existingIds = new Set(existing.rows.map(r => r.id))
    const kept = []
    for (const variant of variants) {
      if (variant.id && !existingIds.has(variant.id)) { const e = new Error('Una variante no pertenece al usuario seleccionado'); e.status = 400; throw e }
      if (variant.id) {
        await client.query(
          `UPDATE wa_presentation_variants SET name=$1, message_text=$2, media_url=$3,
             media_type=$4, media_filename=$5, is_active=$6, position=$7, updated_at=NOW()
           WHERE id=$8 AND user_id=$9`,
          [variant.name, variant.message_text, variant.media_url, variant.media_type,
            variant.media_filename, variant.is_active, variant.position, variant.id, userId])
        kept.push(variant.id)
      } else {
        const inserted = await client.query(
          `INSERT INTO wa_presentation_variants
             (user_id, name, message_text, media_url, media_type, media_filename, is_active, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [userId, variant.name, variant.message_text, variant.media_url, variant.media_type,
            variant.media_filename, variant.is_active, variant.position])
        kept.push(inserted.rows[0].id)
      }
    }
    if (kept.length) await client.query('DELETE FROM wa_presentation_variants WHERE user_id=$1 AND NOT (id = ANY($2::uuid[]))', [userId, kept])
    else await client.query('DELETE FROM wa_presentation_variants WHERE user_id=$1', [userId])
    await client.query(
      `INSERT INTO wa_presentation_rotation (user_id, next_index, updated_at) VALUES ($1,0,NOW())
       ON CONFLICT (user_id) DO UPDATE SET next_index=0, updated_at=NOW()`, [userId])
    return variantsFor(userId, client)
  })
}

async function saveMine(req, res) {
  try { res.json({ success: true, data: { user_id: req.user.id, variants: await saveFor(req.user.id, req.body) } }) }
  catch (err) { res.status(err.status || 500).json({ success: false, error: err.message }) }
}

async function saveForUser(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ success: false, error: 'Solo un administrador puede editar la presentación de otro usuario' })
  const userId = Number(req.params.userId)
  if (!userId) return res.status(400).json({ success: false, error: 'Usuario inválido' })
  try { res.json({ success: true, data: { user_id: userId, variants: await saveFor(userId, req.body) } }) }
  catch (err) { res.status(err.status || 500).json({ success: false, error: err.message }) }
}

module.exports = { getMine, saveMine, getAll, getForUser, saveForUser }
