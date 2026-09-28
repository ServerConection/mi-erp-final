const crypto = require('crypto')
const {
  extractDealId,
  createCallActionToken,
  verifyCallActionToken,
  resolveDealPhone,
  consumeCallNonce,
  queueAutomarcadorDirectCall,
} = require('../services/bitrixCallPlacement.service')

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function page(content) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#263238;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{min-height:250px;display:flex;align-items:center;justify-content:center;padding:28px}.card{width:min(520px,100%);background:#fff;border:1px solid #dfe6ec;border-radius:16px;padding:28px;text-align:center;box-shadow:0 8px 24px rgba(38,50,56,.08)}
.icon{width:58px;height:58px;border-radius:50%;margin:0 auto 14px;display:grid;place-items:center;background:#e8f5ff;color:#1687d9;font-size:27px}h1{font-size:21px;margin:0 0 8px}p{margin:7px 0;color:#607d8b}.deal{font-weight:700;color:#263238}.actions{display:flex;gap:10px;justify-content:center;margin-top:22px}button{border:0;border-radius:9px;padding:11px 20px;font-size:14px;font-weight:700;cursor:pointer}.primary{background:#1687d9;color:#fff}.secondary{background:#eef2f5;color:#52636f}.error{color:#c62828}.success{color:#15803d}
</style></head><body><div class="wrap"><div class="card">${content}</div></div></body></html>`
}

function renderCallConfirmation({ dealId, dealTitle, actionToken, actionPath = './placement-call/start' }) {
  return page(`<div class="icon">☎</div><h1>¿Deseas iniciar la llamada?</h1>
<p class="deal">Negociación #${escapeHtml(dealId)}</p>
<p>${escapeHtml(dealTitle || 'Cliente de Bitrix')}</p>
<p>El número se procesará de forma privada y no será mostrado.</p>
<form method="post" action="${escapeHtml(actionPath)}"><input type="hidden" name="action_token" value="${escapeHtml(actionToken)}">
<div class="actions"><button class="primary" type="submit">Iniciar llamada</button><button class="secondary" type="button" onclick="history.back()">Cancelar</button></div></form>`)
}

function renderResult({ success, title, message }) {
  return page(`<div class="icon">${success ? '✓' : '!'}</div><h1 class="${success ? 'success' : 'error'}">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`)
}

function createBitrixCallPlacementController({
  bitrixApp,
  pool,
  actionSecret,
  automarcadorUrl,
  automarcadorApiKey,
  fetchImpl = fetch,
  now = () => Date.now(),
}) {
  function setPrivateEmbedHeaders(res) {
    res.set('Content-Type', 'text/html; charset=utf-8')
    res.set('Cache-Control', 'no-store')
    res.set('Referrer-Policy', 'no-referrer')
    let portalOrigin = ''
    try { portalOrigin = new URL(bitrixApp.PORTAL).origin } catch (_) { /* config error handled by the request */ }
    res.set('Content-Security-Policy', `frame-ancestors 'self' ${portalOrigin || "'none'"}`)
  }

  async function placementCall(req, res) {
    setPrivateEmbedHeaders(res)
    try {
      const body = req.body && Object.keys(req.body).length ? req.body : (req.query || {})
      const dealId = extractDealId(body)
      const authId = body.AUTH_ID || body.auth_id
      if (!dealId || !authId) return res.status(400).send(renderResult({ success: false, title: 'No se pudo preparar la llamada', message: 'Bitrix no envió una negociación o sesión válida.' }))

      const user = await bitrixApp.usuarioActualPorAuthId(authId)
      const userId = String(user?.ID || '').trim()
      const email = String(user?.EMAIL || '').trim().toLowerCase()
      if (!email) throw new Error('El usuario de Bitrix no tiene correo')
      const erpUser = await pool.query(
        `SELECT id FROM usuarios WHERE LOWER(correo) = $1 AND activo = 'SI' LIMIT 1`,
        [email],
      )
      if (erpUser.rows.length !== 1) throw new Error('El asesor no tiene un usuario ERP activo')

      // Consultar con AUTH_ID obliga a Bitrix a validar que este asesor pueda ver el deal.
      const deal = await bitrixApp.llamarConAuthId('crm.deal.get', { id: dealId }, authId)
      const nonce = crypto.randomBytes(16).toString('hex')
      const erpUserId = String(erpUser.rows[0].id)
      await pool.query(
        `INSERT INTO bitrix_sso_codes (code, usuario_id, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '60 seconds')`,
        [`call:${nonce}`, erpUserId],
      )
      const actionToken = createCallActionToken(
        { dealId, userId, erpUserId, authId },
        actionSecret,
        { now: now(), nonce },
      )
      return res.send(renderCallConfirmation({ dealId, dealTitle: deal?.TITLE, actionToken }))
    } catch (error) {
      console.error('[BITRIX-CALL] No se pudo preparar la llamada:', error.message)
      return res.status(500).send(renderResult({ success: false, title: 'No se pudo preparar la llamada', message: 'Intenta nuevamente desde la negociación.' }))
    }
  }

  async function startCall(req, res) {
    setPrivateEmbedHeaders(res)
    if (String(req.body?.action_token || '').length > 4096) {
      return res.status(400).send(renderResult({ success: false, title: 'Confirmación inválida', message: 'Vuelve a abrir LLAMAR e intenta nuevamente.' }))
    }
    try {
      const payload = verifyCallActionToken(req.body?.action_token, actionSecret, { now: now() })
      const firstUse = await consumeCallNonce(pool, payload.nonce, payload.erpUserId)
      if (!firstUse) return res.status(409).send(renderResult({ success: false, title: 'Confirmación utilizada', message: 'Vuelve a abrir LLAMAR para solicitar una nueva llamada.' }))

      const contact = await resolveDealPhone(bitrixApp, payload.authId, payload.dealId)
      await queueAutomarcadorDirectCall(fetchImpl, {
        baseUrl: automarcadorUrl,
        apiKey: automarcadorApiKey,
        userId: payload.userId,
        phone: contact.phone,
        dealId: payload.dealId,
        contactName: contact.contactName,
      })
      return res.status(202).send(renderResult({ success: true, title: 'Llamada enviada', message: 'El automarcador está iniciando la llamada con tu usuario.' }))
    } catch (error) {
      const clientError = /inválida|expiró|sin acceso|no tiene un teléfono|asesor|automarcador|disponible|conectado|autorizado/i.test(error.message)
      console.error('[BITRIX-CALL] No se pudo iniciar la llamada. error=%s', error.message)
      return res.status(clientError ? 400 : 500).send(renderResult({
        success: false,
        title: 'No se pudo iniciar la llamada',
        message: clientError ? error.message : 'El automarcador no está disponible. Vuelve a abrir LLAMAR e intenta nuevamente.',
      }))
    }
  }

  return { placementCall, startCall }
}

module.exports = { escapeHtml, renderCallConfirmation, renderResult, createBitrixCallPlacementController }


