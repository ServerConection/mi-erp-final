const crypto = require('node:crypto')
const pool = require('../config/db')
const { construirPrompt, parsearSalida } = require('../nexoIa/nexoIa.prompt')

const EMPRESAS = new Set(['NOVONET', 'VELSA', 'SEMILLERO', 'VENTAENLINEA'])

function normalizarEmpresa(valor) {
  const empresa = String(valor || '').trim().toUpperCase().replace(/\s+/g, '')
  return EMPRESAS.has(empresa) ? empresa : ''
}

async function cargarConfiguracion(empresa, db = pool) {
  const propias = await db.query('SELECT * FROM nexo_ia_config WHERE empresa=$1 AND enabled=TRUE', [empresa])
  if (propias.rows[0]) return { config: propias.rows[0], empresaConfig: empresa }

  // SEMILLERO y VENTA EN LINEA comparten el negocio Netlife de NOVONET. Este
  // fallback permite devolver el control aunque aun no tengan prompt propio;
  // el prompt conserva EMPRESA real para que la IA no mezcle identidades.
  if (['SEMILLERO', 'VENTAENLINEA'].includes(empresa)) {
    const base = await db.query("SELECT * FROM nexo_ia_config WHERE empresa='NOVONET' AND enabled=TRUE")
    if (base.rows[0]) return { config: base.rows[0], empresaConfig: 'NOVONET' }
  }
  const error = new Error(`Nexo IA no esta habilitado para ${empresa}`)
  error.code = 'NEXO_IA_NO_HABILITADO'
  throw error
}

async function contextoConversacion(conversationId, empresa, db = pool) {
  const mensajes = await db.query(
    `SELECT id,
            CASE WHEN direction='in' THEN 'CLIENTE' ELSE 'ASESOR' END AS emisor_tipo,
            timestamp AS fecha,
            COALESCE(NULLIF(content, ''), CASE WHEN type <> 'text' THEN '[' || UPPER(type) || ']' END, '[Mensaje]') AS texto
       FROM messages
      WHERE conversation_id=$1
      ORDER BY timestamp ASC, id ASC
      LIMIT 500`,
    [conversationId]
  )
  if (!mensajes.rows.length) throw new Error('La conversacion no tiene mensajes para analizar')
  return {
    empresa,
    mensajes: mensajes.rows,
    ultimoId: String(mensajes.rows.at(-1).id),
  }
}

async function generarRespuesta({ conversationId, empresa, bitrixId, db = pool, fetchImpl = fetch }) {
  const company = normalizarEmpresa(empresa)
  if (!company) throw new Error('La linea no tiene una empresa compatible con Nexo IA')
  const [{ config, empresaConfig }, conversacion] = await Promise.all([
    cargarConfiguracion(company, db),
    contextoConversacion(conversationId, company, db),
  ])
  const docs = await db.query(
    'SELECT texto FROM nexo_ia_documentos WHERE empresa=$1 AND activo=TRUE ORDER BY creado_at DESC LIMIT 5',
    [empresaConfig]
  )
  let etapa = null
  if (bitrixId) {
    const etapaResult = await db.query(
      `SELECT COALESCE(NULLIF(etapa_bitrix, ''), etapa) AS etapa
         FROM bitrix_webhook_leads
        WHERE UPPER(BTRIM(empresa))=$1 AND bitrix_id=$2
        ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
      [company, String(bitrixId)]
    )
    etapa = etapaResult.rows[0]?.etapa || null
  }
  const prompt = construirPrompt({
    config: {
      ...config,
      reglas: `${config.reglas || ''}\nAl retomar el control del bot, responde directamente al ultimo mensaje y continua naturalmente desde el punto exacto donde quedo el asesor. No saludes de nuevo si la conversacion ya inicio. No menciones inteligencia artificial, automatizacion ni cambio de operador.`,
    },
    lead: { empresa: company, etapa_nombre: etapa },
    conversacion: conversacion.mensajes,
    documentos: docs.rows.map(row => row.texto),
    tipo: 'RESPUESTA_AL_CLIENTE',
  })
  const baseUrl = (process.env.NEXO_IA_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '')
  const apiKey = process.env.NEXO_IA_API_KEY || process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('Nexo IA no tiene API key configurada')
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.modelo,
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 4000,
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(45000),
  })
  if (!response.ok) {
    const detalle = String(await response.text().catch(() => '')).slice(0, 300).replace(/\s+/g, ' ')
    const error = new Error(`Nexo IA respondio ${response.status}${detalle ? `: ${detalle}` : ''}`)
    error.status = response.status
    throw error
  }
  const raw = await response.json()
  const salida = parsearSalida(raw.choices?.[0]?.message?.content)
  const texto = String(salida.respuesta_sugerida || '').trim().slice(0, Number(config.longitud_maxima) || 900)
  if (!texto) throw new Error('Nexo IA no genero una respuesta para enviar')
  return {
    texto,
    salida,
    empresa: company,
    empresaConfig,
    modelo: config.modelo,
    mensajeDisparadorId: conversacion.ultimoId,
    contextoHash: crypto.createHash('sha256').update(prompt).digest('hex'),
  }
}

module.exports = { generarRespuesta, normalizarEmpresa, cargarConfiguracion, contextoConversacion, EMPRESAS }
