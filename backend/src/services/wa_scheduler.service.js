/**
 * SchedulerService — dispara:
 *  1. Campañas con status='scheduled' cuyo scheduled_at ya pasó
 *  2. Mensajes one-off (scheduled_messages) cuyo scheduled_at ya pasó
 *
 * Se ejecuta cada 30s.
 */
const { query } = require('../config/db')

class SchedulerService {
  constructor({ baileysManager, campaignEngine, io }) {
    this.baileysManager = baileysManager
    this.campaignEngine = campaignEngine
    this.io = io
    this.interval = null
  }

  start() {
    this.interval = setInterval(() => this.tick().catch(() => {}), 30 * 1000)
    console.log('[Scheduler] Iniciado — revisa cada 30s')
    // Primera corrida inmediata
    setTimeout(() => this.tick().catch(() => {}), 2000)
  }

  stop() {
    if (this.interval) clearInterval(this.interval)
  }

  async tick() {
    await this._checkScheduledCampaigns()
    await this._checkScheduledMessages()
  }

  async _checkScheduledCampaigns() {
    try {
      const res = await query(
        `SELECT id, name FROM campaigns
         WHERE status='scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
         LIMIT 5`
      )
      for (const c of res.rows) {
        try {
          console.log(`[Scheduler] ▶ Auto-iniciando campaña programada "${c.name}" (${c.id})`)
          await this.campaignEngine.start(c.id)
        } catch (e) {
          console.warn('[Scheduler] No pude iniciar campaña:', e.message)
        }
      }
    } catch (err) {
      console.warn('[Scheduler] checkScheduledCampaigns:', err.message)
    }
  }

  async _checkScheduledMessages() {
    try {
      const res = await query(
        `SELECT * FROM scheduled_messages
         WHERE status='pending' AND scheduled_at <= NOW()
         ORDER BY scheduled_at ASC
         LIMIT 20`
      )
      for (const msg of res.rows) {
        try {
          if (msg.media_url) {
            const fs = require('fs')
            const path = require('path')
            const filePath = msg.media_url.startsWith('/uploads/')
              ? path.join(__dirname, '../../', msg.media_url)
              : msg.media_url
            if (!fs.existsSync(filePath)) throw new Error('Archivo no encontrado')
            const buffer = fs.readFileSync(filePath)
            await this.baileysManager.sendMedia(msg.line_id, msg.wa_number, {
              type: msg.media_type || 'document',
              buffer,
              mimetype: 'application/octet-stream',
              filename: 'archivo',
              caption: msg.body,
            })
          } else {
            await this.baileysManager.sendText(msg.line_id, msg.wa_number, msg.body)
          }
          await query(
            `UPDATE scheduled_messages SET status='sent', sent_at=NOW(), error=NULL WHERE id=$1`,
            [msg.id]
          )
          console.log(`[Scheduler] ✅ Mensaje programado enviado a ${msg.wa_number}`)
        } catch (e) {
          await query(
            `UPDATE scheduled_messages SET status='failed', error=$1 WHERE id=$2`,
            [e.message.substring(0, 500), msg.id]
          )
          console.warn(`[Scheduler] ❌ Falló mensaje ${msg.id}: ${e.message}`)
        }
      }
    } catch (err) {
      console.warn('[Scheduler] checkScheduledMessages:', err.message)
    }
  }
}

module.exports = SchedulerService
