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

test('tipificación: solo acepta las 8 opciones del equipo', async () => {
  assert.deepEqual(svc.TIPIFICACIONES, ['Contrata', 'No contesta', 'Seguimiento', 'No desea', 'ATC', 'Fuera de Cobertura', 'Zona Peligrosa', 'Innegociable'])
  await assert.rejects(svc.tipificar(1, { item_id: 1, tipificacion: 'Otra' }, { query: async () => ({ rows: [] }) }), /Tipificación inválida/)
})

test('reporte exige un rango de fechas válido', async () => {
  await assert.rejects(svc.reporte({ empresa: 'NOVONET' }, { desde: '2026-10-05', hasta: '2026-10-01' }, { query: async () => ({ rows: [] }) }), /rango/)
})

test('el panel de reportes exige un rango de fechas válido', async () => {
  await assert.rejects(svc.resumen({ empresa: 'NOVONET' }, { desde: '', hasta: '2026-10-01' }, { query: async () => ({ rows: [] }) }), /rango/)
})

test('pausar campaña: solo acepta activa o pausada', async () => {
  await assert.rejects(svc.cambiarEstadoCampana({ empresa: 'NOVONET' }, 1, 'borrada', { query: async () => ({ rows: [] }) }), /Estado inválido/)
})

// ── Historial de campañas (filtro por fechas y estado) y estado "finalizada" ──
function dbCaptura(respuestas = []) {
  const consultas = []
  return {
    consultas,
    query: async (sql, params) => {
      if (/CREATE TABLE/.test(sql)) return { rows: [] }
      consultas.push({ sql, params })
      return respuestas.length ? respuestas.shift() : { rows: [] }
    },
  }
}

test('historial: filtra campañas por rango de fechas y estado, sin tope de 30', async () => {
  svc._reset()
  const db = dbCaptura()
  await svc.listarCampanas({ empresa: 'NOVONET' }, { desde: '2026-10-01', hasta: '2026-10-31', estado: 'finalizada' }, db)
  const { sql, params } = db.consultas[0]
  assert.deepEqual(params, ['NOVONET', '2026-10-01', '2026-10-31', 'finalizada'])
  assert.match(sql, /created_at AT TIME ZONE 'America\/Guayaquil'\)::date >= \$2::date/)
  assert.match(sql, /c\.estado = \$4/)
  assert.doesNotMatch(sql, /LIMIT 30\b/)
})

test('historial: sin filtros trae todas las campañas de la empresa', async () => {
  svc._reset()
  const db = dbCaptura()
  await svc.listarCampanas({ empresa: 'VELSA' }, {}, db)
  assert.deepEqual(db.consultas[0].params, ['VELSA'])
})

test('historial: ignora estado o fechas inválidos', async () => {
  svc._reset()
  const db = dbCaptura()
  await svc.listarCampanas({ empresa: 'NOVONET' }, { desde: 'ayer', estado: 'borrada' }, db)
  assert.deepEqual(db.consultas[0].params, ['NOVONET'])
})

test('finalizar: acepta el estado finalizada', async () => {
  svc._reset()
  const db = dbCaptura([{ rows: [{ id: 3, estado: 'finalizada' }] }])
  const r = await svc.cambiarEstadoCampana({ empresa: 'NOVONET' }, 3, 'finalizada', db)
  assert.equal(r.estado, 'finalizada')
  assert.match(db.consultas[0].sql, /estado <> 'finalizada'/)
})

test('finalizar: una campaña finalizada no se puede reabrir', async () => {
  svc._reset()
  const db = dbCaptura([{ rows: [] }, { rows: [{ estado: 'finalizada' }] }])
  await assert.rejects(svc.cambiarEstadoCampana({ empresa: 'NOVONET' }, 3, 'activa', db), /finalizada/)
})

test('finalizar: no se reintentan números de una campaña finalizada', async () => {
  svc._reset()
  const db = dbCaptura()
  await svc.reintentarNoContestados({ empresa: 'NOVONET' }, 3, db)
  assert.match(db.consultas[0].sql, /c\.estado <> 'finalizada'/)
})
