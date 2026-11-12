const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const dbPath = path.resolve(__dirname, '../src/config/db.js')
const controllerPath = path.resolve(__dirname, '../src/controllers/wa_conversations.controller.js')

function loadController(query) {
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query } }
  delete require.cache[controllerPath]
  return require(controllerPath)
}

test('message history is chronological and no longer truncates at the oldest 500', async () => {
  const sql = []
  const controller = loadController(async (statement) => {
    sql.push(statement)
    if (statement.includes('SELECT c.*, l.created_by AS line_created_by')) {
      return { rows: [{ id: 'c', line_id: 'l', wa_number: '5939' }] }
    }
    return { rows: [] }
  })
  const req = { params: { id: 'c' }, user: { id: 1, perfil: 'ADMINISTRADOR' }, app: { get: () => null } }
  const res = { status() { return this }, json(body) { this.body = body } }
  await controller.getMessages(req, res)
  const history = sql.find(s => s.includes('FROM messages m') && s.includes('ORDER BY m.timestamp ASC'))
  assert.match(history, /ORDER BY m\.timestamp ASC/)
  assert.doesNotMatch(history, /LIMIT 500/)
  delete require.cache[controllerPath]; delete require.cache[dbPath]
})

test('Human filter includes legacy human and current human_takeover statuses', async () => {
  let listSql = ''
  const controller = loadController(async (statement) => {
    if (statement.includes('WITH base AS')) listSql = statement
    return { rows: [] }
  })
  const req = { query: { status: 'human_takeover' }, user: { id: 1, perfil: 'ADMINISTRADOR' } }
  const res = { status() { return this }, json(body) { this.body = body } }
  await controller.getAll(req, res)
  assert.match(listSql, /c\.status IN \('human','human_takeover'\)/)
  delete require.cache[controllerPath]; delete require.cache[dbPath]
})

test('Inbox obtiene el ultimo mensaje una sola vez y cuenta no leidos con indices', async () => {
  let listSql = ''
  const controller = loadController(async (statement) => {
    if (statement.includes('WITH base AS')) listSql = statement
    return { rows: [] }
  })
  const req = { query: { limit: '500' }, user: { id: 1, perfil: 'USUARIO' } }
  const res = { status() { return this }, json(body) { this.body = body } }
  await controller.getAll(req, res)
  assert.equal(res.body.success, true)
  assert.match(listSql, /LEFT JOIN LATERAL/)
  assert.match(listSql, /unnest\(top\.conversation_ids\)/)
  assert.match(listSql, /m\.direction = 'in'/)
  assert.doesNotMatch(listSql, /SELECT content FROM messages/)
  assert.doesNotMatch(listSql, /SELECT direction FROM messages/)
  delete require.cache[controllerPath]; delete require.cache[dbPath]
})
