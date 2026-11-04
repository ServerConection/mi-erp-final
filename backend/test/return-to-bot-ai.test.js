const test = require('node:test')
const assert = require('node:assert/strict')
const service = require('../src/services/returnToBotAi.service')

test('normaliza las cuatro empresas soportadas', () => {
  assert.equal(service.normalizarEmpresa('Novonet'), 'NOVONET')
  assert.equal(service.normalizarEmpresa('Velsa'), 'VELSA')
  assert.equal(service.normalizarEmpresa('Semillero'), 'SEMILLERO')
  assert.equal(service.normalizarEmpresa('Venta en linea'), 'VENTAENLINEA')
  assert.equal(service.normalizarEmpresa('otra'), '')
})

test('Semillero usa configuracion base NOVONET cuando aun no tiene una propia', async () => {
  const llamadas = []
  const db = { query: async (sql, params) => {
    llamadas.push({ sql, params })
    if (params?.[0] === 'SEMILLERO') return { rows: [] }
    return { rows: [{ empresa: 'NOVONET', enabled: true }] }
  } }
  const result = await service.cargarConfiguracion('SEMILLERO', db)
  assert.equal(result.empresaConfig, 'NOVONET')
  assert.equal(llamadas.length, 2)
})

test('genera la respuesta con empresa de la linea y conversacion WABOT', async () => {
  const config = { empresa: 'VELSA', enabled: true, modelo: 'modelo-test', personalidad: 'natural', usar_emojis: false, longitud_maxima: 900, prompt_negocio: 'Reglas VELSA' }
  const db = { query: async (sql) => {
    if (sql.includes('FROM nexo_ia_config')) return { rows: [config] }
    if (sql.includes('FROM messages')) return { rows: [
      { id: 1, emisor_tipo: 'CLIENTE', texto: 'Necesito ayuda' },
      { id: 2, emisor_tipo: 'ASESOR', texto: 'Claro, cuenteme' },
    ] }
    if (sql.includes('FROM nexo_ia_documentos')) return { rows: [] }
    if (sql.includes('FROM bitrix_webhook_leads')) return { rows: [{ etapa: 'ATC' }] }
    throw new Error(`Consulta inesperada: ${sql}`)
  } }
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body)
    assert.match(body.messages[0].content, /EMPRESA: VELSA/)
    assert.match(body.messages[0].content, /continua naturalmente/i)
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ diagnostico: 'ok', respuesta_sugerida: 'Continuemos con tu solicitud.', tecnica_aplicada: 'continuidad', siguiente_accion: 'esperar', alertas: [] }) } }] }) }
  }
  const oldKey = process.env.NEXO_IA_API_KEY
  process.env.NEXO_IA_API_KEY = 'test-key'
  try {
    const result = await service.generarRespuesta({ conversationId: 'c1', empresa: 'VELSA', bitrixId: '10', db, fetchImpl })
    assert.equal(result.texto, 'Continuemos con tu solicitud.')
    assert.equal(result.empresa, 'VELSA')
  } finally {
    if (oldKey === undefined) delete process.env.NEXO_IA_API_KEY
    else process.env.NEXO_IA_API_KEY = oldKey
  }
})

