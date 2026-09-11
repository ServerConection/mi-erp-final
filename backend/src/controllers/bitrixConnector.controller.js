/**
 * WABOT-BITRIX — endpoints públicos que consume Bitrix24
 * ---------------------------------------------------------------------------
 *  POST /api/bitrix-connector/install   Bitrix llama acá al instalar la app
 *                                       local. Trae los tokens OAuth.
 *  POST /api/bitrix-connector/events    Bitrix avisa acá cuando un asesor
 *                                       escribe desde el CRM -> va a WhatsApp.
 *  GET  /api/bitrix-connector/settings  Iframe de configuración (placement).
 *
 * Los tres son PÚBLICOS (sin verificarToken): los llama Bitrix, no el frontend.
 * La autenticidad se valida con application_token, que Bitrix manda en cada
 * request y es el único secreto compartido que tenemos con el portal.
 */
const crypto = require('crypto')
const pool = require('../config/db')
const bitrixApp = require('../services/bitrixApp.service')
const conector = require('../services/bitrixConnector.service')

const APP_TOKEN = process.env.BITRIX_APP_TOKEN || ''

/** Bitrix manda application_token en cada evento; sin él no se procesa nada. */
function tokenValido(req) {
  if (!APP_TOKEN) return false
  const b = req.body || {}
  const t = b.auth?.application_token || b.application_token || b.APPLICATION_TOKEN || ''
  return t === APP_TOKEN
}

// ── Instalación de la app local ─────────────────────────────────────────────
async function install(req, res) {
  try {
    const b = req.body || {}
    const auth = b.auth || b
    if (!auth.access_token || !auth.refresh_token) {
      return res.status(400).send('Faltan tokens en el callback de instalación')
    }
    await bitrixApp.guardarTokens({
      access_token: auth.access_token,
      refresh_token: auth.refresh_token,
      expires_in: auth.expires_in || 3600,
      member_id: auth.member_id,
      scope: auth.scope,
    })
    console.log('[WABOT-BITRIX] App local instalada; tokens OAuth guardados.')
    // Bitrix espera HTML: este iframe es lo que ve el admin al instalar.
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.send('<html><body style="font-family:system-ui;padding:24px">'
      + '<h3>WABOT-BITRIX instalado</h3>'
      + '<p>Los tokens quedaron guardados. Ahora registra el conector desde el ERP.</p>'
      + '</body></html>')
  } catch (e) {
    console.error('[WABOT-BITRIX] install falló:', e.message)
    return res.status(500).send('Error en la instalación: ' + e.message)
  }
}

const FRONTEND_URL = (process.env.ERP_FRONTEND_URL || 'https://erp-frontend-v1.onrender.com').replace(/\/+$/, '')

function paginaRedirect(destino) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#fff">
<script>window.location.replace(${JSON.stringify(destino)});</script>
<noscript><a href="${destino}">Abrir WABOT Inbox</a></noscript>
</body></html>`
}

// ── Placement embebido (pestaña "WABOT" en el Deal) ─────────────────────────
// Bitrix abre los placements con POST, y el frontend (sitio estático) no
// sabe responder POST -> devuelve vacío y la pestaña sale en blanco. Esta
// ruta sí responde (GET y POST).
//
// Además hace el SSO: Bitrix manda AUTH_ID (la sesión del asesor que abrió
// la pestaña) y DOMAIN. Con eso se le pregunta A BITRIX quién es de verdad
// (user.current) — nunca se confía en un email o id que venga del cliente.
// Si el correo de Bitrix coincide con un usuario ACTIVO del ERP, se emite un
// código de un solo uso (60s de vida) y se redirige al embed del frontend
// con ese código — jamás con el JWT real en la URL. Si algo falla o no
// coincide, cae de forma segura al login manual normal.
async function placementInbox(req, res) {
  res.set('Content-Type', 'text/html; charset=utf-8')
  const irALoginManual = () => res.send(paginaRedirect(`${FRONTEND_URL}/whatsapp/inbox`))

  try {
    const b = (req.body && Object.keys(req.body).length) ? req.body : (req.query || {})
    const authId = b.AUTH_ID || b.auth_id
    const domain = b.DOMAIN || b.domain

    if (!authId || !domain) return irALoginManual()

    // 1) Confirmar identidad real contra Bitrix (nunca confiar en el cliente)
    const usuarioBitrix = await bitrixApp.usuarioActualPorAuthId(domain, authId)
    const email = String(usuarioBitrix.EMAIL || '').trim().toLowerCase()
    if (!email) { console.warn('[WABOT-BITRIX] SSO: user.current sin EMAIL'); return irALoginManual() }

    // 2) Ese correo debe pertenecer a un usuario del ERP, activo
    const r = await pool.query(
      `SELECT id FROM usuarios WHERE LOWER(correo) = $1 AND activo = 'SI' LIMIT 1`,
      [email]
    )
    if (r.rows.length === 0) {
      console.warn('[WABOT-BITRIX] SSO: sin usuario ERP activo para ese correo de Bitrix')
      return irALoginManual()
    }
    const usuarioId = r.rows[0].id

    // 3) Código de un solo uso, vida corta: el frontend lo canjea por el JWT
    //    real en /api/auth/bitrix-exchange. El JWT nunca viaja en la URL.
    const code = crypto.randomBytes(32).toString('hex')
    await pool.query(
      `INSERT INTO bitrix_sso_codes (code, usuario_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '60 seconds')`,
      [code, usuarioId]
    )

    return res.send(paginaRedirect(`${FRONTEND_URL}/embed/inbox?code=${code}`))
  } catch (e) {
    console.error('[WABOT-BITRIX] placementInbox SSO falló, cae a login manual:', e.message)
    return irALoginManual()
  }
}

// ── Iframe de configuración del conector ────────────────────────────────────
async function settings(req, res) {
  res.set('Content-Type', 'text/html; charset=utf-8')
  return res.send('<html><body style="font-family:system-ui;padding:24px">'
    + '<h3>WABOT-BITRIX</h3><p>Las líneas de WhatsApp se administran desde el ERP, en el módulo WhatsApp.</p>'
    + '</body></html>')
}

// ── Eventos de Bitrix (mensaje saliente del asesor) ─────────────────────────
async function events(req, res) {
  // Se responde 200 SIEMPRE y lo antes posible: Bitrix reintenta ante un no-200
  // y un reintento acá significa mandarle el mensaje dos veces al cliente.
  // El trabajo real va después de responder.
  const b = req.body || {}
  const evento = b.event || ''
  if (!tokenValido(req)) {
    console.warn('[WABOT-BITRIX] evento con application_token invalido, descartado:', evento)
    return res.status(401).json({ ok: false })
  }

  // Bitrix llama a esta MISMA ruta cuando alguien ABRE la app desde el menu:
  // no trae 'event', trae AUTH_ID/REFRESH_ID sueltos (son el access/refresh
  // token). Se aprovecha para guardar o refrescar los tokens OAuth cada vez
  // que alguien abre la app, sin depender de que el install inicial funcionara.
  if (!evento && b.AUTH_ID && b.REFRESH_ID) {
    try {
      await bitrixApp.guardarTokens({
        access_token: b.AUTH_ID,
        refresh_token: b.REFRESH_ID,
        expires_in: b.AUTH_EXPIRES || 3600,
        member_id: b.member_id,
        scope: b.APPLICATION_SCOPE,
      })
      console.log('[WABOT-BITRIX] Tokens OAuth guardados/refrescados desde la apertura de la app.')
    } catch (e) {
      console.error('[WABOT-BITRIX] no se pudo guardar tokens al abrir la app:', e.message)
    }
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.send('<html><body style="font-family:system-ui;padding:24px">'
      + '<h3>WABOT-BITRIX</h3><p>La app esta activa. Las lineas de WhatsApp se administran desde el ERP.</p>'
      + '</body></html>')
  }

  // Se responde 200 SIEMPRE y lo antes posible: Bitrix reintenta ante un no-200
  // y un reintento acá significa mandarle el mensaje dos veces al cliente.
  // El trabajo real va después de responder.
  res.json({ ok: true })

  try {
    if (evento === 'ONIMCONNECTORMESSAGEADD') {
      await _procesarSaliente(b, req.app.get('baileysManager'))
    } else if (evento === 'ONAPPUNINSTALL') {
      await pool.query('DELETE FROM bitrix_oauth_tokens WHERE portal = $1', [bitrixApp.PORTAL])
      console.warn('[WABOT-BITRIX] la app fue desinstalada del portal; tokens borrados.')
    }
  } catch (e) {
    console.error(`[WABOT-BITRIX] error procesando ${evento}:`, e.message)
  }
}

/**
 * Un asesor escribió desde el CRM -> hay que mandarlo por WhatsApp.
 * chat.id viene como `${lineId}:${waNumber}`, que es como lo armamos al
 * empujar el mensaje entrante en bitrixConnector.service.
 */
async function _procesarSaliente(body, manager) {
  const data = body.data || {}
  const mensajes = data.MESSAGES || data.messages || []

  for (const m of mensajes) {
    const chatId = String(m.chat?.id || '')
    const texto  = m.message?.text || ''
    const sep = chatId.indexOf(':')
    if (sep < 0) { console.warn('[WABOT-BITRIX] chat.id con formato inesperado:', chatId); continue }

    const lineId   = chatId.slice(0, sep)
    const waNumber = chatId.slice(sep + 1)
    if (!texto.trim()) continue

    if (!manager) { console.error('[WABOT-BITRIX] BaileysManager no disponible; mensaje no enviado'); continue }
    try {
      await manager.sendText(lineId, waNumber, texto)
      const linea = await pool.query('SELECT open_line_id FROM lines WHERE id = $1', [lineId])
      const openLineId = linea.rows[0]?.open_line_id
      if (openLineId && m.im?.message_id) {
        await conector.marcarEntregado({ openLineId, chatId, bitrixMsgIds: [m.im.message_id] })
      }
    } catch (e) {
      console.error(`[WABOT-BITRIX] no se pudo enviar a ${waNumber} por la línea ${lineId}:`, e.message)
    }
  }
}

// ── Administración (sí llevan verificarToken en las rutas) ──────────────────
async function registrarConector(req, res) {
  try { return res.json({ success: true, data: await conector.registrar() }) }
  catch (e) { return res.status(500).json({ success: false, message: e.message }) }
}

async function listarCanales(req, res) {
  try { return res.json({ success: true, canales: await conector.listarCanales() }) }
  catch (e) { return res.status(500).json({ success: false, message: e.message }) }
}

async function activarCanal(req, res) {
  try {
    const openLineId = Number(req.body.open_line_id)
    if (!openLineId) return res.status(400).json({ success: false, message: 'Falta open_line_id' })
    await conector.activar(openLineId, true)
    await conector.fijarDatos(openLineId)
    return res.json({ success: true })
  } catch (e) { return res.status(500).json({ success: false, message: e.message }) }
}

async function estado(req, res) {
  try {
    const tokens = await bitrixApp.leerTokens()
    return res.json({
      success: true,
      configurada: bitrixApp.configurado(),
      instalada: !!tokens,
      portal: bitrixApp.PORTAL || null,
      conector: conector.CONNECTOR_ID,
      token_vence: tokens?.expires_at || null,
    })
  } catch (e) { return res.status(500).json({ success: false, message: e.message }) }
}

module.exports = { install, settings, events, placementInbox, registrarConector, listarCanales, activarCanal, estado }
