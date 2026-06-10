const { query } = require('../config/db')

async function getAll(req, res) {
  try {
    const result = await query('SELECT * FROM bots ORDER BY created_at DESC')
    res.json({ success: true, data: result.rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function getOne(req, res) {
  try {
    const result = await query('SELECT * FROM bots WHERE id=$1', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Bot no encontrado' })
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function create(req, res) {
  try {
    const { name, description, flow_json } = req.body
    if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' })
    const result = await query(
      `INSERT INTO bots (name, description, flow_json) VALUES ($1,$2,$3) RETURNING *`,
      [name, description || '', JSON.stringify(flow_json || { nodes: [], edges: [] })]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function update(req, res) {
  try {
    const { id } = req.params
    const { name, description, flow_json, is_active } = req.body
    const result = await query(
      `UPDATE bots SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        flow_json = COALESCE($3, flow_json),
        is_active = COALESCE($4, is_active),
        updated_at = NOW()
       WHERE id=$5 RETURNING *`,
      [name, description, flow_json ? JSON.stringify(flow_json) : null, is_active, id]
    )
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Bot no encontrado' })
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function remove(req, res) {
  try {
    await query('DELETE FROM bots WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function toggleActive(req, res) {
  try {
    const result = await query(
      'UPDATE bots SET is_active = NOT is_active, updated_at=NOW() WHERE id=$1 RETURNING *',
      [req.params.id]
    )
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function resetConversations(req, res) {
  try {
    const { id } = req.params
    await query(
      `UPDATE conversations SET current_node_id = NULL, context_data = '{}'
       WHERE bot_id = $1 AND status = 'active'`,
      [id]
    )
    res.json({ success: true, message: 'Conversaciones activas reseteadas' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = { getAll, getOne, create, update, remove, toggleActive, resetConversations }
