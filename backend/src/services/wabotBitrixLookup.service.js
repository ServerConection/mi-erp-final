function normalizePhoneEC(raw) {
  let digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `593${digits.slice(1)}`
  else if (!digits.startsWith('593') && digits.length <= 10) digits = `593${digits}`
  return digits
}

function createWabotBitrixLookup({ novonetApp, env = process.env, fetchImpl = fetch }) {
  async function callWebhook(company, method, params) {
    const base = String(company === 'VELSA' ? env.BITRIX_VELSA_URL : env.BITRIX_NOVONET_URL)
      .replace(/\/+$/, '')
    if (!base) throw new Error(`Empresa sin webhook de Bitrix: ${company}`)
    const response = await fetchImpl(`${base}/${method}.json?${new URLSearchParams(params)}`, {
      signal: AbortSignal.timeout(20000),
    })
    const body = await response.json()
    if (!response.ok || body.error) {
      throw new Error(`Bitrix [${method}]: ${body.error_description || body.error || `HTTP ${response.status}`}`)
    }
    return body.result
  }

  async function call(company, method, params = {}) {
    const normalizedCompany = String(company || '').trim().toUpperCase()
    // La app OAuth de NOVONET fue instalada a nivel del portal. A diferencia
    // del webhook técnico (cuyo usuario puede estar limitado a un pipeline),
    // permite consultar cualquier pipeline autorizado para la aplicación.
    if (normalizedCompany === 'NOVONET') return novonetApp.llamar(method, params)
    return callWebhook(normalizedCompany, method, params)
  }

  async function getDeal(company, dealId) {
    const id = String(dealId || '').trim()
    if (!/^[1-9]\d{0,14}$/.test(id)) throw new Error('ID de negociación inválido')
    const deal = await call(company, 'crm.deal.get', { id })
    if (!deal || String(deal.ID) !== id) throw new Error('Negociación no encontrada en Bitrix')
    return deal
  }

  async function phoneFromDeal(company, dealId) {
    const deal = await getDeal(company, dealId)
    let phoneRaw = null
    let contactName = deal.TITLE || null

    if (deal.CONTACT_ID && String(deal.CONTACT_ID) !== '0') {
      const contact = await call(company, 'crm.contact.get', { id: String(deal.CONTACT_ID) })
      if (contact) {
        phoneRaw = contact.PHONE?.[0]?.VALUE || null
        const name = [contact.NAME, contact.LAST_NAME].filter(Boolean).join(' ').trim()
        if (name && phoneRaw) contactName = name
      }
    }
    if (!phoneRaw && deal.COMPANY_ID && String(deal.COMPANY_ID) !== '0') {
      const companyData = await call(company, 'crm.company.get', { id: String(deal.COMPANY_ID) })
      if (companyData) {
        phoneRaw = companyData.PHONE?.[0]?.VALUE || null
        if (companyData.TITLE && phoneRaw) contactName = companyData.TITLE
      }
    }

    return { phone: normalizePhoneEC(phoneRaw), phoneRaw, contactName, dealTitle: deal.TITLE || null }
  }

  return { getDeal, phoneFromDeal }
}

let singleton
function getWabotBitrixLookup() {
  if (!singleton) {
    singleton = createWabotBitrixLookup({ novonetApp: require('./bitrixApp.service') })
  }
  return singleton
}

module.exports = { createWabotBitrixLookup, getWabotBitrixLookup, normalizePhoneEC }
