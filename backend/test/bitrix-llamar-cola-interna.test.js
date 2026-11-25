const test = require('node:test')
const assert = require('node:assert/strict')
const { createBitrixCallPlacementController } = require('../src/controllers/bitrixCallPlacement.controller')
const { createCallActionToken } = require('../src/services/bitrixCallPlacement.service')

function resFalsa() {
  return { codigo: 200, html: '', set() {}, status(c) { this.codigo = c; return this }, send(h) { this.html = h; return this } }
}

test('LLAMAR desde Bitrix encola en el Automarcador interno (igual que WABOT), sin ngrok', async () => {
  const encoladas = []
  const pool = {
    query: async (sql) => {
      if (/UPDATE bitrix_sso_codes/.test(sql)) return { rows: [{ usuario_id: '15' }] }
      if (/SELECT empresa FROM usuarios/.test(sql)) return { rows: [{ empresa: 'NOVONET' }] }
      throw new Error('SQL inesperado: ' + sql)
    },
  }
  const c = createBitrixCallPlacementController({
    bitrixApp: { PORTAL: 'https://novonet.bitrix24.es' },
    pool,
    actionSecret: 'secreto-de-prueba-123456789012345',
    fetchImpl: async () => { throw new Error('no debe llamar al automarcador externo') },
    resolverTelefono: async () => ({ phone: '593991234567', contactName: 'Anthony' }),
    encolar: async (...args) => { encoladas.push(args); return { item_id: 9 } },
  })
  const token = createCallActionToken({ dealId: '718509', userId: '87', erpUserId: '15', authId: 'abc' }, 'secreto-de-prueba-123456789012345', { nonce: 'n1' })
  const res = resFalsa()
  await c.startCall({ body: { action_token: token } }, res)
  assert.equal(res.codigo, 202, res.html)
  assert.equal(encoladas.length, 1)
  const [usuarioId, empresa, datos] = encoladas[0]
  assert.equal(String(usuarioId), '15')
  assert.equal(empresa, 'NOVONET')
  assert.deepEqual(datos, { telefono: '593991234567', nombre: 'Anthony', deal_id: '718509' })
  assert.match(res.html, /Automarcador/)
})
