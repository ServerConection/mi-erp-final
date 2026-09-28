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

async function resolveDealPhone(bitrixApp, authId, dealId) {
  const cleanDealId = validId(dealId)
  if (!cleanDealId || !authId) throw new Error('ID de negociación inválido')
  const deal = await bitrixApp.llamarConAuthId('crm.deal.get', { id: cleanDealId }, authId)
  if (!deal?.ID) throw new Error('Negociación no encontrada o sin acceso en Bitrix')

  let phone = ''
  let contactName = deal.TITLE || `Negociación #${cleanDealId}`
  if (validId(deal.CONTACT_ID)) {
    const contact = await bitrixApp.llamarConAuthId('crm.contact.get', { id: String(deal.CONTACT_ID) }, authId)
    phone = firstValidPhone(contact?.PHONE)
    const name = [contact?.NAME, contact?.LAST_NAME].filter(Boolean).join(' ').trim()
    if (name) contactName = name
  }
  if (!phone && validId(deal.COMPANY_ID)) {
    const company = await bitrixApp.llamarConAuthId('crm.company.get', { id: String(deal.COMPANY_ID) }, authId)
    phone = firstValidPhone(company?.PHONE)
    if (company?.TITLE) contactName = company.TITLE
  }
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

async function startBitrixCallback(bitrixApp, authId, { lineId, phone, dealId }) {
  if (!lineId) throw new Error('BITRIX_OUTGOING_LINE_ID no configurada')
  const response = await bitrixApp.llamarConAuthId('voximplant.callback.start', {
    FROM_LINE: lineId,
    TO_NUMBER: phone,
    TEXT_TO_PRONOUNCE: `Llamada solicitada desde la negociación ${dealId}`,
  }, authId)
  if (!response?.RESULT || !response?.CALL_ID) throw new Error('Bitrix no confirmó el inicio de la llamada')
  return { callId: response.CALL_ID }
}

module.exports = {
  extractDealId,
  createCallActionToken,
  verifyCallActionToken,
  normalizePhoneEC,
  resolveDealPhone,
  consumeCallNonce,
  startBitrixCallback,
}

