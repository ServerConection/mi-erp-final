const test = require('node:test')
const assert = require('node:assert/strict')

process.env.BITRIX_NOVONET_URL = 'https://example.test/rest/1/key'
process.env.NOVONET_CATEGORY_ID = '19'

const service = require('../src/services/waBitrixContactLists.service')

test('valida rango de fechas; etapas y responsables son opcionales y múltiples', () => {
  assert.throws(() => service.validarFiltros({}), /rango de fechas/)
  assert.throws(() => service.validarFiltros({ stage_id: 'S', responsible_id: '1', date_from: '2026-10-08', date_to: '2026-10-07' }), /posterior/)
  assert.deepEqual(
    service.validarFiltros({ stage_id: 'S', responsible_id: '1', date_from: '2026-10-01', date_to: '2026-10-07' }),
    { stageIds: ['S'], responsibleIds: ['1'], sourceIds: [], from: '2026-10-01', to: '2026-10-07' }
  )
  assert.deepEqual(
    service.validarFiltros({ stage_ids: ['A', 'B', 'A'], responsible_ids: [], date_from: '2026-10-01', date_to: '2026-10-07' }),
    { stageIds: ['A', 'B'], responsibleIds: [], sourceIds: [], from: '2026-10-01', to: '2026-10-07' }
  )
})

test('consulta la base sincronizada, normaliza teléfonos y elimina duplicados', async () => {
  const db = { query: async (sql, params) => {
    assert.match(sql, /FROM bitrix_webhook_leads/)
    assert.deepEqual(params, ['novonet', '2026-10-01', '2026-10-07', ['innegociable'], ['BRYAN PINEDA'], 10000])
    return { rows: [
      { bitrix_id: '10', phone: '+593 99 111 2233', etapa: 'innegociable', etapa_bitrix: 'INNEGOCIABLE', responsible: 'Bryan Pineda', created_at: '2026-10-01T15:00:00Z', contact_name: 'Ana Pérez' },
      { bitrix_id: '11', phone: '0991112233', etapa: 'innegociable', etapa_bitrix: 'INNEGOCIABLE', responsible: 'Bryan Pineda', created_at: '2026-10-02T15:00:00Z', contact_name: 'Ana duplicada' },
    ] }
  } }
  const result = await service.consultar(
    { empresa: 'NOVONET' },
    { stage_id: 'innegociable', responsible_id: 'Bryan Pineda', date_from: '2026-10-01', date_to: '2026-10-07' }, db
  )
  assert.equal(result.total_deals, 2)
  assert.equal(result.unique_contacts, 1)
  assert.equal(result.items[0].wa_number, '593991112233')
  assert.equal(result.items[0].name, 'Ana Pérez')
})

test('sin etapas ni responsables trae todo el rango de fechas', async () => {
  const db = { query: async (sql, params) => {
    assert.doesNotMatch(sql, /ANY/)
    assert.deepEqual(params, ['novonet', '2026-10-01', '2026-10-07', 10000])
    return { rows: [] }
  } }
  const result = await service.consultar({ empresa: 'NOVONET' }, { date_from: '2026-10-01', date_to: '2026-10-07' }, db)
  assert.equal(result.total_deals, 0)
})

test('filtra por origen sin distinguir mayúsculas', async () => {
  const db = { query: async (sql, params) => {
    assert.match(sql, /UPPER\(BTRIM\(source\)\) = ANY/)
    assert.deepEqual(params, ['novonet', '2026-10-01', '2026-10-07', ['FACEBOOK ADS', 'TIKTOK'], 10000])
    return { rows: [] }
  } }
  await service.consultar({ empresa: 'NOVONET' }, { source_ids: ['Facebook Ads', 'TikTok'], date_from: '2026-10-01', date_to: '2026-10-07' }, db)
})

test('crear base: elige pipeline por filtro y limita opciones al rango de fechas', async () => {
  const service = require('../src/services/waBitrixContactLists.service')
  const calls = []
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] } } }
  const r = await service.obtenerOpciones({ empresa: 'NOVONET' }, { empresa: 'Venta en linea', date_from: '2026-10-01', date_to: '2026-10-07' }, db)
  assert.equal(r.empresa, 'VENTAENLINEA')
  assert.equal(calls.length, 3)
  for (const c of calls) {
    assert.deepEqual(c.params, ['ventaenlinea', '2026-10-01', '2026-10-07'])
    assert.match(c.sql, /BETWEEN \$2::date AND \$3::date/)
  }
  calls.length = 0
  await service.consultar({ empresa: 'NOVONET' }, { empresa: 'VELSA', date_from: '2026-10-01', date_to: '2026-10-07' }, db)
  assert.equal(calls[0].params[0], 'velsa')
})

test('crear base: solo administradores o acloaiza', () => {
  const service = require('../src/services/waBitrixContactLists.service')
  assert.equal(service.puedeCrearBase({ perfil: 'ADMINISTRADOR', usuario: 'x' }), true)
  assert.equal(service.puedeCrearBase({ perfil: 'USUARIO', usuario: 'ACLOAIZA' }), true)
  assert.equal(service.puedeCrearBase({ perfil: 'SUPERVISOR', usuario: 'kpucha' }), false)
})
