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
