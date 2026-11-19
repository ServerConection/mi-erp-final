/**
 * BOT VENDEDOR NETLIFE — WhatsApp por QR (Baileys) + IA (Groq).
 *
 * El prompt, las reglas y el conocimiento se editan en el ERP (modulo "Bot Vendedor IA")
 * y se guardan en Postgres. El bot los relee cada 60 s: no hace falta reiniciarlo.
 *
 * Uso (desde la carpeta backend):
 *   node scripts/bot-vendedor/bot-vendedor.js            -> conecta WhatsApp y muestra el QR
 *   node scripts/bot-vendedor/bot-vendedor.js --probar   -> prueba la IA en la terminal, sin WhatsApp
 *
 * Variables (.env del backend): GROQ_API_KEY, DB_* (las del ERP).
 * Opcionales: BOT_MODEL, BOT_MODEL_RESPALDO, BOT_VISION_MODEL, BOT_PAUSA_MIN (default 120).
 */
const path = require('path')
const fs = require('fs')
const readline = require('readline')

const BACKEND_DIR = path.resolve(__dirname, '..', '..')
require(path.join(BACKEND_DIR, 'node_modules', 'dotenv')).config({ path: path.join(BACKEND_DIR, '.env') })
const bot = require(path.join(BACKEND_DIR, 'src', 'services', 'botVendedor.service'))

const BOT_DIR = __dirname
const AUTH_DIR = path.join(BOT_DIR, 'auth')
const LOG_ESCALADOS = path.join(BOT_DIR, 'escalados.log')
const PAUSA_MS = Number(process.env.BOT_PAUSA_MIN || 120) * 60 * 1000
const MAX_HISTORIAL = 10

if (!process.env.GROQ_API_KEY && !process.env.BOT_VENDEDOR_API_KEY) {
  console.error('Falta GROQ_API_KEY en backend/.env')
  process.exit(1)
}

// ---------------------------------------------------------------- conversacion
const historiales = new Map() // jid -> [{role, content}]
const pausados = new Map() // jid -> timestamp hasta el que el bot no responde

async function responder (jid, textoCliente) {
  const hist = historiales.get(jid) || []
  hist.push({ role: 'user', content: textoCliente })
  while (hist.length > MAX_HISTORIAL) hist.shift()
  const r = await bot.responder(hist)
  console.log(`   (${r.modelo} respondio en ${(r.ms / 1000).toFixed(1)} s)`)
  hist.push({ role: 'assistant', content: r.texto })
  historiales.set(jid, hist)
  return r
}

// cola por chat para no responder en paralelo al mismo cliente
const colas = new Map()
function enCola (jid, tarea) {
  const siguiente = (colas.get(jid) || Promise.resolve()).then(tarea).catch(e => console.error(`[${jid}] ${e.message}`))
  colas.set(jid, siguiente)
  return siguiente
}

async function mostrarBase () {
  const base = await bot.cargarBase()
  console.log(`Base cargada desde el ERP: prompt ${base.prompt.length} caracteres, ${base.siempre.length} documentos fijos, ${base.fragmentos.length} fragmentos de busqueda.`)
}

// ---------------------------------------------------------------- modo prueba
async function modoPrueba () {
  await mostrarBase()
  console.log('\nModo prueba. Escribe como cliente (Ctrl+C para salir).\n')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  let cerrado = false
  rl.on('close', () => { cerrado = true; process.exit(0) })
  const preguntar = () => !cerrado && rl.question('Cliente: ', async linea => {
    if (!linea.trim()) return preguntar()
    try {
      const { texto, accion } = await responder('prueba', linea)
      console.log(`\nBot: ${texto}${accion ? `   <<${accion}>>` : ''}\n`)
    } catch (e) {
      console.error('Error:', e.message, e.cause ? `(${e.cause.code || e.cause.message})` : '')
    }
    preguntar()
  })
  preguntar()
}

// ---------------------------------------------------------------- whatsapp
async function modoWhatsApp () {
  await mostrarBase()
  const nm = p => require(path.join(BACKEND_DIR, 'node_modules', p))
  const baileys = nm('@whiskeysockets/baileys')
  const makeWASocket = baileys.default || baileys.makeWASocket
  const { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, downloadMediaMessage } = baileys
  const QRCode = nm('qrcode')
  let logger
  try { logger = nm('pino')({ level: 'silent' }) } catch { logger = undefined }

  const conectar = async () => {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
    let version
    try { ({ version } = await fetchLatestBaileysVersion()) } catch { version = undefined }

    const sock = makeWASocket({ auth: state, logger, version, printQRInTerminal: false, markOnlineOnConnect: false, browser: ['Bot Vendedor NETLIFE', 'Chrome', '1.0'] })
    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        const pngQR = path.join(BOT_DIR, 'qr.png')
        await QRCode.toFile(pngQR, qr, { width: 400 })
        console.log(await QRCode.toString(qr, { type: 'terminal', small: true }))
        console.log(`Escanea el QR desde WhatsApp Business > Dispositivos vinculados. Tambien esta en: ${pngQR}`)
      }
      if (connection === 'open') {
        console.log('WhatsApp conectado. El bot ya esta respondiendo.')
        try { fs.unlinkSync(path.join(BOT_DIR, 'qr.png')) } catch {}
      }
      if (connection === 'close') {
        const codigo = lastDisconnect?.error?.output?.statusCode
        if (codigo === DisconnectReason.loggedOut) {
          console.error('La sesion se cerro desde el telefono. Mueve la carpeta auth a otro lado y vuelve a escanear.')
          process.exit(1)
        }
        console.log(`Conexion cerrada (codigo ${codigo}). Reintentando en 5 s...`)
        setTimeout(conectar, 5000)
      }
    })

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return
      for (const msg of messages) {
        const jid = msg.key?.remoteJid || ''
        if (!msg.message || msg.key.fromMe) continue
        if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) continue
        enCola(jid, () => atender(sock, downloadMediaMessage, logger, msg))
      }
    })
  }

  await conectar()
}

async function atender (sock, downloadMediaMessage, logger, msg) {
  const jid = msg.key.remoteJid
  const hasta = pausados.get(jid)
  if (hasta && Date.now() < hasta) return // lo atiende un asesor
  if (hasta) pausados.delete(jid)

  const m = msg.message.ephemeralMessage?.message || msg.message.viewOnceMessageV2?.message || msg.message
  const bajar = () => downloadMediaMessage(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage })

  let entrada = m.conversation || m.extendedTextMessage?.text || ''
  try {
    if (m.audioMessage) {
      const texto = await bot.transcribirAudio(await bajar(), m.audioMessage.mimetype || 'audio/ogg')
      entrada = `[Audio: ${texto || 'no se entendio el audio'}]`
    } else if (m.imageMessage) {
      const caption = m.imageMessage.caption || ''
      let descripcion
      try {
        descripcion = await bot.describirImagen(await bajar(), m.imageMessage.mimetype || 'image/jpeg', caption)
      } catch (e) {
        console.error(`No pude analizar la imagen: ${e.message}`)
        descripcion = 'no disponible'
      }
      entrada = `[Image: ${descripcion}]${caption ? ' ' + caption : ''}`
    } else if (m.documentMessage) {
      entrada = `[Documento: ${m.documentMessage.fileName || 'archivo'}] ${m.documentMessage.caption || ''}`
    } else if (m.locationMessage) {
      const l = m.locationMessage
      entrada = `[Ubicacion compartida: lat ${l.degreesLatitude}, lng ${l.degreesLongitude}${l.address ? ', ' + l.address : ''}]`
    } else if (m.stickerMessage || m.reactionMessage) {
      return
    }
  } catch (e) {
    console.error(`Error procesando adjunto: ${e.message}`)
    entrada = entrada || '[El cliente envio un archivo que no se pudo procesar]'
  }
  if (!entrada.trim()) return

  console.log(`<- ${jid}: ${entrada.slice(0, 120)}`)
  try { await sock.sendPresenceUpdate('composing', jid) } catch {}

  let respuesta
  try {
    respuesta = await responder(jid, entrada)
  } catch (e) {
    console.error(`IA no disponible: ${e.message}`)
    respuesta = { texto: 'Disculpa, estoy teniendo un inconveniente. Un asesor te escribira en breve.', accion: 'ESCALAR' }
  }

  await sock.sendMessage(jid, { text: respuesta.texto })
  try { await sock.sendPresenceUpdate('paused', jid) } catch {}
  console.log(`-> ${jid}: ${respuesta.texto.slice(0, 120)}${respuesta.accion ? `  <<${respuesta.accion}>>` : ''}`)

  if (respuesta.accion) {
    pausados.set(jid, Date.now() + PAUSA_MS)
    fs.appendFileSync(LOG_ESCALADOS, `${new Date().toISOString()}\t${respuesta.accion}\t${jid}\t${entrada.replace(/\s+/g, ' ').slice(0, 200)}\n`)
    console.log(`*** PASAR A ASESOR: ${jid} (revisa escalados.log) ***`)
  }
}

// ---------------------------------------------------------------- inicio
const arranque = process.argv.includes('--probar') ? modoPrueba : modoWhatsApp
arranque().catch(e => { console.error(e.message || e); process.exit(1) })
