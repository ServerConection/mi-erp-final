/**
 * Los asesores no pueden descargar los Archivos Compartidos.
 *
 * El bloqueo tiene que estar en el SERVIDOR. Ocultar el botón en la pantalla
 * evita el clic, no la petición: cualquiera con la URL se lleva el Excel.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const dbPath = path.resolve(__dirname, '../src/config/db.js')
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async () => ({ rows: [] }), transaction: async (fn) => fn({ query: async () => ({ rows: [] }) }) },
}

const { noAsesor } = require('../src/middleware/auth')
const router = require('../src/routes/hojas.routes')

/** Middlewares registrados para un método+ruta del router. */
function capasDe(metodo, ruta) {
  const capa = router.stack.find(l => l.route
    && l.route.path === ruta
    && l.route.methods[metodo])
  assert.ok(capa, `no existe ${metodo.toUpperCase()} ${ruta}`)
  return capa.route.stack.map(s => s.name)
}

test('la ruta de exportar pasa por noAsesor', () => {
  assert.ok(capasDe('get', '/:hojaId/exportar').includes('noAsesor'),
    'sin noAsesor cualquier asesor puede bajarse la base entera')
})

test('leer e importar NO se bloquean: el asesor sigue trabajando', () => {
  assert.ok(!capasDe('get', '/:hojaId').includes('noAsesor'), 'abrir el archivo debe seguir permitido')
  assert.ok(!capasDe('put', '/:hojaId/celdas').includes('noAsesor'), 'editar celdas debe seguir permitido')
  assert.ok(!capasDe('get', '/:hojaId/historial').includes('noAsesor'))
})

test('noAsesor rechaza al perfil ASESOR con 403', () => {
  let codigo = null, cuerpo = null, siguio = false
  const res = { status: (c) => { codigo = c; return res }, json: (b) => { cuerpo = b } }
  noAsesor({ user: { perfil: 'ASESOR' } }, res, () => { siguio = true })
  assert.equal(codigo, 403)
  assert.equal(siguio, false, 'no debe continuar a la descarga')
  assert.equal(cuerpo.success, false)
})

test('los demas perfiles si pueden descargar', () => {
  for (const perfil of ['ADMINISTRADOR', 'SUPERVISOR', 'GERENCIA', 'ANALISTA', 'BACKOFFICE']) {
    let siguio = false
    noAsesor({ user: { perfil } }, { status: () => ({ json: () => {} }) }, () => { siguio = true })
    assert.equal(siguio, true, `${perfil} debería poder descargar`)
  }
})

test('sin usuario tampoco se descarga', () => {
  let siguio = false, codigo = null
  const res = { status: (c) => { codigo = c; return res }, json: () => {} }
  noAsesor({}, res, () => { siguio = true })
  assert.equal(siguio, false)
  assert.equal(codigo, 403)
})
