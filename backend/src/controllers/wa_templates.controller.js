const { query } = require('../config/db')

const isAdmin = (req) => req.user?.perfil === 'ADMINISTRADOR'

// Verifica que la plantilla exista y pertenezca al usuario (o que sea admin).
async function findOwnedTemplate(req, id) {
  const result = await query('SELECT * FROM templates WHERE id=$1', [id])
  if (!result.rows.length) return null
  const tpl = result.rows[0]
  if (!isAdmin(req) && tpl.created_by !== req.user.id) return null
  return tpl
}

// Extrae variables {{nombre}} de un texto
function extractVariables(text) {
  const matches = (text || '').match(/\{\{(\w+)\}\}/g) || []
  return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))]
}

async function getAll(req, res) {
  try {
    const { category } = req.query
    const conditions = []
    const params = []
    if (category) { params.push(category); conditions.push(`category = $${params.length}`) }
    if (!isAdmin(req)) { params.push(req.user.id); conditions.push(`created_by = $${params.length}`) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
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
    const tpl = await findOwnedTemplate(req, req.params.id)
    if (!tpl) return res.status(404).json({ success: false, error: 'Plantilla no encontrada' })
    res.json({ success: true, data: tpl })
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
      `INSERT INTO templates (name, category, body, media_url, media_type, media_filename, variables, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, category || 'general', body, media_url || null, media_type || null, media_filename || null, variables, req.user.id]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function update(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedTemplate(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Plantilla no encontrada' })

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
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

async function remove(req, res) {
  try {
    const owned = await findOwnedTemplate(req, req.params.id)
    if (!owned) return res.status(404).json({ success: false, error: 'Plantilla no encontrada' })

    await query('DELETE FROM templates WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = { getAll, getOne, create, update, remove, extractVariables }
