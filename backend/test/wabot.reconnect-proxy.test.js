const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const controllerPath = path.resolve(__dirname, '../src/controllers/wa_lines.controller.js')
const proxyPoolPath = path.resolve(__dirname, '../src/services/proxyPool.service.js')
const dbPath = path.resolve(__dirname, '../src/config/db.js')

function cargarControlador({ queryImpl, construirProxyAutomaticoImpl }) {
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: queryImpl } }
  require.cache[proxyPoolPath] = {
    id: proxyPoolPath, filename: proxyPoolPath, loaded: true,
    exports: {
      construirProxyAutomatico: construirProxyAutomaticoImpl,
      quemarPuerto: async () => true,
      rotarProxyDeLinea: async () => null,
    },
  }
  delete require.cache[controllerPath]
  return require(controllerPath)
}

function fakeRes() {
  const res = {}
  res.statusCode = 200
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

test('reconectar una linea SIN proxy le asigna uno automatico antes de conectar', async () => {
  const updates = []
  let bmConnectCalledWith = null

  const query = async (sql, params) => {
    if (sql.includes('FROM lines l LEFT JOIN usuarios')) {
      return { rows: [{ id: 'line-1', name: 'ASESOR_7', proxy_enabled: false, proxy_config: {}, created_by: 1 }] }
    }
    if (sql.includes('UPDATE lines SET proxy_enabled=true')) {
      updates.push(params)
      return { rows: [] }
    }
    return { rows: [] }
  }
  const construirProxyAutomatico = async () => ({ protocol: 'http', host: 'gw.dataimpulse.com', port: 10005, username: 'u__cr.ec', password: 'p' })

  const { connect } = cargarControlador({ queryImpl: query, construirProxyAutomaticoImpl: construirProxyAutomatico })

  const req = {
    params: { id: 'line-1' },
    user: { id: 1, perfil: 'ASESOR' },
    app: { get: () => ({ connect: async (id) => { bmConnectCalledWith = id } }) },
  }
  const res = fakeRes()

  await connect(req, res)

  assert.equal(updates.length, 1, 'debia asignar proxy antes de conectar')
  assert.equal(updates[0][1], 'line-1')
  const configGuardada = JSON.parse(updates[0][0])
  assert.equal(configGuardada.host, 'gw.dataimpulse.com')
  assert.equal(bmConnectCalledWith, 'line-1', 'igual debe conectar la linea')
  assert.equal(res.statusCode, 200)
})

test('reconectar una linea que YA tiene proxy no vuelve a pedir uno', async () => {
  let seLlamoConstruir = false
  const query = async (sql) => {
    if (sql.includes('FROM lines l LEFT JOIN usuarios')) {
      return { rows: [{ id: 'line-2', name: 'ASESOR_2', proxy_enabled: true, proxy_config: { host: 'gw.dataimpulse.com', port: 10002 }, created_by: 1 }] }
    }
    return { rows: [] }
  }
  const construirProxyAutomatico = async () => { seLlamoConstruir = true; return { host: 'x', port: 1 } }

  const { connect } = cargarControlador({ queryImpl: query, construirProxyAutomaticoImpl: construirProxyAutomatico })

  const req = {
    params: { id: 'line-2' },
    user: { id: 1, perfil: 'ASESOR' },
    app: { get: () => ({ connect: async () => {} }) },
  }
  await connect(req, fakeRes())

  assert.equal(seLlamoConstruir, false)
})

test('si no se puede asignar proxy al reconectar, IGUAL se conecta (no bloquea al asesor)', async () => {
  let bmConnectCalled = false
  const query = async (sql) => {
    if (sql.includes('FROM lines l LEFT JOIN usuarios')) {
      return { rows: [{ id: 'line-3', name: 'ASESOR_9', proxy_enabled: false, proxy_config: {}, created_by: 1 }] }
    }
    return { rows: [] }
  }
  const construirProxyAutomatico = async () => null // sin credenciales / pool agotado

  const { connect } = cargarControlador({ queryImpl: query, construirProxyAutomaticoImpl: construirProxyAutomatico })

  const req = {
    params: { id: 'line-3' },
    user: { id: 1, perfil: 'ASESOR' },
    app: { get: () => ({ connect: async () => { bmConnectCalled = true } }) },
  }
  const res = fakeRes()
  await connect(req, res)

  assert.equal(bmConnectCalled, true)
  assert.equal(res.statusCode, 200)
})
