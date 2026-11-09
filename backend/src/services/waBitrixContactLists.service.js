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

// Solo ADMINISTRADOR y usuarios autorizados pueden elegir la empresa/pipeline.
// El resto queda fijo en la empresa registrada en su usuario.
const USUARIOS_ELIGEN_EMPRESA = ['acloaiza']
function puedeElegirEmpresa(user) {
  if (String(user?.perfil || '').trim().toUpperCase() === 'ADMINISTRADOR') return true
  return USUARIOS_ELIGEN_EMPRESA.includes(String(user?.usuario || '').trim().toLowerCase())
}

// Perfiles que ven a todos los responsables de su empresa. El resto (asesores)
// solo ve sus propios negocios.
const PERFILES_VEN_TODOS = ['ADMINISTRADOR', 'SUPERVISOR', 'GERENCIA', 'ANALISTA']
function soloSusNegocios(user) {
  if (puedeElegirEmpresa(user)) return false
  return !PERFILES_VEN_TODOS.includes(String(user?.perfil || '').trim().toUpperCase())
}

// Patrones para reconocer al asesor en el campo "responsible" de Bitrix.
// Se comparan prefijos de tres letras de cada palabra: además de admitir
// nombres intermedios, tolera errores menores del registro interno como
// "Jacj Vera" frente a "Jack Vera". Sin nombre no coincide con nadie.
const SIN_TILDES = (txt) => String(txt || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
function patronesAsesor(user) {
  const palabras = [...new Set(SIN_TILDES(user?.nombreCompleto).toUpperCase()
    .split(/[^A-Z]+/).filter(p => p.length >= 3))]
  return palabras.length ? palabras.map(p => p.slice(0, 3)) : ['__SIN_NOMBRE_ASESOR__']
}
const RESPONSABLE_NORM_SQL = `UPPER(TRANSLATE(COALESCE(responsible, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))`

// El nombre del ERP suele traer 2 nombres + 2 apellidos y Bitrix solo
// "Nombre Apellido". Exigir TODAS las palabras dejaba a esos asesores sin
// negocios (responsable en blanco). Ahora basta con que coincidan 2 palabras
// (o todas, si el nombre del ERP tiene menos de 2).
// La Bolsa reparte pauta de VELSA a otros pipelines y el negocio conserva
// su origen ("VELSA 1"). Esos orígenes solo se muestran a VELSA.
const ORIGEN_AJENO_SQL = `UPPER(BTRIM(source)) LIKE 'VELSA%'`
const esOrigenAjeno = (empresa, origen) =>
  String(empresa).toUpperCase() !== 'VELSA' && /^\s*VELSA/i.test(String(origen || ''))

function filtroAsesorSQL(pos) {
  return `(SELECT COUNT(*)
             FROM unnest($${pos}::text[]) AS pa(p)
            WHERE EXISTS (
              SELECT 1
                FROM regexp_split_to_table(${RESPONSABLE_NORM_SQL}, '[^A-Z0-9]+') AS palabra
               WHERE palabra LIKE pa.p || '%'
            ))
            >= LEAST(2, cardinality($${pos}::text[]))`
}

// Empresa registrada del usuario (incluye VENTA EN LÍNEA).
function empresaFija(user) {
  const propia = String(user?.empresa || '').trim().toUpperCase().replace(/\s+/g, '')
  return EMPRESAS_BASE.some(e => e.id === propia) ? propia : empresaUsuario(user)
}

// Empresa del filtro: solo se respeta si el usuario puede elegirla; si no,
// SIEMPRE la registrada (aunque el frontend mande otra).
function empresaElegida(user, input = {}) {
  if (!puedeElegirEmpresa(user)) return empresaFija(user)
  const pedida = String(input?.empresa || '').trim().toUpperCase().replace(/\s+/g, '')
  return EMPRESAS_BASE.some(e => e.id === pedida) ? pedida : empresaFija(user)
}

// Crear bases desde Bitrix: habilitado para todos los usuarios autenticados.
// (Antes: solo ADMINISTRADOR y 'acloaiza'. Para volver a restringir, cambiar esta función.)
function puedeCrearBase(user) {
  return Boolean(user)
}

function configuracion(user) {
  const empresa = empresaUsuario(user)
  const webhook = empresa === 'VELSA'
    ? (process.env.BITRIX_NOVONET_URL || process.env.NOVONET_WEBHOOK || process.env.BITRIX_WEBHOOK || process.env.BITRIX_VELSA_URL || process.env.VELSA_WEBHOOK)
    : (process.env.BITRIX_NOVONET_URL || process.env.NOVONET_WEBHOOK || process.env.BITRIX_WEBHOOK)
  const categoryId = empresa === 'VELSA'
    ? (process.env.VELSA_CATEGORY_ID || '51')
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

// ── Filtro por Estado Netlife (JotForm / envios_ventas) ──────────────────
// Se eligen estados (ACTIVO, PENDIENTE…); se toman los ID Bitrix de esas
// ventas y el resto (teléfono, responsable, etapa) sale de Bitrix. Con este
// filtro activo, el rango de fechas se aplica a la FECHA DE ACTIVACIÓN de la
// venta (si no tiene, a la fecha de registro en JotForm), no a la creación
// del negocio en Bitrix.
const ESTADO_NETLIFE_SQL = `COALESCE(NULLIF(UPPER(BTRIM(e.netlife_estatus_real)), ''), 'SIN ESTADO')`
const FECHA_JOTFORM_SQL = `COALESCE(public.parse_fecha_flex(e.fecha_activacion_netlife::text),
                   public.parse_fecha_flex(e.fecha_registro_sistema::text))`
const DISTRIBUIDOR_SQL = `REPLACE(UPPER(BTRIM(COALESCE(e.distribuidor_autorizado, ''))), ' ', '')`

// Subconsulta: ID Bitrix + estado Netlife de las ventas de la empresa con los
// estados pedidos (y en el rango, si se pasa). Agrega params a la lista.
function ventasNetlifeSQL(params, empresa, estados, from, to) {
  params.push(empresa.toUpperCase())
  const pEmp = params.length
  params.push(estados.map(e => e.toUpperCase()))
  const pEst = params.length
  let rango = ''
  if (from && to) {
    params.push(from, to)
    rango = `\n            AND ${FECHA_JOTFORM_SQL} BETWEEN $${params.length - 1}::date AND $${params.length}::date`
  }
  return `SELECT DISTINCT ON (BTRIM(e.id_bitrix::text))
                 BTRIM(e.id_bitrix::text) AS id_bitrix, ${ESTADO_NETLIFE_SQL} AS estado_netlife,
                 ${FECHA_JOTFORM_SQL} AS fecha_jotform
            FROM public.envios_ventas e
           WHERE ${DISTRIBUIDOR_SQL} = $${pEmp}
             AND e.estatus_envio IS DISTINCT FROM 'BORRADOR'
             AND NULLIF(BTRIM(e.id_bitrix::text), '') IS NOT NULL
             AND ${ESTADO_NETLIFE_SQL} = ANY($${pEst}::text[])${rango}
           ORDER BY BTRIM(e.id_bitrix::text), ${FECHA_JOTFORM_SQL} DESC NULLS LAST`
}

function validarFiltros(input = {}) {
  const netlifeEstados = aLista(input.netlife_estados).map(e => e.toUpperCase())
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
  return { stageIds, responsibleIds, sourceIds, netlifeEstados, from, to }
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
  const fechasOk = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to
  const netlifeEstados = aLista(input?.netlife_estados).map(e => e.toUpperCase())
  if (netlifeEstados.length) {
    // Etapas/responsables/orígenes de los negocios con esos estados Netlife.
    const sub = ventasNetlifeSQL(params, empresa, netlifeEstados, fechasOk ? from : null, fechasOk ? to : null)
    rango = `\n          AND BTRIM(bitrix_id::text) IN (SELECT id_bitrix FROM (${sub}) jf)`
  } else if (fechasOk) {
    params.push(from, to)
    rango = `\n          AND (created_at AT TIME ZONE 'America/Guayaquil')::date BETWEEN $2::date AND $3::date`
  }
  // Asesor: solo sus propios negocios (etapas, responsables y orígenes).
  if (soloSusNegocios(user)) {
    params.push(patronesAsesor(user))
    rango += `\n          AND ${filtroAsesorSQL(params.length)}`
  }
  // Estados Netlife disponibles en JotForm para la empresa. NO dependen del
  // rango: el modal abre con la fecha de hoy y casi nunca hay activaciones
  // del día, lo que dejaba la lista vacía.
  const paramsNet = [empresa.toUpperCase()]
  const rangoNet = ''
  const [stageResult, responsibleResult, sourceResult, netlifeResult] = await Promise.all([
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
        WHERE empresa=$1 AND NULLIF(BTRIM(source), '') IS NOT NULL${rango}${empresa === 'VELSA' ? '' : `\n          AND NOT ${ORIGEN_AJENO_SQL}`}
        GROUP BY BTRIM(source) ORDER BY 2`, params),
    db.query(
      `SELECT ${ESTADO_NETLIFE_SQL} AS id, ${ESTADO_NETLIFE_SQL} AS name
         FROM public.envios_ventas e
        WHERE ${DISTRIBUIDOR_SQL} = $1
          AND e.estatus_envio IS DISTINCT FROM 'BORRADOR'
          AND NULLIF(BTRIM(e.id_bitrix::text), '') IS NOT NULL${rangoNet}
        GROUP BY 1 ORDER BY 1`, paramsNet)
      // Sin tabla JotForm (o error) el resto del formulario sigue funcionando.
      .catch(err => { console.warn('[bitrixLists] estados Netlife:', err.message); return { rows: [] } }),
  ])
  const elegir = puedeElegirEmpresa(user)
  return { empresa, puede_elegir_empresa: elegir, solo_sus_negocios: soloSusNegocios(user),
    empresas: elegir ? EMPRESAS_BASE : EMPRESAS_BASE.filter(e => e.id === empresa), stages: stageResult.rows, responsibles: responsibleResult.rows, sources: sourceResult.rows,
    netlife_estados: netlifeResult.rows }
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
  const params = [empresa.toLowerCase()]
  let filtrosExtra = ''
  let joinNetlife = ''
  let colNetlife = 'NULL::text AS estado_netlife, NULL::date AS fecha_jotform'
  if (f.netlifeEstados.length) {
    // Rango sobre la fecha de la venta en JotForm (no la creación en Bitrix).
    joinNetlife = `\n       JOIN (${ventasNetlifeSQL(params, empresa, f.netlifeEstados, f.from, f.to)}) jf
         ON jf.id_bitrix = BTRIM(bw.bitrix_id::text)`
    colNetlife = 'jf.estado_netlife, jf.fecha_jotform'
  } else {
    params.push(f.from, f.to)
    filtrosExtra += `\n        AND (created_at AT TIME ZONE 'America/Guayaquil')::date BETWEEN $${params.length - 1}::date AND $${params.length}::date`
  }
  if (f.stageIds.length) {
    params.push(f.stageIds)
    filtrosExtra += `\n        AND etapa = ANY($${params.length}::text[])`
  }
  if (f.responsibleIds.length) {
    params.push(f.responsibleIds.map(r => r.toUpperCase()))
    filtrosExtra += `\n        AND UPPER(BTRIM(responsible)) = ANY($${params.length}::text[])`
  }
  // Asesor: forzado a sus propios negocios aunque el navegador pida otros.
  if (soloSusNegocios(user)) {
    params.push(patronesAsesor(user))
    filtrosExtra += `\n        AND ${filtroAsesorSQL(params.length)}`
  }
  // Un origen de VELSA pedido desde otra empresa se ignora (no se cuela por API).
  const origenes = f.sourceIds.filter(o => !esOrigenAjeno(empresa, o))
  if (f.sourceIds.length && !origenes.length) {
    return { company: empresa, total_deals: 0, deals_without_phone: 0, unique_contacts: 0, truncated: false, items: [] }
  }
  if (origenes.length) {
    params.push(origenes.map(o => o.toUpperCase()))
    filtrosExtra += `\n        AND UPPER(BTRIM(source)) = ANY($${params.length}::text[])`
  }
  params.push(MAX_DEALS)
  const result = await db.query(
    `SELECT bitrix_id, phone, etapa, etapa_bitrix, responsible, source, created_at, ${colNetlife},
            COALESCE(NULLIF(BTRIM(raw_query->>'title'), ''), NULLIF(BTRIM(raw_query->>'TITLE'), '')) AS contact_name
       FROM bitrix_webhook_leads bw${joinNetlife}
      WHERE empresa=$1${filtrosExtra}
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
          ...(deal.estado_netlife ? { estado_netlife: String(deal.estado_netlife) } : {}),
        },
      })
    }
  }
  const items = [...byPhone.values()]
  return { company: empresa, total_deals: deals.length, deals_without_phone: dealsWithoutPhone,
    unique_contacts: items.length, truncated: deals.length >= MAX_DEALS, items }
}

// Vista previa: nunca expone el número completo; solo ID de Bitrix y los
// dos últimos dígitos.
function enmascararTelefono(numero) {
  const d = String(numero || '').replace(/\D/g, '')
  return d.length >= 2 ? `${'•'.repeat(Math.max(d.length - 2, 4))}${d.slice(-2)}` : '••'
}
function itemsVistaPrevia(items = [], max = 100) {
  return items.slice(0, max).map(item => ({
    bitrix_id: item.variables?.bitrix_id || null,
    name: item.name || null,
    telefono: enmascararTelefono(item.wa_number),
  }))
}

module.exports = { obtenerOpciones, consultar, validarFiltros, empresaUsuario, empresaElegida, puedeElegirEmpresa, soloSusNegocios, patronesAsesor, enmascararTelefono, itemsVistaPrevia, puedeCrearBase, EMPRESAS_BASE }
