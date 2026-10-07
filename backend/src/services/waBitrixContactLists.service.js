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

async function obtenerOpciones(user, db = require('../config/db')) {
  const empresa = empresaUsuario(user)
  const [stageResult, responsibleResult] = await Promise.all([
    db.query(
      `SELECT etapa AS id,
              COALESCE(NULLIF(MAX(etapa_bitrix), ''), REPLACE(etapa, '_', ' ')) AS name
         FROM bitrix_webhook_leads
        WHERE empresa=$1 AND NULLIF(BTRIM(etapa), '') IS NOT NULL
        GROUP BY etapa ORDER BY name`, [empresa.toLowerCase()]),
    db.query(
      `SELECT responsible AS id, responsible AS name
         FROM bitrix_webhook_leads
        WHERE empresa=$1 AND NULLIF(BTRIM(responsible), '') IS NOT NULL
        GROUP BY responsible ORDER BY responsible`, [empresa.toLowerCase()]),
  ])
  return { empresa, stages: stageResult.rows, responsibles: responsibleResult.rows }
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

async function consultar(user, input, db = require('../config/db')) {
  const empresa = empresaUsuario(user)
  const f = validarFiltros(input)
  const result = await db.query(
    `SELECT bitrix_id, phone, etapa, etapa_bitrix, responsible, created_at,
            COALESCE(NULLIF(BTRIM(raw_query->>'title'), ''), NULLIF(BTRIM(raw_query->>'TITLE'), '')) AS contact_name
       FROM bitrix_webhook_leads
      WHERE empresa=$1
        AND etapa=$2
        AND UPPER(BTRIM(responsible))=UPPER(BTRIM($3))
        AND (created_at AT TIME ZONE 'America/Guayaquil')::date BETWEEN $4::date AND $5::date
      ORDER BY created_at DESC, bitrix_id DESC
      LIMIT $6`,
    [empresa.toLowerCase(), f.stageId, f.responsibleId, f.from, f.to, MAX_DEALS]
  )
  const deals = result.rows
  const byPhone = new Map()
  let dealsWithoutPhone = 0
  for (const deal of deals) {
    const phones = String(deal.phone || '').split(/[,;|/]+/).map(normalizeNumber).filter(Boolean)
    if (!phones.length) { dealsWithoutPhone++; continue }
    for (const phone of phones) {
      if (byPhone.has(phone)) continue
      byPhone.set(phone, {
        wa_number: phone,
        name: deal.contact_name || null,
        variables: {
          bitrix_id: String(deal.bitrix_id), bitrix_stage: String(deal.etapa_bitrix || deal.etapa || ''),
          bitrix_responsible: String(deal.responsible || ''),
          bitrix_date_create: deal.created_at || null, bitrix_company: empresa,
        },
      })
    }
  }
  const items = [...byPhone.values()]
  return { company: empresa, total_deals: deals.length, deals_without_phone: dealsWithoutPhone,
    unique_contacts: items.length, truncated: deals.length >= MAX_DEALS, items }
}

module.exports = { obtenerOpciones, consultar, validarFiltros, empresaUsuario }
