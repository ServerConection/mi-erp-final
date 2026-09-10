/**
 * OAuth de la aplicación local de Bitrix24 (NOVONET)
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTE ARCHIVO SI YA LLAMAMOS A BITRIX EN OTRO LADO
 *
 * El resto del ERP habla con Bitrix por WEBHOOK entrante (BITRIX_NOVONET_URL).
 * Eso sirve para crm.deal.get, crm.contact.get y todo lo que ya funciona, y NO
 * hay que tocarlo.
 *
 * Pero los métodos imconnector.* NO aceptan webhook. La documentación es
 * explícita: "The method works only in the context of an application", y si
 * lo intentás por webhook devuelve WRONG_AUTH_TYPE / "Application context
 * required". Por eso hace falta una app local con OAuth, que es lo único que
 * este módulo maneja.
 *
 * Los tokens viven en la tabla bitrix_oauth_tokens, no en memoria: si se
 * reinicia el servicio (cada deploy de Render lo hace) el refresh_token tiene
 * que sobrevivir, si no hay que reinstalar la app a mano.
 */
const pool = require('../config/db')

const PORTAL        = (process.env.BITRIX_PORTAL_URL || '').replace(/\/+$/, '')
const CLIENT_ID     = process.env.BITRIX_APP_CLIENT_ID || ''
const CLIENT_SECRET = process.env.BITRIX_APP_CLIENT_SECRET || ''
const OAUTH_URL     = 'https://oauth.bitrix.info/oauth/token/'

// Margen para renovar antes de que venza de verdad: evita la carrera de que el
// token muera entre que lo leemos y que Bitrix procesa el request.
const MARGEN_SEG = 120

const configurado = () => !!(PORTAL && CLIENT_ID && CLIENT_SECRET)

/** Guarda el juego de tokens que devuelve Bitrix (instalación o refresh). */
async function guardarTokens(t) {
  const expiraEn = Number(t.expires_in || 3600)
  await pool.query(
    `INSERT INTO bitrix_oauth_tokens (portal, access_token, refresh_token, expires_at, member_id, scope, updated_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval, $5, $6, NOW())
     ON CONFLICT (portal) DO UPDATE
       SET access_token  = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           expires_at    = EXCLUDED.expires_at,
           member_id     = COALESCE(EXCLUDED.member_id, bitrix_oauth_tokens.member_id),
           scope         = COALESCE(EXCLUDED.scope, bitrix_oauth_tokens.scope),
           updated_at    = NOW()`,
    [PORTAL, t.access_token, t.refresh_token, String(expiraEn), t.member_id || null, t.scope || null]
  )
}

async function leerTokens() {
  const r = await pool.query('SELECT * FROM bitrix_oauth_tokens WHERE portal = $1', [PORTAL])
  return r.rows[0] || null
}

/** Renueva el access_token con el refresh_token. */
async function refrescar() {
  const fila = await leerTokens()
  if (!fila) throw new Error('BITRIX_OAUTH_SIN_INSTALAR: la app local todavía no se instaló en el portal')

  const qs = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: fila.refresh_token,
  })
  const res = await fetch(`${OAUTH_URL}?${qs}`)
  const json = await res.json()
  if (json.error) {
    // Si el refresh_token murió no hay recuperación automática: alguien tiene
    // que reinstalar la app en el portal. Se dice claro en vez de reintentar.
    throw new Error(`BITRIX_OAUTH_REFRESH_FALLO: ${json.error_description || json.error} — hay que reinstalar la app local en Bitrix`)
  }
  await guardarTokens(json)
  return json.access_token
}

/** Devuelve un access_token vigente, renovando si está por vencer. */
async function tokenVigente() {
  const fila = await leerTokens()
  if (!fila) throw new Error('BITRIX_OAUTH_SIN_INSTALAR: la app local todavía no se instaló en el portal')
  const venceEn = (new Date(fila.expires_at).getTime() - Date.now()) / 1000
  if (venceEn > MARGEN_SEG) return fila.access_token
  return refrescar()
}

/**
 * Llama a un método REST de Bitrix con OAuth.
 * Si el token venció igual (reloj corrido, refresh en paralelo), reintenta UNA
 * vez con token nuevo. No más: un bucle de reintentos contra un token muerto
 * solo consume rate limit.
 */
async function llamar(metodo, params = {}, { _reintento = false } = {}) {
  if (!configurado()) {
    throw new Error('BITRIX_APP_NO_CONFIGURADA: faltan BITRIX_PORTAL_URL, BITRIX_APP_CLIENT_ID o BITRIX_APP_CLIENT_SECRET')
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

module.exports = { llamar, guardarTokens, leerTokens, refrescar, tokenVigente, configurado, PORTAL }
