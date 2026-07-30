const { query } = require('../config/db')

// Helpers de perfil
// Perfiles "gerenciales" ven todas las líneas/chats de SU empresa (no de otras).
// Solo ADMINISTRADOR ve todo, sin restricción de empresa.
const PERFILES_GERENCIALES = ['SUPERVISOR', 'GERENCIA', 'ANALISTA']
const isAdmin = (req) => (req.user?.perfil || '').toUpperCase() === 'ADMINISTRADOR'
const isSupervisor = (req) => PERFILES_GERENCIALES.includes((req.user?.perfil || '').toUpperCase())

// Verifica que la línea exista y que el usuario pueda verla según su perfil.
// ADMIN: todo · SUPERVISOR: líneas de su empresa · ASESOR: solo las suyas (o huérfanas).
async function findOwnedLine(req, id) {
  const result = await query(
    `SELECT l.*, u.empresa AS owner_empresa
     FROM lines l LEFT JOIN usuarios u ON l.created_by = u.id
     WHERE l.id=$1`,
    [id]
  )
  if (!result.rows.length) return null
  const line = result.rows[0]
  if (isAdmin(req)) return line
  if (isSupervisor(req)) {
    return (line.owner_empresa || '').toUpperCase() === (req.user.empresa || '').toUpperCase() ? line : null
  }
  if (line.created_by === null || line.created_by === req.user.id) return line
  return null
}

// Obtener las líneas visibles según el perfil
async function getAll(req, res) {
  try {
    const params = []
    let where = ''
    if (isSupervisor(req)) {
      params.push((req.user.empresa || '').toUpperCase())
      where = `WHERE l.created_by IN (SELECT id FROM usuarios WHERE UPPER(empresa) = $${params.length})`
    } else if (!isAdmin(req)) {
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
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
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
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

// Cupo de líneas por usuario no administrador (1 línea = 1 número por asesor)
const MAX_LINEAS_POR_USUARIO = 1

// Crear nueva línea (queda asociada al usuario que la crea)
// ADMINISTRADOR: sin límite · Resto: solo si no tiene ninguna línea propia.
async function create(req, res) {
  try {
    if (!isAdmin(req)) {
      const propias = await query(
        'SELECT COUNT(*)::int AS total FROM lines WHERE created_by = $1',
        [req.user.id]
      )
      if ((propias.rows[0]?.total || 0) >= MAX_LINEAS_POR_USUARIO) {
        return res.status(403).json({
          success: false,
          error: 'Ya tienes una línea asignada. Si necesitas otra, solicítala a un administrador.'
        })
      }
    }
    const { name, bot_id, proxy_enabled, proxy_config } = req.body
    if (!name) return res.status(400).json({ success: false, error: 'Nombre requerido' })

    const result = await query(
      `INSERT INTO lines (name, bot_id, proxy_enabled, proxy_config, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, bot_id || null, proxy_enabled || false, JSON.stringify(proxy_config || {}), req.user.id]
    )
    res.status(201).json({ success: true, data: result.rows[0] })
  } catch (err) {
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
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
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

// Eliminar línea — restringido: solo ADMINISTRADOR puede eliminar líneas.
async function remove(req, res) {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, error: 'Solo un administrador puede eliminar líneas' })
    }
    const { id } = req.params
    const owned = await findOwnedLine(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Línea no encontrada' })

    const bm = req.app.get('baileysManager')
    await bm.disconnect(id)
    await query('DELETE FROM lines WHERE id=$1', [id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

// Conectar línea (iniciar Baileys + generar QR) — solo si es del usuario
async function connect(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedLine(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Línea no encontrada' })

    const bm = req.app.get('baileysManager')
    if (!bm) { console.error('[wa_lines.connect] baileysManager NO disponible en req.app'); return res.status(503).json({ success: false, error: 'WhatsApp no inicializado' }) }
    // Pasar quién solicita: el QR se emite SOLO a este usuario (seguridad)
    await bm.connect(id, req.user.id)
    res.json({ success: true, message: 'Conectando... espera el QR' })
  } catch (err) {
    console.error('[wa_lines.connect] ERROR:', err && (err.stack || err.message || err))
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
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
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
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
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

module.exports = { getAll, getOne, create, update, remove, connect, disconnect, getQR }