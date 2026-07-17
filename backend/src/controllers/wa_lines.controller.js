const { query } = require('../config/db')

// Helper: ¿el usuario ve todo (admin) o solo lo suyo?
const isAdmin = (req) => req.user?.perfil === 'ADMINISTRADOR'

// Verifica que la línea exista y pertenezca al usuario (o que sea admin).
// Devuelve la fila si tiene acceso, o null si no existe / no es suya.
async function findOwnedLine(req, id) {
  const result = await query('SELECT * FROM lines WHERE id=$1', [id])
  if (!result.rows.length) return null
  const line = result.rows[0]
  // Líneas creadas antes de la migración de ownership tienen created_by = NULL.
  // Se tratan como accesibles para cualquier usuario autenticado (no quedan huérfanas).
  if (!isAdmin(req) && line.created_by !== null && line.created_by !== req.user.id) return null
  return line
}

// Obtener todas las líneas (solo las del usuario, salvo ADMINISTRADOR)
async function getAll(req, res) {
  try {
    const params = []
    let where = ''
    if (!isAdmin(req)) {
      params.push(req.user.id)
      // Incluye también las líneas huérfanas (created_by IS NULL, de antes de la migración)
      where = `WHERE (l.created_by = $${params.length} OR l.created_by IS NULL)`
    }
    const result = await query(`
      SELECT l.*, b.name AS bot_name, u.usuario AS owner_username
      FROM lines l
      LEFT JOIN bots b ON l.bot_id = b.id
      LEFT JOIN usuarios u ON l.created_by = u.id
      ${where}
      ORDER BY l.created_at ASC
    `, params)
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

// Obtener una línea por id (solo si es del usuario, salvo ADMINISTRADOR)
async function getOne(req, res) {
  try {
    const owned = await findOwnedLine(req, req.params.id)
    if (!owned) return res.status(404).json({ success: false, error: 'Línea no encontrada' })

    const result = await query(
      `SELECT l.*, b.name AS bot_name
       FROM lines l LEFT JOIN bots b ON l.bot_id = b.id
       WHERE l.id = $1`,
      [req.params.id]
    )
    const bm = req.app.get('baileysManager')
    const line = result.rows[0]
    res.json({
      success: true,
      data: {
        ...line,
        rt_status: bm ? bm.getStatus(line.id) : 'disconnected',
        has_qr: bm ? !!bm.getQR(line.id) : false,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Crear nueva línea (queda asociada al usuario que la crea)
async function create(req, res) {
  try {
    const { name, bot_id, proxy_enabled, proxy_config } = req.body
    if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' })

    const result = await query(
      `INSERT INTO lines (name, bot_id, proxy_enabled, proxy_config, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, bot_id || null, proxy_enabled || false, JSON.stringify(proxy_config || {}), req.user.id]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Actualizar línea (nombre, proxy, bot asignado) — solo si es del usuario
async function update(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedLine(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Línea no encontrada' })

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
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Eliminar línea — solo si es del usuario
async function remove(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedLine(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Línea no encontrada' })

    const bm = req.app.get('baileysManager')
    await bm.disconnect(id)
    await query('DELETE FROM lines WHERE id=$1', [id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Conectar línea (iniciar Baileys + generar QR) — solo si es del usuario
async function connect(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedLine(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Línea no encontrada' })

    const bm = req.app.get('baileysManager')
    // Pasar quién solicita: el QR se emite SOLO a este usuario (seguridad)
    await bm.connect(id, req.user.id)
    res.json({ success: true, message: 'Conectando... espera el QR' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Desconectar línea — solo si es del usuario
async function disconnect(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedLine(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Línea no encontrada' })

    const bm = req.app.get('baileysManager')
    await bm.disconnect(id)
    res.json({ success: true, message: 'Línea desconectada' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

// Obtener QR actual de una línea — solo si es del usuario
async function getQR(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedLine(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Línea no encontrada' })

    const bm = req.app.get('baileysManager')
    const qr = bm.getQR(id)
    if (!qr) return res.status(404).json({ success: false, error: 'QR no disponible' })
    res.json({ success: true, qr })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
}

module.exports = { getAll, getOne, create, update, remove, connect, disconnect, getQR }