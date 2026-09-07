/**
 * Mapa de módulos de Salud del Sistema.
 *
 * Lo que aporta sobre la lista de chequeos es la propagación: una pantalla no
 * se mide sola, está mal cuando lo está algo de lo que come. Si la propagación
 * falla, el mapa miente en verde — que es peor que no tenerlo.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const dbPath = path.resolve(__dirname, '../src/config/db.js')
const ctrlPath = path.resolve(__dirname, '../src/controllers/salud.controller.js')

const FRESCO = () => new Date()
const VIEJO  = () => new Date(Date.now() - 90000000)   // ~25 h

function cargar({ congelar = [] } = {}) {
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
      query: async (sql) => {
        if (/cierre_diario_estado/.test(sql)) {
          return { rows: [{ fecha_cierre: '2026-09-06', filas_total: 1, tablas_ok: 3, tablas_error: 0, detalle: '', actualizado_en: FRESCO() }] }
        }
        if (/nexo_ia_jobs/.test(sql)) return { rows: [{ pendientes: 3, ultimo: FRESCO() }] }
        if (/FROM public\.lines/.test(sql)) return { rows: [{ total: 10, conectadas: 9 }] }
        const roto = congelar.some(t => new RegExp(t).test(sql))
        return { rows: [{ ultimo: roto ? VIEJO() : FRESCO(), total: 10 }] }
      },
      transaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
    },
  }
  delete require.cache[ctrlPath]
  return require(ctrlPath)
}
const limpiar = () => { delete require.cache[ctrlPath]; delete require.cache[dbPath] }

async function mapaCon(opts) {
  const ctrl = cargar(opts)
  let cuerpo = null
  const res = { status: () => res, json: (b) => { cuerpo = b } }
  await ctrl.getSalud({ query: {} }, res)
  const todos = {}
  for (const capa of cuerpo.mapa.capas) for (const n of capa.nodos) todos[n.id] = n
  return todos
}

test('con todo al dia, las pantallas estan al dia', async () => {
  try {
    const m = await mapaCon()
    for (const id of ['reporte_d1', 'vista_asesor', 'gerencial', 'redes']) {
      assert.equal(m[id].estado, 'OK', `${id} deberia estar OK`)
      assert.equal(m[id].causa, null)
    }
  } finally { limpiar() }
})

test('si la Maestra Bitrix se congela, arrastra a las pantallas que comen de ella', async () => {
  try {
    const m = await mapaCon({ congelar: ['mestra_bitrix'] })
    assert.equal(m.mestra_bitrix.estado, 'CAIDO')
    for (const id of ['reporte_d1', 'vista_asesor', 'gerencial']) {
      assert.equal(m[id].estado, 'CAIDO', `${id} come de la Maestra Bitrix`)
      assert.equal(m[id].causa, 'Maestra Bitrix', 'debe decir QUIÉN lo arrastró')
    }
  } finally { limpiar() }
})

test('lo que NO come de la Maestra Bitrix no se contagia', async () => {
  try {
    const m = await mapaCon({ congelar: ['mestra_bitrix'] })
    assert.equal(m.vista_asesor_velsa.estado, 'OK', 'Velsa sale de su propia vista materializada')
    assert.equal(m.redes.estado, 'OK', 'Redes sale del webhook')
    assert.equal(m.cierre.estado, 'OK')
  } finally { limpiar() }
})

test('un problema encadenado viaja dos saltos', async () => {
  try {
    const m = await mapaCon({ congelar: ['mv_indicadores_velsa_completo'] })
    assert.equal(m.mv_velsa.estado, 'CAIDO')
    assert.equal(m.vista_asesor_velsa.estado, 'CAIDO')
    assert.equal(m.redes_velsa.estado, 'CAIDO')
    assert.equal(m.gerencial.estado, 'CAIDO', 'Gerencial come de las dos empresas')
  } finally { limpiar() }
})

test('las fuentes externas no se pintan en rojo por las dudas', async () => {
  try {
    const m = await mapaCon({ congelar: ['mestra_bitrix'] })
    for (const id of ['bitrix', 'jotform', 'wintracker', 'whatsapp']) {
      assert.equal(m[id].estado, 'SIN_MEDIR', `${id} no se mide, no se inventa un estado`)
    }
  } finally { limpiar() }
})

test('cada nodo declara a quien alimenta, para poder dibujar las flechas', async () => {
  try {
    const m = await mapaCon()
    assert.ok(m.mestra_bitrix.alimenta.includes('reporte_d1'))
    assert.ok(m.webhook.alimenta.includes('redes'))
    // Todo destino declarado tiene que existir: una flecha al vacío no se dibuja
    for (const n of Object.values(m)) {
      for (const destino of n.alimenta) {
        assert.ok(m[destino], `${n.id} apunta a "${destino}", que no existe en el mapa`)
      }
    }
  } finally { limpiar() }
})
