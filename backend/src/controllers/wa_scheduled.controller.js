const { query } = require('../config/db')
const { normalizeNumber } = require('./wa_contacts.controller')

const isAdmin = (req) => req.user?.perfil === 'ADMINISTRADOR'

// Verifica que el mensaje programado exista y pertenezca al usuario (o que sea admin).
async function findOwnedScheduled(req, id) {
  const result = await query('SELECT * FROM scheduled_messages WHERE id=$1', [id])
  if (!result.rows.length) return null
  const sched = result.rows[0]
  if (!isAdmin(req) && sched.created_by !== req.user.id) return null
  return sched
}

async function getAll(req, res) {
  try {
    const { status } = req.query
    const conditions = []
    const params = []
    if (status) { params.push(status); conditions.push(`s.status = $${params.length}`) }
    if (!isAdmin(req)) { params.push(req.user.id); conditions.push(`s.created_by = $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const result = await query(`
      SELECT s.*, l.name AS line_name
      FROM scheduled_messages s
      LEFT JOIN lines l ON s.line_id = l.id
      ${where}
      ORDER BY s.scheduled_at ASC
      LIMIT 200
    `, params)
    res.json({ success: true, data: result.rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function create(req, res) {
  try {
    const { line_id, wa_number, body, media_url, media_type, scheduled_at } = req.body
    const num = normalizeNumber(wa_number)
    if (!line_id || !num || !body) {
      return res.status(400).json({ success: false, error: 'line_id, wa_number y body requeridos' })
    }
    if (!scheduled_at) {
      return res.status(400).json({ success: false, error: 'scheduled_at requerido (ISO date)' })
    }

    // Verificar que la línea sea del usuario (o admin)
    const lineCheck = await query('SELECT created_by FROM lines WHERE id=$1', [line_id])
    if (!lineCheck.rows.length || (!isAdmin(req) && lineCheck.rows[0].created_by !== req.user.id)) {
      return res.status(404).json({ success: false, error: 'Línea no encontrada' })
    }

    const result = await query(
      `INSERT INTO scheduled_messages (line_id, wa_number, body, media_url, media_type, scheduled_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [line_id, num, body, media_url || null, media_type || null, scheduled_at, req.user.id]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function cancel(req, res) {
  try {
    const owned = await findOwnedScheduled(req, req.params.id)
    if (!owned) return res.status(404).json({ success: false, error: 'No encontrado' })

    await query(`UPDATE scheduled_messages SET status='cancelled' WHERE id=$1 AND status='pending'`, [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function remove(req, res) {
  try {
    const owned = await findOwnedScheduled(req, req.params.id)
    if (!owned) return res.status(404).json({ success: false, error: 'No encontrado' })

    await query(`DELETE FROM scheduled_messages WHERE id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = { getAll, create, cancel, remove }
