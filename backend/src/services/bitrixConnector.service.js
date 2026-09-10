/**
 * WABOT-BITRIX — Conector de Canales Abiertos
 * ---------------------------------------------------------------------------
 * Esto es lo que hace Wazzup por dentro: registra un conector propio en
 * Bitrix24 para que las conversaciones de WhatsApp aparezcan NATIVAS dentro
 * del CRM (en la negociación, en el contacto, en el chat del asesor).
 *
 * Flujo de alta, una sola vez por portal:
 *   registrar()  -> imconnector.register
 *   activar(N)   -> imconnector.activate  (por cada canal abierto que se use)
 *
 * Flujo por mensaje:
 *   ENTRANTE  WhatsApp -> BaileysManager -> enviarAOpenLine()
 *   SALIENTE  Bitrix   -> evento OnImConnectorMessageAdd -> bitrixConnector.controller
 *
 * IMPORTANTE SOBRE CANTIDAD DE CANALES
 * 30 líneas de WhatsApp NO necesitan 30 canales abiertos. Un mismo conector se
 * activa en varios canales, y varias líneas pueden entregar al MISMO canal: de
 * qué número entró se distingue por el nombre del chat y por chat.id. Se usan
 * canales distintos solo cuando querés colas o reglas de asignación distintas
 * (ej. ARTS a un equipo y VIDIKA a otro). Eso baja el costo de licencia.
 */
const pool = require('../config/db')
const bitrix = require('./bitrixApp.service')

const CONNECTOR_ID   = process.env.BITRIX_CONNECTOR_ID || 'wabot_bitrix'
const CONNECTOR_NAME = process.env.BITRIX_CONNECTOR_NAME || 'WABOT-BITRIX (WhatsApp)'
const BASE_URL       = (process.env.BITRIX_APP_BASE_URL || '').replace(/\/+$/, '')

// SVG inline en Data URI — imconnector.register lo exige así, no acepta URL.
const ICONO = {
  DATA_IMAGE: 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<path fill="#25D366" d="M12 2a10 10 0 00-8.6 15L2 22l5.1-1.3A10 10 0 1012 2zm0 18a8 8 0 01-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1112 20z"/>' +
    '</svg>'
  ),
  COLOR: '#25D366',
}

/** Alta del conector en el portal. Idempotente: re-registrar solo actualiza. */
async function registrar() {
  if (!BASE_URL) throw new Error('BITRIX_APP_BASE_URL no configurada (URL pública HTTPS del handler)')
  return bitrix.llamar('imconnector.register', {
    ID: CONNECTOR_ID,
    NAME: CONNECTOR_NAME,
    ICON: ICONO,
    PLACEMENT_HANDLER: `${BASE_URL}/api/bitrix-connector/settings`,
  })
}

/** Activa el conector en un canal abierto concreto. */
async function activar(openLineId, activo = true) {
  return bitrix.llamar('imconnector.activate', {
    CONNECTOR: CONNECTOR_ID,
    LINE: Number(openLineId),
    ACTIVE: activo ? 1 : 0,
  })
}

/** Lista los canales abiertos del portal (para elegir a cuál entregar). */
async function listarCanales() {
  const ids = await bitrix.llamar('imopenlines.config.list.get', {})
  return Array.isArray(ids) ? ids : []
}

/** Nombre visible del conector dentro de ese canal. */
async function fijarDatos(openLineId, datos = {}) {
  return bitrix.llamar('imconnector.connector.data.set', {
    CONNECTOR: CONNECTOR_ID,
    LINE: Number(openLineId),
    DATA: { id: CONNECTOR_ID, url_im: BASE_URL, name: CONNECTOR_NAME, ...datos },
  })
}

/**
 * Empuja un mensaje ENTRANTE de WhatsApp hacia el canal abierto.
 *
 * `chat.id` es la clave de todo: Bitrix agrupa por ese id, así que tiene que
 * ser estable por conversación. Se usa `${lineId}:${waNumber}` para que el
 * MISMO cliente escribiendo a DOS líneas distintas abra DOS chats distintos —
 * que es justo lo que hace falta para saber por qué número/campaña entró.
 */
async function enviarAOpenLine({ openLineId, lineId, waNumber, nombre, texto, waMsgId, fechaUnix, archivos = [], nombreChat }) {
  const chatId = `${lineId}:${waNumber}`
  const partes = String(nombre || '').trim().split(/\s+/)

  const mensaje = {
    user: {
      id: `wa_${waNumber}`,
      name: _limpiarNombre(partes[0]) || waNumber,
      last_name: _limpiarNombre(partes.slice(1).join(' ')),
      phone: `+${waNumber}`,
      // El número de WhatsApp ya viene normalizado a E.164 sin '+'; la
      // validación de Bitrix rechaza formatos locales y perderíamos el mensaje.
      skip_phone_validate: 'Y',
    },
    message: {
      id: String(waMsgId || `${chatId}:${Date.now()}`),
      date: Number(fechaUnix || Math.floor(Date.now() / 1000)),
      text: texto || '',
    },
    chat: { id: chatId, name: nombreChat || `WhatsApp ${waNumber}` },
  }
  if (archivos.length) mensaje.message.files = archivos.map((a) => ({ url: a.url, name: a.name }))

  const res = await bitrix.llamar('imconnector.send.messages', {
    CONNECTOR: CONNECTOR_ID,
    LINE: Number(openLineId),
    MESSAGES: [mensaje],
  })

  await _guardarMapeo({ waMsgId, bitrixMsgId: mensaje.message.id, direction: 'in', chatId })
  return res
}

/** Marca como entregado en Bitrix un mensaje que WhatsApp ya confirmó. */
async function marcarEntregado({ openLineId, chatId, bitrixMsgIds = [] }) {
  if (!bitrixMsgIds.length) return null
  return bitrix.llamar('imconnector.send.status.delivery', {
    CONNECTOR: CONNECTOR_ID,
    LINE: Number(openLineId),
    MESSAGES: [{ chat: { id: chatId }, im: { message_id: bitrixMsgIds } }],
  })
}

/** Renombra el chat — así el asesor ve de qué campaña/línea vino. */
async function renombrarChat({ openLineId, chatId, nombre }) {
  return bitrix.llamar('imconnector.chat.name.set', {
    CONNECTOR: CONNECTOR_ID,
    LINE: Number(openLineId),
    CHAT: { id: chatId, name: nombre },
  })
}

// Bitrix rechaza nombres con dígitos o símbolos: solo letras, espacios,
// guiones y apóstrofes. Un nombre inválido tumba el mensaje entero.
function _limpiarNombre(s) {
  return String(s || '').replace(/[^\p{L} \-']/gu, '').trim().slice(0, 25)
}

async function _guardarMapeo({ waMsgId, bitrixMsgId, direction, chatId }) {
  if (!waMsgId && !bitrixMsgId) return
  try {
    const conv = await pool.query(
      'SELECT id FROM conversations WHERE bitrix_chat_id = $1 LIMIT 1', [chatId]
    )
    await pool.query(
      `INSERT INTO bitrix_message_map (conversation_id, wa_msg_id, bitrix_msg_id, direction)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (wa_msg_id) WHERE wa_msg_id IS NOT NULL DO NOTHING`,
      [conv.rows[0]?.id || null, waMsgId || null, bitrixMsgId || null, direction]
    )
  } catch (e) {
    // El mapeo es para trazabilidad y acuses; que falle no debe tumbar el
    // mensaje, que es lo que el cliente realmente está esperando.
    console.warn('[bitrixConnector] no se pudo guardar el mapeo de ids:', e.message)
  }
}

module.exports = {
  CONNECTOR_ID,
  registrar, activar, listarCanales, fijarDatos,
  enviarAOpenLine, marcarEntregado, renombrarChat,
}
