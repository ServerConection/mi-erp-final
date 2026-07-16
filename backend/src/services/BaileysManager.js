const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  getAggregateVotesInPollMessage,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const path = require('path')
const fs = require('fs')
const pino = require('pino')
const { query } = require('../config/db')
const FlowEngine = require('./FlowEngine')

// WA_AUTH_DIR: variable usada en Render (disco persistente /var/data/auth_sessions)
const AUTH_BASE = process.env.WA_AUTH_DIR || process.env.AUTH_SESSIONS_DIR || path.join(__dirname, '../../auth_sessions')
const silentLogger = pino({ level: 'silent' })

class BaileysManager {
  constructor(io) {
    this.io = io
    this.instances = {}
    this.lidMap = {}
  }

  async _loadLidMapFromDB() {
    try {
      const res = await query('SELECT lid_number, real_number FROM lid_mappings')
      for (const row of res.rows) {
        this.lidMap[row.lid_number] = row.real_number
      }
      console.log(`[BaileysManager] LidMap cargado: ${res.rows.length} entradas`)
    } catch (e) {
      console.warn('[BaileysManager] No se pudo cargar lidMap desde DB:', e.message)
    }
  }

  async _saveLidMapping(lidNum, realNum) {
    if (!lidNum || !realNum) return
    this.lidMap[lidNum] = realNum
    try {
      await query(
        `INSERT INTO lid_mappings (lid_number, real_number)
         VALUES ($1, $2)
         ON CONFLICT (lid_number) DO UPDATE SET real_number=$2, updated_at=NOW()`,
        [lidNum, realNum]
      )
    } catch (e) {
      console.warn('[BaileysManager] Error guardando lid_mapping:', e.message)
    }
  }

  async _resolveLid(lidRaw, sock, lineId) {
    const lidNum = this._cleanNumber(lidRaw)

    if (this.lidMap[lidNum]) {
      console.log(`[Line ${lineId}] ✅ LID resuelto (memoria): ${lidNum} → ${this.lidMap[lidNum]}`)
      return this.lidMap[lidNum]
    }

    try {
      const res = await query(
        `SELECT metadata->>'real_phone' as real_phone
         FROM contacts WHERE wa_number=$1 AND line_id=$2 AND metadata->>'real_phone' IS NOT NULL`,
        [lidNum, lineId]
      )
      if (res.rows[0]?.real_phone) {
        const realNum = res.rows[0].real_phone
        await this._saveLidMapping(lidNum, realNum)
        console.log(`[Line ${lineId}] ✅ LID resuelto (DB contacts): ${lidNum} → ${realNum}`)
        return realNum
      }
    } catch (e) {}

    try {
      const results = await sock.onWhatsApp(`+${lidNum}`)
      if (results?.[0]?.jid) {
        const resolved = results[0].jid.replace('@s.whatsapp.net', '')
        await this._saveLidMapping(lidNum, resolved)
        console.log(`[Line ${lineId}] ✅ LID resuelto (onWhatsApp): ${lidNum} → ${resolved}`)
        return resolved
      }
    } catch (e) {
      console.log(`[Line ${lineId}] ⚠️ onWhatsApp falló para LID ${lidNum}: ${e.message}`)
    }

    console.log(`[Line ${lineId}] ⚠️ LID sin resolver: ${lidNum}, usando LID como fallback`)
    return lidNum
  }

  async connect(lineId) {
    if (Object.keys(this.lidMap).length === 0) {
      await this._loadLidMapFromDB()
    }

    if (this.instances[lineId]?.sock) {
      console.log(`[Line ${lineId}] Ya está conectada o conectando`)
      return
    }

    const authDir = path.join(AUTH_BASE, lineId)
    fs.mkdirSync(authDir, { recursive: true })

    const { state, saveCreds } = await useMultiFileAuthState(authDir)
    const { version } = await fetchLatestBaileysVersion()
    // makeInMemoryStore fue eliminado en Baileys v7 → mini-store propio compatible
    const store = this._createMessageStore()

    const lineRow = await query('SELECT * FROM lines WHERE id = $1', [lineId])
    const line = lineRow.rows[0]

    const socketOptions = {
      version,
      auth: state,
      printQRInTerminal: false,
      logger: silentLogger,
      browser: ['WaBot Platform', 'Chrome', '120.0'],
      getMessage: async (key) => {
        if (store) {
          const msg = await store.loadMessage(key.remoteJid, key.id)
          return msg?.message || undefined
        }
        return { conversation: 'hello' }
      },
    }

    if (line?.proxy_enabled && line?.proxy_config?.host) {
      try {
        const { SocksProxyAgent } = require('socks-proxy-agent')
        const { HttpsProxyAgent } = require('https-proxy-agent')
        const pc = line.proxy_config
        const proxyUrl = pc.username
          ? `${pc.protocol || 'socks5'}://${pc.username}:${pc.password}@${pc.host}:${pc.port}`
          : `${pc.protocol || 'socks5'}://${pc.host}:${pc.port}`
        if ((pc.protocol || 'socks5').startsWith('socks')) {
          socketOptions.agent = new SocksProxyAgent(proxyUrl)
        } else {
          socketOptions.agent = new HttpsProxyAgent(proxyUrl)
        }
        console.log(`[Line ${lineId}] Proxy configurado: ${pc.host}:${pc.port}`)
      } catch (e) {
        console.warn(`[Line ${lineId}] Error configurando proxy:`, e.message)
      }
    }

    const sock = makeWASocket(socketOptions)
    store.bind(sock.ev)

    this.instances[lineId] = { sock, store, status: 'connecting', qr: null }
    this._updateLineStatus(lineId, 'connecting')

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('contacts.update', async (updates) => {
      for (const contact of updates) {
        if (contact.id && contact.id.endsWith('@lid') && contact.phoneNumber) {
          const lidNum = contact.id.replace('@lid', '').replace(/\D/g, '')
          const realNum = contact.phoneNumber.replace(/\D/g, '')
          console.log(`[Line ${lineId}] 📞 LID resuelto (contacts.update): ${lidNum} → +${realNum}`)
          await this._saveLidMapping(lidNum, realNum)
          try {
            await query(
              `UPDATE contacts SET metadata = jsonb_set(
                COALESCE(metadata, '{}'),
                '{real_phone}',
                $1::jsonb
              ), last_seen = NOW()
              WHERE wa_number = $2 AND line_id = $3`,
              [JSON.stringify(realNum), lidNum, lineId]
            )
          } catch (e) {}
        }
      }
    })

    sock.ev.on('lid-mapping.update', async (mappings) => {
      for (const [lid, pn] of Object.entries(mappings || {})) {
        const lidNum = lid.replace('@lid', '').replace(/\D/g, '')
        const realNum = pn.replace('@s.whatsapp.net', '').replace(/\D/g, '')
        if (lidNum && realNum) {
          await this._saveLidMapping(lidNum, realNum)
          console.log(`[Line ${lineId}] 🔗 lid-mapping: ${lidNum} → +${realNum}`)
          try {
            await query(
              `UPDATE contacts SET metadata = metadata || $1::jsonb, last_seen = NOW()
               WHERE wa_number = $2 AND line_id = $3`,
              [JSON.stringify({ real_phone: realNum }), lidNum, lineId]
            )
          } catch (e) {}
        }
      }
    })

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        const QRCode = require('qrcode')
        const qrImage = await QRCode.toDataURL(qr)
        this.instances[lineId].qr = qrImage
        this.instances[lineId].status = 'qr_ready'
        this._updateLineStatus(lineId, 'qr_ready')
        this.io.emit('line:qr', { lineId, qr: qrImage })
        this.io.emit(`line:qr:${lineId}`, { lineId, qr: qrImage })
        this.io.emit('line:status', { lineId, status: 'qr_ready' })
        console.log(`[Line ${lineId}] QR generado`)
      }

      if (connection === 'open') {
        this.instances[lineId].status = 'connected'
        this.instances[lineId].qr = null
        this._updateLineStatus(lineId, 'connected')
        this.io.emit('line:status', { lineId, status: 'connected' })
        this.io.emit(`line:status:${lineId}`, { lineId, status: 'connected' })
        console.log(`[Line ${lineId}] ✅ Conectada`)
        const phoneNumber = sock.user?.id?.split(':')[0]
        if (phoneNumber) {
          await query(
            'UPDATE lines SET phone_number=$1, last_connected=NOW() WHERE id=$2',
            [phoneNumber, lineId]
          )
          console.log(`[Line ${lineId}] Número registrado: ${phoneNumber}`)
        }
      }

      if (connection === 'close') {
        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut
        console.log(`[Line ${lineId}] Desconectada. Código: ${statusCode}. Reconectar: ${shouldReconnect}`)
        delete this.instances[lineId]
        this._updateLineStatus(lineId, shouldReconnect ? 'disconnected' : 'logged_out')
        const closePayload = { lineId, status: shouldReconnect ? 'disconnected' : 'logged_out' }
        this.io.emit('line:status', closePayload)
        this.io.emit(`line:status:${lineId}`, closePayload)
        if (shouldReconnect) {
          setTimeout(() => this.connect(lineId), 5000)
        }
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return

      for (const msg of messages) {
        if (msg.key.fromMe) continue
        if (!msg.message) continue

        const remoteJid = msg.key.remoteJid
        if (remoteJid.endsWith('@g.us')) continue
        if (remoteJid === 'status@broadcast') continue

        let waNumber = this._cleanNumber(remoteJid)

        if (remoteJid.endsWith('@lid')) {
          const directJid =
            msg.message?.deviceSentMessage?.destinationJid ||
            msg.key?.participant

          if (directJid && !directJid.endsWith('@lid')) {
            const directNum = this._cleanNumber(directJid)
            if (directNum) {
              await this._saveLidMapping(waNumber, directNum)
              console.log(`[Line ${lineId}] ✅ LID resuelto (mensaje directo): ${waNumber} → ${directNum}`)
              waNumber = directNum
            }
          } else {
            waNumber = await this._resolveLid(remoteJid, sock, lineId)
          }
        }

        const listResponse = msg.message?.listResponseMessage
        const interactiveResponse = msg.message?.interactiveResponseMessage
        const nativeFlowResponse = interactiveResponse?.nativeFlowResponseMessage

        let quickReplyResponse = ''
        if (nativeFlowResponse?.paramsJson) {
          try {
            const params = JSON.parse(nativeFlowResponse.paramsJson)
            quickReplyResponse = params?.id || params?.display_text || ''
            if (quickReplyResponse.startsWith('opt_')) {
              const parts = quickReplyResponse.split('_')
              quickReplyResponse = parts.slice(2).join('_').replace(/_/g, ' ')
            }
          } catch (e) {}
        }

        const text = (
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.documentMessage?.caption ||
          listResponse?.title ||
          listResponse?.singleSelectReply?.selectedRowId ||
          quickReplyResponse ||
          ''
        ).trim()

        const msgType = msg.message?.conversation ? 'text'
          : msg.message?.extendedTextMessage ? 'text'
          : msg.message?.listResponseMessage ? 'list_response'
          : msg.message?.interactiveResponseMessage ? 'interactive_response'
          : msg.message?.imageMessage ? 'image'
          : msg.message?.documentMessage ? 'document'
          : msg.message?.audioMessage ? 'audio'
          : 'unknown'

        const pushName = msg.pushName || ''
        // ── Número de quien escribe ──────────────────────────────
        const waNumberDisplay = `+${waNumber}`

        let realPhone = null
        const participant = msg.key?.participant
        if (participant && participant.endsWith('@s.whatsapp.net')) {
          realPhone = participant.replace('@s.whatsapp.net', '')
        }

        console.log(`[Line ${lineId}] 📱 De: ${waNumberDisplay} nombre: "${pushName}" → "${text}"`)

        if (realPhone) {
          try {
            await query(
              `INSERT INTO contacts (wa_number, line_id, metadata)
               VALUES ($1, $2, $3::jsonb)
               ON CONFLICT (wa_number, line_id)
               DO UPDATE SET metadata = contacts.metadata || $3::jsonb, last_seen = NOW()`,
              [waNumber, lineId, JSON.stringify({ real_phone: realPhone, push_name: pushName })]
            )
          } catch (e) {}
        }

        try { await sock.readMessages([msg.key]) } catch (e) {}

        try {
          await this._handleIncomingMessage(lineId, sock, msg, remoteJid, waNumber, text, msgType, pushName)
        } catch (err) {
          console.error(`[Line ${lineId}] Error procesando mensaje:`, err.message)
          console.error(err.stack)
        }
      }
    })

    sock.ev.on('messages.update', async (updates) => {
      for (const { key, update } of updates) {
        // ── Acks de entrega/lectura (status: 3=entregado, 4=leído) ──
        if (typeof update.status === 'number' && key?.id) {
          try { await this._handleDeliveryAck(lineId, key.id, update.status) } catch (e) {}
        }

        if (!update.pollUpdates) continue

        const remoteJid = key.remoteJid
        if (remoteJid.endsWith('@g.us')) continue

        let waNumber = this._cleanNumber(remoteJid)

        if (remoteJid.endsWith('@lid')) {
          waNumber = await this._resolveLid(remoteJid, sock, lineId)
        }

        const pollCreation = await store.loadMessage(remoteJid, key.id)
        if (!pollCreation) continue

        const votes = getAggregateVotesInPollMessage({
          message: pollCreation,
          pollUpdates: update.pollUpdates,
        })

        const selected = votes.find(v => v.voters.length > 0)
        if (!selected) continue

        console.log(`[Line ${lineId}] 🗳️ Poll de ${waNumber}: "${selected.name}"`)

        try {
          await this._handlePollVote(lineId, sock, remoteJid, waNumber, selected.name)
        } catch (err) {
          console.error(`[Line ${lineId}] Error procesando poll:`, err.message)
        }
      }
    })
  }

  async disconnect(lineId) {
    const inst = this.instances[lineId]
    if (!inst) return
    try { await inst.sock.logout() } catch (e) {}
    delete this.instances[lineId]
    this._updateLineStatus(lineId, 'disconnected')
    this.io.emit('line:status', { lineId, status: 'disconnected' })
    this.io.emit(`line:status:${lineId}`, { lineId, status: 'disconnected' })
  }

  async sendText(lineId, to, text) {
    const inst = this.instances[lineId]
    if (!inst || inst.status !== 'connected') throw new Error(`Línea ${lineId} no conectada`)
    const jid = this._toJid(to)
    console.log(`[Line ${lineId}] → Enviando texto a ${jid}`)
    const result = await inst.sock.sendMessage(jid, { text })
    await this._saveOutboundMessage(lineId, this._cleanNumber(to), 'text', text)
    return result
  }

  async sendPoll(lineId, to, pollTitle, options) {
    const inst = this.instances[lineId]
    if (!inst || inst.status !== 'connected') throw new Error(`Línea ${lineId} no conectada`)
    const jid = this._toJid(to)
    console.log(`[Line ${lineId}] → Enviando poll a ${jid}: "${pollTitle}"`)
    await inst.sock.sendMessage(jid, {
      poll: { name: pollTitle, values: options, selectableCount: 1 },
    })
  }

  // ── SOLO lista numerada, sin botones ─────────────────────────────────────
  async sendList(lineId, to, { title, description, buttonText, options }) {
    const inst = this.instances[lineId]
    if (!inst || inst.status !== 'connected') throw new Error(`Línea ${lineId} no conectada`)
    const jid = this._toJid(to)

    const labels = options
      .map(o => typeof o === 'object' ? (o.label || '') : (o || ''))
      .filter(Boolean)

    const lines = [
      `*${title}*`,
      '',
      ...labels.map((label, i) => `${_numEmoji(i + 1)} ${label}`),
      '',
      '👆 _Responde con el número de tu opción_',
    ]
    await inst.sock.sendMessage(jid, { text: lines.join('\n') })
    console.log(`[Line ${lineId}] → Menú numerado enviado`)
  }

  async sendMedia(lineId, to, { type, buffer, mimetype, filename, caption, mediaUrl }) {
    const inst = this.instances[lineId]
    if (!inst || inst.status !== 'connected') throw new Error(`Línea ${lineId} no conectada`)
    const jid = this._toJid(to)
    const msgContent = { caption: caption || '' }
    if (type === 'image') msgContent.image = buffer
    else if (type === 'document') {
      msgContent.document = buffer
      msgContent.mimetype = mimetype
      msgContent.fileName = filename
    } else if (type === 'audio') {
      msgContent.audio = buffer
      msgContent.mimetype = mimetype
    }
    const result = await inst.sock.sendMessage(jid, msgContent)
    await this._saveOutboundMessage(lineId, this._cleanNumber(to), type, caption || filename, mediaUrl)
    return result
  }

  getStatus(lineId) { return this.instances[lineId]?.status || 'disconnected' }
  getQR(lineId) { return this.instances[lineId]?.qr || null }
  getAllStatuses() {
    const result = {}
    for (const [id, inst] of Object.entries(this.instances)) {
      result[id] = { status: inst.status, hasQR: !!inst.qr }
    }
    return result
  }

  async _handleIncomingMessage(lineId, sock, msg, remoteJid, waNumber, text, msgType, pushName = '') {
    const conv = await this._getOrCreateConversation(lineId, waNumber, remoteJid)

    if (pushName) {
      try {
        await query(
          `UPDATE contacts SET name = $1, last_seen = NOW()
           WHERE wa_number = $2 AND line_id = $3 AND (name IS NULL OR name = '')`,
          [pushName, waNumber, lineId]
        )
      } catch (e) {}
    }

    try {
      await query(
        `INSERT INTO messages
          (conversation_id, line_id, wa_number, direction, type, content, wa_msg_id, timestamp)
         VALUES ($1,$2,$3,'in',$4,$5,$6,NOW())`,
        [conv.id, lineId, waNumber, msgType, text, msg.key.id]
      )
      await query('UPDATE conversations SET last_msg_at=NOW() WHERE id=$1', [conv.id])
    } catch (e) {
      console.error('[BaileysManager] Error guardando mensaje:', e.message)
    }

    this.io.emit('message:new', {
      conversation_id: conv.id,
      lineId, waNumber, text, content: text, direction: 'in',
      timestamp: new Date().toISOString(),
    })

    const lineRow = await query('SELECT bot_id FROM lines WHERE id=$1', [lineId])
    const botId = lineRow.rows[0]?.bot_id
    if (!botId) {
      console.log(`[Line ${lineId}] Sin bot asignado`)
      return
    }

    const engine = new FlowEngine(this, this.io)
    await engine.process({ lineId, sock, waNumber: remoteJid, text, conv, botId })
  }

  // ── Acks de campañas: marca delivered/read en campaign_recipients ──
  // Baileys status: 2=server ack, 3=delivery ack, 4=read
  async _handleDeliveryAck(lineId, waMsgId, status) {
    if (status < 3) return

    // Entregado (solo la primera vez: transición sent → delivered)
    const del = await query(
      `UPDATE campaign_recipients
       SET status='delivered', delivered_at=COALESCE(delivered_at, NOW())
       WHERE wa_msg_id=$1 AND status='sent'
       RETURNING id, campaign_id, message_id, wa_number`,
      [waMsgId]
    )
    if (del.rows.length) {
      const r = del.rows[0]
      await query(`UPDATE campaigns SET delivered_count = delivered_count + 1 WHERE id=$1`, [r.campaign_id])
      try {
        await query(
          `INSERT INTO campaign_events (campaign_id, recipient_id, variant_id, event, wa_number)
           VALUES ($1,$2,$3,'delivered',$4)`,
          [r.campaign_id, r.id, r.message_id, r.wa_number]
        )
      } catch (e) {}
      this.io.emit('campaign:delivered', { campaignId: r.campaign_id, recipientId: r.id, wa_number: r.wa_number })
    }

    // Leído (solo la primera vez)
    if (status >= 4) {
      const rd = await query(
        `UPDATE campaign_recipients
         SET read_at=NOW(), status='read'
         WHERE wa_msg_id=$1 AND read_at IS NULL AND status IN ('sent','delivered')
         RETURNING id, campaign_id, message_id, wa_number`,
        [waMsgId]
      )
      if (rd.rows.length) {
        const r = rd.rows[0]
        await query(`UPDATE campaigns SET read_count = read_count + 1 WHERE id=$1`, [r.campaign_id])
        try {
          await query(
            `INSERT INTO campaign_events (campaign_id, recipient_id, variant_id, event, wa_number)
             VALUES ($1,$2,$3,'read',$4)`,
            [r.campaign_id, r.id, r.message_id, r.wa_number]
          )
        } catch (e) {}
        this.io.emit('campaign:read', { campaignId: r.campaign_id, recipientId: r.id, wa_number: r.wa_number })
      }
    }
  }

  async _handlePollVote(lineId, sock, remoteJid, waNumber, selectedLabel) {
    const conv = await this._getOrCreateConversation(lineId, waNumber, remoteJid)
    const lineRow = await query('SELECT bot_id FROM lines WHERE id=$1', [lineId])
    const botId = lineRow.rows[0]?.bot_id
    if (!botId) return

    console.log(`[Line ${lineId}] Enviando confirmación: "${selectedLabel}"`)
    try {
      await sock.sendMessage(remoteJid, { text: `✅ *${selectedLabel}*` })
    } catch (e) {}

    try {
      await query(
        `INSERT INTO messages
          (conversation_id, line_id, wa_number, direction, type, content, timestamp)
         VALUES ($1,$2,$3,'in','text',$4,NOW())`,
        [conv.id, lineId, waNumber, selectedLabel]
      )
    } catch (e) {}

    this.io.emit('message:new', {
      lineId, waNumber, text: selectedLabel, direction: 'in',
      timestamp: new Date().toISOString(),
    })

    const engine = new FlowEngine(this, this.io)
    await engine.process({ lineId, sock, waNumber: remoteJid, text: selectedLabel, conv, botId, isPollVote: true })
  }

  async _getOrCreateConversation(lineId, waNumber, remoteJid) {
    const existing = await query(
      `SELECT * FROM conversations
       WHERE line_id=$1 AND wa_number=$2 AND status='active'
       ORDER BY started_at DESC LIMIT 1`,
      [lineId, waNumber]
    )
    if (existing.rows.length > 0) return existing.rows[0]

    const contactRes = await query(
      `INSERT INTO contacts (wa_number, line_id)
       VALUES ($1,$2)
       ON CONFLICT (wa_number, line_id) DO UPDATE SET last_seen=NOW()
       RETURNING id`,
      [waNumber, lineId]
    )

    const lineRow = await query('SELECT bot_id FROM lines WHERE id=$1', [lineId])
    const newConv = await query(
      `INSERT INTO conversations (line_id, contact_id, wa_number, bot_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [lineId, contactRes.rows[0].id, waNumber, lineRow.rows[0]?.bot_id]
    )
    console.log(`[BaileysManager] Nueva conversación creada para ${waNumber}`)
    return newConv.rows[0]
  }

  async _saveOutboundMessage(lineId, waNumber, type, content, mediaUrl = null) {
    try {
      const conv = await this._getOrCreateConversation(lineId, waNumber, this._toJid(waNumber))
      await query(
        `INSERT INTO messages
          (conversation_id, line_id, wa_number, direction, type, content, media_url, timestamp)
         VALUES ($1,$2,$3,'out',$4,$5,$6,NOW())`,
        [conv.id, lineId, waNumber, type, content, mediaUrl]
      )
      // Notificar al inbox en tiempo real (mensajes salientes: bot, inbox, campañas)
      this.io.emit('message:new', {
        conversation_id: conv.id,
        lineId, waNumber, content, text: content, direction: 'out',
        type, media_url: mediaUrl,
        timestamp: new Date().toISOString(),
      })
    } catch (e) {}
  }

  async _updateLineStatus(lineId, status) {
    try {
      await query('UPDATE lines SET status=$1, updated_at=NOW() WHERE id=$2', [status, lineId])
    } catch (e) {}
  }

  _toJid(input) {
    if (!input) return ''
    const str = input.toString()
    if (str.endsWith('@s.whatsapp.net')) return str
    if (str.endsWith('@lid')) return str
    if (str.endsWith('@c.us')) return str.replace('@c.us', '@s.whatsapp.net')
    const clean = str.replace(/\D/g, '')
    return `${clean}@s.whatsapp.net`
  }

  _cleanNumber(input) {
    if (!input) return ''
    return input.toString()
      .replace('@s.whatsapp.net', '')
      .replace('@c.us', '')
      .replace('@lid', '')
      .replace(/[^0-9]/g, '')
  }

  // Mini-store en memoria (reemplazo de makeInMemoryStore, eliminado en Baileys v7).
  // Solo cachea mensajes para getMessage/loadMessage (reintentos y polls).
  _createMessageStore(maxEntries = 2000) {
    const cache = new Map()
    return {
      bind(ev) {
        ev.on('messages.upsert', ({ messages }) => {
          for (const m of messages || []) {
            if (!m?.key?.id || !m?.key?.remoteJid) continue
            cache.set(`${m.key.remoteJid}|${m.key.id}`, m)
            if (cache.size > maxEntries) {
              const oldest = cache.keys().next().value
              cache.delete(oldest)
            }
          }
        })
      },
      async loadMessage(jid, id) {
        return cache.get(`${jid}|${id}`) || undefined
      },
    }
  }
}

function _numEmoji(n) {
  const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣']
  return emojis[n - 1] || `${n}.`
}

module.exports = BaileysManager