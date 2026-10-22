const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { crearRouter } = require('../src/routes/llamadasBitrixDialer.routes')

async function levantar({ bitrixApp, db }) {
  const app = express()
  app.use((req, res, next) => { res.setHeader('X-Frame-Options', 'SAMEORIGIN'); next() })
  app.use('/api/llamadas/bitrix-dialer', crearRouter({ bitrixApp, db, portalUrl: 'https://novonet.bitrix24.es' }))
  const server = await new Promise(ok => { const s = app.listen(0, () => ok(s)) })
  return { base: `http://127.0.0.1:${server.address().port}/api/llamadas/bitrix-dialer`, cerrar: () => server.close() }
}

test('la página se puede abrir dentro de Bitrix', async () => {
  const s = await levantar({ bitrixApp: {}, db: {} })
  try {
    for (const metodo of ['GET', 'POST']) {
      const r = await fetch(`${s.base}/app`, { method: metodo })
      assert.equal(r.status, 200)
      assert.equal(r.headers.get('x-frame-options'), null)
      assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'self' https:\/\/novonet\.bitrix24\.es/)
      assert.match(await r.text(), /BX24\.im\.phoneTo/)
    }
  } finally { s.cerrar() }
})

test('sin sesión de Bitrix no entrega números', async () => {
  const s = await levantar({ bitrixApp: {}, db: {} })
  try {
    const r = await fetch(`${s.base}/siguiente`, { method: 'POST' })
    assert.equal(r.status, 401)
  } finally { s.cerrar() }
})

test('identifica al asesor por el correo de Bitrix', async () => {
  const consultas = []
  const bitrixApp = { usuarioActualPorAuthId: async (t) => { if (t !== 'tok') throw new Error('inválido'); return { ID: '55', EMAIL: 'Asesor@Novonet.net' } } }
  const db = { query: async (sql, params) => {
    consultas.push(params)
    if (/FROM usuarios/.test(sql)) return { rows: [{ id: 9, nombre: 'Ana' }] }
    if (/CREATE TABLE/.test(sql)) return { rows: [] }
    return { rows: [{ pendientes: 3, contestadas_hoy: 1, no_contesta_hoy: 0 }] }
  } }
  const s = await levantar({ bitrixApp, db })
  try {
    const malo = await fetch(`${s.base}/cola`, { headers: { 'X-Bitrix-Auth': 'otro' } })
    assert.equal(malo.status, 401)
    const r = await fetch(`${s.base}/cola`, { headers: { 'X-Bitrix-Auth': 'tok' } })
    const j = await r.json()
    assert.equal(j.success, true)
    assert.equal(j.data.pendientes, 3)
    assert.equal(j.data.asesor, 'Ana')
    assert.deepEqual(consultas[0], ['asesor@novonet.net'])
  } finally { s.cerrar() }
})

test('reintenta cuando Bitrix responde Too many requests', async () => {
  let intentos = 0
  const bitrixApp = { usuarioActualPorAuthId: async () => { intentos++; if (intentos < 3) throw new Error('BITRIX_SSO_AUTH_INVALIDO: Too many requests'); return { ID: '1', EMAIL: 'a@b.c' } } }
  const db = { query: async (sql) => /FROM usuarios/.test(sql) ? { rows: [{ id: 1, nombre: 'A' }] } : { rows: [{ pendientes: 0, contestadas_hoy: 0, no_contesta_hoy: 0 }] } }
  const { crearDialerController } = require('../src/controllers/llamadasBitrixDialer.controller')
  const c = crearDialerController({ bitrixApp, db, portalUrl: 'https://x.bitrix24.es', pausaReintentoMs: 1 })
  let estado = 200, siguiente = false
  await c.autenticar({ get: () => 'tok' }, { status(s) { estado = s; return this }, json() {} }, () => { siguiente = true })
  assert.equal(intentos, 3); assert.equal(siguiente, true); assert.equal(estado, 200)

  intentos = -10
  const c2 = crearDialerController({ bitrixApp, db, portalUrl: 'https://x.bitrix24.es', pausaReintentoMs: 1 })
  let cuerpo = null
  await c2.autenticar({ get: () => 'tok2' }, { status(s) { estado = s; return this }, json(b) { cuerpo = b } }, () => {})
  assert.equal(estado, 503); assert.equal(cuerpo.ocupado, true)
})

test('estado registra el resultado con el registro compartido', async () => {
  const bitrixApp = { usuarioActualPorAuthId: async () => ({ ID: '55', EMAIL: 'a@b.c' }) }
  const consultas = []
  const db = { query: async (sql, params) => {
    consultas.push(sql)
    if (/FROM usuarios/.test(sql)) return { rows: [{ id: 9, nombre: 'Ana' }] }
    if (/SELECT id, telefono, ultimo_intento/.test(sql)) return { rows: [{ id: 3, telefono: '593990000001', ultimo_intento: '2026-10-22T15:00:00Z' }] }
    if (/SET estado = \$3/.test(sql)) { assert.deepEqual(params, [3, 9, 'contestada', 40]); return { rows: [{ id: 3 }] } }
    return { rows: [] }
  } }
  const registro = { configurado: () => true, buscar: async (q) => { assert.equal(q.bitrixUserId, '55'); return { CALL_FAILED_CODE: '200', CALL_DURATION: '40' } } }
  const { crearDialerController } = require('../src/controllers/llamadasBitrixDialer.controller')
  const c = crearDialerController({ bitrixApp, db, portalUrl: 'https://x.bitrix24.es', registro })
  const req = { get: () => 'tok', body: { item_id: 3 } }
  let cuerpo
  await new Promise(ok => c.autenticar(req, {}, ok))
  await c.estado(req, { json(b) { cuerpo = b; return this }, status() { return this } })
  assert.deepEqual(cuerpo, { success: true, data: { terminada: true, estado: 'contestada', duracion: 40 } })
  assert.ok(consultas.some(s => /SET estado = \$3/.test(s)))
})
