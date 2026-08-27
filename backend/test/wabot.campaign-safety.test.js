const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const enginePath = path.resolve(__dirname, '../src/services/CampaignEngine.js')
const dbPath = path.resolve(__dirname, '../src/config/db.js')

function cargarMotor(queryImpl) {
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: queryImpl } }
  delete require.cache[enginePath]
  return require(enginePath)
}

// ── lineaEnCalentamiento (funcion pura) ──────────────────────────────────

test('una linea creada hoy esta en calentamiento', () => {
  const CampaignEngine = cargarMotor(async () => ({ rows: [] }))
  const hoy = new Date('2026-08-27T12:00:00Z')
  const creadaHoy = new Date('2026-08-27T08:00:00Z')
  assert.equal(CampaignEngine.lineaEnCalentamiento(creadaHoy, hoy), true)
})

test('una linea creada hace mas de 14 dias YA NO esta en calentamiento', () => {
  const CampaignEngine = cargarMotor(async () => ({ rows: [] }))
  const hoy = new Date('2026-08-27T12:00:00Z')
  const creadaHaceMucho = new Date('2026-01-01T00:00:00Z')
  assert.equal(CampaignEngine.lineaEnCalentamiento(creadaHaceMucho, hoy), false)
})

test('sin created_at, no se asume calentamiento (evita bloquear lineas viejas sin dato)', () => {
  const CampaignEngine = cargarMotor(async () => ({ rows: [] }))
  assert.equal(CampaignEngine.lineaEnCalentamiento(null), false)
})

// ── _run(): pausa por tope diario de calentamiento ───────────────────────

test('una linea nueva que llega al tope diario pausa la campaña sin mandar mas', async () => {
  const updates = []
  const emitted = []
  const creadaHace2Dias = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

  const query = async (sql, params) => {
    if (sql.includes('SELECT * FROM campaigns WHERE id')) {
      return { rows: [{ id: 'camp-1', name: 'Campaña test', status: 'running', line_id: 'line-1', batch_size: 50 }] }
    }
    if (sql.includes('SELECT id, name, created_at FROM lines')) {
      return { rows: [{ id: 'line-1', name: 'ENVIO_9', created_at: creadaHace2Dias }] }
    }
    if (sql.includes('FROM campaign_messages')) return { rows: [] }
    if (sql.includes('SELECT COUNT(*)::int AS total FROM messages')) {
      return { rows: [{ total: 60 }] } // ya alcanzo el tope por defecto (60)
    }
    if (sql.includes("UPDATE campaigns SET status='paused'")) {
      updates.push(params?.[0])
      return { rows: [] }
    }
    return { rows: [] }
  }

  const CampaignEngine = cargarMotor(query)
  const engine = new CampaignEngine(
    { sendText: async () => ({ key: { id: 'wa-1' } }) },
    { emit: (event, payload) => emitted.push({ event, payload }) }
  )
  engine.running['camp-1'] = { abortFlag: false }

  await engine._run('camp-1')

  assert.deepEqual(updates, ['camp-1'])
  assert.ok(emitted.some(e => e.payload?.motivo === 'calentamiento_linea_nueva'))
  assert.equal(engine.running['camp-1'], undefined, 'debe liberar el flag de "corriendo"')
})

test('una linea nueva por debajo del tope SI puede seguir enviando', async () => {
  let seEnvio = false
  const creadaHace2Dias = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

  const query = async (sql) => {
    if (sql.includes('SELECT * FROM campaigns WHERE id')) {
      // Tras el primer envío, ya no quedan pendientes → se completa
      return { rows: [{ id: 'camp-2', name: 'Campaña test 2', status: 'running', line_id: 'line-2', batch_size: 50 }] }
    }
    if (sql.includes('SELECT id, name, created_at FROM lines')) {
      return { rows: [{ id: 'line-2', name: 'ENVIO_1', created_at: creadaHace2Dias }] }
    }
    if (sql.includes('FROM campaign_messages')) return { rows: [] }
    if (sql.includes('SELECT COUNT(*)::int AS total FROM messages')) {
      return { rows: [{ total: 5 }] } // muy por debajo del tope
    }
    if (sql.includes("FROM campaign_recipients")) {
      if (seEnvio) return { rows: [] }
      return { rows: [{ id: 'rec-1', wa_number: '593999999999', variables: {} }] }
    }
    return { rows: [] }
  }

  const CampaignEngine = cargarMotor(query)
  const engine = new CampaignEngine(
    { sendText: async () => { seEnvio = true; return { key: { id: 'wa-2' } } } },
    { emit: () => {} }
  )
  engine.running['camp-2'] = { abortFlag: false }
  engine._sleep = async () => {} // no esperar de verdad en la prueba

  await engine._run('camp-2')

  assert.equal(seEnvio, true, 'debia enviar el mensaje pendiente')
})

// ── piso de seguridad en el pacing ────────────────────────────────────────

test('una campaña configurada con delay/lote peligrosos queda acotada por el piso de seguridad', async () => {
  const delaysCapturados = []
  let intentos = 0

  const query = async (sql) => {
    if (sql.includes('SELECT * FROM campaigns WHERE id')) {
      // delay 0-0s, lote 1000 → mucho mas agresivo que los pisos seguros
      return { rows: [{ id: 'camp-3', name: 'Agresiva', status: 'running', line_id: 'line-3', batch_size: 1000, min_delay_secs: 0, max_delay_secs: 0 }] }
    }
    if (sql.includes('SELECT id, name, created_at FROM lines')) {
      return { rows: [{ id: 'line-3', name: 'ENVIO_2', created_at: '2020-01-01T00:00:00Z' }] } // linea vieja, sin calentamiento
    }
    if (sql.includes('FROM campaign_messages')) return { rows: [] }
    if (sql.includes("FROM campaign_recipients")) {
      intentos += 1
      if (intentos > 1) return { rows: [] } // solo un destinatario
      return { rows: [{ id: 'rec-3', wa_number: '593999999999', variables: {} }] }
    }
    return { rows: [] }
  }

  const CampaignEngine = cargarMotor(query)
  const engine = new CampaignEngine(
    { sendText: async () => ({ key: { id: 'wa-3' } }) },
    { emit: () => {} }
  )
  engine.running['camp-3'] = { abortFlag: false }
  engine._sleep = async (ms) => { delaysCapturados.push(ms) }

  await engine._run('camp-3')

  assert.ok(delaysCapturados.length >= 1)
  // El piso de seguridad por defecto es 5s = 5000ms; con min=max=0 configurado
  // en la campaña, el motor debe usar igual el piso, no 0.
  assert.ok(delaysCapturados[0] >= 5000, `esperaba >= 5000ms, fue ${delaysCapturados[0]}`)
})
