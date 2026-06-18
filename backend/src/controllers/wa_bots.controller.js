const { query } = require('../config/db')

const isAdmin = (req) => req.user?.perfil === 'ADMINISTRADOR'

// Verifica que el bot exista y pertenezca al usuario (o que sea admin).
async function findOwnedBot(req, id) {
  const result = await query('SELECT * FROM bots WHERE id=$1', [id])
  if (!result.rows.length) return null
  const bot = result.rows[0]
  if (!isAdmin(req) && bot.created_by !== req.user.id) return null
  return bot
}

async function getAll(req, res) {
  try {
    const params = []
    let where = ''
    if (!isAdmin(req)) {
      params.push(req.user.id)
      where = `WHERE created_by = $${params.length}`
    }
    const result = await query(`SELECT * FROM bots ${where} ORDER BY created_at DESC`, params)
    res.json({ success: true, data: result.rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function getOne(req, res) {
  try {
    const bot = await findOwnedBot(req, req.params.id)
    if (!bot) return res.status(404).json({ success: false, error: 'Bot no encontrado' })
    res.json({ success: true, data: bot })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function create(req, res) {
  try {
    const { name, description, flow_json } = req.body
    if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' })
    const result = await query(
      `INSERT INTO bots (name, description, flow_json, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, description || '', JSON.stringify(flow_json || { nodes: [], edges: [] }), req.user.id]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function update(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedBot(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Bot no encontrado' })

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
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function remove(req, res) {
  try {
    const owned = await findOwnedBot(req, req.params.id)
    if (!owned) return res.status(404).json({ success: false, error: 'Bot no encontrado' })

    await query('DELETE FROM bots WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function toggleActive(req, res) {
  try {
    const owned = await findOwnedBot(req, req.params.id)
    if (!owned) return res.status(404).json({ success: false, error: 'Bot no encontrado' })

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
    const owned = await findOwnedBot(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Bot no encontrado' })

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
