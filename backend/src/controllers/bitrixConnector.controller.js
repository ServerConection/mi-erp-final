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
const pool = require('../config/db')
const bitrixApp = require('../services/bitrixApp.service')
const conector = require('../services/bitrixConnector.service')

const APP_TOKEN = process.env.BITRIX_APP_TOKEN || ''

/** Bitrix manda application_token en cada evento; sin él no se procesa nada. */
function tokenValido(req) {
  if (!APP_TOKEN) return false
  const t = req.body?.auth?.application_token || req.body?.application_token || ''
  return t === APP_TOKEN
}

// ── Instalación de la app local ─────────────────────────────────────────────
async function install(req, res) {
  try {
    const b = req.body || {}
    const auth = b.auth || b
    // TEMPORAL: para capturar el application_token una sola vez tras reinstalar.
    // Borrar esta linea despues de leerlo en los logs y guardarlo en BITRIX_APP_TOKEN.
    console.log('[WABOT-BITRIX] application_token recibido:', b.auth?.application_token || b.application_token || '(no vino ninguno)')
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
    console.warn('[WABOT-BITRIX] evento con application_token inválido, descartado:', evento)
    return res.status(401).json({ ok: false })
  }
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

module.exports = { install, settings, events, registrarConector, listarCanales, activarCanal, estado }
