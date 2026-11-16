const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const controllerPath = path.resolve(__dirname, '../src/controllers/wa_lines.controller.js')
const proxyPoolPath = path.resolve(__dirname, '../src/services/proxyPool.service.js')
const dbPath = path.resolve(__dirname, '../src/config/db.js')

test('reactivar una linea transfiere created_by al usuario autenticado', async () => {
  const consultas = []
  const lineaAnterior = {
    id: 'linea-noti-back',
    name: 'NOTI_BACK',
    bot_id: null,
    proxy_config: {},
    created_by: 253,
  }

  const query = async (sql, params = []) => {
    consultas.push({ sql, params })
    if (sql.includes('COUNT(*)::int AS total')) return { rows: [{ total: 0 }] }
    if (sql.includes('deleted_at IS NULL LIMIT 1')) return { rows: [] }
    if (sql.includes('deleted_at IS NOT NULL')) return { rows: [lineaAnterior] }
    if (sql.includes('UPDATE lines SET')) {
      return { rows: [{ ...lineaAnterior, created_by: params[3], deleted_at: null, status: 'disconnected' }] }
    }
    throw new Error(`Consulta no esperada: ${sql}`)
  }

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { query },
  }
  require.cache[proxyPoolPath] = {
    id: proxyPoolPath,
    filename: proxyPoolPath,
    loaded: true,
    exports: {
      construirProxyAutomatico: async () => null,
      liberarPuertoDeLinea: async () => true,
      estadoPool: async () => ({}),
    },
  }
  delete require.cache[controllerPath]
  const controller = require(controllerPath)

  let statusCode = null
  let payload = null
  const req = {
    user: { id: 297, usuario: 'arengel', perfil: 'ATC', empresa: 'NOVONET' },
    body: { name: 'NOTI_BACK', proxy_enabled: false },
  }
  const res = {
    status(code) { statusCode = code; return this },
    json(data) { payload = data; return this },
  }

  await controller.create(req, res)

  assert.equal(statusCode, 201)
  assert.equal(payload.success, true)
  assert.equal(payload.data.created_by, 297)

  const reactivacion = consultas.find(({ sql }) => sql.includes('UPDATE lines SET'))
  assert.ok(reactivacion)
  assert.match(reactivacion.sql, /created_by = \$4/)
  assert.match(reactivacion.sql, /WHERE id = \$5/)
  assert.deepEqual(reactivacion.params.slice(3), [297, 'linea-noti-back'])
})
