const { query } = require('../config/db')

// Extrae variables {{nombre}} de un texto
function extractVariables(text) {
  const matches = (text || '').match(/\{\{(\w+)\}\}/g) || []
  return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))]
}

async function getAll(req, res) {
  try {
    const { category } = req.query
    const where = category ? 'WHERE category = $1' : ''
    const params = category ? [category] : []
    const result = await query(
      `SELECT * FROM templates ${where} ORDER BY created_at DESC`, params
    )
    res.json({ success: true, data: result.rows })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function getOne(req, res) {
  try {
    const result = await query('SELECT * FROM templates WHERE id=$1', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Plantilla no encontrada' })
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function create(req, res) {
  try {
    const { name, category, body, media_url, media_type, media_filename } = req.body
    if (!name || !body) return res.status(400).json({ success: false, error: 'Nombre y cuerpo requeridos' })

    const variables = extractVariables(body)
    const result = await query(
      `INSERT INTO templates (name, category, body, media_url, media_type, media_filename, variables)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, category || 'general', body, media_url || null, media_type || null, media_filename || null, variables]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function update(req, res) {
  try {
    const { id } = req.params
    const { name, category, body, media_url, media_type, media_filename } = req.body
    const variables = body ? extractVariables(body) : null
    const result = await query(
      `UPDATE templates SET
         name = COALESCE($1, name),
         category = COALESCE($2, category),
         body = COALESCE($3, body),
         media_url = $4,
         media_type = $5,
         media_filename = $6,
         variables = COALESCE($7, variables)
       WHERE id=$8 RETURNING *`,
      [name, category, body, media_url || null, media_type || null, media_filename || null, variables, id]
    )
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Plantilla no encontrada' })
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function remove(req, res) {
  try {
    await query('DELETE FROM templates WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = { getAll, getOne, create, update, remove, extractVariables }
