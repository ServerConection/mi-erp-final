const test = require('node:test')
const assert = require('node:assert/strict')

process.env.BITRIX_NOVONET_URL = 'https://example.test/rest/1/key'
process.env.NOVONET_CATEGORY_ID = '19'

const service = require('../src/services/waBitrixContactLists.service')

test('valida filtros obligatorios y rango de fechas', () => {
  assert.throws(() => service.validarFiltros({}), /Selecciona etapa/)
  assert.throws(() => service.validarFiltros({ stage_id: 'S', responsible_id: '1', date_from: '2026-10-08', date_to: '2026-10-07' }), /posterior/)
  assert.deepEqual(
    service.validarFiltros({ stage_id: 'S', responsible_id: '1', date_from: '2026-10-01', date_to: '2026-10-07' }),
    { stageId: 'S', responsibleId: '1', from: '2026-10-01', to: '2026-10-07' }
  )
})

test('consulta la base sincronizada, normaliza teléfonos y elimina duplicados', async () => {
  const db = { query: async (sql, params) => {
    assert.match(sql, /FROM bitrix_webhook_leads/)
    assert.deepEqual(params.slice(0, 5), ['novonet', 'innegociable', 'Bryan Pineda', '2026-10-01', '2026-10-07'])
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
