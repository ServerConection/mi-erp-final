const { query } = require('../config/db')

// Obtener todas las líneas
async function getAll(req, res) {
  try {
    const result = await query(`
      SELECT l.*, b.name AS bot_name
      FROM lines l
      LEFT JOIN bots b ON l.bot_id = b.id
      ORDER BY l.created_at ASC
    `)
    // Añadir status en tiempo real desde BaileysManager
    const bm = req.app.get('baileysManager')
    const lines = result.rows.map(line => ({
      ...line,
      rt_status: bm ? bm.getStatus(line.id) : 'disconnected',
      has_qr: bm ? !!bm.getQR(line.id) : false,
    }))
    res.json({ success: true, data: lines })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Crear nueva línea
async function create(req, res) {
  try {
    const { name, bot_id, proxy_enabled, proxy_config } = req.body
    if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' })

    const result = await query(
      `INSERT INTO lines (name, bot_id, proxy_enabled, proxy_config)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, bot_id || null, proxy_enabled || false, JSON.stringify(proxy_config || {})]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Actualizar línea (nombre, proxy, bot asignado)
async function update(req, res) {
  try {
    const { id } = req.params
    const { name, bot_id, proxy_enabled, proxy_config } = req.body
    const result = await query(
      `UPDATE lines SET
        name = COALESCE($1, name),
        bot_id = $2,
        proxy_enabled = COALESCE($3, proxy_enabled),
        proxy_config = COALESCE($4, proxy_config),
        updated_at = NOW()
       WHERE id=$5 RETURNING *`,
      [name, bot_id || null, proxy_enabled, proxy_config ? JSON.stringify(proxy_config) : null, id]
    )
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Línea no encontrada' })
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Eliminar línea
async function remove(req, res) {
  try {
    const { id } = req.params
    const bm = req.app.get('baileysManager')
    await bm.disconnect(id)
    await query('DELETE FROM lines WHERE id=$1', [id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Conectar línea (iniciar Baileys + generar QR)
async function connect(req, res) {
  try {
    const { id } = req.params
    const bm = req.app.get('baileysManager')
    const lineRes = await query('SELECT * FROM lines WHERE id=$1', [id])
    if (!lineRes.rows.length) return res.status(404).json({ success: false, error: 'Línea no encontrada' })
    await bm.connect(id)
    res.json({ success: true, message: 'Conectando... espera el QR' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Desconectar línea
async function disconnect(req, res) {
  try {
    const { id } = req.params
    const bm = req.app.get('baileysManager')
    await bm.disconnect(id)
    res.json({ success: true, message: 'Línea desconectada' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Obtener QR actual de una línea
async function getQR(req, res) {
  try {
    const { id } = req.params
    const bm = req.app.get('baileysManager')
    const qr = bm.getQR(id)
    if (!qr) return res.status(404).json({ success: false, error: 'QR no disponible' })
    res.json({ success: true, qr })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = { getAll, create, update, remove, connect, disconnect, getQR }