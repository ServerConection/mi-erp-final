/**
 * SchedulerService — dispara:
 *  1. Campañas con status='scheduled' cuyo scheduled_at ya pasó
 *  2. Mensajes one-off (scheduled_messages) cuyo scheduled_at ya pasó
 *
 * Se ejecuta cada 30s.
 */
const { query } = require('../config/db')
const CampaignEngine = require('./CampaignEngine')
const { enviarBienvenidaWelcome } = require('./email.service')
const { prepararWhatsappBienvenida } = require('./welcomeWhatsapp.service')

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
    await this._checkWelcomeNotifications()
    await this._checkCampanasPausadasPorHorario()
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

  // Campañas que se auto-pausaron por estar fuera de su horario de envío
  // configurado (días/horas). En cuanto vuelven a estar dentro de la
  // ventana permitida, se reanudan solas — no hace falta que nadie entre
  // a darle "Reanudar" a mano cada mañana.
  async _checkCampanasPausadasPorHorario() {
    try {
      const res = await query(
        `SELECT id, name, send_days, send_hour_from, send_hour_to FROM campaigns
         WHERE status='paused' AND paused_for_schedule = true
         LIMIT 20`
      )
      for (const c of res.rows) {
        if (!CampaignEngine.dentroDeHorarioPermitido(c)) continue
        try {
          console.log(`[Scheduler] ▶ Reanudando campaña "${c.name}" (${c.id}) — ya entró a su horario permitido`)
          await this.campaignEngine.start(c.id)
        } catch (e) {
          console.warn('[Scheduler] No pude reanudar campaña por horario:', e.message)
        }
      }
    } catch (err) {
      console.warn('[Scheduler] checkCampanasPausadasPorHorario:', err.message)
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

  async _checkWelcomeNotifications() {
    try {
      const res = await query(
        `SELECT * FROM welcome_notifications
         WHERE (status IN ('pending', 'failed')
                OR (status='processing' AND updated_at < NOW() - INTERVAL '5 minutes'))
           AND attempts < 3
           AND scheduled_at <= NOW()
         ORDER BY scheduled_at ASC
         LIMIT 10`
      )

      for (const tarea of res.rows) {
        const tomada = await query(
          `UPDATE welcome_notifications
           SET status='processing', updated_at=NOW()
           WHERE id=$1
             AND (status IN ('pending', 'failed')
                  OR (status='processing' AND updated_at < NOW() - INTERVAL '5 minutes'))
           RETURNING *`,
          [tarea.id]
        )
        if (!tomada.rows.length) continue

        let emailSent = tarea.email_sent
        let whatsappSent = tarea.whatsapp_sent
        const errores = []

        try {
          const registroRes = await query(
            `SELECT * FROM public.envios_ventas WHERE id=$1`,
            [tarea.registro_id]
          )
          const registro = registroRes.rows[0]
          if (!registro) throw new Error('Registro de Welcome no encontrado')

          if (!emailSent) {
            try {
              await enviarBienvenidaWelcome(registro)
              emailSent = true
              await query(
                `UPDATE welcome_notifications SET email_sent=true, updated_at=NOW() WHERE id=$1`,
                [tarea.id]
              )
            } catch (error) {
              errores.push(`Correo: ${error.message}`)
            }
          }

          if (!whatsappSent) {
            try {
              const preparado = await prepararWhatsappBienvenida(registro)
              if (!preparado.ok) throw new Error(preparado.motivo)
              await this.baileysManager.sendText(
                preparado.linea_id,
                preparado.telefono,
                preparado.mensaje
              )
              whatsappSent = true
              await query(
                `UPDATE welcome_notifications SET whatsapp_sent=true, updated_at=NOW() WHERE id=$1`,
                [tarea.id]
              )
            } catch (error) {
              errores.push(`WhatsApp: ${error.message}`)
            }
          }

          if (emailSent && whatsappSent) {
            await query(
              `UPDATE welcome_notifications
               SET status='completed', completed_at=NOW(), updated_at=NOW(), last_error=NULL
               WHERE id=$1`,
              [tarea.id]
            )
            await query(
              `UPDATE public.envios_ventas SET novedades_atc='NOTIFICADO' WHERE id=$1`,
              [tarea.registro_id]
            )
            this.io.emit('welcome:notificado', { registroId: tarea.registro_id })
            console.log(`[Scheduler] ✅ Bienvenida completada para registro #${tarea.registro_id}`)
          } else {
            const intentos = Number(tarea.attempts || 0) + 1
            await query(
              `UPDATE welcome_notifications
               SET status='failed', attempts=$2, last_error=$3, updated_at=NOW()
               WHERE id=$1`,
              [tarea.id, intentos, errores.join(' | ').slice(0, 1000)]
            )
            console.warn(`[Scheduler] ⚠️ Bienvenida #${tarea.registro_id} incompleta (intento ${intentos}/3): ${errores.join(' | ')}`)
          }
        } catch (error) {
          const intentos = Number(tarea.attempts || 0) + 1
          await query(
            `UPDATE welcome_notifications
             SET status='failed', attempts=$2, last_error=$3, updated_at=NOW()
             WHERE id=$1`,
            [tarea.id, intentos, error.message.slice(0, 1000)]
          )
        }
      }
    } catch (error) {
      console.warn('[Scheduler] checkWelcomeNotifications:', error.message)
    }
  }
}

module.exports = SchedulerService
