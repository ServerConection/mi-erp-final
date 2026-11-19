const test = require('node:test')
const assert = require('node:assert/strict')

const { isBitrixEmbedPath } = require('../src/security/bitrixEmbedPolicy')

test('recognizes every Bitrix iframe route, including LLAMAR', () => {
  assert.equal(isBitrixEmbedPath('/api/bitrix-connector/install'), true)
  assert.equal(isBitrixEmbedPath('/api/bitrix-connector/settings'), true)
  assert.equal(isBitrixEmbedPath('/api/bitrix-connector/placement-inbox'), true)
  assert.equal(isBitrixEmbedPath('/api/bitrix-connector/placement-call'), true)
  assert.equal(isBitrixEmbedPath('/api/bitrix-connector/placement-call/start'), true)
  assert.equal(isBitrixEmbedPath('/api/health'), false)
})
