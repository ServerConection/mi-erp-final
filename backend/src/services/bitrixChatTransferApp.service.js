/**
 * OAuth de la app local "Chat Transfer Bot" — AISLADA de WABOT-BITRIX
 * ---------------------------------------------------------------------------
 * Copia adaptada de bitrixApp.service.js, a propósito NO comparte código ni
 * tabla con ese archivo: WABOT-BITRIX es un desarrollo aparte que no se debe
 * tocar ni reusar (instrucción explícita de Bryan).
 *
 * Por qué hace falta una app local (y no alcanza con el webhook de siempre):
 * los métodos imbot.* e imopenlines.bot.* exigen "contexto de aplicación"
 * (devuelven ACCESS_DENIED / "Client ID not specified" por webhook simple).
 * Ver bitrixChatTransfer.controller.js.
 *
 * Tokens en bitrix_chat_transfer_oauth_tokens (migración
 * bitrix_chat_transfer.sql), separada de bitrix_oauth_tokens (esa sí es de
 * WABOT-BITRIX, no tocar).
 */
const pool = require('../config/db')

const OAUTH_URL = 'https://oauth.bitrix.info/oauth/token/'
const MARGEN_SEG = 120

function crearBitrixChatTransferApp({ portalUrl, clientId, clientSecret }) {
  const PORTAL        = (portalUrl || '').replace(/\/+$/, '')
  const CLIENT_ID     = clientId || ''
  const CLIENT_SECRET = clientSecret || ''

  const configurado = () => !!(PORTAL && CLIENT_ID && CLIENT_SECRET)

  async function guardarTokens(t) {
    const expiraEn = Number(t.expires_in || 3600)
    await pool.query(
      `INSERT INTO bitrix_chat_transfer_oauth_tokens (portal, access_token, refresh_token, expires_at, member_id, scope, updated_at)
       VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval, $5, $6, NOW())
       ON CONFLICT (portal) DO UPDATE
         SET access_token  = EXCLUDED.access_token,
             refresh_token = EXCLUDED.refresh_token,
             expires_at    = EXCLUDED.expires_at,
             member_id     = COALESCE(EXCLUDED.member_id, bitrix_chat_transfer_oauth_tokens.member_id),
             scope         = COALESCE(EXCLUDED.scope, bitrix_chat_transfer_oauth_tokens.scope),
             updated_at    = NOW()`,
      [PORTAL, t.access_token, t.refresh_token, String(expiraEn), t.member_id || null, t.scope || null]
    )
  }

  async function leerTokens() {
    const r = await pool.query('SELECT * FROM bitrix_chat_transfer_oauth_tokens WHERE portal = $1', [PORTAL])
    return r.rows[0] || null
  }

  async function refrescar() {
    const fila = await leerTokens()
    if (!fila) throw new Error('BITRIX_CT_OAUTH_SIN_INSTALAR: la app local Chat Transfer Bot todavía no se instaló en el portal')

    const qs = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: fila.refresh_token,
    })
    const res = await fetch(`${OAUTH_URL}?${qs}`)
    const json = await res.json()
    if (json.error) {
      throw new Error(`BITRIX_CT_OAUTH_REFRESH_FALLO: ${json.error_description || json.error} — hay que reinstalar la app local en Bitrix`)
    }
    await guardarTokens(json)
    return json.access_token
  }

  async function tokenVigente() {
    const fila = await leerTokens()
    if (!fila) throw new Error('BITRIX_CT_OAUTH_SIN_INSTALAR: la app local Chat Transfer Bot todavía no se instaló en el portal')
    const venceEn = (new Date(fila.expires_at).getTime() - Date.now()) / 1000
    if (venceEn > MARGEN_SEG) return fila.access_token
    return refrescar()
  }

  async function llamar(metodo, params = {}, { _reintento = false } = {}) {
    if (!configurado()) {
      throw new Error('BITRIX_CT_APP_NO_CONFIGURADA: faltan BITRIX_CT_PORTAL_URL, BITRIX_CT_CLIENT_ID o BITRIX_CT_CLIENT_SECRET')
    }
    const auth = await tokenVigente()
    const controlador = new AbortController()
    const t = setTimeout(() => controlador.abort(), 25000)
    try {
      const res = await fetch(`${PORTAL}/rest/${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, auth }),
        signal: controlador.signal,
      })
      const json = await res.json()
      if (json.error) {
        const cod = String(json.error).toLowerCase()
        if (!_reintento && (cod === 'expired_token' || cod === 'invalid_token')) {
          await refrescar()
          return llamar(metodo, params, { _reintento: true })
        }
        throw new Error(`Bitrix [${metodo}]: ${json.error_description || json.error}`)
      }
      return json.result
    } finally {
      clearTimeout(t)
    }
  }

  return { llamar, guardarTokens, leerTokens, refrescar, tokenVigente, configurado, PORTAL }
}

// ── Instancia lista para usar (Chat Transfer Bot, portal Novonet) ─────────
const chatTransferApp = crearBitrixChatTransferApp({
  portalUrl: process.env.BITRIX_CT_PORTAL_URL,
  clientId: process.env.BITRIX_CT_CLIENT_ID,
  clientSecret: process.env.BITRIX_CT_CLIENT_SECRET,
})

module.exports = { crearBitrixChatTransferApp, ...chatTransferApp }
