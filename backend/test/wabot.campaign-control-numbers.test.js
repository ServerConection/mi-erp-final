const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const enginePath = path.resolve(__dirname, '../src/services/CampaignEngine.js')
const dbPath = path.resolve(__dirname, '../src/config/db.js')

function cargarMotor(queryImpl, envOverrides = {}) {
  const prevEnv = {}
  for (const k of Object.keys(envOverrides)) {
    prevEnv[k] = process.env[k]
    if (envOverrides[k] === undefined) delete process.env[k]
    else process.env[k] = envOverrides[k]
  }
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: queryImpl } }
  delete require.cache[enginePath]
  const mod = require(enginePath)
  return { CampaignEngine: mod, restore: () => {
    for (const k of Object.keys(prevEnv)) {
      if (prevEnv[k] === undefined) delete process.env[k]
      else process.env[k] = prevEnv[k]
    }
  } }
}

// ── normalizarNumeroControl ──────────────────────────────────────────────

test('normaliza numero local con 0 inicial a formato internacional 593', () => {
  const { CampaignEngine, restore } = cargarMotor(async () => ({ rows: [] }))
  assert.equal(CampaignEngine.normalizarNumeroControl('0983336118'), '593983336118')
  restore()
})

test('normaliza numero de 9 digitos sin codigo de pais agregando 593', () => {
  const { CampaignEngine, restore } = cargarMotor(async () => ({ rows: [] }))
  assert.equal(CampaignEngine.normalizarNumeroControl('958790214'), '593958790214')
  restore()
})

test('numero ya en formato 593 + 9 digitos se deja igual', () => {
  const { CampaignEngine, restore } = cargarMotor(async () => ({ rows: [] }))
  assert.equal(CampaignEngine.normalizarNumeroControl('593958650281'), '593958650281')
  restore()
})

// ── conOptOut ─────────────────────────────────────────────────────────────

test('agrega el aviso de STOP si el mensaje no lo menciona', () => {
  const { CampaignEngine, restore } = cargarMotor(async () => ({ rows: [] }))
  const resultado = CampaignEngine.conOptOut('Hola, tenemos una promo para ti.')
  assert.match(resultado, /STOP/i)
  restore()
})

test('no duplica el aviso si el mensaje ya menciona STOP', () => {
  const { CampaignEngine, restore } = cargarMotor(async () => ({ rows: [] }))
  const original = 'Hola. Responde STOP para no recibir mas.'
  assert.equal(CampaignEngine.conOptOut(original), original)
  restore()
})

test('WA_AGREGAR_OPT_OUT=false desactiva el aviso automatico', () => {
  const { CampaignEngine, restore } = cargarMotor(async () => ({ rows: [] }), { WA_AGREGAR_OPT_OUT: 'false' })
  const original = 'Hola, tenemos una promo para ti.'
  assert.equal(CampaignEngine.conOptOut(original), original)
  restore()
})

// ── _run(): burst a numeros de control ──────────────────────────────────

test('una campaña nueva (sent_count=0) manda primero a los numeros de control', async () => {
  const enviosControl = []
  const query = async (sql) => {
    if (sql.includes('SELECT * FROM campaigns WHERE id')) {
      return { rows: [{ id: 'camp-1', name: 'Test', status: 'running', line_id: 'line-1', sent_count: 0, batch_size: 50 }] }
    }
    if (sql.includes('SELECT id, name, created_at FROM lines')) {
      return { rows: [{ id: 'line-1', name: 'ENVIO_1', created_at: '2020-01-01T00:00:00Z' }] }
    }
    if (sql.includes('FROM campaign_messages')) return { rows: [] }
    if (sql.includes('FROM campaign_recipients')) return { rows: [] }
    return { rows: [] }
  }
  const { CampaignEngine, restore } = cargarMotor(query, { WA_NUMEROS_CONTROL: '593999111222,593999333444' })
  const engine = new CampaignEngine(
    { sendText: async (lineId, numero) => { enviosControl.push(numero); return { key: { id: 'wa-x' } } } },
    { emit: () => {} }
  )
  engine.running['camp-1'] = { abortFlag: false }
  engine._sleep = async () => {}

  await engine._run('camp-1')

  assert.deepEqual(enviosControl, ['593999111222', '593999333444'])
  restore()
})

test('una campaña YA iniciada (sent_count>0) no repite el burst inicial al reanudar', async () => {
  const enviosControl = []
  const query = async (sql) => {
    if (sql.includes('SELECT * FROM campaigns WHERE id')) {
      return { rows: [{ id: 'camp-2', name: 'Test2', status: 'running', line_id: 'line-2', sent_count: 5, batch_size: 50 }] }
    }
    if (sql.includes('SELECT id, name, created_at FROM lines')) {
      return { rows: [{ id: 'line-2', name: 'ENVIO_2', created_at: '2020-01-01T00:00:00Z' }] }
    }
    if (sql.includes('FROM campaign_messages')) return { rows: [] }
    if (sql.includes('FROM campaign_recipients')) return { rows: [] }
    return { rows: [] }
  }
  const { CampaignEngine, restore } = cargarMotor(query, { WA_NUMEROS_CONTROL: '593999111222' })
  const engine = new CampaignEngine(
    { sendText: async (lineId, numero) => { enviosControl.push(numero); return { key: { id: 'wa-x' } } } },
    { emit: () => {} }
  )
  engine.running['camp-2'] = { abortFlag: false }
  engine._sleep = async () => {}

  await engine._run('camp-2')

  assert.deepEqual(enviosControl, [])
  restore()
})

test('cada N envios reales (WA_CONTROL_CADA_N=2) se vuelve a tocar a los numeros de control', async () => {
  const enviosControl = []
  const enviosReales = []
  let intentos = 0

  const query = async (sql) => {
    if (sql.includes('SELECT * FROM campaigns WHERE id')) {
      return { rows: [{ id: 'camp-3', name: 'Test3', status: 'running', line_id: 'line-3', sent_count: 0, batch_size: 50 }] }
    }
    if (sql.includes('SELECT id, name, created_at FROM lines')) {
      return { rows: [{ id: 'line-3', name: 'ENVIO_3', created_at: '2020-01-01T00:00:00Z' }] }
    }
    if (sql.includes('FROM campaign_messages')) return { rows: [] }
    if (sql.includes('FROM campaign_recipients')) {
      intentos += 1
      if (intentos > 3) return { rows: [] }
      return { rows: [{ id: `rec-${intentos}`, wa_number: `59399900000${intentos}`, variables: {} }] }
    }
    return { rows: [] }
  }
  const { CampaignEngine, restore } = cargarMotor(query, { WA_NUMEROS_CONTROL: '593999111222', WA_CONTROL_CADA_N: '2' })
  const engine = new CampaignEngine(
    {
      sendText: async (lineId, numero) => {
        if (numero === '593999111222') enviosControl.push(numero)
        else enviosReales.push(numero)
        return { key: { id: 'wa-x' } }
      },
    },
    { emit: () => {} }
  )
  engine.running['camp-3'] = { abortFlag: false }
  engine._sleep = async () => {}

  await engine._run('camp-3')

  assert.equal(enviosReales.length, 3, 'debia mandar a los 3 destinatarios reales')
  assert.equal(enviosControl.length, 2, `esperaba 2 envios de control, hubo ${enviosControl.length}`)
  restore()
})
