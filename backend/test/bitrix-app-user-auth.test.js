const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

test('requiredScopes reports missing Bitrix permissions without partial matches', () => {
  const servicePath = path.resolve(__dirname, '../src/services/bitrixApp.service.js')
  const dbPath = path.resolve(__dirname, '../src/config/db.js')
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => ({ rows: [] }) } }
  try {
    delete require.cache[servicePath]
    const { requiredScopes } = require(servicePath)
    assert.deepEqual(requiredScopes('crm,user,placement,telephony'), [])
    assert.deepEqual(requiredScopes('crm,user,placement'), ['telephony'])
    assert.deepEqual(requiredScopes('crm,user,placement,telephony.extra'), ['telephony'])
  } finally {
    delete require.cache[servicePath]
    delete require.cache[dbPath]
  }
})

test('llamarConAuthId invokes Bitrix with the verified advisor token', async () => {
  const servicePath = path.resolve(__dirname, '../src/services/bitrixApp.service.js')
  const dbPath = path.resolve(__dirname, '../src/config/db.js')
  const previousFetch = global.fetch
  const requests = []
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => ({ rows: [] }) } }
  global.fetch = async (url, options) => {
    requests.push({ url, options })
    return { json: async () => ({ result: { ID: '662241' } }) }
  }

  try {
    delete require.cache[servicePath]
    const { crearBitrixApp } = require(servicePath)
    const app = crearBitrixApp({ portalUrl: 'https://novonet.bitrix24.es', clientId: 'id', clientSecret: 'secret' })
    const result = await app.llamarConAuthId('crm.deal.get', { id: '662241' }, 'advisor-auth-token')

    assert.deepEqual(result, { ID: '662241' })
    assert.equal(requests[0].url, 'https://novonet.bitrix24.es/rest/crm.deal.get')
    assert.deepEqual(JSON.parse(requests[0].options.body), { id: '662241', auth: 'advisor-auth-token' })
  } finally {
    delete require.cache[servicePath]
    delete require.cache[dbPath]
    global.fetch = previousFetch
  }
})

