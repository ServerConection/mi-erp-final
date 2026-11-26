// Pruebas por empresa, jornada 07:00–21:00, cierre 20:00–21:00 y bot de campaña.
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

test('jornada global 07:00–21:00 y cierre aleatorio entre 20:00 y 21:00', () => {
  const E = cargar(enginePath, async () => ({ rows: [] }), { WA_CAMPANA_HORA_INICIO: '7', WA_CAMPANA_HORA_FIN: '21' })
  assert.equal(E.dentroJornadaGlobal(new Date('2026-11-25T11:59:00Z')), false) // 06:59
  assert.equal(E.dentroJornadaGlobal(new Date('2026-11-25T12:00:00Z')), true)  // 07:00
  assert.equal(E.dentroJornadaGlobal(new Date('2026-11-26T01:59:00Z')), true)  // 20:59
  assert.equal(E.dentroJornadaGlobal(new Date('2026-11-26T02:00:00Z')), false) // 21:00
  // Una campaña SIN horario propio tampoco envía de madrugada.
  assert.equal(E.dentroDeHorarioPermitido({}, new Date('2026-11-25T08:37:00Z')), false) // 03:37
  // El horario propio se cruza con la jornada: 6 a 23 → efectivo 7 a 21.
  assert.equal(E.dentroDeHorarioPermitido({ send_hour_from: 6, send_hour_to: 23 }, new Date('2026-11-25T11:30:00Z')), false) // 06:30
  const once = new Date('2026-11-25T16:00:00Z') // 11:00 Ecuador
  assert.equal(E.cierreAleatorioDelDia(once, () => 0).toISOString(), '2026-11-26T01:00:00.000Z')      // 20:00
  assert.ok(E.cierreAleatorioDelDia(once, () => 0.9999).getTime() < Date.parse('2026-11-26T02:00:00Z')) // antes de 21:00
  // Si termina a las 20:40, el cierre nunca queda antes de "ahora".
  assert.equal(E.cierreAleatorioDelDia(new Date('2026-11-26T01:40:00Z'), () => 0).toISOString(), '2026-11-26T01:40:00.000Z')
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
  const E = cargar(enginePath, query, { WA_CAMPANA_HORA_INICIO: '0', WA_CAMPANA_HORA_FIN: '24' })
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
  const E = cargar(enginePath, query, { WA_CAMPANA_HORA_INICIO: '0', WA_CAMPANA_HORA_FIN: '24' })
  const engine = new E({ sendText: async () => ({}) }, { emit() {} })
  engine.running.c2 = { abortFlag: false }
  await engine._run('c2')
  assert.ok(sqls.some(q => /SET status='abierta'/.test(q.sql)))
  assert.ok(!sqls.some(q => /SET status='completed'/.test(q.sql)))
})

test('cerrar: finaliza la campaña abierta y manda el resumen a 593958693149', async () => {
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
  assert.ok(sqls.some(s => /status = 'abierta'/.test(s)))
  assert.equal(enviados[0][0], '593958693149')
  assert.match(enviados[0][1], /RMK/)
  assert.match(enviados[0][1], /Leídos: 4 \(50%\)/)
  assert.match(enviados[0][1], /Respondieron: 2 \(25%\)/)
})

test('fuera de la jornada la campaña no falla: queda pausada para seguir a las 07:00', async () => {
  const sqls = []
  const query = async (sql) => {
    sqls.push(sql)
    if (sql.includes('SELECT * FROM campaigns WHERE id')) return { rows: [{ id: 'c', name: 'N', status: 'running', line_id: 'l1', sent_count: 0 }] }
    if (sql.includes('FROM lines')) return { rows: [{ id: 'l1', name: 'L1', created_at: '2020-01-01' }] }
    return { rows: [] }
  }
  const E = cargar(enginePath, query, { WA_CAMPANA_HORA_INICIO: '0', WA_CAMPANA_HORA_FIN: '0' }) // jornada cerrada
  const engine = new E({ sendText: async () => { throw new Error('no debe enviar') } }, { emit() {} })
  engine.running.c = { abortFlag: false }
  await engine._run('c')
  assert.ok(sqls.some(s => /status='paused', paused_for_schedule=true/.test(s)))
  process.env.WA_CAMPANA_HORA_INICIO = '0'; process.env.WA_CAMPANA_HORA_FIN = '24'
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
