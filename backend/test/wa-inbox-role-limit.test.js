const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const dbPath = path.resolve(__dirname, '../src/config/db.js')
const calls = []
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] } } } }
const { getAll } = require('../src/controllers/wa_conversations.controller')
for (const empresa of ['NOVONET', 'VELSA']) {
  for (const perfil of ['ADMINISTRADOR', 'ASESOR']) {
    test(empresa + ' ' + perfil + ': l?mite de conversaciones del Deal', async () => {
      calls.length = 0
      const req = { query: { bitrix_deal_id: '123' }, user: { id: 7, empresa, perfil } }
      const res = { json(body) { this.body = body }, status() { return this } }
      await getAll(req, res)
      assert.equal(res.body.success, true)
      assert.equal(calls[0].params.at(-1), perfil === 'ADMINISTRADOR' ? 100 : 1)
      assert.ok(calls[0].sql.includes('c.bitrix_deal_id = $1'))
      if (perfil === 'ASESOR') assert.ok(calls[0].params.includes(7))
    })
  }
}
