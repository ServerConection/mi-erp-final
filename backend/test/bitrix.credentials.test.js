const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

test('NOVONET rechaza la llamada si BITRIX_NOVONET_URL no esta configurada', async () => {
  const servicePath = path.resolve(__dirname, '../src/services/bitrix.service.js')
  const dbPath = path.resolve(__dirname, '../src/config/db.js')
  const previousUrl = process.env.BITRIX_NOVONET_URL
  const previousFetch = global.fetch
  let fetchCalls = 0

  delete process.env.BITRIX_NOVONET_URL
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { query: async () => ({ rows: [] }) },
  }
  global.fetch = async () => {
    fetchCalls += 1
    throw new Error('No debe intentar una llamada externa sin credencial')
  }

  try {
    delete require.cache[servicePath]
    const { bitrixCallNovonet } = require(servicePath)

    await assert.rejects(
      bitrixCallNovonet('crm.deal.get', { ID: 1 }),
      /Webhook de Bitrix no configurado/
    )
    assert.equal(fetchCalls, 0)
  } finally {
    delete require.cache[servicePath]
    delete require.cache[dbPath]
    global.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.BITRIX_NOVONET_URL
    else process.env.BITRIX_NOVONET_URL = previousUrl
  }
})
