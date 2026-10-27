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
  const empresa = String(user?.empresa || 'NOVONET').trim().toUpperCase()
  return ['NOVONET', 'VELSA', 'SEMILLERO'].includes(empresa) ? empresa : 'NOVONET'
}

// Pipelines que se pueden elegir al crear una base. El valor coincide con
// bitrix_webhook_leads.empresa (en minúsculas).
const EMPRESAS_BASE = [
  { id: 'NOVONET', name: 'NOVONET' },
  { id: 'VELSA', name: 'VELSA' },
  { id: 'SEMILLERO', name: 'SEMILLERO' },
  { id: 'VENTAENLINEA', name: 'VENTA EN LÍNEA' },
]

// Empresa elegida en el filtro; si no viene o no es válida, la del usuario.
function empresaElegida(user, input = {}) {
  const pedida = String(input?.empresa || '').trim().toUpperCase().replace(/\s+/g, '')
  return EMPRESAS_BASE.some(e => e.id === pedida) ? pedida : empresaUsuario(user)
}

// Crear bases desde Bitrix: habilitado para todos los usuarios autenticados.
// (Antes: solo ADMINISTRADOR y 'acloaiza'. Para volver a restringir, cambiar esta función.)
function puedeCrearBase(user) {
  return Boolean(user)
}

function configuracion(user) {
  const empresa = empresaUsuario(user)
  const webhook = empresa === 'VELSA'
    ? (process.env.BITRIX_VELSA_URL || process.env.VELSA_WEBHOOK || process.env.BITRIX_WEBHOOK)
    : (process.env.BITRIX_NOVONET_URL || process.env.NOVONET_WEBHOOK || process.env.BITRIX_WEBHOOK)
  const categoryId = empresa === 'VELSA'
    ? (process.env.VELSA_CATEGORY_ID || '8')
    : empresa === 'SEMILLERO'
      ? (process.env.SEMILLERO_CATEGORY_ID || process.env.NOVONET_CATEGORY_ID || process.env.GESTIONABLES_CATEGORY_ID || '19')
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

// Acepta listas (stage_ids / responsible_ids) o el formato anterior de un
// solo valor (stage_id / responsible_id). Lista vacía = todas/todos.
function aLista(lista, unico) {
  const crudo = Array.isArray(lista) ? lista : (lista ? [lista] : (unico ? [unico] : []))
  return [...new Set(crudo.map(v => String(v ?? '').trim()).filter(Boolean))].slice(0, 500)
}

function validarFiltros(input = {}) {
  const stageIds = aLista(input.stage_ids, input.stage_id)
  const responsibleIds = aLista(input.responsible_ids, input.responsible_id)
  const sourceIds = aLista(input.source_ids, input.source_id)
  const from = String(input.date_from || '').trim()
  const to = String(input.date_to || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const err = new Error('Selecciona un rango de fechas válido')
    err.status = 400
    throw err
  }
  if (from > to) {
    const err = new Error('La fecha desde no puede ser posterior a la fecha hasta')
    err.status = 400
    throw err
  }
  return { stageIds, responsibleIds, sourceIds, from, to }
}

// input (opcional): { empresa, date_from, date_to }. Con fechas válidas, las
// etapas, responsables y orígenes se limitan a los negocios creados en ese rango.
// Compatibilidad: obtenerOpciones(user, db) sigue funcionando.
async function obtenerOpciones(user, input = {}, db) {
  if (input && typeof input.query === 'function') { db = input; input = {} }
  db = db || require('../config/db')
  const empresa = empresaElegida(user, input)
  const params = [empresa.toLowerCase()]
  let rango = ''
  const from = String(input?.date_from || '').trim()
  const to = String(input?.date_to || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) {
    params.push(from, to)
    rango = `\n          AND (created_at AT TIME ZONE 'America/Guayaquil')::date BETWEEN $2::date AND $3::date`
  }
  const [stageResult, responsibleResult, sourceResult] = await Promise.all([
    db.query(
      `SELECT etapa AS id,
              COALESCE(NULLIF(MAX(etapa_bitrix), ''), REPLACE(etapa, '_', ' ')) AS name
         FROM bitrix_webhook_leads
        WHERE empresa=$1 AND NULLIF(BTRIM(etapa), '') IS NOT NULL${rango}
        GROUP BY etapa ORDER BY name`, params),
    db.query(
      `SELECT responsible AS id, responsible AS name
         FROM bitrix_webhook_leads
        WHERE empresa=$1 AND NULLIF(BTRIM(responsible), '') IS NOT NULL${rango}
        GROUP BY responsible ORDER BY responsible`, params),
    db.query(
      `SELECT BTRIM(source) AS id, BTRIM(source) AS name
         FROM bitrix_webhook_leads
        WHERE empresa=$1 AND NULLIF(BTRIM(source), '') IS NOT NULL${rango}
        GROUP BY BTRIM(source) ORDER BY 2`, params),
  ])
  return { empresa, empresas: EMPRESAS_BASE, stages: stageResult.rows, responsibles: responsibleResult.rows, sources: sourceResult.rows }
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
  const empresa = empresaElegida(user, input)
  const f = validarFiltros(input)
  const params = [empresa.toLowerCase(), f.from, f.to]
  let filtrosExtra = ''
  if (f.stageIds.length) {
    params.push(f.stageIds)
    filtrosExtra += `\n        AND etapa = ANY($${params.length}::text[])`
  }
  if (f.responsibleIds.length) {
    params.push(f.responsibleIds.map(r => r.toUpperCase()))
    filtrosExtra += `\n        AND UPPER(BTRIM(responsible)) = ANY($${params.length}::text[])`
  }
  if (f.sourceIds.length) {
    params.push(f.sourceIds.map(o => o.toUpperCase()))
    filtrosExtra += `\n        AND UPPER(BTRIM(source)) = ANY($${params.length}::text[])`
  }
  params.push(MAX_DEALS)
  const result = await db.query(
    `SELECT bitrix_id, phone, etapa, etapa_bitrix, responsible, source, created_at,
            COALESCE(NULLIF(BTRIM(raw_query->>'title'), ''), NULLIF(BTRIM(raw_query->>'TITLE'), '')) AS contact_name
       FROM bitrix_webhook_leads
      WHERE empresa=$1
        AND (created_at AT TIME ZONE 'America/Guayaquil')::date BETWEEN $2::date AND $3::date${filtrosExtra}
      ORDER BY created_at DESC, bitrix_id DESC
      LIMIT $${params.length}`,
    params
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
          bitrix_responsible: String(deal.responsible || ''), bitrix_source: String(deal.source || ''),
          bitrix_date_create: deal.created_at || null, bitrix_company: empresa,
        },
      })
    }
  }
  const items = [...byPhone.values()]
  return { company: empresa, total_deals: deals.length, deals_without_phone: dealsWithoutPhone,
    unique_contacts: items.length, truncated: deals.length >= MAX_DEALS, items }
}

module.exports = { obtenerOpciones, consultar, validarFiltros, empresaUsuario, empresaElegida, puedeCrearBase, EMPRESAS_BASE }
