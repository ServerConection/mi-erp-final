/**
 * Forecast consolidado: Novonet + Velsa juntos.
 *
 * Dos cosas que tienen que quedar fijas:
 *  1. proyecta con el MISMO método que Redes → Reporte Data (se importa la
 *     función, no se copia);
 *  2. el CPA del conjunto es inversión total ÷ ventas totales, NO el promedio
 *     de los dos CPA — promediar ratios de tamaños distintos da un número que
 *     no existe.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const dbPath = path.resolve(__dirname, '../src/config/db.js')
const ctrlPath = path.resolve(__dirname, '../src/controllers/forecast.controller.js')
const gerPath  = path.resolve(__dirname, '../src/controllers/reporteGerencial.controller.js')

// Novonet: 300 de inversión en 2 días, 20 activas. Velsa: 100 y 5.
const FILAS = {
  novonet: [
    { fecha: '2026-09-01', origen: 'ARTS', monto_usd: 100 },
    { fecha: '2026-09-02', origen: 'ARTS', monto_usd: 200 },
  ],
  velsa: [{ fecha: '2026-09-01', origen: 'VELSA', monto_usd: 100 }],
}
const SERIE = {
  novonet: [
    { fecha: '2026-09-01', ingresos: 40, gestionables: 30, activas: 8,  inversion: 100 },
    { fecha: '2026-09-02', ingresos: 60, gestionables: 40, activas: 12, inversion: 200 },
  ],
  velsa: [{ fecha: '2026-09-01', ingresos: 20, gestionables: 10, activas: 5, inversion: 100 }],
}

function cargar() {
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
      query: async (sql, params) => {
        if (/novonet_inversion_redes/.test(sql) && !/SUM/.test(sql)) return { rows: FILAS.novonet }
        if (/velsa_inversion_redes/.test(sql)   && !/SUM/.test(sql)) return { rows: FILAS.velsa }
        return { rows: [] }
      },
      transaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
    },
  }
  delete require.cache[gerPath]; delete require.cache[ctrlPath]
  const ger = require(gerPath)
  // serieEmpresa toca la base de verdad; acá se reemplaza por datos fijos.
  const real = require(ctrlPath)
  ger.serieEmpresa = async (clave) => ({ empresa: clave, dias: SERIE[clave] })
  delete require.cache[ctrlPath]
  return require(ctrlPath)
}
const limpiar = () => { delete require.cache[ctrlPath]; delete require.cache[gerPath]; delete require.cache[dbPath] }

async function pedir(query = {}) {
  const ctrl = cargar()
  let cuerpo = null
  const res = { status: () => res, json: (b) => { cuerpo = b } }
  await ctrl.getConsolidado({ query: { anio: 2026, mes: 9, ...query } }, res)
  return cuerpo
}

test('suma las dos empresas y proyecta al cierre del mes', async () => {
  try {
    const r = await pedir()
    assert.equal(r.success, true)
    // Novonet 300 en 2 días = 150/día × 30 = 4500 · Velsa 100 en 1 día = 3000
    assert.equal(r.total.inversion.acumulado, 400)
    assert.equal(r.total.inversion.proyeccion_cierre, 7500)
    assert.equal(r.total.inversion.por_gastar, 7100)
  } finally { limpiar() }
})

test('proyecta la gestion total, que es el volumen que se puede trabajar', async () => {
  try {
    const r = await pedir()
    // Novonet 70 en 2 días = 35/día × 30 = 1050 · Velsa 10 × 30 = 300
    assert.equal(r.total.gestionables.acumulado, 80)
    assert.equal(r.total.gestionables.proyeccion_cierre, 1350)
  } finally { limpiar() }
})

test('el CPA del conjunto es inversion total / ventas totales, no un promedio', async () => {
  try {
    const r = await pedir()
    const inv = r.total.inversion.proyeccion_cierre     // 7500
    const act = r.total.activas.proyeccion_cierre       // 300 + 150 = 450
    assert.equal(r.total.cpa_proyectado, Number((inv / act).toFixed(2)))
    // El promedio de los CPA por empresa daría otro número: se comprueba que NO es ese
    const cpas = r.empresas.map(e => e.forecast.cpa_proyectado)
    const promedio = Number(((cpas[0] + cpas[1]) / 2).toFixed(2))
    assert.notEqual(r.total.cpa_proyectado, promedio,
      'promediar los dos CPA da un número que no existe')
  } finally { limpiar() }
})

test('devuelve tambien el detalle por empresa, no solo la suma', async () => {
  try {
    const r = await pedir()
    assert.equal(r.empresas.length, 2)
    for (const e of r.empresas) {
      assert.ok(e.forecast, `${e.empresa} debe traer su propio forecast`)
      assert.ok(e.forecast.inversion.proyeccion_cierre > 0)
    }
  } finally { limpiar() }
})

test('sin ARPU se ve el volumen igual; con ARPU aparece el margen', async () => {
  try {
    const sin = await pedir()
    assert.ok(sin.total.inversion.proyeccion_cierre > 0)
    const con = await pedir({ arpu: 25 })
    for (const e of con.empresas) {
      assert.ok(e.forecast.financiero, 'con ARPU cada empresa trae su margen')
    }
  } finally { limpiar() }
})

test('informa el mes y cuantos dias quedan', async () => {
  try {
    const r = await pedir()
    assert.equal(r.mes, '2026-09')
    assert.equal(r.dias_del_mes, 30)
    assert.ok(r.dias_restantes >= 0)
    assert.match(r.metodo, /Reporte Data/)
  } finally { limpiar() }
})
