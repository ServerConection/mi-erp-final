const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const servicePath = path.resolve(__dirname, '../src/services/wabotBitrixLookup.service.js')

test('NOVONET consulta negocios por OAuth sin fijar CATEGORY_ID', async () => {
  assert.ok(fs.existsSync(servicePath), 'falta el lookup de WaBot para todos los pipelines')
  const { createWabotBitrixLookup } = require(servicePath)
  const calls = []
  const lookup = createWabotBitrixLookup({
    novonetApp: {
      llamar: async (method, params) => {
        calls.push({ method, params })
        return { ID: '9001', CATEGORY_ID: '77', TITLE: 'Deal de otro pipeline' }
      },
    },
    env: {},
  })

  const deal = await lookup.getDeal('NOVONET', '9001')

  assert.equal(deal.CATEGORY_ID, '77')
  assert.deepEqual(calls, [{ method: 'crm.deal.get', params: { id: '9001' } }])
  assert.equal(JSON.stringify(calls).includes('CATEGORY_ID'), false)
})

test('NOVONET obtiene el contacto del negocio con la misma credencial OAuth', async () => {
  const { createWabotBitrixLookup } = require(servicePath)
  const calls = []
  const lookup = createWabotBitrixLookup({
    novonetApp: {
      llamar: async (method, params) => {
        calls.push({ method, params })
        if (method === 'crm.deal.get') return { ID: '9002', CATEGORY_ID: '41', CONTACT_ID: '55', TITLE: 'Otro pipeline' }
        return { ID: '55', NAME: 'Ana', LAST_NAME: 'Paz', PHONE: [{ VALUE: '0991234567' }] }
      },
    },
    env: {},
  })

  const info = await lookup.phoneFromDeal('NOVONET', '9002')

  assert.equal(info.phone, '593991234567')
  assert.equal(info.contactName, 'Ana Paz')
  assert.deepEqual(calls, [
    { method: 'crm.deal.get', params: { id: '9002' } },
    { method: 'crm.contact.get', params: { id: '55' } },
  ])
})

