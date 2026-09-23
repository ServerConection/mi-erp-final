const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const dbPath = path.resolve(__dirname, '../src/config/db.js')
const controllerPath = path.resolve(__dirname, '../src/controllers/wa_conversations.controller.js')

function setup(rowsForConversation) {
  const calls = []
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async (sql, args) => {
    calls.push({ sql, args })
    if (sql.includes('WHERE c.id=$1')) return { rows: rowsForConversation }
    return { rows: [] }
  } } }
  delete require.cache[controllerPath]
  return { controller: require(controllerPath), calls }
}

function response() {
  return { statusCode: 200, status(n) { this.statusCode = n; return this }, json(body) { this.body = body; return this } }
}

test('advisor cannot open protected conversation by direct id', async () => {
  const h = setup([{ id: 'c', line_id: 'l', wa_number: '59398650281', line_created_by: 7 }])
  const req = { params: { id: 'c' }, user: { id: 7, perfil: 'ASESOR' }, app: { get: () => null } }
  const res = response()
  await h.controller.getMessages(req, res)
  assert.equal(res.statusCode, 404)
  delete require.cache[controllerPath]; delete require.cache[dbPath]
})

test('admin can open protected conversation', async () => {
  const h = setup([{ id: 'c', line_id: 'l', wa_number: '59398650281' }])
  const req = { params: { id: 'c' }, user: { id: 1, perfil: 'ADMINISTRADOR' }, app: { get: () => null } }
  const res = response()
  await h.controller.getMessages(req, res)
  assert.equal(res.body.success, true)
  delete require.cache[controllerPath]; delete require.cache[dbPath]
})

test('non-admin inbox query excludes protected stored and real numbers', async () => {
  const h = setup([])
  const req = { query: {}, user: { id: 7, perfil: 'ASESOR' } }
  const res = response()
  await h.controller.getAll(req, res)
  const list = h.calls.find(c => c.sql.includes('ORDER BY c.last_msg_at'))
  assert.match(list.sql, /ct\.metadata->>'real_phone'/)
  assert.ok(list.args.some(value => Array.isArray(value) && value.includes('59398650281')))
  delete require.cache[controllerPath]; delete require.cache[dbPath]
})
