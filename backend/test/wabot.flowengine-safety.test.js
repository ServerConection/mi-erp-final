const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const enginePath = path.resolve(__dirname, '../src/services/FlowEngine.js')
const dbPath     = path.resolve(__dirname, '../src/config/db.js')

function cargarMotor(queryImpl, envOverrides = {}) {
  const prevEnv = {}
  for (const k of Object.keys(envOverrides)) {
    prevEnv[k] = process.env[k]
    process.env[k] = envOverrides[k]
  }
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: queryImpl } }
  delete require.cache[enginePath]
  const FlowEngine = require(enginePath)
  return { FlowEngine, restore: () => {
    for (const k of Object.keys(prevEnv)) {
      if (prevEnv[k] === undefined) delete process.env[k]
      else process.env[k] = prevEnv[k]
    }
  } }
}

// Flujo con un ciclo: A -> B -> A -> B -> ... sin ningun nodo de espera de
// por medio. Es exactamente el tipo de flujo que alguien arma sin querer en
// el editor visual (un edge que vuelve a un nodo anterior).
function flujoConCiclo() {
  return {
    nodes: [
      { id: 'start', type: 'startNode' },
      { id: 'A', type: 'messageNode', data: { text: 'Hola A' } },
      { id: 'B', type: 'messageNode', data: { text: 'Hola B' } },
    ],
    edges: [
      { source: 'start', target: 'A' },
      { source: 'A', target: 'B' },
      { source: 'B', target: 'A' }, // <- el ciclo
    ],
  }
}

test('un flujo con ciclo NO manda mensajes sin parar: se detiene en el tope de nodos por turno', async () => {
  const enviados = []
  const query = async (sql, params) => {
    if (sql.includes('SELECT flow_json FROM bots')) return { rows: [{ flow_json: flujoConCiclo() }] }
    if (sql.includes('SELECT * FROM conversations WHERE id')) {
      return { rows: [{ id: 'conv-1', current_node_id: null, context_data: {} }] }
    }
    return { rows: [] }
  }
  const { FlowEngine, restore } = cargarMotor(query, { WA_FLOW_MAX_NODOS_POR_TURNO: '5' })
  const engine = new FlowEngine(
    { sendText: async (lineId, numero, texto) => { enviados.push(texto); return { key: { id: 'wa-x' } } } },
    { emit: () => {} }
  )
  engine._sleep = async () => {} // no esperar de verdad en la prueba

  await engine.process({
    lineId: 'line-1', sock: {}, waNumber: '593999999999@s.whatsapp.net',
    text: 'hola', conv: { id: 'conv-1' }, botId: 'bot-1',
  })

  // Con tope=5, como máximo salen unos pocos mensajes — nunca cientos.
  assert.ok(enviados.length > 0, 'debia mandar al menos el primer mensaje')
  assert.ok(enviados.length <= 5, `el ciclo debia frenarse por el tope, mando ${enviados.length} mensajes`)
  restore()
})

test('sin tope configurado explícitamente, igual frena (tope por defecto = 25)', async () => {
  const enviados = []
  const query = async (sql) => {
    if (sql.includes('SELECT flow_json FROM bots')) return { rows: [{ flow_json: flujoConCiclo() }] }
    if (sql.includes('SELECT * FROM conversations WHERE id')) {
      return { rows: [{ id: 'conv-2', current_node_id: null, context_data: {} }] }
    }
    return { rows: [] }
  }
  const { FlowEngine, restore } = cargarMotor(query)
  const engine = new FlowEngine(
    { sendText: async (lineId, numero, texto) => { enviados.push(texto); return { key: { id: 'wa-x' } } } },
    { emit: () => {} }
  )
  engine._sleep = async () => {}

  await engine.process({
    lineId: 'line-1', sock: {}, waNumber: '593999999999@s.whatsapp.net',
    text: 'hola', conv: { id: 'conv-2' }, botId: 'bot-1',
  })

  assert.ok(enviados.length <= 25, `esperaba <=25 mensajes con el tope por defecto, hubo ${enviados.length}`)
  assert.ok(enviados.length > 10, `esperaba bastante mas de 10 mensajes antes de frenar (tope default=25), hubo ${enviados.length} — revisa que no se haya achicado el default por error`)
  restore()
})

test('un flujo NORMAL (sin ciclo) no se ve afectado por el tope', async () => {
  const enviados = []
  const flujoNormal = {
    nodes: [
      { id: 'start', type: 'startNode' },
      { id: 'saludo', type: 'messageNode', data: { text: 'Hola, bienvenido' } },
      { id: 'fin', type: 'endNode' },
    ],
    edges: [
      { source: 'start', target: 'saludo' },
      { source: 'saludo', target: 'fin' },
    ],
  }
  const query = async (sql) => {
    if (sql.includes('SELECT flow_json FROM bots')) return { rows: [{ flow_json: flujoNormal }] }
    if (sql.includes('SELECT * FROM conversations WHERE id')) {
      return { rows: [{ id: 'conv-3', current_node_id: null, context_data: {} }] }
    }
    return { rows: [] }
  }
  const { FlowEngine, restore } = cargarMotor(query, { WA_FLOW_MAX_NODOS_POR_TURNO: '3' })
  const engine = new FlowEngine(
    { sendText: async (lineId, numero, texto) => { enviados.push(texto); return { key: { id: 'wa-x' } } } },
    { emit: () => {} }
  )
  engine._sleep = async () => {}

  await engine.process({
    lineId: 'line-1', sock: {}, waNumber: '593999999999@s.whatsapp.net',
    text: 'hola', conv: { id: 'conv-3' }, botId: 'bot-1',
  })

  assert.deepEqual(enviados, ['Hola, bienvenido'])
  restore()
})

test('dos mensajes casi simultaneos de la misma conversacion: el segundo no dispara otro turno', async () => {
  const enviados = []
  let dejarSeguir
  const puedeSeguir = new Promise(r => { dejarSeguir = r })

  const query = async (sql) => {
    if (sql.includes('SELECT flow_json FROM bots')) {
      // El primer turno se queda "colgado" a propósito hasta que el test lo libere,
      // simulando que sigue en curso cuando llega el segundo mensaje.
      await puedeSeguir
      return {
        rows: [{
          flow_json: {
            nodes: [{ id: 'start', type: 'startNode' }, { id: 'm', type: 'messageNode', data: { text: 'hola' } }],
            edges: [{ source: 'start', target: 'm' }],
          },
        }],
      }
    }
    if (sql.includes('SELECT * FROM conversations WHERE id')) {
      return { rows: [{ id: 'conv-4', current_node_id: null, context_data: {} }] }
    }
    return { rows: [] }
  }
  const { FlowEngine, restore } = cargarMotor(query)
  const engine = new FlowEngine(
    { sendText: async (lineId, numero, texto) => { enviados.push(texto); return { key: { id: 'wa-x' } } } },
    { emit: () => {} }
  )
  engine._sleep = async () => {}

  const primerTurno = engine.process({
    lineId: 'line-1', sock: {}, waNumber: '593999999999@s.whatsapp.net',
    text: 'primero', conv: { id: 'conv-4' }, botId: 'bot-1',
  })

  // El segundo mensaje llega MIENTRAS el primero sigue esperando en la "query" de arriba.
  await engine.process({
    lineId: 'line-1', sock: {}, waNumber: '593999999999@s.whatsapp.net',
    text: 'segundo', conv: { id: 'conv-4' }, botId: 'bot-1',
  })

  assert.deepEqual(enviados, [], 'el segundo turno no debia mandar nada mientras el primero seguia en curso')

  dejarSeguir()
  await primerTurno

  assert.deepEqual(enviados, ['hola'], 'el primer turno si debia completarse normalmente')
  restore()
})
