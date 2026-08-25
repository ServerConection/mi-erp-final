const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

test('mensajes simultaneos reutilizan una sola conversacion abierta', async () => {
  const managerPath = path.resolve(__dirname, '../src/services/BaileysManager.js')
  const dbPath = path.resolve(__dirname, '../src/config/db.js')
  let conversation = null
  let selectCount = 0
  let releaseSelects
  const bothSelected = new Promise(resolve => { releaseSelects = resolve })
  let inserts = 0
  let transactionQueue = Promise.resolve()

  const query = async (sql) => {
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] }
    if (sql.includes('SELECT * FROM conversations')) {
      const snapshot = conversation
      selectCount += 1
      if (selectCount === 2) releaseSelects()
      await bothSelected
      return { rows: snapshot ? [snapshot] : [] }
    }
    if (sql.includes('INSERT INTO contacts')) return { rows: [{ id: 'contact-1' }] }
    if (sql.includes('SELECT bot_id FROM lines')) return { rows: [{ bot_id: 'bot-1' }] }
    if (sql.includes('INSERT INTO conversations')) {
      inserts += 1
      conversation = { id: `conv-${inserts}`, line_id: 'line-1', wa_number: '593999999999' }
      return { rows: [conversation] }
    }
    return { rows: [] }
  }

  const clientQuery = async (sql) => {
    if (sql.includes('SELECT * FROM conversations')) return { rows: conversation ? [conversation] : [] }
    return query(sql)
  }
  const transaction = (fn) => {
    const run = transactionQueue.then(() => fn({ query: clientQuery }))
    transactionQueue = run.catch(() => {})
    return run
  }

  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: { query, transaction },
  }

  try {
    delete require.cache[managerPath]
    const BaileysManager = require(managerPath)
    const manager = new BaileysManager({ emit() {} })

    const results = await Promise.all([
      manager._getOrCreateConversation('line-1', '593999999999', '593999999999@s.whatsapp.net'),
      manager._getOrCreateConversation('line-1', '593999999999', '593999999999@s.whatsapp.net'),
    ])

    assert.equal(inserts, 1)
    assert.equal(results[0].id, results[1].id)
  } finally {
    delete require.cache[managerPath]
    delete require.cache[dbPath]
  }
})
