/**
 * Gestionables del Reporte Gerencial.
 *
 * Novonet mostraba 0 gestionables con 239 ingresos. La causa: en
 * mestra_bitrix la fila de JotForm (j_*) y la del CRM (b_*) son filas
 * DISTINTAS, así que leer mb.b_etapa_de_la_negociacion desde la fila JotForm
 * devuelve NULL, y la expresión de gestionable exige IS NOT NULL. El Reporte
 * D-1 ya resolvía esto cruzando con vw_bitrix_novonet.
 *
 * Este test fija el cruce: sin él, cualquiera podría volver a apuntar la
 * expresión a la tabla equivocada y el indicador volvería a 0 en silencio —
 * un 0 no rompe nada, solo miente.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const dbPath = path.resolve(__dirname, '../src/config/db.js')
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { query: async () => ({ rows: [] }), transaction: async (fn) => fn({ query: async () => ({ rows: [] }) }) },
}
const { SERIES } = require('../src/controllers/reporteGerencial.controller')

test('Novonet lee la etapa del CRM desde vw_bitrix_novonet, no de la fila JotForm', () => {
  const sql = SERIES.novonet.sql
  assert.match(sql, /vw_bitrix_novonet/, 'debe cruzar con la vista del webhook')
  assert.match(sql, /b\.b_id::text = mb\.j_id_bitrix::text/, 'el cruce va por j_id_bitrix = b_id')
  assert.match(sql, /crm\.b_etapa_de_la_negociacion/, 'la etapa sale del alias del CRM')
  assert.doesNotMatch(
    sql.replace(/--[^\n]*/g, ''),
    /FILTER \(WHERE[^)]*mb\.b_etapa_de_la_negociacion/,
    'no debe volver a leer la etapa de la fila JotForm'
  )
})

test('el cruce es LATERAL con LIMIT 1: los ingresos no se pueden duplicar', () => {
  const sql = SERIES.novonet.sql
  assert.match(sql, /LEFT JOIN LATERAL/, 'un LEFT JOIN normal duplicaría filas')
  assert.match(sql, /LIMIT 1/)
})

test('los ingresos y las activas se siguen contando sobre la fila JotForm', () => {
  const sql = SERIES.novonet.sql
  assert.match(sql, /COUNT\(\*\)::int\s+AS ingresos/)
  assert.match(sql, /mb\.j_netlife_estatus_real\)\) = 'ACTIVO'/)
})

test('Velsa no cambia: su vista ya trae la etapa en la misma fila', () => {
  const sql = SERIES.velsa.sql
  assert.match(sql, /mv\.etapa_crm/)
  assert.doesNotMatch(sql, /vw_bitrix_novonet/)
})

test('las tres series del embudo salen de la misma consulta', () => {
  for (const clave of ['novonet', 'velsa']) {
    const sql = SERIES[clave].sql
    for (const col of ['ingresos', 'gestionables', 'activas']) {
      assert.match(sql, new RegExp(`AS ${col}`), `${clave} debe devolver ${col}`)
    }
  }
})
