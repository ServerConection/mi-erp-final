/**
 * Vigilancia del cierre diario desde el ERP.
 *
 * El cierre corre en una PC de la oficina y guarda en una base local que el
 * servidor no ve. Lo único que cruza es un latido. Este test fija los casos
 * que importan: que un silencio se note, y que un latido fresco con tablas en
 * error NO pase por bueno.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const dbPath = path.resolve(__dirname, '../src/config/db.js')
const ctrlPath = path.resolve(__dirname, '../src/controllers/salud.controller.js')

function cargar(filaEstado) {
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
      query: async (sql) => /cierre_diario_estado/.test(sql)
        ? { rows: filaEstado ? [filaEstado] : [] }
        : { rows: [{}] },
      transaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
    },
  }
  delete require.cache[ctrlPath]
  return require(ctrlPath)
}
const limpiar = () => { delete require.cache[ctrlPath]; delete require.cache[dbPath] }

const haceHoras = (h) => new Date(Date.now() - h * 3600000)
const fila = (over = {}) => ({
  fecha_cierre: '2026-09-06', filas_total: 627, tablas_ok: 3, tablas_error: 0,
  detalle: 'cierre_diario_bitrix: 433 filas', actualizado_en: haceHoras(2), ...over,
})

// El controlador expone el mapa completo; se busca el componente del cierre.
async function componente(filaEstado) {
  const ctrl = cargar(filaEstado)
  let cuerpo = null
  const res = { status: () => res, json: (b) => { cuerpo = b; return res } }
  await ctrl.getSalud({ query: {} }, res)
  return (cuerpo?.componentes || []).find(c => c.id === 'cierre_diario')
}

test('latido de hace 2 horas: todo en orden', async () => {
  try {
    const c = await componente(fila())
    assert.ok(c, 'el mapa debe incluir el cierre diario')
    assert.equal(c.estado, 'OK')
    assert.match(c.medida, /627/)
  } finally { limpiar() }
})

test('26 horas todavia es normal: corre una vez al dia', async () => {
  try {
    assert.equal((await componente(fila({ actualizado_en: haceHoras(25) }))).estado, 'OK')
  } finally { limpiar() }
})

test('a las 30 horas avisa que se esta retrasando', async () => {
  try {
    assert.equal((await componente(fila({ actualizado_en: haceHoras(30) }))).estado, 'RETRASO')
  } finally { limpiar() }
})

test('pasadas 36 horas se salto una noche entera', async () => {
  try {
    assert.equal((await componente(fila({ actualizado_en: haceHoras(40) }))).estado, 'CAIDO')
  } finally { limpiar() }
})

test('un latido FRESCO con tablas en error no pasa por bueno', async () => {
  try {
    const c = await componente(fila({ tablas_error: 1, tablas_ok: 2, actualizado_en: haceHoras(1) }))
    assert.equal(c.estado, 'CAIDO', 'el respaldo quedó incompleto aunque el aviso sea reciente')
    assert.match(c.medida, /error/i)
  } finally { limpiar() }
})

test('si nunca reporto, se dice explicitamente', async () => {
  try {
    const c = await componente(null)
    assert.equal(c.estado, 'CAIDO')
    assert.match(c.medida, /nunca/i)
  } finally { limpiar() }
})

test('no es critico: que falte un respaldo no pinta el ERP entero en rojo', async () => {
  try {
    assert.equal((await componente(fila())).critico, false)
  } finally { limpiar() }
})
