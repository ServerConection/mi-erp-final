const test = require('node:test')
const assert = require('node:assert/strict')

const bitrixLists = require('../src/services/waBitrixContactLists.service')

test('WaBot conserva SEMILLERO como empresa para las bases masivas', () => {
  assert.equal(bitrixLists.empresaUsuario({ empresa: 'SEMILLERO' }), 'SEMILLERO')
  assert.equal(bitrixLists.empresaUsuario({ empresa: ' semillero ' }), 'SEMILLERO')
})

test('las opciones de importación masiva consultan únicamente SEMILLERO', async () => {
  const calls = []
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params })
      return { rows: [] }
    },
  }

  const result = await bitrixLists.obtenerOpciones({ empresa: 'SEMILLERO' }, db)

  assert.equal(result.empresa, 'SEMILLERO')
  assert.equal(calls.length, 3)
  assert.deepEqual(calls.map(call => call.params), [['semillero'], ['semillero'], ['semillero']])
})

test('la previsualización masiva de SEMILLERO no mezcla registros de NOVONET', async () => {
  const calls = []
  const db = {
    query: async (sql, params) => {
      calls.push({ sql, params })
      return {
        rows: [{
          bitrix_id: '7001',
          phone: '0991234567',
          etapa: 'VENTA_SUBIDA',
          etapa_bitrix: 'VENTA SUBIDA',
          responsible: 'Adriana Salvatore',
          created_at: '2026-10-13T10:00:00Z',
          contact_name: 'Cliente Semillero',
        }],
      }
    },
  }

  const result = await bitrixLists.consultar({ empresa: 'SEMILLERO' }, {
    stage_id: 'VENTA_SUBIDA',
    responsible_id: 'Adriana Salvatore',
    date_from: '2026-10-01',
    date_to: '2026-10-31',
  }, db)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].params[0], 'semillero')
  assert.equal(result.company, 'SEMILLERO')
  assert.equal(result.unique_contacts, 1)
  assert.equal(result.items[0].wa_number, '593991234567')
  assert.equal(result.items[0].variables.bitrix_company, 'SEMILLERO')
})
