const TIMEOUT_MS = 25000
const MAX_DEALS = 10000

function normalizeNumber(raw) {
  if (raw === null || raw === undefined) return ''
  let digits = String(raw).replace(/[^\d]/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (/^0\d{9}$/.test(digits)) digits = `593${digits.slice(1)}`
  else if (/^9\d{8}$/.test(digits)) digits = `593${digits}`
  return /^\d{10,15}$/.test(digits) ? digits : ''
}

function empresaUsuario(user) {
  return String(user?.empresa || 'NOVONET').trim().toUpperCase() === 'VELSA' ? 'VELSA' : 'NOVONET'
}

function configuracion(user) {
  const empresa = empresaUsuario(user)
  const webhook = empresa === 'VELSA'
    ? (process.env.BITRIX_VELSA_URL || process.env.VELSA_WEBHOOK || process.env.BITRIX_WEBHOOK)
    : (process.env.BITRIX_NOVONET_URL || process.env.NOVONET_WEBHOOK || process.env.BITRIX_WEBHOOK)
  const categoryId = empresa === 'VELSA'
    ? (process.env.VELSA_CATEGORY_ID || '8')
    : (process.env.NOVONET_CATEGORY_ID || process.env.GESTIONABLES_CATEGORY_ID || '19')
  if (!webhook) {
    const err = new Error(`La conexión de Bitrix para ${empresa} no está configurada`)
    err.status = 503
    throw err
  }
  return { empresa, webhook: webhook.replace(/\/+$/, ''), categoryId: String(categoryId) }
}

function appendParams(qs, value, prefix = '') {
  Object.entries(value || {}).forEach(([key, item]) => {
    const fullKey = prefix ? `${prefix}[${key}]` : key
    if (Array.isArray(item)) item.forEach((v, i) => appendParams(qs, { [i]: v }, fullKey))
    else if (item && typeof item === 'object') appendParams(qs, item, fullKey)
    else if (item !== undefined && item !== null) qs.append(fullKey, String(item))
  })
}

async function llamar(webhook, method, params = {}) {
  const qs = new URLSearchParams()
  appendParams(qs, params)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${webhook}/${method}.json?${qs}`, { signal: controller.signal })
    const payload = await response.json()
    if (!response.ok || payload.error) throw new Error(payload.error_description || payload.error || `Bitrix respondió ${response.status}`)
    return payload
  } finally {
    clearTimeout(timer)
  }
}

async function listarTodo(webhook, method, params, max = MAX_DEALS) {
  const rows = []
  let start = 0
  while (rows.length < max) {
    const payload = await llamar(webhook, method, { ...params, start })
    const batch = Array.isArray(payload.result) ? payload.result : []
    rows.push(...batch)
    if (payload.next === undefined || batch.length === 0) break
    start = payload.next
  }
  return rows.slice(0, max)
}

function validarFiltros(input = {}) {
  const stageId = String(input.stage_id || '').trim()
  const responsibleId = String(input.responsible_id || '').trim()
  const from = String(input.date_from || '').trim()
  const to = String(input.date_to || '').trim()
  if (!stageId || !responsibleId || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const err = new Error('Selecciona etapa, responsable y un rango de fechas válido')
    err.status = 400
    throw err
  }
  if (from > to) {
    const err = new Error('La fecha desde no puede ser posterior a la fecha hasta')
    err.status = 400
    throw err
  }
  return { stageId, responsibleId, from, to }
}

async function obtenerOpciones(user) {
  const cfg = configuracion(user)
  const [stagesPayload, users] = await Promise.all([
    llamar(cfg.webhook, 'crm.dealcategory.stage.list', { id: cfg.categoryId }),
    listarTodo(cfg.webhook, 'user.get', { filter: { ACTIVE: 'Y' } }, 5000),
  ])
  const stages = (Array.isArray(stagesPayload.result) ? stagesPayload.result : [])
    .map(s => ({ id: String(s.STATUS_ID), name: String(s.NAME || s.STATUS_ID) }))
  const responsibles = users
    .filter(u => String(u.ACTIVE || 'Y') === 'Y' && String(u.USER_TYPE || 'employee') !== 'extranet')
    .map(u => ({ id: String(u.ID), name: [u.NAME, u.LAST_NAME].filter(Boolean).join(' ').trim() || `Usuario ${u.ID}` }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return { empresa: cfg.empresa, stages, responsibles }
}

function extraerTelefonos(contact) {
  const phones = Array.isArray(contact?.PHONE) ? contact.PHONE : []
  return [...new Set(phones.map(p => normalizeNumber(p?.VALUE)).filter(Boolean))]
}

async function cargarContactos(webhook, contactIds) {
  const map = new Map()
  for (let i = 0; i < contactIds.length; i += 50) {
    const contacts = await listarTodo(webhook, 'crm.contact.list', {
      filter: { '@ID': contactIds.slice(i, i + 50) },
      select: ['ID', 'NAME', 'SECOND_NAME', 'LAST_NAME', 'PHONE'],
      order: { ID: 'ASC' },
    }, 500)
    contacts.forEach(contact => map.set(String(contact.ID), contact))
  }
  return map
}

async function consultar(user, input) {
  const cfg = configuracion(user)
  const f = validarFiltros(input)
  const deals = await listarTodo(cfg.webhook, 'crm.deal.list', {
    filter: {
      CATEGORY_ID: cfg.categoryId,
      STAGE_ID: f.stageId,
      ASSIGNED_BY_ID: f.responsibleId,
      '>=DATE_CREATE': `${f.from}T00:00:00-05:00`,
      '<=DATE_CREATE': `${f.to}T23:59:59-05:00`,
    },
    select: ['ID', 'TITLE', 'CONTACT_ID', 'DATE_CREATE', 'STAGE_ID', 'ASSIGNED_BY_ID'],
    order: { DATE_CREATE: 'DESC' },
  })
  const contactIds = [...new Set(deals.map(d => String(d.CONTACT_ID || '')).filter(Boolean))]
  const contacts = await cargarContactos(cfg.webhook, contactIds)
  const byPhone = new Map()
  let dealsWithoutPhone = 0
  for (const deal of deals) {
    const contact = contacts.get(String(deal.CONTACT_ID || ''))
    const phones = extraerTelefonos(contact)
    if (!phones.length) { dealsWithoutPhone++; continue }
    const contactName = [contact?.NAME, contact?.SECOND_NAME, contact?.LAST_NAME].filter(Boolean).join(' ').trim()
    for (const phone of phones) {
      if (byPhone.has(phone)) continue
      byPhone.set(phone, {
        wa_number: phone,
        name: contactName || deal.TITLE || null,
        variables: {
          bitrix_id: String(deal.ID), bitrix_stage_id: String(deal.STAGE_ID || ''),
          bitrix_responsible_id: String(deal.ASSIGNED_BY_ID || ''),
          bitrix_date_create: deal.DATE_CREATE || null, bitrix_company: cfg.empresa,
        },
      })
    }
  }
  const items = [...byPhone.values()]
  return { company: cfg.empresa, total_deals: deals.length, deals_without_phone: dealsWithoutPhone,
    unique_contacts: items.length, truncated: deals.length >= MAX_DEALS, items }
}

module.exports = { obtenerOpciones, consultar, validarFiltros, empresaUsuario }
