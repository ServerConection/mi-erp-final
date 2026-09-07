/**
 * Forecast mensual del Reporte Gerencial.
 *
 * Tiene que dar EXACTAMENTE lo mismo que Redes → Reporte Data. Si gerencia y
 * pauta proyectan distinto, la reunión se va en discutir cuál número vale.
 * Por eso la inversión se delega en la misma función compartida y aquí se
 * comprueba que el resultado coincide.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const dbPath = path.resolve(__dirname, '../src/config/db.js')
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async () => ({ rows: [] }), transaction: async (fn) => fn({ query: async () => ({ rows: [] }) }) },
}
const { forecastMensual, proyectar } = require('../src/controllers/reporteGerencial.controller')
const { construirForecastAgencias } = require('../src/shared/inversionRedes')

// Septiembre 2026 tiene 30 días.
const RANGO = { desde: '2026-09-01', hasta: '2026-09-06' }
const DIAS = [
  { fecha: '2026-09-01', ingresos: 40, activas: 10, inversion: 100 },
  { fecha: '2026-09-02', ingresos: 60, activas: 20, inversion: 200 },
  { fecha: '2026-09-03', ingresos: 50, activas: 0,  inversion: 0   },  // día sin cargar
]
const FILAS_INV = [
  { fecha: '2026-09-01', origen: 'ARTS GOOGLE', monto_usd: 100 },
  { fecha: '2026-09-02', origen: 'ARTS GOOGLE', monto_usd: 200 },
]

test('proyectar divide por dias CON dato, no por dias transcurridos', () => {
  // 10 + 20 = 30 en 2 días con dato → 15/día → 15 × 30 = 450.
  // Si dividiera por los 3 días de la serie daría 10/día = 300, corto.
  const r = proyectar(DIAS, 'activas', 30)
  assert.equal(r.acumulado, 30)
  assert.equal(r.dias_con_datos, 2)
  assert.equal(r.promedio_diario, 15)
  assert.equal(r.proyeccion_cierre, 450)
})

test('una metrica sin ningun dato proyecta 0, no NaN', () => {
  const r = proyectar([{ fecha: '2026-09-01', activas: 0 }], 'activas', 30)
  assert.deepEqual(r, { acumulado: 0, dias_con_datos: 0, promedio_diario: 0, proyeccion_cierre: 0 })
})

test('la inversion proyectada coincide con la de Redes -> Reporte Data', () => {
  const f = forecastMensual({ dias: DIAS }, FILAS_INV, RANGO, 0)
  const referencia = construirForecastAgencias(FILAS_INV, {
    desde: '2026-09-01', hasta: '2026-09-30', hoy: '2026-09-06',
  })
  const totalReferencia = referencia.reduce((a, x) => a + x.proyeccion_cierre, 0)
  assert.equal(f.inversion.proyeccion_cierre, Number(totalReferencia.toFixed(2)))
  // 300 acumulado en 2 días = 150/día × 30 = 4500
  assert.equal(f.inversion.acumulado, 300)
  assert.equal(f.inversion.proyeccion_cierre, 4500)
  assert.equal(f.inversion.por_gastar, 4200)
})

test('el mes se toma del final del rango y trae sus dias reales', () => {
  const f = forecastMensual({ dias: DIAS }, FILAS_INV, RANGO, 0)
  assert.equal(f.mes, '2026-09')
  assert.equal(f.dias_del_mes, 30)
  const feb = forecastMensual(
    { dias: [{ fecha: '2026-02-10', activas: 5, ingresos: 5, inversion: 50 }] },
    [{ fecha: '2026-02-10', origen: 'X', monto_usd: 50 }],
    { desde: '2026-02-01', hasta: '2026-02-28' }, 0
  )
  assert.equal(feb.dias_del_mes, 28, 'febrero de 2026 tiene 28 días')
})

test('los dias de OTROS meses no entran en el forecast del mes en curso', () => {
  const dias = [{ fecha: '2026-08-31', activas: 999, ingresos: 999, inversion: 9999 }, ...DIAS]
  const f = forecastMensual({ dias }, FILAS_INV, RANGO, 0)
  assert.equal(f.activas.acumulado, 30, 'agosto no debe sumar a septiembre')
})

test('con ARPU aparece la salud financiera; sin ARPU, el volumen igual', () => {
  const sin = forecastMensual({ dias: DIAS }, FILAS_INV, RANGO, 0)
  assert.equal(sin.financiero, null)
  assert.ok(sin.activas.proyeccion_cierre > 0, 'el volumen se proyecta igual')

  const con = forecastMensual({ dias: DIAS }, FILAS_INV, RANGO, 25)
  // 450 activas × $25 = $11.250 contra $4.500 proyectados de inversión
  assert.equal(con.financiero.ingreso_proyectado, 11250)
  assert.equal(con.financiero.margen_proyectado, 6750)
  assert.equal(con.financiero.rentable, true)
  assert.equal(con.financiero.activas_necesarias, 180)   // 4500 / 25
  assert.equal(con.financiero.faltan_activas, 0)
})

test('cuando la inversion proyectada supera lo que dejan las ventas, avisa', () => {
  const f = forecastMensual({ dias: DIAS }, FILAS_INV, RANGO, 5)
  // 450 × $5 = $2.250 contra $4.500 → pierde plata
  assert.equal(f.financiero.rentable, false)
  assert.ok(f.financiero.margen_proyectado < 0)
  assert.equal(f.financiero.activas_necesarias, 900)
  assert.equal(f.financiero.faltan_activas, 450)
})

test('el CPA proyectado sale de las dos proyecciones, no del acumulado', () => {
  const f = forecastMensual({ dias: DIAS }, FILAS_INV, RANGO, 0)
  assert.equal(f.cpa_proyectado, Number((4500 / 450).toFixed(2)))
})

test('sin dias no hay forecast (null), nunca un objeto en ceros', () => {
  assert.equal(forecastMensual({ dias: [] }, [], RANGO, 25), null)
  assert.equal(forecastMensual(null, [], RANGO, 25), null)
})
