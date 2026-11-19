// Pruebas por empresa, cierre diario 20:00–20:30 y bot de campaña (2026-11-19).
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const enginePath = path.resolve(__dirname, '../src/services/CampaignEngine.js')
const managerPath = path.resolve(__dirname, '../src/services/BaileysManager.js')
const dbPath = path.resolve(__dirname, '../src/config/db.js')

function cargar(modPath, queryImpl, env = {}) {
  for (const [k, v] of Object.entries(env)) process.env[k] = v
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: queryImpl, transaction: async fn => fn({ query: queryImpl }) } }
  delete require.cache[modPath]
  return require(modPath)
}

test('números de prueba por empresa: VELSA y NOVONET (SEMILLERO usa NOVONET)', () => {
  delete process.env.WA_NUMEROS_CONTROL_VELSA; delete process.env.WA_NUMEROS_CONTROL_NOVONET
  const E = cargar(enginePath, async () => ({ rows: [] }))
  assert.deepEqual(E.numerosControlDe('VELSA'), ['593963097928', '593987362202', '593992689404'])
  assert.deepEqual(E.numerosControlDe('NOVONET'), ['593958685423', '593984892363', '593999925455', '593983336118', '593958650281'])
  assert.deepEqual(E.numerosControlDe('SEMILLERO'), E.numerosControlDe('NOVONET'))
})

test('corte a las 20:00 Ecuador y cierre aleatorio entre 20:00 y 20:30', () => {
  const E = cargar(enginePath, async () => ({ rows: [] }), { WA_CAMPANA_HORA_CORTE: '20' })
  const manana = new Date('2026-11-19T15:00:00Z') // 10:00 Ecuador
  assert.equal(E.corteDelDia(manana).toISOString(), '2026-11-20T01:00:00.000Z')
  assert.equal(E.pasoHoraCorte(new Date('2026-11-20T00:59:59Z')), false) // 19:59
  assert.equal(E.pasoHoraCorte(new Date('2026-11-20T01:00:00Z')), true)  // 20:00
  assert.equal(E.pasoHoraCorte(new Date('2026-11-20T05:00:00Z')), false) // 00:00 del día siguiente
  const min = E.cierreAleatorioDelDia(manana, () => 0).getTime()
  const max = E.cierreAleatorioDelDia(manana, () => 0.9999).getTime()
  assert.equal(new Date(min).toISOString(), '2026-11-20T01:00:00.000Z')
  assert.ok(max < Date.parse('2026-11-20T01:30:00Z') && max > Date.parse('2026-11-20T01:29:00Z'))
})

test('una campaña VELSA manda la prueba a los números de VELSA, con la imagen', async () => {
  const pruebas = []
  const query = async (sql) => {
    if (sql.includes('SELECT * FROM campaigns WHERE id')) {
      return { rows: [{ id: 'c1', name: 'V', status: 'running', line_id: 'l1', sent_count: 0, created_by: 9 }] }
    }
    if (sql.includes('FROM usuarios WHERE id')) return { rows: [{ empresa: 'VELSA' }] }
    if (sql.includes('FROM lines')) return { rows: [{ id: 'l1', name: 'L1', created_at: '2020-01-01' }] }
    return { rows: [] }
  }
  const E = cargar(enginePath, query, { WA_CAMPANA_HORA_CORTE: '24' })
  const engine = new E({
    sendText: async (l, n) => { pruebas.push(['texto', n]); return {} },
    sendMedia: async (l, n, o) => { pruebas.push([o.type, n]); return {} },
  }, { emit() {} })
  engine.running.c1 = { abortFlag: false }
  engine._sleep = async () => {}
  engine._loadVariants = async () => [{ id: 'v', message_text: 'Hola', media_url: 'https://x/img.jpg', media_type: 'image' }]
  global.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(3) })
  await engine._run('c1')
  assert.deepEqual(pruebas, [['image', '593963097928'], ['image', '593987362202'], ['image', '593992689404']])
})

test('sin pendientes la campaña queda ABIERTA (no se completa) hasta su cierre', async () => {
  const sqls = []
  const query = async (sql, params) => {
    sqls.push({ sql, params })
    if (sql.includes('SELECT * FROM campaigns WHERE id')) return { rows: [{ id: 'c2', name: 'N', status: 'running', line_id: 'l1', sent_count: 3 }] }
    if (sql.includes('FROM lines')) return { rows: [{ id: 'l1', name: 'L1', created_at: '2020-01-01' }] }
    return { rows: [] }
  }
  const E = cargar(enginePath, query, { WA_CAMPANA_HORA_CORTE: '24' })
  const engine = new E({ sendText: async () => ({}) }, { emit() {} })
  engine.running.c2 = { abortFlag: false }
  await engine._run('c2')
  assert.ok(sqls.some(q => /SET status='abierta'/.test(q.sql)))
  assert.ok(!sqls.some(q => /SET status='completed'/.test(q.sql)))
})

test('cerrar: finaliza, descarta pendientes y manda el resumen a 593962517928', async () => {
  const enviados = []
  const sqls = []
  const query = async (sql, params) => {
    sqls.push(sql)
    if (sql.includes("SET status='completed'")) return { rows: [{ id: 'c3', name: 'RMK', line_id: 'l1', created_by: 1, started_at: new Date() }] }
    if (sql.includes('FROM campaign_recipients WHERE campaign_id')) return { rows: [{ total: 10, enviados: 8, leidos: 4, fallidos: 1, saltados: 1 }] }
    if (sql.includes('respondieron')) return { rows: [{ respondieron: 2 }] }
    if (sql.includes('FROM usuarios WHERE id')) return { rows: [{ usuario: 'dcruz', empresa: 'NOVONET' }] }
    if (sql.includes('FROM lines')) return { rows: [{ id: 'l1', name: 'L1' }] }
    return { rows: [] }
  }
  delete process.env.WA_NUMERO_CIERRE_CAMPANA
  const E = cargar(enginePath, query)
  const engine = new E({ getStatus: () => 'connected', sendText: async (l, n, t) => { enviados.push([n, t]); return {} } }, { emit() {} })
  assert.equal(await engine.cerrar('c3'), true)
  assert.ok(sqls.some(s => /SET status='skipped'/.test(s)))
  assert.equal(enviados[0][0], '593962517928')
  assert.match(enviados[0][1], /RMK/)
  assert.match(enviados[0][1], /Leídos: 4 \(50%\)/)
  assert.match(enviados[0][1], /Respondieron: 2 \(25%\)/)
})

test('no se inicia una campaña después de las 20:00', async () => {
  const E = cargar(enginePath, async (sql) => (sql.includes('FROM campaigns WHERE id') ? { rows: [{ id: 'c', status: 'draft' }] } : { rows: [] }),
    { WA_CAMPANA_HORA_CORTE: '0' }) // corte a medianoche = siempre pasado
  const engine = new E({}, { emit() {} })
  await assert.rejects(engine.start('c'), /no se inician campañas/)
  process.env.WA_CAMPANA_HORA_CORTE = '24'
})

test('bot de campaña: solo para números de la base de una campaña activa en esa línea', async () => {
  let params
  const query = async (sql, p) => {
    if (sql.includes('FROM campaigns c')) {
      params = p
      assert.match(sql, /status IN \('running', 'paused', 'abierta'\)/)
      assert.match(sql, /campaign_recipients r/)
      return p[1].includes('593960288055') ? { rows: [{ bot_id: 'bot-1' }] } : { rows: [] }
    }
    return { rows: [] }
  }
  const M = cargar(managerPath, query)
  const bm = new M({ emit() {} })
  assert.equal(await bm._botDeCampania('l1', ['593960288055@s.whatsapp.net']), 'bot-1')
  assert.deepEqual(params, ['l1', ['593960288055']])
  assert.equal(await bm._botDeCampania('l1', ['593979143280']), null)
  assert.equal(await bm._botDeCampania('l1', [null, '']), null)
})
