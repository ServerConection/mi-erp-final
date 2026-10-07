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

test('consulta Bitrix, normaliza teléfonos y elimina duplicados', async t => {
  const originalFetch = global.fetch
  t.after(() => { global.fetch = originalFetch })
  global.fetch = async url => {
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/crm.deal.list.json')) {
      assert.equal(parsed.searchParams.get('filter[STAGE_ID]'), 'C19:LOSE')
      assert.equal(parsed.searchParams.get('filter[ASSIGNED_BY_ID]'), '42')
      return { ok: true, json: async () => ({ result: [
        { ID: '10', TITLE: 'Uno', CONTACT_ID: '100', DATE_CREATE: '2026-10-01T10:00:00-05:00', STAGE_ID: 'C19:LOSE', ASSIGNED_BY_ID: '42' },
        { ID: '11', TITLE: 'Dos', CONTACT_ID: '101', DATE_CREATE: '2026-10-02T10:00:00-05:00', STAGE_ID: 'C19:LOSE', ASSIGNED_BY_ID: '42' },
      ] }) }
    }
    if (parsed.pathname.endsWith('/crm.contact.list.json')) {
      return { ok: true, json: async () => ({ result: [
        { ID: '100', NAME: 'Ana', LAST_NAME: 'Pérez', PHONE: [{ VALUE: '+593 99 111 2233' }] },
        { ID: '101', NAME: 'Ana duplicada', PHONE: [{ VALUE: '0991112233' }] },
      ] }) }
    }
    throw new Error(`URL inesperada: ${url}`)
  }

  const result = await service.consultar(
    { empresa: 'NOVONET' },
    { stage_id: 'C19:LOSE', responsible_id: '42', date_from: '2026-10-01', date_to: '2026-10-07' }
  )
  assert.equal(result.total_deals, 2)
  assert.equal(result.unique_contacts, 1)
  assert.equal(result.items[0].wa_number, '593991112233')
  assert.equal(result.items[0].name, 'Ana Pérez')
})
