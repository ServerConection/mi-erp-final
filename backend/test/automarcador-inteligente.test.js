const test = require('node:test')
const assert = require('node:assert/strict')
const svc = require('../src/services/automarcadorBitrix.service')

// BD falsa: guarda cada consulta y responde según el patrón del SQL.
function dbFalsa(respuestas = {}) {
  const consultas = []
  const responder = async (sql, params) => {
    if (/CREATE TABLE/.test(sql)) return { rows: [] }
    consultas.push({ sql, params })
    for (const [patron, rows] of Object.entries(respuestas)) {
      if (new RegExp(patron).test(sql)) return { rows: typeof rows === 'function' ? rows(params) : rows }
    }
    return { rows: [] }
  }
  return { consultas, query: responder, transaction: async (fn) => fn({ query: responder }) }
}

// Hora Ecuador (UTC-5) → milisegundos UTC
const ec = (y, m, d, h, min = 0) => Date.UTC(y, m - 1, d, h + 5, min)
const horaEC = (fecha) => new Date(fecha.getTime() - 5 * 3600000).getUTCHours()

// ── Reintento inteligente ────────────────────────────────────────────────
test('reintento: sin estadísticas, vuelve a llamar 2 horas después', () => {
  const p = svc.proximoIntento(ec(2026, 11, 24, 9, 30), {})
  assert.equal(p.getTime(), ec(2026, 11, 24, 11, 30))
})

test('reintento: elige la hora con mejor tasa de contacto que queda hoy', () => {
  const p = svc.proximoIntento(ec(2026, 11, 24, 9, 0), { 11: 0.2, 15: 0.6, 18: 0.4 })
  assert.equal(p.getTime(), ec(2026, 11, 24, 15, 0))
})

test('reintento: si ya no hay horario hoy, pasa a la mejor hora de mañana', () => {
  const p = svc.proximoIntento(ec(2026, 11, 24, 18, 30), { 10: 0.5, 16: 0.3 })
  assert.equal(p.getTime(), ec(2026, 11, 25, 10, 0))
})

test('reintento: nunca programa fuera del horario 08h-19h', () => {
  const p = svc.proximoIntento(ec(2026, 11, 24, 19, 10), {})
  assert.ok(horaEC(p) >= 8 && horaEC(p) <= 19)
  assert.ok(p.getTime() > ec(2026, 11, 24, 21, 0))
})

test('resultado: "no contesta" con menos de 3 intentos programa reintento y cierra el intento', async () => {
  svc._reset()
  const db = dbFalsa({ 'RETURNING id, intentos, proximo_intento': [{ id: 5, intentos: 1, proximo_intento: '2026-11-24T20:00:00Z' }] })
  const r = await svc.registrarResultado(9, { item_id: 5, estado: 'no_contesta', duracion: 0 }, db)
  const upd = db.consultas.find(c => /automarcador_bx_intentos/.test(c.sql) && /UPDATE automarcador_bx_items/.test(c.sql))
  assert.ok(upd, 'actualiza item e intento en la misma consulta')
  assert.equal(upd.params[4], svc.MAX_INTENTOS)
  assert.ok(upd.params[5] instanceof Date)
  assert.equal(r.reintento, '2026-11-24T20:00:00Z')
})

// ── Historial por intento ────────────────────────────────────────────────
test('siguiente: registra el intento y prioriza reintentos vencidos', async () => {
  svc._reset()
  const db = dbFalsa({ 'WITH tomado': [{ id: 5, telefono: '0999', nombre_cliente: 'Ana', deal_id: '77' }] })
  const r = await svc.siguiente(9, db)
  const q = db.consultas.find(c => /WITH tomado/.test(c.sql)).sql
  assert.match(q, /INSERT INTO automarcador_bx_intentos/)
  assert.match(q, /proximo_intento <= NOW\(\)/)
  assert.match(q, /ORDER BY i\.proximo_intento NULLS LAST, i\.id/)
  assert.equal(r.id, 5)
})

test('tipificar: una tipificación final cancela el reintento y queda en el intento', async () => {
  svc._reset()
  const db = dbFalsa({ 'UPDATE automarcador_bx_items': [{ id: 5, proximo_intento: null }] })
  await svc.tipificar(9, { item_id: 5, tipificacion: 'Número errado' }, db)
  const q = db.consultas.find(c => /UPDATE automarcador_bx_items/.test(c.sql))
  assert.match(q.sql, /UPDATE automarcador_bx_intentos/)
  assert.ok(q.params[3].includes('Número errado'))
  assert.ok(q.params[4].includes('Buzón de voz'))
})

// ── Contactabilidad por cliente ──────────────────────────────────────────
test('contactabilidad: agrupa por deal y exige rango válido', async () => {
  svc._reset()
  await assert.rejects(svc.contactabilidad({ empresa: 'NOVONET' }, { desde: 'x', hasta: '2026-11-01' }, dbFalsa()), /rango/)
  const db = dbFalsa({ 'veces_llamado': [{ deal_id: '77', veces_llamado: 3 }] })
  const r = await svc.contactabilidad({ empresa: 'VELSA' }, { desde: '2026-11-01', hasta: '2026-11-24' }, db)
  const q = db.consultas.find(c => /veces_llamado/.test(c.sql))
  assert.deepEqual(q.params.slice(0, 3), ['VELSA', '2026-11-01', '2026-11-24'])
  assert.ok(q.params[3].includes('Buzón de voz'), 'el buzón no cuenta como contacto')
  assert.match(q.sql, /GROUP BY COALESCE\(NULLIF\(i\.deal_id, ''\)/)
  assert.equal(r[0].veces_llamado, 3)
})
