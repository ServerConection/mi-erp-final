const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

test('internal note is persisted and emitted without calling WhatsApp', async () => {
  const dbPath = path.resolve(__dirname, '../src/config/db.js')
  const controllerPath = path.resolve(__dirname, '../src/controllers/wa_conversations.controller.js')
  const queries = [], emitted = []
  const conversation = { id: 'c1', line_id: 'l1', wa_number: '5939', line_created_by: 7 }
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    query: async (sql, args) => {
      queries.push({ sql, args })
      if (sql.includes('FROM conversations c')) return { rows: [conversation] }
      if (sql.includes('INSERT INTO messages')) return { rows: [{ id: 'm1', type: 'internal_note', content: args[3], metadata: JSON.parse(args[4]) }] }
      return { rows: [] }
    },
  } }
  delete require.cache[controllerPath]
  try {
    const controller = require(controllerPath)
    const bm = { _emitInbox: async (...args) => emitted.push(args), sendText: () => assert.fail('must not send WhatsApp') }
    const req = { params: { id: 'c1' }, body: { text: '  Gestión sin respuesta  ' },
      user: { id: 7, username: 'asesor', perfil: 'ASESOR' }, app: { get: () => bm } }
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this }, json(body) { this.body = body; return this } }
    await controller.createInternalNote(req, res)
    assert.equal(res.body.success, true)
    const insert = queries.find(q => q.sql.includes('INSERT INTO messages'))
    assert.match(insert.sql, /'internal_note'/)
    assert.equal(insert.args[3], 'Gestión sin respuesta')
    assert.equal(JSON.parse(insert.args[4]).author, 'asesor')
    assert.equal(emitted[0][1], 'message:new')
  } finally { delete require.cache[controllerPath]; delete require.cache[dbPath] }
})

test('call event is stored once and later statuses update it', async () => {
  const dbPath = path.resolve(__dirname, '../src/config/db.js')
  const managerPath = path.resolve(__dirname, '../src/services/BaileysManager.js')
  let exists = false
  const statements = []
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    query: async (sql, args) => {
      statements.push({ sql, args })
      if (sql.startsWith('SELECT id FROM messages')) return { rows: exists ? [{ id: 'm1' }] : [] }
      if (sql.includes('INSERT INTO messages')) { exists = true; return { rows: [{ id: 'm1', type: 'call', wa_msg_id: 'call1' }] } }
      if (sql.includes('UPDATE messages SET content')) return { rows: [{ id: 'm1', type: 'call', wa_msg_id: 'call1' }] }
      return { rows: [] }
    }, transaction: async fn => fn({ query: async () => ({ rows: [] }) }),
  } }
  delete require.cache[managerPath]
  try {
    const Manager = require(managerPath), bm = new Manager({ emit() {} })
    bm._getOrCreateConversation = async () => ({ id: 'c1' }); bm._emitInbox = async () => {}
    const sock = { user: { id: '593000@s.whatsapp.net' } }
    await bm._handleCallEvent('l1', sock, { id: 'call1', from: '593999@s.whatsapp.net', chatId: '593999@s.whatsapp.net', status: 'offer', date: new Date() })
    await bm._handleCallEvent('l1', sock, { id: 'call1', from: '593999@s.whatsapp.net', chatId: '593999@s.whatsapp.net', status: 'timeout', date: new Date() })
    assert.equal(statements.filter(q => q.sql.includes('INSERT INTO messages')).length, 1)
    assert.equal(statements.filter(q => q.sql.includes('UPDATE messages SET content')).length, 1)
  } finally { delete require.cache[managerPath]; delete require.cache[dbPath] }
})
