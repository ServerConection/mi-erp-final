const test = require('node:test')
const assert = require('node:assert/strict')

const {
  extractDealId,
  createCallActionToken,
  verifyCallActionToken,
  resolveDealPhone,
  consumeCallNonce,
  startBitrixCallback,
} = require('../src/services/bitrixCallPlacement.service')

test('extractDealId accepts only positive numeric Bitrix deal IDs', () => {
  assert.equal(extractDealId({ PLACEMENT_OPTIONS: '{"ID":"662241"}' }), '662241')
  assert.equal(extractDealId({ PLACEMENT_OPTIONS: '{"ENTITY_ID":"77"}' }), '77')
  assert.equal(extractDealId({ PLACEMENT_OPTIONS: '{"ID":"1 OR 1=1"}' }), '')
  assert.equal(extractDealId({ PLACEMENT_OPTIONS: '{not-json}' }), '')
})

test('action token encrypts the Bitrix session and rejects tampering or expiry', () => {
  const token = createCallActionToken(
    { dealId: '662241', userId: '91', erpUserId: '15', authId: 'sensitive-bitrix-auth' },
    'a-test-secret-that-is-longer-than-thirty-two-characters',
    { now: 1_000, ttlMs: 60_000, nonce: 'fixed-nonce' },
  )

  assert.equal(token.includes('sensitive-bitrix-auth'), false)
  assert.deepEqual(
    verifyCallActionToken(token, 'a-test-secret-that-is-longer-than-thirty-two-characters', { now: 30_000 }),
    { dealId: '662241', userId: '91', erpUserId: '15', authId: 'sensitive-bitrix-auth', exp: 61_000, nonce: 'fixed-nonce' },
  )
  assert.throws(() => verifyCallActionToken(`${token}x`, 'a-test-secret-that-is-longer-than-thirty-two-characters'), /inválid/i)
  assert.throws(() => verifyCallActionToken('x'.repeat(5000), 'a-test-secret-that-is-longer-than-thirty-two-characters'), /inválid/i)
  assert.throws(() => verifyCallActionToken(token, 'a-test-secret-that-is-longer-than-thirty-two-characters', { now: 61_001 }), /expir/i)
})

test('resolveDealPhone uses the authenticated Bitrix user context and never returns raw data', async () => {
  const calls = []
  const bitrixApp = {
    llamarConAuthId: async (method, params, authId) => {
      calls.push({ method, params, authId })
      if (method === 'crm.deal.get') return { ID: '662241', TITLE: 'Ma Augusta Larrea', CONTACT_ID: '44' }
      if (method === 'crm.contact.get') return { ID: '44', NAME: 'Ma Augusta', LAST_NAME: 'Larrea', PHONE: [{ VALUE: '099 857 1562' }] }
      throw new Error(`unexpected method ${method}`)
    },
  }

  const result = await resolveDealPhone(bitrixApp, 'sensitive-auth', '662241')

  assert.deepEqual(result, { phone: '593998571562', contactName: 'Ma Augusta Larrea', dealTitle: 'Ma Augusta Larrea' })
  assert.deepEqual(calls, [
    { method: 'crm.deal.get', params: { id: '662241' }, authId: 'sensitive-auth' },
    { method: 'crm.contact.get', params: { id: '44' }, authId: 'sensitive-auth' },
  ])
  assert.equal(Object.hasOwn(result, 'phoneRaw'), false)
})

test('consumeCallNonce atomically accepts the first confirmation only', async () => {
  let used = false
  const pool = { query: async (sql, params) => {
    assert.match(sql, /used = false/)
    assert.deepEqual(params, ['call:fixed-nonce', '15'])
    if (used) return { rows: [] }
    used = true
    return { rows: [{ usuario_id: 15 }] }
  } }

  assert.equal(await consumeCallNonce(pool, 'fixed-nonce', '15'), true)
  assert.equal(await consumeCallNonce(pool, 'fixed-nonce', '15'), false)
})

test('startBitrixCallback initiates a server-side callback without returning the phone', async () => {
  const calls = []
  const bitrixApp = { llamarConAuthId: async (method, params, authId) => {
    calls.push({ method, params, authId })
    return { RESULT: true, CALL_ID: 'callback.123' }
  } }

  const result = await startBitrixCallback(bitrixApp, 'sensitive-auth', {
    lineId: 'reg151083', phone: '593998571562', dealId: '662241',
  })

  assert.deepEqual(result, { callId: 'callback.123' })
  assert.deepEqual(calls, [{
    method: 'voximplant.callback.start',
    params: {
      FROM_LINE: 'reg151083',
      TO_NUMBER: '593998571562',
      TEXT_TO_PRONOUNCE: 'Llamada solicitada desde la negociación 662241',
    },
    authId: 'sensitive-auth',
  }])
  assert.equal(JSON.stringify(result).includes('593998571562'), false)
})

test('confirmation HTML shows the deal and never receives or renders a phone', () => {
  const { renderCallConfirmation } = require('../src/controllers/bitrixCallPlacement.controller')
  const html = renderCallConfirmation({ dealId: '662241', dealTitle: '<script>alert(1)</script>', actionToken: 'encrypted-token' })
  assert.match(html, /¿Deseas iniciar la llamada\?/)
  assert.match(html, /Negociación #662241/)
  assert.doesNotMatch(html, /<script>alert/)
  assert.doesNotMatch(html, /593998571562/)
})

test('registers LLAMAR as a separate Bitrix deal tab', async () => {
  const Module = require('node:module')
  const originalRequire = Module.prototype.require
  Module.prototype.require = function (id) {
    if (id.endsWith('config/db')) return { query: async () => ({ rows: [] }) }
    return originalRequire.apply(this, arguments)
  }
  const { crearBitrixConnector } = require('../src/services/bitrixConnector.service')
  Module.prototype.require = originalRequire
  const calls = []
  const connector = crearBitrixConnector({
    bitrixApp: { llamar: async (method, params) => { calls.push({ method, params }); return true } },
    baseUrl: 'https://erp-api.example/', routePrefix: '/api/bitrix-connector',
  })
  await connector.registrarLlamadaPlacement()
  assert.deepEqual(calls, [{ method: 'placement.bind', params: {
    PLACEMENT: 'CRM_DEAL_DETAIL_TAB',
    HANDLER: 'https://erp-api.example/api/bitrix-connector/placement-call',
    TITLE: 'LLAMAR',
  } }])
})

