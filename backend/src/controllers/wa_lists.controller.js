const { query } = require('../config/db')
const { normalizeNumber } = require('./wa_contacts.controller')

const isAdmin = (req) => req.user?.perfil === 'ADMINISTRADOR'

// Verifica que la lista exista y pertenezca al usuario (o que sea admin).
async function findOwnedList(req, id) {
  const result = await query('SELECT * FROM contact_lists WHERE id=$1', [id])
  if (!result.rows.length) return null
  const list = result.rows[0]
  if (!isAdmin(req) && list.created_by !== req.user.id) return null
  return list
}

async function getAll(req, res) {
  try {
    const params = []
    let where = ''
    if (!isAdmin(req)) {
      params.push(req.user.id)
      where = `WHERE l.created_by = $${params.length}`
    }
    const result = await query(`
      SELECT l.*,
        (SELECT COUNT(*)::int FROM contact_list_items WHERE list_id = l.id) AS contact_count
      FROM contact_lists l
      ${where}
      ORDER BY l.created_at DESC
    `, params)
    res.json({ success: true, data: result.rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function getOne(req, res) {
  try {
    const { id } = req.params
    const list = await findOwnedList(req, id)
    if (!list) return res.status(404).json({ success: false, error: 'Lista no encontrada' })

    const items = await query(
      'SELECT * FROM contact_list_items WHERE list_id=$1 ORDER BY added_at DESC LIMIT 1000',
      [id]
    )
    res.json({ success: true, data: { ...list, items: items.rows } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function create(req, res) {
  try {
    const { name, description, color } = req.body
    if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' })
    const result = await query(
      `INSERT INTO contact_lists (name, description, color, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, description || '', color || '#22c55e', req.user.id]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function update(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedList(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Lista no encontrada' })

    const { name, description, color } = req.body
    const result = await query(
      `UPDATE contact_lists SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         color = COALESCE($3, color)
       WHERE id=$4 RETURNING *`,
      [name, description, color, id]
    )
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function remove(req, res) {
  try {
    const owned = await findOwnedList(req, req.params.id)
    if (!owned) return res.status(404).json({ success: false, error: 'Lista no encontrada' })

    await query('DELETE FROM contact_lists WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function addItem(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedList(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Lista no encontrada' })

    const { wa_number, name, variables } = req.body
    const num = normalizeNumber(wa_number)
    if (!num) return res.status(400).json({ success: false, error: 'wa_number requerido' })

    const result = await query(
      `INSERT INTO contact_list_items (list_id, wa_number, name, variables)
       VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT (list_id, wa_number)
       DO UPDATE SET name = COALESCE(EXCLUDED.name, contact_list_items.name),
                     variables = contact_list_items.variables || EXCLUDED.variables
       RETURNING *`,
      [id, num, name || null, JSON.stringify(variables || {})]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function removeItem(req, res) {
  try {
    const { id, itemId } = req.params
    const owned = await findOwnedList(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Lista no encontrada' })

    await query('DELETE FROM contact_list_items WHERE id=$1 AND list_id=$2', [itemId, id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = { getAll, getOne, create, update, remove, addItem, removeItem }
