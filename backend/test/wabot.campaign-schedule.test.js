const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const enginePath    = path.resolve(__dirname, '../src/services/CampaignEngine.js')
const schedulerPath = path.resolve(__dirname, '../src/services/wa_scheduler.service.js')
const dbPath        = path.resolve(__dirname, '../src/config/db.js')

function mockDb(queryImpl) {
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: queryImpl } }
}

function cargarMotor(queryImpl) {
  mockDb(queryImpl)
  delete require.cache[enginePath]
  return require(enginePath)
}

function cargarScheduler(queryImpl) {
  mockDb(queryImpl)
  delete require.cache[enginePath]
  delete require.cache[schedulerPath]
  const Scheduler = require(schedulerPath)
  return Scheduler
}

// ── dentroDeHorarioPermitido (funcion pura) ──────────────────────────────
// Ecuador es UTC-5. Se eligen fechas UTC concretas para que la hora/dia
// local de Ecuador sea conocida sin depender del reloj real de la maquina.
//   2026-08-31T15:00:00Z → Ecuador 2026-08-31 10:00 (lunes, hora 10)
//   2026-08-31T04:00:00Z → Ecuador 2026-08-30 23:00 (domingo, hora 23)

test('sin dias ni horas configurados, siempre permite enviar', () => {
  const CampaignEngine = cargarMotor(async () => ({ rows: [] }))
  const ahora = new Date('2026-08-31T15:00:00Z')
  assert.equal(CampaignEngine.dentroDeHorarioPermitido({ send_days: null, send_hour_from: null, send_hour_to: null }, ahora), true)
})

test('dia de hoy (lunes) incluido en send_days → permite', () => {
  const CampaignEngine = cargarMotor(async () => ({ rows: [] }))
  const ahora = new Date('2026-08-31T15:00:00Z') // lunes en Ecuador
  assert.equal(CampaignEngine.dentroDeHorarioPermitido({ send_days: [1, 2, 3, 4, 5] }, ahora), true)
})

test('dia de hoy (lunes) NO incluido en send_days → bloquea', () => {
  const CampaignEngine = cargarMotor(async () => ({ rows: [] }))
  const ahora = new Date('2026-08-31T15:00:00Z') // lunes en Ecuador
  assert.equal(CampaignEngine.dentroDeHorarioPermitido({ send_days: [0, 6] }, ahora), false) // solo sab/dom
})

test('rango de horas normal (8 a 20): hora 10 esta dentro → permite', () => {
  const CampaignEngine = cargarMotor(async () => ({ rows: [] }))
  const ahora = new Date('2026-08-31T15:00:00Z') // Ecuador hora 10
  assert.equal(CampaignEngine.dentroDeHorarioPermitido({ send_hour_from: 8, send_hour_to: 20 }, ahora), true)
})

test('rango de horas normal (8 a 20): hora 23 esta fuera → bloquea', () => {
  const CampaignEngine = cargarMotor(async () => ({ rows: [] }))
  const ahora = new Date('2026-08-31T04:00:00Z') // Ecuador hora 23 (domingo)
  assert.equal(CampaignEngine.dentroDeHorarioPermitido({ send_hour_from: 8, send_hour_to: 20 }, ahora), false)
})

test('rango que cruza medianoche (22 a 6): hora 23 esta dentro → permite', () => {
  const CampaignEngine = cargarMotor(async () => ({ rows: [] }))
  const ahora = new Date('2026-08-31T04:00:00Z') // Ecuador hora 23
  assert.equal(CampaignEngine.dentroDeHorarioPermitido({ send_hour_from: 22, send_hour_to: 6 }, ahora), true)
})

test('rango que cruza medianoche (22 a 6): hora 10 esta fuera → bloquea', () => {
  const CampaignEngine = cargarMotor(async () => ({ rows: [] }))
  const ahora = new Date('2026-08-31T15:00:00Z') // Ecuador hora 10
  assert.equal(CampaignEngine.dentroDeHorarioPermitido({ send_hour_from: 22, send_hour_to: 6 }, ahora), false)
})

// ── _run(): se pausa sola fuera de horario ───────────────────────────────

test('_run() pausa la campaña si esta fuera de su horario configurado (sin mandar nada)', async () => {
  const updates = []
  const emitted = []
  const enviosControl = []

  const query = async (sql, params) => {
    if (sql.includes('SELECT * FROM campaigns WHERE id')) {
      // send_days:[99] nunca calza con ningun dia real → siempre "fuera de horario"
      return { rows: [{ id: 'camp-h1', name: 'Fuera de horario', status: 'running', line_id: 'line-1', send_days: [99] }] }
    }
    if (sql.includes('SELECT id, name, created_at FROM lines')) {
      return { rows: [{ id: 'line-1', name: 'ENVIO_1', created_at: '2020-01-01T00:00:00Z' }] }
    }
    if (sql.includes('FROM campaign_messages')) return { rows: [] }
    if (sql.includes("UPDATE campaigns SET status='paused'")) {
      updates.push({ sql, params })
      return { rows: [] }
    }
    return { rows: [] }
  }

  const CampaignEngine = cargarMotor(query)
  const engine = new CampaignEngine(
    { sendText: async (lineId, numero) => { enviosControl.push(numero); return { key: { id: 'wa-x' } } } },
    { emit: (event, payload) => emitted.push({ event, payload }) }
  )
  engine.running['camp-h1'] = { abortFlag: false }
  engine._sleep = async () => {}

  await engine._run('camp-h1')

  assert.equal(updates.length, 1, 'debia pausar la campaña')
  assert.match(updates[0].sql, /paused_for_schedule\s*=\s*true/)
  assert.deepEqual(updates[0].params, ['camp-h1'])
  assert.ok(emitted.some(e => e.payload?.motivo === 'fuera_de_horario'))
  assert.deepEqual(enviosControl, [], 'no debia mandar ni siquiera el burst de control')
  assert.equal(engine.running['camp-h1'], undefined)
})

// ── start()/pause(): manejo de paused_for_schedule ───────────────────────

test('start() resetea paused_for_schedule=false al (re)arrancar', async () => {
  const updates = []
  const query = async (sql, params) => {
    if (sql.includes("UPDATE campaigns SET status='running'")) { updates.push(sql); return { rows: [] } }
    if (sql.includes('SELECT * FROM campaigns WHERE id')) return { rows: [{ id: 'camp-s', status: 'draft' }] }
    return { rows: [] }
  }
  const CampaignEngine = cargarMotor(query)
  const engine = new CampaignEngine({ sendText: async () => ({}) }, { emit: () => {} })
  engine._run = async () => {} // no ejecutar el loop real en esta prueba
  await engine.start('camp-s')
  assert.equal(updates.length, 1)
  assert.match(updates[0], /paused_for_schedule\s*=\s*false/)
})

test('pause() marca paused_for_schedule=false (no confundir con pausa por horario)', async () => {
  const updates = []
  const query = async (sql) => {
    if (sql.includes("UPDATE campaigns SET status='paused'")) { updates.push(sql); return { rows: [] } }
    return { rows: [] }
  }
  const CampaignEngine = cargarMotor(query)
  const engine = new CampaignEngine({ sendText: async () => ({}) }, { emit: () => {} })
  engine.running['camp-p'] = { abortFlag: false }
  await engine.pause('camp-p')
  assert.equal(updates.length, 1)
  assert.match(updates[0], /paused_for_schedule\s*=\s*false/)
})

// ── SchedulerService: reanuda solo las que ya entraron en horario ───────

test('SchedulerService reanuda solo las campañas pausadas por horario que ya calzan', async () => {
  const iniciadas = []
  const query = async (sql) => {
    if (sql.includes("WHERE status='paused' AND paused_for_schedule = true")) {
      return {
        rows: [
          { id: 'camp-a', name: 'Aun fuera', send_days: [99] },     // nunca calza
          { id: 'camp-b', name: 'Ya entro', send_days: null },      // sin restriccion → calza siempre
        ],
      }
    }
    return { rows: [] }
  }
  const Scheduler = cargarScheduler(query)
  const scheduler = new Scheduler({
    baileysManager: {},
    campaignEngine: { start: async (id) => { iniciadas.push(id) } },
    io: null,
  })

  await scheduler._checkCampanasPausadasPorHorario()

  assert.deepEqual(iniciadas, ['camp-b'])
})
