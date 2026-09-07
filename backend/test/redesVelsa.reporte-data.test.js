/**
 * Reporte Data de Redes VELSA — fase 1.
 *
 * La pantalla es la MISMA que la de Novonet con otra URL base, así que lo
 * único que la puede romper es que el contrato de la respuesta no coincida.
 * Este test compara las claves de las dos empresas: si alguien agrega un
 * bloque en Novonet y se olvida de Velsa, falla acá y no en producción.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const dbPath = path.resolve(__dirname, '../src/config/db.js')
const freshPath = path.resolve(__dirname, '../src/services/inversionFreshness.service.js')

function preparar(filasPorConsulta = () => ({ rows: [] })) {
  const consultas = []
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
      query: async (sql, params) => { consultas.push({ sql, params }); return filasPorConsulta(sql, params) },
      transaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
    },
  }
  require.cache[freshPath] = {
    id: freshPath, filename: freshPath, loaded: true,
    exports: { asegurarInversionReciente: async () => {} },
  }
  return consultas
}
function limpiar(...rutas) { for (const r of rutas) delete require.cache[r] }

function resFalso() {
  const r = { codigo: 200, cuerpo: null }
  r.status = (c) => { r.codigo = c; return r }
  r.json = (b) => { r.cuerpo = b; return r }
  return r
}

const velsaPath = path.resolve(__dirname, '../src/controllers/redesVelsaWebhook.controller.js')
const novoPath  = path.resolve(__dirname, '../src/controllers/redesWebhook.controller.js')

test('devuelve las MISMAS claves que el reporte de Novonet', async () => {
  preparar()
  delete require.cache[velsaPath]; delete require.cache[novoPath]
  const velsa = require(velsaPath)
  const novo  = require(novoPath)
  try {
    const rv = resFalso(), rn = resFalso()
    await velsa.getReporteDataMensual({ query: { anio: 2026, mes: 9 } }, rv)
    await novo.getReporteData({ query: { anio: 2026, mes: 9 } }, rn)

    assert.equal(rv.codigo, 200, `Velsa respondió ${rv.codigo}: ${JSON.stringify(rv.cuerpo)}`)
    assert.equal(rn.codigo, 200)

    const faltan = Object.keys(rn.cuerpo).filter(k => !(k in rv.cuerpo))
    assert.deepEqual(faltan, [], `a Velsa le faltan bloques que Novonet sí manda: ${faltan.join(', ')}`)
  } finally { limpiar(velsaPath, novoPath, dbPath, freshPath) }
})

test('arma una fila por cada dia del mes, aunque no haya movimiento', async () => {
  preparar()
  delete require.cache[velsaPath]
  const velsa = require(velsaPath)
  try {
    const r = resFalso()
    await velsa.getReporteDataMensual({ query: { anio: 2026, mes: 2 } }, r)
    assert.equal(r.cuerpo.inversion.length, 28, 'febrero 2026 tiene 28 días')
    assert.equal(r.cuerpo.meta.dias.length, 28)
    assert.equal(r.cuerpo.inversion[0].dia, 1)
    assert.equal(r.cuerpo.inversion[27].dia, 28)
  } finally { limpiar(velsaPath, dbPath, freshPath) }
})

test('los bloques de la fase 2 vienen en cero y declarados, no ausentes', async () => {
  preparar()
  delete require.cache[velsaPath]
  const velsa = require(velsaPath)
  try {
    const r = resFalso()
    await velsa.getReporteDataMensual({ query: { anio: 2026, mes: 9 } }, r)
    assert.deepEqual(r.cuerpo.status_jot, [])
    assert.ok(r.cuerpo.bloques_pendientes.includes('status_jot'),
      'la pantalla necesita saber que el bloque está pendiente, no roto')
    const d1 = r.cuerpo.inversion[0]
    for (const campo of ['ingreso_jot', 'activos_mes', 'activo_backlog', 'preplaneados', 'asignados', 'preservicio']) {
      assert.equal(d1[campo], 0, `${campo} debe venir en 0 explícito`)
    }
  } finally { limpiar(velsaPath, dbPath, freshPath) }
})

test('el forecast usa la funcion compartida con el mes completo', async () => {
  const FILAS = [
    { fecha: '2026-09-01', origen: 'VELSA', monto_usd: 100 },
    { fecha: '2026-09-02', origen: 'VELSA', monto_usd: 200 },
  ]
  preparar((sql) => (/velsa_inversion_redes/.test(sql) && /monto_usd/.test(sql) && !/SUM/.test(sql))
    ? { rows: FILAS } : { rows: [] })
  delete require.cache[velsaPath]
  const velsa = require(velsaPath)
  try {
    const r = resFalso()
    await velsa.getReporteDataMensual({ query: { anio: 2026, mes: 9 } }, r)
    const fa = r.cuerpo.forecast_agencias
    assert.equal(fa.length, 1)
    assert.equal(fa[0].inversion_acumulada, 300)
    // 300 en 2 días con dato = 150/día × 30 días de septiembre
    assert.equal(fa[0].proyeccion_cierre, 4500)
  } finally { limpiar(velsaPath, dbPath, freshPath) }
})

test('la inversion diaria se reparte en el dia correcto', async () => {
  preparar((sql) => (/velsa_inversion_redes/.test(sql) && !/SUM/.test(sql))
    ? { rows: [{ fecha: '2026-09-03', origen: 'VELSA', monto_usd: 55 }] } : { rows: [] })
  delete require.cache[velsaPath]
  const velsa = require(velsaPath)
  try {
    const r = resFalso()
    await velsa.getReporteDataMensual({ query: { anio: 2026, mes: 9 } }, r)
    assert.equal(r.cuerpo.inversion[2].inversion_usd, 55, 'el día 3 es el índice 2')
    assert.equal(r.cuerpo.inversion[0].inversion_usd, 0)
  } finally { limpiar(velsaPath, dbPath, freshPath) }
})

test('consulta siempre por empresa velsa, nunca mezcla con novonet', async () => {
  const consultas = preparar()
  delete require.cache[velsaPath]
  const velsa = require(velsaPath)
  try {
    await velsa.getReporteDataMensual({ query: { anio: 2026, mes: 9 } }, resFalso())
    const sobreWebhook = consultas.filter(c => /bitrix_webhook_leads/.test(c.sql))
    assert.ok(sobreWebhook.length > 0, 'debe consultar el webhook')
    for (const c of sobreWebhook) {
      assert.match(c.sql, /empresa\s*=\s*'velsa'/, 'toda consulta al webhook filtra por velsa')
    }
  } finally { limpiar(velsaPath, dbPath, freshPath) }
})
