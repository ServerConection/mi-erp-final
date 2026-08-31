const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const controllerPath = path.resolve(__dirname, '../src/controllers/wa_lines.controller.js')
const proxyPoolPath = path.resolve(__dirname, '../src/services/proxyPool.service.js')
const dbPath = path.resolve(__dirname, '../src/config/db.js')

function cargarControlador(queryImpl) {
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: queryImpl } }
  require.cache[proxyPoolPath] = {
    id: proxyPoolPath, filename: proxyPoolPath, loaded: true,
    exports: { construirProxyAutomatico: async () => null, quemarPuerto: async () => true, rotarProxyDeLinea: async () => null },
  }
  delete require.cache[controllerPath]
  return require(controllerPath)
}

function fakeRes() {
  const res = { statusCode: 200 }
  res.status = (code) => { res.statusCode = code; return res }
  res.json = (body) => { res.body = body; return res }
  return res
}

test('dashboard no muestra un qr_ready historico cuando Baileys no tiene QR activo', async () => {
  const query = async () => ({ rows: [{
    id: 'line-1', name: 'ASESOR_1', phone_number: '593999000111', status: 'qr_ready',
    last_connected: new Date().toISOString(), created_at: new Date().toISOString(), created_by: 1,
    empresa: 'NOVONET', usuario: 'asesor1', nombre_completo: 'Asesor Uno',
  }] })
  const { dashboard } = cargarControlador(query)
  const req = {
    user: { id: 1, perfil: 'ADMINISTRADOR' },
    app: { get: () => ({ getStatus: () => 'disconnected', getQR: () => null }) },
  }
  const res = fakeRes()

  await dashboard(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data[0].asesores[0].lineas[0].estado, 'disconnected')
  assert.equal(res.body.resumen.conectadas, 0)
})
