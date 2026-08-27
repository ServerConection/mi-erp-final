const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const managerPath = path.resolve(__dirname, '../src/services/BaileysManager.js')
const dbPath = path.resolve(__dirname, '../src/config/db.js')

function cargarBaileysManager() {
  // BaileysManager hace `require('../config/db')` al cargar el módulo — se
  // mockea para no necesitar una base de datos real, igual que el resto de
  // pruebas de wabot en esta carpeta.
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { query: async () => ({ rows: [] }), transaction: async (fn) => fn({ query: async () => ({ rows: [] }) }) },
  }
  delete require.cache[managerPath]
  return require(managerPath)
}

test('sin WA_PROXY_REQUIRED, cualquier linea puede conectar aunque no tenga proxy', () => {
  const BaileysManager = cargarBaileysManager()
  assert.equal(BaileysManager.proxyPermiteConectar({ proxy_enabled: false }, false), true)
  assert.equal(BaileysManager.proxyPermiteConectar(null, false), true)
})

test('con WA_PROXY_REQUIRED activo, una linea sin proxy_enabled no puede conectar', () => {
  const BaileysManager = cargarBaileysManager()
  assert.equal(BaileysManager.proxyPermiteConectar({ proxy_enabled: false }, true), false)
})

test('con WA_PROXY_REQUIRED activo, una linea con proxy_enabled pero sin host/puerto no puede conectar', () => {
  const BaileysManager = cargarBaileysManager()
  assert.equal(BaileysManager.proxyPermiteConectar({ proxy_enabled: true, proxy_config: {} }, true), false)
  assert.equal(BaileysManager.proxyPermiteConectar({ proxy_enabled: true, proxy_config: { host: 'gw.dataimpulse.com' } }, true), false)
})

test('con WA_PROXY_REQUIRED activo, una linea con proxy completo SI puede conectar', () => {
  const BaileysManager = cargarBaileysManager()
  assert.equal(
    BaileysManager.proxyPermiteConectar(
      { proxy_enabled: true, proxy_config: { host: 'gw.dataimpulse.com', port: 10001 } },
      true
    ),
    true
  )
})

test('connect() detiene la conexion y marca proxy_error si falta proxy y es obligatorio', async () => {
  const originalRequired = process.env.WA_PROXY_REQUIRED
  process.env.WA_PROXY_REQUIRED = 'true'

  const statusUpdates = []
  const emitted = []

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      query: async (sql, params) => {
        if (sql.includes('SELECT status FROM lines')) return { rows: [{ status: 'disconnected' }] }
        if (sql.includes('SELECT * FROM lines WHERE id')) {
          return { rows: [{ id: params[0], proxy_enabled: false, proxy_config: {}, created_by: 1 }] }
        }
        if (sql.includes('UPDATE lines SET status')) {
          statusUpdates.push(params[0])
          return { rows: [] }
        }
        return { rows: [] }
      },
      transaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
    },
  }
  delete require.cache[managerPath]
  const BaileysManager = require(managerPath)

  try {
    const manager = new BaileysManager({ emit: (event, payload) => emitted.push({ event, payload }) })

    await assert.rejects(
      () => manager.connect('line-sin-proxy'),
      /PROXY_REQUIRED/
    )

    assert.ok(statusUpdates.includes('proxy_error'), `esperaba proxy_error, recibido: ${statusUpdates}`)
    assert.ok(emitted.some(e => e.payload?.status === 'proxy_error'))
    assert.equal(manager.instances['line-sin-proxy'], undefined, 'no debe haber creado un socket')
  } finally {
    if (originalRequired === undefined) delete process.env.WA_PROXY_REQUIRED
    else process.env.WA_PROXY_REQUIRED = originalRequired
    delete require.cache[managerPath]
  }
})
