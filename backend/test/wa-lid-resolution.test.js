const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const dbPath = path.resolve(__dirname, '../src/config/db.js')
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async () => ({ rows: [] }) } }
const Manager = require('../src/services/BaileysManager')

test('remoteJidAlt vincula mensajes entrantes y salientes con el teléfono de Presentación', async () => {
  const bm = new Manager({ emit() {} })
  const mappings = []
  bm._saveLidMapping = async (...args) => mappings.push(args)
  for (const fromMe of [false, true]) {
    const phone = await bm._resolveLid('212119928705162@lid', {}, 'line', {
      key: { fromMe, remoteJidAlt: '593999669941:2@s.whatsapp.net' }
    })
    assert.equal(phone, '593999669941')
  }
  assert.deepEqual(mappings, Array(2).fill(['212119928705162', '593999669941']))
})

test('resuelve LID desde Signal sin consultar un identificador como teléfono', async () => {
  const bm = new Manager({ emit() {} })
  bm._saveLidMapping = async () => {}
  const sock = { onWhatsApp() { assert.fail('LID no es teléfono') },
    signalRepository: { lidMapping: { getPNForLID: async () => '593999669941@s.whatsapp.net' } } }
  assert.equal(await bm._resolveLid('212119928705162@lid', sock, 'line'), '593999669941')
})

test('Presentación registra también LID cuando onWhatsApp devuelve el JID del teléfono', async () => {
  const bm = new Manager({ emit() {} })
  const mappings = []
  bm._saveLidMapping = async (...args) => mappings.push(args)
  bm.instances.line = { sock: {
    onWhatsApp: async () => [{ jid: '593999669941@s.whatsapp.net', exists: true }],
    signalRepository: { lidMapping: { getLIDForPN: async () => '212119928705162@lid' } }
  } }
  assert.equal(await bm.resolveWaJid('line', '593999669941'), '593999669941@s.whatsapp.net')
  assert.deepEqual(mappings, [['212119928705162', '593999669941']])
})
