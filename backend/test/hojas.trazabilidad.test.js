/**
 * Segmentación y auditoría de Archivos Compartidos.
 *
 * Lo que se prueba es la construcción de la consulta: los filtros se arman
 * dinámicamente y el riesgo real es que la numeración de $1, $2... se
 * desalinee con el array de parámetros. Eso no falla al arrancar — falla en
 * producción con datos equivocados o un error de Postgres.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const dbPath = path.resolve(__dirname, '../src/config/db.js')
const svcPath = path.resolve(__dirname, '../src/services/hojas.service.js')
const ctrlPath = path.resolve(__dirname, '../src/controllers/hojas.controller.js')

function cargar(respuestas = []) {
  const llamadas = []
  let i = 0
  const pool = {
    query: async (sql, params) => { llamadas.push({ sql, params }); return respuestas[i++] || { rows: [] } },
    transaction: async (fn) => fn({ query: async () => ({ rows: [] }) }),
  }
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool }
  require.cache[svcPath] = {
    id: svcPath, filename: svcPath, loaded: true,
    exports: { registrarHistorial: async () => {}, registrarYEmitir: async () => {}, emitirAHoja: () => {}, normalizarValor: () => ({ ok: true }) },
  }
  delete require.cache[ctrlPath]
  return { ctrl: require(ctrlPath), llamadas }
}
function limpiar() { delete require.cache[ctrlPath]; delete require.cache[dbPath]; delete require.cache[svcPath] }

function resFalso() {
  const r = { codigo: 200, cuerpo: null, cabeceras: {} }
  r.status = (c) => { r.codigo = c; return r }
  r.json = (b) => { r.cuerpo = b; return r }
  r.send = (b) => { r.cuerpo = b; return r }
  r.setHeader = (k, v) => { r.cabeceras[k] = v }
  return r
}

// Todo $N que aparece en el SQL tiene que existir en params, y al revés.
function placeholdersCoherentes(sql, params) {
  const usados = new Set([...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1])))
  for (const n of usados) {
    assert.ok(n >= 1 && n <= params.length, `el SQL usa $${n} pero solo hay ${params.length} parámetros`)
  }
  for (let n = 1; n <= params.length; n++) {
    assert.ok(usados.has(n), `el parámetro $${n} (${JSON.stringify(params[n - 1])}) no se usa en el SQL`)
  }
}

test('listar sin filtros: consulta base coherente', async () => {
  const { ctrl, llamadas } = cargar()
  try {
    await ctrl.listar({ user: { id: 7, perfil: 'ANALISTA' }, query: {} }, resFalso())
    const { sql, params } = llamadas[0]
    assert.deepEqual(params, [7, false, false])
    placeholdersCoherentes(sql, params)
  } finally { limpiar() }
})

test('listar con TODOS los filtros: numeracion correcta y condiciones presentes', async () => {
  const { ctrl, llamadas } = cargar()
  try {
    await ctrl.listar({
      user: { id: 7, perfil: 'ANALISTA' },
      query: { desde: '2026-09-01', hasta: '2026-09-05', creadoPor: '42', empresa: 'novonet', q: 'ventas' },
    }, resFalso())
    const { sql, params } = llamadas[0]
    placeholdersCoherentes(sql, params)
    assert.deepEqual(params, [7, false, false, '2026-09-01', '2026-09-05', 42, 'novonet', '%ventas%'])
    assert.match(sql, /h\.created_at >= \$4::date/)
    assert.match(sql, /h\.created_at < \(\$5::date \+ INTERVAL '1 day'\)/)
    assert.match(sql, /h\.creado_por = \$6::int/)
    assert.match(sql, /UPPER\(h\.empresa\) = UPPER\(\$7\)/)
    assert.match(sql, /h\.nombre ILIKE \$8 OR h\.descripcion ILIKE \$8/)
  } finally { limpiar() }
})

test('campoFecha=modificacion filtra por updated_at', async () => {
  const { ctrl, llamadas } = cargar()
  try {
    await ctrl.listar({ user: { id: 1, perfil: 'ADMINISTRADOR' }, query: { campoFecha: 'modificacion', desde: '2026-01-01' } }, resFalso())
    const { sql, params } = llamadas[0]
    assert.match(sql, /h\.updated_at >= \$4::date/)
    placeholdersCoherentes(sql, params)
  } finally { limpiar() }
})

test('un creadoPor basura no ensucia la consulta', async () => {
  const { ctrl, llamadas } = cargar()
  try {
    await ctrl.listar({ user: { id: 7, perfil: 'ANALISTA' }, query: { creadoPor: 'abc; DROP TABLE' } }, resFalso())
    const { sql, params } = llamadas[0]
    assert.deepEqual(params, [7, false, false])
    assert.doesNotMatch(sql, /DROP TABLE/)
  } finally { limpiar() }
})

test('auditoria: filtros validos y accion desconocida ignorada', async () => {
  const { ctrl, llamadas } = cargar([{ rows: [] }])
  try {
    await ctrl.auditoria({
      user: { id: 7, perfil: 'ANALISTA' },
      query: { desde: '2026-09-01', usuarioId: '12', accion: 'INVENTADA' },
    }, resFalso())
    const { sql, params } = llamadas[0]
    placeholdersCoherentes(sql, params)
    assert.deepEqual(params, [7, false, '2026-09-01', 12])
    assert.doesNotMatch(sql, /INVENTADA/)
    assert.match(sql, /hh\.usuario_id = \$4::int/)
  } finally { limpiar() }
})

test('auditoria: solo devuelve movimientos de archivos que el usuario ve', async () => {
  const { ctrl, llamadas } = cargar([{ rows: [] }])
  try {
    await ctrl.auditoria({ user: { id: 7, perfil: 'ASESOR' }, query: {} }, resFalso())
    const { sql } = llamadas[0]
    assert.match(sql, /\$2::boolean OR h\.creado_por = \$1 OR p\.id IS NOT NULL/)
  } finally { limpiar() }
})

test('auditoria en CSV: cabecera, BOM y separador', async () => {
  const fila = {
    id: 1, accion: 'EXPORTACION', created_at: new Date('2026-09-05T18:00:00Z'),
    valor_anterior: null, valor_nuevo: '12 fila(s) descargadas como Ventas.xlsx',
    hoja_id: 3, hoja_nombre: 'Ventas "Q3"', empresa: 'NOVONET',
    columna_nombre: null, usuario: 'bpineda', nombres: 'Bryan', apellidos: 'Pineda',
  }
  const { ctrl } = cargar([{ rows: [fila] }])
  const res = resFalso()
  try {
    await ctrl.auditoria({ user: { id: 1, perfil: 'ADMINISTRADOR' }, query: { formato: 'csv' } }, res)
    assert.match(res.cabeceras['Content-Type'], /text\/csv/)
    assert.ok(res.cuerpo.startsWith('﻿'), 'falta el BOM: Excel rompe los acentos')
    assert.match(res.cuerpo, /"Fecha";"Usuario";"Accion"/)
    assert.match(res.cuerpo, /"Bryan Pineda"/)
    assert.match(res.cuerpo, /"Descargó el archivo"/)
    // Las comillas del nombre del archivo se escapan, no rompen la columna
    assert.match(res.cuerpo, /"Ventas ""Q3"""/)
  } finally { limpiar() }
})

test('las acciones nuevas tienen etiqueta legible', async () => {
  const { ctrl } = cargar([{ rows: [] }])
  const res = resFalso()
  try {
    await ctrl.auditoria({ user: { id: 1, perfil: 'ADMINISTRADOR' }, query: {} }, res)
    const valores = res.cuerpo.acciones.map(a => a.valor)
    for (const nueva of ['EXPORTACION', 'HOJA_ARCHIVADA', 'HOJA_DESARCHIVADA']) {
      assert.ok(valores.includes(nueva), `falta la etiqueta de ${nueva}`)
    }
  } finally { limpiar() }
})
