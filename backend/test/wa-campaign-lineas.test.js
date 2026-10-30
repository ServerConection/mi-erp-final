const test = require('node:test')
const assert = require('node:assert/strict')
const { elegirLinea, esResponsable } = require('../src/services/campaignLineas')

const L = [
  { id: 'a', name: 'KATHERINE', owner_nombre: 'Katherine Pucha' },
  { id: 'b', name: 'MELANY', owner_nombre: 'Melany Reina' },
  { id: 'c', name: 'SERGIO', owner_nombre: 'Sergio Almeida' },
]
const lead = (resp) => ({ variables: resp ? { bitrix_responsible: resp } : {} })

test('responsable de Bitrix coincide con el dueño de la línea (sin tildes, nombre completo)', () => {
  assert.equal(esResponsable(L[0], 'KATHERINE PAOLA PUCHA BRAVO'), true)
  assert.equal(esResponsable(L[0], 'Kathérine Púcha'), true)
  assert.equal(esResponsable(L[0], 'KATHERINE REINA'), false)
  assert.equal(esResponsable({ owner_nombre: '' }, 'KATHERINE'), false)
})

test('ronda normal: una línea tras otra y vuelve a empezar', () => {
  let i = 0; const usadas = []
  for (let k = 0; k < 5; k++) { const r = elegirLinea({ lineas: L, indice: i, recipient: lead(), modo: 'libre' }); usadas.push(r.linea.id); i = r.siguiente }
  assert.deepEqual(usadas, ['a', 'b', 'c', 'a', 'b'])
})

test('ronda salta líneas no disponibles', () => {
  const r = elegirLinea({ lineas: L, indice: 0, recipient: lead(), modo: 'libre', disponible: l => l.id !== 'a' })
  assert.equal(r.linea.id, 'b')
})

test('evitar: nunca desde el responsable del lead', () => {
  const r = elegirLinea({ lineas: L, indice: 0, recipient: lead('KATHERINE PAOLA PUCHA BRAVO'), modo: 'evitar' })
  assert.equal(r.linea.id, 'b')
  const solo = elegirLinea({ lineas: [L[0]], indice: 0, recipient: lead('KATHERINE PUCHA'), modo: 'evitar' })
  assert.ok(solo.saltar)
  const sinResp = elegirLinea({ lineas: L, indice: 0, recipient: lead(), modo: 'evitar' })
  assert.equal(sinResp.linea.id, 'a')
})

test('mismo: solo desde la línea del responsable; si no hay, se salta', () => {
  assert.equal(elegirLinea({ lineas: L, indice: 0, recipient: lead('MELANY CAMILA REINA NOTENO'), modo: 'mismo' }).linea.id, 'b')
  assert.match(elegirLinea({ lineas: L, indice: 0, recipient: lead('OTRO ASESOR'), modo: 'mismo' }).saltar, /Sin línea del responsable/)
  assert.match(elegirLinea({ lineas: L, indice: 0, recipient: lead(), modo: 'mismo' }).saltar, /sin responsable/)
  assert.match(elegirLinea({ lineas: L, indice: 0, recipient: lead('MELANY REINA'), modo: 'mismo', disponible: l => l.id !== 'b' }).saltar, /no disponible/)
})

test('motor: reparte en ronda entre líneas y salta si rompe la regla de responsable', async () => {
  const path = require('node:path')
  const enginePath = path.resolve(__dirname, '../src/services/CampaignEngine.js')
  const dbPath = path.resolve(__dirname, '../src/config/db.js')
  const pendientes = [
    { id: 1, wa_number: '593990000001', variables: { bitrix_responsible: 'KATHERINE PAOLA PUCHA BRAVO' } },
    { id: 2, wa_number: '593990000002', variables: { bitrix_responsible: 'MELANY CAMILA REINA' } },
    { id: 3, wa_number: '593990000003', variables: { bitrix_responsible: 'SIN LINEA' } },
  ]
  const enviados = []; const saltados = []
  const query = async (sql, params) => {
    if (sql.includes('SELECT * FROM campaigns WHERE id')) {
      return { rows: [{ id: 'c1', name: 'Multi', status: pendientes.length ? 'running' : 'completed', line_id: 'a',
        line_ids: ['a', 'b'], modo_responsable: 'mismo', batch_size: 50, min_delay_secs: 0, max_delay_secs: 0, sent_count: 1 }] }
    }
    if (sql.includes('l.id = ANY($1::uuid[])')) {
      return { rows: [{ id: 'a', name: 'L-KATHE', owner_nombre: 'Katherine Pucha' }, { id: 'b', name: 'L-MELANY', owner_nombre: 'Melany Reina' }] }
    }
    if (sql.includes("FROM campaign_recipients") && sql.includes("status='pending'")) return { rows: pendientes.slice(0, 1) }
    if (sql.includes("status='skipped'")) { saltados.push(params[0]); pendientes.shift(); return { rows: [] } }
    if (sql.includes("SET status='sending'")) { enviados.push({ id: params[0], linea: params[2] }); pendientes.shift(); return { rows: [] } }
    return { rows: [] }
  }
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query } }
  delete require.cache[enginePath]
  const CampaignEngine = require(enginePath)
  const engine = new CampaignEngine(
    { sendText: async () => ({ key: { id: 'x' } }), getStatus: () => 'connected' },
    { emit: () => {}, to: () => ({ emit: () => {} }) })
  engine._sleep = async () => {}
  engine.running.c1 = { abortFlag: false }
  await engine._run('c1')
  assert.deepEqual(enviados, [{ id: 1, linea: 'a' }, { id: 2, linea: 'b' }])
  assert.deepEqual(saltados, [3])
  delete require.cache[enginePath]; delete require.cache[dbPath]
})
