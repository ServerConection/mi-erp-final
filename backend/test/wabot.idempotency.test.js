const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

test('un mensaje entrante duplicado no vuelve a ejecutar el bot', async () => {
  const managerPath = path.resolve(__dirname, '../src/services/BaileysManager.js')
  const dbPath = path.resolve(__dirname, '../src/config/db.js')
  const flowPath = path.resolve(__dirname, '../src/services/FlowEngine.js')
  let flowRuns = 0

  const query = async (sql) => {
    if (sql.includes('INSERT INTO messages')) return { rows: [] }
    if (sql.includes('SELECT bot_id FROM lines')) return { rows: [{ bot_id: 'bot-1' }] }
    return { rows: [] }
  }

  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query } }
  require.cache[flowPath] = {
    id: flowPath,
    filename: flowPath,
    loaded: true,
    exports: class FlowEngineFake {
      async process() { flowRuns += 1 }
    },
  }

  try {
    delete require.cache[managerPath]
    const BaileysManager = require(managerPath)
    const manager = new BaileysManager({ emit() {} })
    manager._getOrCreateConversation = async () => ({ id: 'conv-1' })

    await manager._handleIncomingMessage(
      'line-1', {}, { key: { id: 'wa-message-1' } },
      '593999999999@s.whatsapp.net', '593999999999', 'hola', 'text'
    )

    assert.equal(flowRuns, 0)
  } finally {
    delete require.cache[managerPath]
    delete require.cache[dbPath]
    delete require.cache[flowPath]
  }
})
