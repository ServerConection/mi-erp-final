const test = require('node:test')
const assert = require('node:assert/strict')
const svc = require('../src/services/automarcadorBitrix.service')

// Doble de BD para validar el reparto sin Postgres.
function dbFalsa(usuariosValidos) {
  const insertados = []
  const client = {
    query: async (sql, params) => {
      if (/INSERT INTO automarcador_bx_campanas/.test(sql)) return { rows: [{ id: 7 }] }
      if (/INSERT INTO automarcador_bx_items/.test(sql)) { for (let i = 0; i < params.length; i += 5) insertados.push(params.slice(i, i + 5)); return { rows: [] } }
      throw new Error('SQL inesperado: ' + sql)
    },
  }
  return {
    insertados,
    query: async (sql) => {
      if (/CREATE TABLE/.test(sql)) return { rows: [] }
      if (/FROM usuarios WHERE id = ANY/.test(sql)) return { rows: usuariosValidos.map(id => ({ id })) }
      throw new Error('SQL inesperado: ' + sql)
    },
    transaction: async (fn) => fn(client),
  }
}

test('reparte los números en ronda entre los asesores', async () => {
  svc._reset()
  const db = dbFalsa([10, 20])
  const items = [1, 2, 3, 4, 5].map(n => ({ wa_number: `59399000000${n}`, name: `C${n}`, variables: { bitrix_id: String(n) } }))
  const r = await svc.crearCampana({ id: 1, empresa: 'NOVONET' }, { nombre: 'X', asesorIds: ['10', '20'], items }, db)
  assert.equal(r.campana_id, 7)
  assert.deepEqual(r.por_asesor, { 10: 3, 20: 2 })
  assert.deepEqual(db.insertados.map(f => f[1]), [10, 20, 10, 20, 10])
})

test('exige asesores válidos y teléfonos', async () => {
  svc._reset()
  await assert.rejects(svc.crearCampana({ empresa: 'NOVONET' }, { asesorIds: [], items: [{}] }, dbFalsa([])), /al menos un asesor/)
  await assert.rejects(svc.crearCampana({ empresa: 'NOVONET' }, { asesorIds: [1], items: [] }, dbFalsa([1])), /teléfonos/)
  await assert.rejects(svc.crearCampana({ empresa: 'NOVONET' }, { asesorIds: [1, 2], items: [{ wa_number: '1' }] }, dbFalsa([1])), /inactivos/)
})

test('resultado solo acepta estados finales', async () => {
  await assert.rejects(svc.registrarResultado(1, { item_id: 1, estado: 'pendiente' }, { query: async () => ({ rows: [] }) }), /Estado inválido/)
})
