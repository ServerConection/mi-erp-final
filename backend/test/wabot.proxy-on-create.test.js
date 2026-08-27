const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const controllerPath = path.resolve(__dirname, '../src/controllers/wa_lines.controller.js')
const proxyPoolPath = path.resolve(__dirname, '../src/services/proxyPool.service.js')
const dbPath = path.resolve(__dirname, '../src/config/db.js')

function cargarControlador({ patron } = {}) {
  const prevPatron = process.env.PROXY_PATRON_LINEA
  if (patron === undefined) delete process.env.PROXY_PATRON_LINEA
  else process.env.PROXY_PATRON_LINEA = patron

  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => ({ rows: [] }) } }
  require.cache[proxyPoolPath] = {
    id: proxyPoolPath, filename: proxyPoolPath, loaded: true,
    exports: { construirProxyAutomatico: async () => null, quemarPuerto: async () => true, rotarProxyDeLinea: async () => null },
  }
  delete require.cache[controllerPath]
  const controller = require(controllerPath)

  if (prevPatron === undefined) delete process.env.PROXY_PATRON_LINEA
  else process.env.PROXY_PATRON_LINEA = prevPatron

  return controller
}

test('por defecto (sin PROXY_PATRON_LINEA), TODA linea nueva coincide con el patron de proxy', () => {
  const { lineaLlevaProxy } = cargarControlador()
  assert.equal(lineaLlevaProxy('ASESOR_1'), true)
  assert.equal(lineaLlevaProxy('ENVIO_3'), true)
  assert.equal(lineaLlevaProxy('cualquier-nombre-raro'), true)
})

test('PROXY_PATRON_LINEA sigue permitiendo acotar a un prefijo si se necesita', () => {
  const { lineaLlevaProxy } = cargarControlador({ patron: '^ENVIO' })
  assert.equal(lineaLlevaProxy('ENVIO_3'), true)
  assert.equal(lineaLlevaProxy('ASESOR_1'), false)
})
