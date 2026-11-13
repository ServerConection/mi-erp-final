// Si la subida del archivo por el proxy de la línea falla, se reintenta con
// subida directa (sin proxy) y el mensaje sale igual.
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

function cargar() {
  const dbPath = path.resolve(__dirname, '../src/config/db.js')
  const managerPath = path.resolve(__dirname, '../src/services/BaileysManager.js')
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => ({ rows: [] }) } }
  delete require.cache[managerPath]
  const Manager = require(managerPath)
  const bm = new Manager({ emit() {} })
  bm._resolveSendJid = async () => '5939@s.whatsapp.net'
  bm._markSentByErp = () => {}
  bm._saveOutboundMessage = async () => {}
  return bm
}

test('foto: si el proxy falla al subir, reintenta con subida directa', async () => {
  const bm = cargar()
  const llamadas = []
  bm.mediaDispatchers.l = {}
  bm.instances.l = { status: 'connected', sock: {
    refreshMediaConn: async () => ({ hosts: [], auth: 'x' }),
    sendMessage: async (jid, body, opts) => {
      llamadas.push(opts)
      if (llamadas.length === 1) throw new Error('proxy timeout')
      return { key: { id: 'ok' } }
    },
  } }
  const r = await bm.sendMedia('l', '5939', { type: 'image', buffer: Buffer.from('jpg'), messageId: 'M1' })
  assert.equal(r.key.id, 'ok')
  assert.equal(llamadas.length, 2)
  assert.equal(llamadas[1].messageId, 'M1')
  assert.equal(typeof llamadas[1].upload, 'function')
})

test('sin proxy de media no hay reintento y el error se propaga', async () => {
  const bm = cargar()
  bm.instances.l = { status: 'connected', sock: { sendMessage: async () => { throw new Error('falló') } } }
  await assert.rejects(bm.sendMedia('l', '5939', { type: 'image', buffer: Buffer.from('jpg') }), /falló/)
})

test('archivo vacío: error claro', async () => {
  const bm = cargar()
  bm.instances.l = { status: 'connected', sock: { sendMessage: async () => ({}) } }
  await assert.rejects(bm.sendMedia('l', '5939', { type: 'image', buffer: Buffer.alloc(0) }), /vacío/)
})
