/**
 * CampaignEngine — motor de envíos masivos
 *
 * Características:
 *  - Throttling aleatorio entre min_delay y max_delay (anti-bloqueo)
 *  - Procesamiento por lotes con pausa entre lotes
 *  - Reanuda campañas interrumpidas tras reinicio del servidor
 *  - Soporta pausa, reanudación y cancelación
 *  - Interpola variables {{nombre}} por cada destinatario
 *  - Soporta adjuntos (image, document, audio)
 *  - Emite progreso por Socket.IO
 *  - Registra wa_msg_id (acks de entrega) y eventos en campaign_events (2026-07)
 */
const fs = require('fs')
const path = require('path')
const { query } = require('../config/db')

class CampaignEngine {
  constructor(baileysManager, io) {
    this.baileysManager = baileysManager
    this.io = io
    this.running = {}    // campaignId → { abortFlag }
    this.paused = {}     // campaignId → true
  }

  // ── Iniciar campaña ────────────────────────────────────────
  async start(campaignId) {
    if (this.running[campaignId]) {
      throw new Error('La campaña ya está en ejecución')
    }

    const camp = await this._loadCampaign(campaignId)
    if (!camp) throw new Error('Campaña no encontrada')
    if (camp.status === 'completed') throw new Error('La campaña ya terminó')

    await query(
      `UPDATE campaigns SET status='running', started_at=COALESCE(started_at, NOW()) WHERE id=$1`,
      [campaignId]
    )

    this.running[campaignId] = { abortFlag: false }
    delete this.paused[campaignId]

    this._emit(campaignId, 'campaign:started', { campaignId })
    console.log(`[CampaignEngine] ▶ Iniciada campaña ${camp.name} (${campaignId})`)

    // Ejecutar en background (no bloqueante)
    this._run(campaignId).catch(err => {
      console.error(`[CampaignEngine] Error fatal en ${campaignId}:`, err)
    })

    return { success: true, message: 'Campaña iniciada' }
  }

  // ── Pausar ────────────────────────────────────────────────
  async pause(campaignId) {
    if (!this.running[campaignId]) throw new Error('La campaña no está en ejecución')
    this.paused[campaignId] = true
    this.running[campaignId].abortFlag = true
    await query(`UPDATE campaigns SET status='paused' WHERE id=$1`, [campaignId])
    this._emit(campaignId, 'campaign:paused', { campaignId })
    return { success: true }
  }

  // ── Reanudar ──────────────────────────────────────────────
  async resume(campaignId) {
    delete this.running[campaignId]
    delete this.paused[campaignId]
    return this.start(campaignId)
  }

  // ── Cancelar ──────────────────────────────────────────────
  async cancel(campaignId) {
    if (this.running[campaignId]) {
      this.running[campaignId].abortFlag = true
    }
    delete this.running[campaignId]
    delete this.paused[campaignId]
    await query(`UPDATE campaigns SET status='cancelled', finished_at=NOW() WHERE id=$1`, [campaignId])
    this._emit(campaignId, 'campaign:cancelled', { campaignId })
    return { success: true }
  }

  // ── Cargar variantes de mensaje de una campaña ────────────
  async _loadVariants(campaignId) {
    const r = await query(
      `SELECT * FROM campaign_messages WHERE campaign_id=$1 ORDER BY sort_order ASC, created_at ASC`,
      [campaignId]
    )
    return r.rows  // [] si no hay variantes → usar body/media de la campaña
  }

  // Baraja un array (Fisher-Yates) — para rotar variantes sin repetir
  _shuffle(arr) {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  // Devuelve la siguiente variante rotando: usa TODAS en orden aleatorio,
  // y cuando se agotan, vuelve a barajar y empieza de nuevo. Así cada
  // variante se usa por igual y los mensajes salen más variados (anti-bloqueo).
  _nextVariant(state, variants) {
    if (!variants.length) return null
    if (!state.queue || state.queue.length === 0) {
      state.queue = this._shuffle(variants)
    }
    return state.queue.shift()
  }

  // ── Loop principal de envío ───────────────────────────────
  async _run(campaignId) {
    let camp     = await this._loadCampaign(campaignId)
    let variants = await this._loadVariants(campaignId)
    let processedInBatch = 0
    const rotState = {}  // estado de rotación de variantes (cola barajada)

    while (camp.status === 'running') {
      if (this.running[campaignId]?.abortFlag) {
        console.log(`[CampaignEngine] ⏸ Abort en ${campaignId}`)
        break
      }

      // Obtener siguiente destinatario pendiente
      const pending = await query(
        `SELECT * FROM campaign_recipients
         WHERE campaign_id=$1 AND status='pending'
         ORDER BY id ASC LIMIT 1`,
        [campaignId]
      )

      if (!pending.rows.length) {
        // No quedan pendientes → completar campaña
        await query(
          `UPDATE campaigns SET status='completed', finished_at=NOW() WHERE id=$1`,
          [campaignId]
        )
        delete this.running[campaignId]
        this._emit(campaignId, 'campaign:completed', { campaignId })
        console.log(`[CampaignEngine] ✅ Completada ${campaignId}`)
        return
      }

      const recipient = pending.rows[0]
      // Rotación: usa TODAS las variantes en orden aleatorio antes de repetir
      const variant = this._nextVariant(rotState, variants)
      await this._sendOne(camp, recipient, variant)
      processedInBatch++

      // Refrescar stats
      camp = await this._loadCampaign(campaignId)
      this._emitProgress(camp)

      // Pausa entre lotes
      if (processedInBatch >= (camp.batch_size || 50)) {
        const batchPause = (camp.batch_pause_secs || 120) * 1000
        console.log(`[CampaignEngine] 🛌 Pausa de lote: ${batchPause / 1000}s`)
        this._emit(campaignId, 'campaign:batch_pause', { campaignId, seconds: batchPause / 1000 })
        await this._sleep(batchPause)
        processedInBatch = 0
      } else {
        // Delay anti-bloqueo entre mensajes
        const minD = camp.min_delay_secs || 8
        const maxD = camp.max_delay_secs || 20
        const delay = (minD + Math.random() * Math.max(0, maxD - minD)) * 1000
        await this._sleep(delay)
      }

      camp = await this._loadCampaign(campaignId)
    }
  }

  // ── Enviar a un destinatario ──────────────────────────────
  // variant: objeto de campaign_messages (o null → usa campos de la campaña)
  async _sendOne(camp, recipient, variant = null) {
    const lineId   = camp.line_id
    const waNumber = recipient.wa_number
    const vars = {
      ...(recipient.variables || {}),
      nombre: recipient.name || (recipient.variables?.nombre) || '',
      numero: waNumber,
    }

    // Determinar texto y media: variante tiene prioridad sobre la campaña
    const msgText   = variant ? (variant.message_text || '') : (camp.body || '')
    const mediaUrl  = variant ? variant.media_url  : camp.media_url
    const mediaType = variant ? variant.media_type : camp.media_type
    const mediaFile = variant ? (variant.media_caption || variant.media_url || '') : camp.media_filename
    const variantId = variant ? variant.id : null

    await query(
      `UPDATE campaign_recipients
       SET status='sending', attempts = attempts + 1, message_id = $2
       WHERE id=$1`,
      [recipient.id, variantId]
    )

    if (variant) {
      console.log(`[CampaignEngine] Variante "${variant.label || variant.id}" → ${waNumber}`)
    }

    try {
      const body = this._interpolate(msgText, vars)
      let sendResult = null

      if (mediaUrl) {
        // Envío con adjunto (soporta /wa-uploads/, /uploads/, ruta absoluta o URL http)
        let buffer
        if (/^https?:\/\//i.test(mediaUrl)) {
          const resp = await fetch(mediaUrl)
          if (!resp.ok) throw new Error(`No se pudo descargar el medio (HTTP ${resp.status}): ${mediaUrl}`)
          buffer = Buffer.from(await resp.arrayBuffer())
        } else {
          const filePath = this._resolveMediaPath(mediaUrl)
          if (!fs.existsSync(filePath)) throw new Error('Archivo de medio no existe: ' + filePath)
          buffer = fs.readFileSync(filePath)
        }

        sendResult = await this.baileysManager.sendMedia(lineId, waNumber, {
          type:     mediaType || 'document',
          buffer,
          mimetype: this._guessMime(mediaFile || mediaUrl),
          filename: path.basename(mediaFile || mediaUrl || 'archivo'),
          caption:  body,
        })
      } else {
        // Solo texto
        sendResult = await this.baileysManager.sendText(lineId, waNumber, body)
      }

      // wa_msg_id permite correlacionar los acks de entrega/lectura de Baileys
      const waMsgId = sendResult?.key?.id || null
      await query(
        `UPDATE campaign_recipients SET status='sent', sent_at=NOW(), error=NULL, wa_msg_id=COALESCE($2, wa_msg_id) WHERE id=$1`,
        [recipient.id, waMsgId]
      )
      await query(
        `UPDATE campaigns SET sent_count = sent_count + 1 WHERE id=$1`,
        [camp.id]
      )

      // Guardar en historial
      try {
        await query(
          `INSERT INTO messages (line_id, wa_number, direction, type, content, campaign_id, timestamp)
           VALUES ($1,$2,'out',$3,$4,$5,NOW())`,
          [lineId, waNumber, mediaUrl ? mediaType : 'text', body, camp.id]
        )
      } catch (e) {}

      // Evento de auditoría (métricas por variante)
      try {
        await query(
          `INSERT INTO campaign_events (campaign_id, recipient_id, variant_id, event, wa_number)
           VALUES ($1,$2,$3,'sent',$4)`,
          [camp.id, recipient.id, variantId, waNumber]
        )
      } catch (e) {}

      this._emit(camp.id, 'campaign:sent', {
        campaignId:  camp.id,
        recipientId: recipient.id,
        wa_number:   waNumber,
        variantId,
      })
    } catch (err) {
      console.warn(`[CampaignEngine] ❌ Falló envío a ${waNumber}: ${err.message}`)
      await query(
        `UPDATE campaign_recipients SET status='failed', error=$1 WHERE id=$2`,
        [err.message.substring(0, 500), recipient.id]
      )
      await query(`UPDATE campaigns SET failed_count = failed_count + 1 WHERE id=$1`, [camp.id])

      try {
        await query(
          `INSERT INTO campaign_events (campaign_id, recipient_id, variant_id, event, wa_number, detail)
           VALUES ($1,$2,$3,'failed',$4,$5)`,
          [camp.id, recipient.id, variantId, waNumber, err.message.substring(0, 500)]
        )
      } catch (e) {}

      this._emit(camp.id, 'campaign:failed', {
        campaignId:  camp.id,
        recipientId: recipient.id,
        wa_number:   waNumber,
        error:       err.message,
      })
    }
  }

  // ── Reanudar campañas tras restart del servidor ───────────
  async resumePendingOnBoot() {
    try {
      const res = await query(`SELECT id, name FROM campaigns WHERE status='running'`)
      for (const c of res.rows) {
        // Marcar como pausada y dejar que el usuario las reanude manualmente
        await query(`UPDATE campaigns SET status='paused' WHERE id=$1`, [c.id])
        console.log(`[CampaignEngine] ⏸ Campaña "${c.name}" pausada por restart`)
      }
    } catch (e) {
      console.warn('[CampaignEngine] resumePendingOnBoot:', e.message)
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  async _loadCampaign(id) {
    const r = await query('SELECT * FROM campaigns WHERE id=$1', [id])
    return r.rows[0]
  }

  _emit(campaignId, event, payload) {
    if (this.io) this.io.emit(event, payload)
  }

  _emitProgress(camp) {
    const total = camp.total_recipients || 1
    const sent = camp.sent_count || 0
    const failed = camp.failed_count || 0
    const progress = Math.round(((sent + failed) / total) * 100)
    this._emit(camp.id, 'campaign:progress', {
      campaignId: camp.id,
      sent, failed, total, progress,
    })
  }

  _interpolate(text, vars) {
    if (!text) return ''
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

  // Traduce la URL pública del medio a su ruta real en disco
  _resolveMediaPath(mediaUrl) {
    if (mediaUrl.startsWith('/wa-uploads/')) {
      const dir = process.env.WA_UPLOADS_DIR || path.join(__dirname, '../../wa_uploads')
      return path.join(dir, mediaUrl.slice('/wa-uploads/'.length))
    }
    if (mediaUrl.startsWith('/uploads/')) {
      return path.join(__dirname, '../../', mediaUrl)
    }
    return mediaUrl // ruta absoluta en disco
  }

  _guessMime(filename) {
    if (!filename) return 'application/octet-stream'
    const ext = (path.extname(filename) || '').toLowerCase()
    const map = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
      '.pdf': 'application/pdf', '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
      '.mp4': 'video/mp4',
    }
    return map[ext] || 'application/octet-stream'
  }
}

module.exports = CampaignEngine
