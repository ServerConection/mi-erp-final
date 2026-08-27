const { query } = require('../config/db')

// Helpers de perfil
// Perfiles "gerenciales" ven todas las líneas/chats de SU empresa (no de otras).
// Solo ADMINISTRADOR ve todo, sin restricción de empresa.
const PERFILES_GERENCIALES = ['SUPERVISOR', 'GERENCIA', 'ANALISTA']
const isAdmin = (req) => (req.user?.perfil || '').toUpperCase() === 'ADMINISTRADOR'
const isSupervisor = (req) => PERFILES_GERENCIALES.includes((req.user?.perfil || '').toUpperCase())

// SEGURIDAD: proxy_config guarda usuario y contraseña del proveedor de proxies.
// La API nunca debe devolver esa contraseña (cualquiera con acceso al inbox
// podría leerla desde la consola del navegador y gastar el saldo contratado).
// Se enmascara siempre; el frontend solo necesita saber si hay proxy o no.
function sanitizarLinea(line) {
  const cfg = (line && line.proxy_config) || {}
  const tieneProxy = !!cfg.host
  return {
    ...line,
    proxy_config: tieneProxy
      ? {
          protocol: cfg.protocol || 'http',
          host: cfg.host,
          port: cfg.port,
          username: cfg.username || '',
          password: cfg.password ? '********' : '',
        }
      : {},
    proxy_configured: tieneProxy,
  }
}

// Verifica que la línea exista y que el usuario pueda verla según su perfil.
// ADMIN: todo · SUPERVISOR: líneas de su empresa · ASESOR: solo las suyas (o huérfanas).
async function findOwnedLine(req, id) {
  const result = await query(
    `SELECT l.*, u.empresa AS owner_empresa
     FROM lines l LEFT JOIN usuarios u ON l.created_by = u.id
     WHERE l.id=$1 AND l.deleted_at IS NULL`,
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
    // Las líneas dadas de baja (deleted_at) nunca se listan, pero su fila se
    // conserva para no perder el historial de chats asociado.
    const conds = ['l.deleted_at IS NULL']
    if (isSupervisor(req)) {
      params.push((req.user.empresa || '').toUpperCase())
      conds.push(`l.created_by IN (SELECT id FROM usuarios WHERE UPPER(empresa) = $${params.length})`)
    } else if (!isAdmin(req)) {
      params.push(req.user.id)
      // Incluye también las líneas huérfanas (created_by IS NULL, de antes de la migración)
      conds.push(`(l.created_by = $${params.length} OR l.created_by IS NULL)`)
    }
    const where = `WHERE ${conds.join(' AND ')}`
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
    const lines = result.rows.map(line => sanitizarLinea({
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
      data: sanitizarLinea({
        ...line,
        rt_status: bm ? bm.getStatus(line.id) : 'disconnected',
        has_qr: bm ? !!bm.getQR(line.id) : false,
      }),
    })
  } catch (err) {
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

// Cupo de líneas por usuario (1 línea = 1 número por asesor).
// AJUSTE 2026-08-13 (a pedido de gerencia): los perfiles gerenciales
// (SUPERVISOR, GERENCIA, ANALISTA) ya NO están limitados a 1 línea — pueden
// crear las que necesiten, igual que ADMINISTRADOR. El límite de 1 se
// mantiene solo para el perfil ASESOR.
const MAX_LINEAS_POR_USUARIO = 1

// ── Proxy automático por línea ────────────────────────────────────────────
// DataImpulse asigna IP fija (sticky) según el PUERTO: 10000, 10001, 10002...
// Cada línea recibe un puerto propio → IP propia. Así un bloqueo en una línea
// no arrastra a las demás. Si no hay credenciales configuradas, no se asigna
// proxy y todo sigue funcionando igual que antes.
// La asignación de puertos/IPs vive en proxyPool.service (la comparten este
// controlador y BaileysManager: evita huecos, salta IPs quemadas y rota al
// re-vincular).
const { construirProxyAutomatico } = require('../services/proxyPool.service')

// Qué líneas reciben proxy automático, por su NOMBRE.
// Antes solo las de envío masivo (ENVIO_1, ENVIO_2, ...); las líneas de
// asesores salían directo por la IP del servidor y terminaron bloqueadas
// igual. Por eso ahora el valor por defecto es "todas las líneas".
// Se ajusta con PROXY_PATRON_LINEA (expresión regular) si se quiere volver a
// acotar. Ejemplos:
//   .                → todas las líneas                  (valor por defecto)
//   ^ENVIO           → solo las que empiezan con ENVIO
//   ^(ENVIO|PAUTA)   → las que empiezan con ENVIO o PAUTA
const PROXY_PATRON_LINEA = process.env.PROXY_PATRON_LINEA || '.'

// Si al crear/reactivar una línea que debería llevar proxy no se puede
// asignar uno (sin credenciales o pool agotado), por defecto se BLOQUEA la
// creación en vez de dejar el número expuesto por la IP del servidor.
// Se puede desactivar con WA_PROXY_REQUIRED_ON_CREATE=false.
const PROXY_OBLIGATORIO_AL_CREAR = process.env.WA_PROXY_REQUIRED_ON_CREATE !== 'false'

function lineaLlevaProxy(nombre) {
  try {
    return new RegExp(PROXY_PATRON_LINEA, 'i').test(String(nombre || ''))
  } catch (e) {
    console.warn(`[wa_lines] PROXY_PATRON_LINEA inválido ("${PROXY_PATRON_LINEA}"):`, e.message)
    return false   // ante un patrón mal escrito, no asignar proxy
  }
}

// Crear nueva línea (queda asociada al usuario que la crea)
// ADMINISTRADOR: sin límite · Resto: solo si no tiene ninguna línea propia.
async function create(req, res) {
  try {
    if (!isAdmin(req) && !isSupervisor(req)) {
      const propias = await query(
        'SELECT COUNT(*)::int AS total FROM lines WHERE created_by = $1 AND deleted_at IS NULL',
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
    const nombre = String(name).trim()

    // El nombre de la línea es un PUESTO FIJO, no un número: "ENVIO_4" existe
    // siempre, aunque el número que tenga vinculado cambie. Si ya hay una línea
    // activa con ese nombre, no se duplica.
    const activa = await query(
      `SELECT id FROM lines WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL LIMIT 1`,
      [nombre]
    )
    if (activa.rows.length) {
      return res.status(409).json({
        success: false,
        error: `Ya existe una línea llamada "${nombre}". Si el número se bloqueó, no la elimines: entra a esa misma línea y dale "Conectar QR" para vincular el número nuevo.`,
      })
    }

    // Si existe una dada de baja con ese mismo nombre, se REACTIVA esa fila en
    // lugar de crear otra. Es clave: las campañas y el historial de chats
    // apuntan al id de la línea. Crear una fila nueva dejaría las campañas
    // amarradas a la vieja, fallando con "línea no conectada".
    const previa = await query(
      `SELECT * FROM lines WHERE LOWER(name) = LOWER($1) AND deleted_at IS NOT NULL
       ORDER BY updated_at DESC LIMIT 1`,
      [nombre]
    )

    // Proxy automático: solo si no mandaron uno explícito Y el nombre de la
    // línea coincide con el patrón configurado (por defecto, las ENVIO_*).
    let cfgProxy = proxy_config
    let usaProxy = proxy_enabled || false

    // Al reactivar se conserva la misma IP, salvo que haya sido retirada por un
    // bloqueo real de WhatsApp (403). Así no se gasta pool sin necesidad.
    if ((!cfgProxy || Object.keys(cfgProxy).length === 0) && previa.rows.length) {
      const anterior = previa.rows[0].proxy_config || {}
      if (anterior.host && anterior.port) {
        const quemada = await query(
          'SELECT 1 FROM proxy_puertos_quemados WHERE host = $1 AND puerto = $2',
          [anterior.host, parseInt(anterior.port, 10)]
        )
        if (!quemada.rows.length) {
          cfgProxy = anterior
          usaProxy = true
        } else {
          console.log(`[wa_lines] "${nombre}": su IP anterior (${anterior.port}) estaba retirada, se asignará otra`)
        }
      }
    }

    // Elección explícita del usuario de NO llevar proxy (proxy_enabled=false
    // enviado a propósito). Se respeta, pero queda registrado en el log.
    const proxyRechazadoExplicitamente = req.body.proxy_enabled === false

    if (!cfgProxy || Object.keys(cfgProxy).length === 0) {
      if (proxyRechazadoExplicitamente) {
        console.log(`[wa_lines] Línea "${nombre}" creada SIN proxy por elección explícita (proxy_enabled=false)`)
      } else if (lineaLlevaProxy(nombre)) {
        const auto = await construirProxyAutomatico()
        if (auto) {
          cfgProxy = auto
          usaProxy = true
          console.log(`[wa_lines] Línea "${nombre}" → proxy automático ${auto.host}:${auto.port}`)
        } else if (PROXY_OBLIGATORIO_AL_CREAR) {
          return res.status(409).json({
            success: false,
            error: 'No se pudo asignar un proxy a la línea (faltan credenciales PROXY_USER/PROXY_PASS o el pool de IPs está agotado). No se crea sin proxy para evitar que el número salga expuesto por la IP del servidor. Si de verdad quieres crearla sin proxy, envía proxy_enabled=false explícitamente.'
          })
        } else {
          console.log(`[wa_lines] Línea "${nombre}" coincide con el patrón pero no hay credenciales de proxy (PROXY_USER/PROXY_PASS)`)
        }
      } else {
        console.log(`[wa_lines] Línea "${nombre}" sin proxy (no coincide con ${PROXY_PATRON_LINEA})`)
      }
    }

    let result
    if (previa.rows.length) {
      result = await query(
        `UPDATE lines SET
           deleted_at = NULL,
           status = 'disconnected',
           bot_id = $1,
           proxy_enabled = $2,
           proxy_config = $3,
           updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [bot_id || previa.rows[0].bot_id || null, usaProxy, JSON.stringify(cfgProxy || {}), previa.rows[0].id]
      )
      console.log(`[wa_lines] Línea "${nombre}" reactivada (id ${previa.rows[0].id}) — campañas e historial intactos`)
    } else {
      result = await query(
        `INSERT INTO lines (name, bot_id, proxy_enabled, proxy_config, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [nombre, bot_id || null, usaProxy, JSON.stringify(cfgProxy || {}), req.user.id]
      )
    }
    res.status(201).json({ success: true, data: sanitizarLinea(result.rows[0]) })
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

// Eliminar línea — BAJA LÓGICA (no borra la fila).
// Cualquiera con acceso a la línea puede darla de baja: así el asesor libera su
// cupo y puede vincular otro número. NO se hace DELETE porque conversations y
// messages tienen ON DELETE CASCADE sobre lines: un borrado real destruiría
// todo el historial de chats de forma irreversible. Al conservar la fila (con
// su created_by), las conversaciones anteriores siguen visibles para el asesor.
async function remove(req, res) {
  try {
    const { id } = req.params
    const owned = await findOwnedLine(req, id)
    if (!owned) return res.status(404).json({ success: false, error: 'Línea no encontrada' })

    const bm = req.app.get('baileysManager')
    // Cierra el socket y borra las credenciales locales de WhatsApp para que el
    // número quede realmente desvinculado (y no reviva en el próximo arranque).
    try { if (bm) await bm.disconnect(id, { wipeAuth: true }) }
    catch (e) { console.warn('[wa_lines.remove] No se pudo desconectar limpio:', e.message) }

    // Dar de baja NO retira la IP: en esta operación el nombre es un puesto fijo
    // (ENVIO_4 se vuelve a crear con el mismo número o con otro), así que la
    // línea suele reactivarse y conviene que conserve su IP. Las IPs solo se
    // retiran cuando WhatsApp bloquea de verdad (código 403, en BaileysManager).

    await query(
      `UPDATE lines SET deleted_at = NOW(), status = 'deleted', updated_at = NOW() WHERE id = $1`,
      [id]
    )
    res.json({ success: true, message: 'Línea dada de baja. El historial de chats se conserva.' })
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

    // Si la línea todavía no tiene proxy (por ejemplo, va a reconectar por QR
    // porque se cayó la sesión), se le intenta asignar uno automático ANTES
    // de conectar. Así una reconexión masiva de asesores por QR también sale
    // protegida, no solo las líneas nuevas creadas desde hoy. A diferencia de
    // la creación, aquí NO se bloquea la conexión si no se puede asignar
    // proxy (sin credenciales o pool agotado): es preferible dejar reconectar
    // sin proxy a dejar a un asesor sin poder trabajar en medio de una
    // campaña, y WA_PROXY_REQUIRED sigue siendo el interruptor que decide si
    // eso alcanza para bloquear o no.
    if ((!owned.proxy_enabled || !owned.proxy_config?.host) && lineaLlevaProxy(owned.name)) {
      const auto = await construirProxyAutomatico()
      if (auto) {
        await query(
          `UPDATE lines SET proxy_enabled=true, proxy_config=$1, updated_at=NOW() WHERE id=$2`,
          [JSON.stringify(auto), id]
        )
        owned.proxy_enabled = true
        owned.proxy_config = auto
        console.log(`[wa_lines] Línea "${owned.name}" → proxy asignado al reconectar: ${auto.host}:${auto.port}`)
      } else {
        console.warn(`[wa_lines] Línea "${owned.name}" va a conectar SIN proxy (no se pudo asignar uno automático — revisa PROXY_USER/PROXY_PASS o el pool)`)
      }
    }

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

// ── DASHBOARD: quién tiene línea, cuántas y en qué estado ─────────────────
// Agrupa por empresa → asesor. ADMINISTRADOR ve todas las empresas;
// los perfiles gerenciales solo la suya. Un asesor solo se ve a sí mismo.
async function dashboard(req, res) {
  try {
    const params = []
    const conds = ['l.deleted_at IS NULL']

    if (!isAdmin(req)) {
      if (isSupervisor(req)) {
        params.push((req.user.empresa || '').toUpperCase())
        conds.push(`UPPER(u.empresa) = $${params.length}`)
      } else {
        params.push(req.user.id)
        conds.push(`l.created_by = $${params.length}`)
      }
    }

    const { rows } = await query(`
      SELECT l.id, l.name, l.phone_number, l.status, l.last_connected, l.created_at,
             l.created_by,
             COALESCE(UPPER(u.empresa), 'SIN EMPRESA') AS empresa,
             COALESCE(u.usuario, 'SIN ASIGNAR')        AS usuario,
             TRIM(COALESCE(u.nombres,'') || ' ' || COALESCE(u.apellidos,'')) AS nombre_completo
      FROM lines l
      LEFT JOIN usuarios u ON l.created_by = u.id
      WHERE ${conds.join(' AND ')}
      ORDER BY empresa ASC, usuario ASC, l.created_at ASC
    `, params)

    // Estado en vivo desde BaileysManager (más fiable que el guardado en BD)
    const bm = req.app.get('baileysManager')
    const lineas = rows.map(r => {
      const rt = bm ? bm.getStatus(r.id) : null
      // Si Baileys no tiene la línea en memoria devuelve 'disconnected'; en ese
      // caso conservamos el último estado conocido de BD (logged_out / error),
      // que es más informativo para saber por qué no está conectada.
      const estado = (rt && rt !== 'disconnected') ? rt : (r.status || 'disconnected')
      return { ...r, estado, conectada: estado === 'connected' }
    })

    // Agrupar: empresa → asesor → líneas
    const porEmpresa = {}
    for (const l of lineas) {
      if (!porEmpresa[l.empresa]) {
        porEmpresa[l.empresa] = { empresa: l.empresa, total: 0, conectadas: 0, asesores: {} }
      }
      const emp = porEmpresa[l.empresa]
      if (!emp.asesores[l.usuario]) {
        emp.asesores[l.usuario] = {
          usuario: l.usuario,
          nombre: l.nombre_completo || l.usuario,
          total: 0,
          conectadas: 0,
          lineas: [],
        }
      }
      const ase = emp.asesores[l.usuario]
      ase.lineas.push({
        id: l.id, name: l.name, phone_number: l.phone_number,
        estado: l.estado, last_connected: l.last_connected,
      })
      ase.total++;  emp.total++
      if (l.conectada) { ase.conectadas++; emp.conectadas++ }
    }

    const data = Object.values(porEmpresa).map(e => ({
      ...e,
      asesores: Object.values(e.asesores).sort((a, b) => a.usuario.localeCompare(b.usuario)),
    }))

    res.json({
      success: true,
      data,
      resumen: {
        empresas:   data.length,
        lineas:     lineas.length,
        conectadas: lineas.filter(l => l.conectada).length,
        asesores:   data.reduce((n, e) => n + e.asesores.length, 0),
      },
    })
  } catch (err) {
    console.error('[wa_lines.dashboard]', err.message)
    res.status(500).json({ success: false, error: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message) })
  }
}

module.exports = { getAll, getOne, create, update, remove, connect, disconnect, getQR, dashboard, lineaLlevaProxy }