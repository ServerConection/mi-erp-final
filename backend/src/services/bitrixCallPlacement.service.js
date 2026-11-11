const crypto = require('crypto')

function validId(value) {
  const id = String(value || '').trim()
  return /^[1-9]\d{0,14}$/.test(id) ? id : ''
}

function extractDealId(body = {}) {
  try {
    const options = typeof body.PLACEMENT_OPTIONS === 'string'
      ? JSON.parse(body.PLACEMENT_OPTIONS)
      : (body.PLACEMENT_OPTIONS || {})
    return validId(options.ID || options.ENTITY_ID || options.entityId || body.ENTITY_ID)
  } catch (_) {
    return ''
  }
}

function encryptionKey(secret) {
  if (String(secret || '').length < 32) throw new Error('BITRIX_CALL_ACTION_SECRET debe tener al menos 32 caracteres')
  return crypto.createHash('sha256').update(String(secret)).digest()
}

function createCallActionToken({ dealId, userId, erpUserId, authId }, secret, options = {}) {
  const cleanDealId = validId(dealId)
  const cleanUserId = validId(userId)
  const cleanErpUserId = validId(erpUserId)
  if (!cleanDealId || !cleanUserId || !cleanErpUserId || !authId) throw new Error('Datos de llamada inválidos')
  const now = options.now ?? Date.now()
  const payload = JSON.stringify({
    dealId: cleanDealId,
    userId: cleanUserId,
    erpUserId: cleanErpUserId,
    authId: String(authId),
    exp: now + (options.ttlMs ?? 60_000),
    nonce: options.nonce || crypto.randomBytes(16).toString('hex'),
  })
  const iv = options.iv || crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  return [iv.toString('base64url'), encrypted.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.')
}

function verifyCallActionToken(token, secret, options = {}) {
  try {
    if (String(token || '').length > 4096) throw new Error('invalid')
    const parts = String(token || '').split('.')
    if (parts.length !== 3) throw new Error('invalid')
    const [ivText, encryptedText, tagText] = parts
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(ivText, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
    const plain = Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8')
    const payload = JSON.parse(plain)
    if (!validId(payload.dealId) || !validId(payload.userId) || !validId(payload.erpUserId) || !payload.authId || !payload.nonce) throw new Error('invalid')
    if (Number(payload.exp) < (options.now ?? Date.now())) throw new Error('expired')
    return payload
  } catch (error) {
    if (error.message === 'expired') throw new Error('La confirmación de llamada expiró')
    if (error.message?.startsWith('BITRIX_CALL_ACTION_SECRET')) throw error
    throw new Error('Acción de llamada inválida')
  }
}

function normalizePhoneEC(raw) {
  let digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `593${digits.slice(1)}`
  else if (!digits.startsWith('593') && digits.length <= 10) digits = `593${digits}`
  return /^593\d{8,9}$/.test(digits) ? digits : ''
}

function firstValidPhone(entries) {
  for (const entry of entries || []) {
    const phone = normalizePhoneEC(entry?.VALUE)
    if (phone) return phone
  }
  return ''
}

// Celular Ecuador (5939XXXXXXXX / 09XXXXXXXX) escrito en texto libre, p. ej. el título del deal.
function phoneFromText(text) {
  const match = String(text || '').match(/(?:\+?593|0)9\d{8}(?!\d)/)
  return match ? normalizePhoneEC(match[0]) : ''
}

// Respaldo: deals creados por API sin contacto/teléfono traen el número en el título o en campos UF_.
function phoneFromDeal(deal) {
  const fromTitle = phoneFromText(deal?.TITLE)
  if (fromTitle) return fromTitle
  for (const [key, value] of Object.entries(deal || {})) {
    if (!key.startsWith('UF_') || value == null) continue
    const values = Array.isArray(value) ? value : [value]
    for (const item of values) {
      const phone = typeof item === 'object' ? normalizePhoneEC(item?.VALUE) : phoneFromText(item)
      if (phone) return phone
    }
  }
  return ''
}

async function resolveDealPhone(bitrixApp, authId, dealId) {
  const cleanDealId = validId(dealId)
  if (!cleanDealId || !authId) throw new Error('ID de negociación inválido')
  const deal = await bitrixApp.llamarConAuthId('crm.deal.get', { id: cleanDealId }, authId)
  if (!deal?.ID) throw new Error('Negociación no encontrada o sin acceso en Bitrix')

  let phone = ''
  let contactName = deal.TITLE || `Negociación #${cleanDealId}`
  // Sin permiso sobre contactos, Bitrix devuelve al asesor el deal sin CONTACT_ID/COMPANY_ID.
  // Ya validado el acceso al deal, se releen los vínculos con el token de la app.
  if (!validId(deal.CONTACT_ID) && !validId(deal.COMPANY_ID)) {
    const appDeal = await bitrixApp.llamar('crm.deal.get', { id: cleanDealId })
    if (appDeal) {
      deal.CONTACT_ID = appDeal.CONTACT_ID
      deal.COMPANY_ID = appDeal.COMPANY_ID
    }
  }
  if (validId(deal.CONTACT_ID)) {
    // El deal ya se validó con el AUTH_ID del asesor (arriba). El teléfono se lee con el
    // token de la app porque los asesores no tienen permiso para ver contactos en Bitrix.
    // El número nunca se devuelve al asesor: solo viaja al automarcador.
    const contact = await bitrixApp.llamar('crm.contact.get', { id: String(deal.CONTACT_ID) })
    phone = firstValidPhone(contact?.PHONE)
    const name = [contact?.NAME, contact?.LAST_NAME].filter(Boolean).join(' ').trim()
    if (name) contactName = name
  }
  if (!phone && validId(deal.COMPANY_ID)) {
    const company = await bitrixApp.llamar('crm.company.get', { id: String(deal.COMPANY_ID) })
    phone = firstValidPhone(company?.PHONE)
    if (company?.TITLE) contactName = company.TITLE
  }
  if (!phone) phone = phoneFromDeal(deal)
  if (!phone) throw new Error('La negociación no tiene un teléfono válido asociado')
  return { phone, contactName, dealTitle: deal.TITLE || null }
}

async function consumeCallNonce(pool, nonce, erpUserId) {
  const result = await pool.query(
    `UPDATE bitrix_sso_codes SET used = true
      WHERE code = $1 AND usuario_id = $2 AND used = false AND expires_at > NOW()
      RETURNING usuario_id`,
    [`call:${nonce}`, String(erpUserId)],
  )
  return result.rows.length === 1
}

async function queueAutomarcadorDirectCall(fetchImpl, {
  baseUrl, apiKey, userId, phone, dealId, contactName,
}) {
  const urlBase = String(baseUrl || '').replace(/\/+$/, '')
  if (!urlBase || !apiKey) throw new Error('Automarcador no configurado')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetchImpl(`${urlBase}/api/direct-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-automarcador-key': apiKey },
      body: JSON.stringify({ userId, phone, dealId, contactName }),
      signal: controller.signal,
    })
    let body = {}
    try { body = await response.json() } catch (_) { /* respuesta inválida */ }
    if (!response.ok || !body.success || !body.campaignId) {
      const safeMessage = String(body.error || 'El automarcador no aceptó la llamada').slice(0, 240)
      const error = new Error(safeMessage)
      error.code = body.code || 'AUTOMARCADOR_REJECTED'
      error.statusCode = response.status
      throw error
    }
    return { campaignId: body.campaignId }
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = {
  extractDealId,
  createCallActionToken,
  verifyCallActionToken,
  normalizePhoneEC,
  resolveDealPhone,
  consumeCallNonce,
  queueAutomarcadorDirectCall,
}

