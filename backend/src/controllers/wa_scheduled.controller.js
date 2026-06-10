const { query } = require('../config/db')
const { normalizeNumber } = require('./wa_contacts.controller')

async function getAll(req, res) {
  try {
    const { status } = req.query
    const where = status ? 'WHERE s.status = $1' : ''
    const params = status ? [status] : []
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
    const result = await query(
      `INSERT INTO scheduled_messages (line_id, wa_number, body, media_url, media_type, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [line_id, num, body, media_url || null, media_type || null, scheduled_at]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function cancel(req, res) {
  try {
    await query(`UPDATE scheduled_messages SET status='cancelled' WHERE id=$1 AND status='pending'`, [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function remove(req, res) {
  try {
    await query(`DELETE FROM scheduled_messages WHERE id=$1`, [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = { getAll, create, cancel, remove }
