/**
 * Chat Transfer Bot — endpoints públicos que consume Bitrix24
 * ---------------------------------------------------------------------------
 *  ANY .../bitrix_chat_transfer_install.php  Bitrix llama acá al instalar la
 *                                             app local. Trae los tokens OAuth.
 *  ANY .../bitrix_chat_transfer_events.php   Bitrix manda acá los eventos del
 *                                             bot (framework imbot). No hace
 *                                             falta procesarlos: este bot solo
 *                                             se usa para transferir chats
 *                                             (imopenlines.bot.session.transfer),
 *                                             no conversa con nadie. Solo
 *                                             confirma 200 OK.
 *
 * Aislado a propósito de bitrixConnector.controller.js (WABOT-BITRIX): no se
 * debe tocar ni reusar esa app/bot.
 */
const bitrixChatTransferApp = require('../services/bitrixChatTransferApp.service')

async function install(req, res) {
  try {
    const b = req.body || {}
    const auth = b.auth || b
    if (!auth.access_token || !auth.refresh_token) {
      return res.status(400).send('Faltan tokens en el callback de instalación')
    }
    await bitrixChatTransferApp.guardarTokens({
      access_token: auth.access_token,
      refresh_token: auth.refresh_token,
      expires_in: auth.expires_in || 3600,
      member_id: auth.member_id,
      scope: auth.scope,
    })
    console.log('[chat-transfer-bot] App local instalada; tokens OAuth guardados.')
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.send('<html><body style="font-family:system-ui;padding:24px">'
      + '<h3>Chat Transfer Bot instalado</h3>'
      + '<p>Los tokens quedaron guardados.</p>'
      + '</body></html>')
  } catch (e) {
    console.error('[chat-transfer-bot] install falló:', e.message)
    return res.status(500).send('Error en la instalación: ' + e.message)
  }
}

async function events(req, res) {
  // No procesamos mensajes: el bot solo existe como CLIENT_ID para las
  // transferencias. Basta con responder 200 para que Bitrix no reintente.
  return res.json({ ok: true })
}

module.exports = { install, events }
