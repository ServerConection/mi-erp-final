const test = require('node:test')
const assert = require('node:assert/strict')
const svc = require('../src/services/inboxPlantillas.service')

const admin = { id: 1, perfil: 'ADMINISTRADOR', empresa: 'NOVONET', usuario: 'bpineda' }
const sup = { id: 2, perfil: 'SUPERVISOR', empresa: 'VELSA', usuario: 'sup' }
const asesor = { id: 3, perfil: 'USUARIO', empresa: 'VELSA', usuario: 'kpucha' }

test('quién gestiona plantillas', () => {
  assert.equal(svc.puedeGestionar(admin), true)
  assert.equal(svc.puedeGestionar(sup), true)
  assert.equal(svc.puedeGestionar({ perfil: 'GERENCIA' }), true)
  assert.equal(svc.puedeGestionar(asesor), false)
  assert.equal(svc.puedeGestionar({ perfil: 'ANALISTA' }), false)
})

test('empresa: admin elige; supervisor queda fijo en la suya', () => {
  assert.equal(svc.empresaDestino(admin, 'velsa'), 'VELSA')
  assert.equal(svc.empresaDestino(admin, ''), 'TODAS')
  assert.equal(svc.empresaDestino(sup, 'NOVONET'), 'VELSA')
})

test('validación: título y (texto o imagen)', () => {
  assert.throws(() => svc.validar({ texto: 'hola' }), /título/)
  assert.throws(() => svc.validar({ titulo: 'x' }), /texto o imagen/)
  assert.throws(() => svc.validar({ titulo: 'x', media_url: 'javascript:alert(1)' }), /no válido/)
  assert.equal(svc.validar({ titulo: 'x', media_url: '/wa-uploads/a.jpg' }).media_type, 'image')
})

test('asesor no puede crear; ve su empresa + TODAS', async () => {
  const calls = []
  const db = { query: async (sql, p) => { calls.push({ sql, p }); return { rows: [] } } }
  await assert.rejects(() => svc.crear(asesor, { titulo: 'x', texto: 'y' }, db), /Solo/)
  await svc.listarParaInbox(asesor, db)
  assert.deepEqual(calls.at(-1).p, [['VELSA', 'TODAS']])
  await svc.listarParaInbox(admin, db)
  assert.deepEqual(calls.at(-1).p, [])
})
