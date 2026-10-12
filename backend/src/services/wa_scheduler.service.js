/**
 * SchedulerService — dispara:
 *  1. Campañas con status='scheduled' cuyo scheduled_at ya pasó
 *  2. Mensajes one-off (scheduled_messages) cuyo scheduled_at ya pasó
 *
 * Se ejecuta cada 30s.
 */
const { query } = require('../config/db')
const { asegurarLocal } = require('./waMediaFallback')
const CampaignEngine = require('./CampaignEngine')
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
    await this._classifyWelcomeResponses()
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
            await asegurarLocal(filePath)
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
      const cfg = await query(`SELECT paused,send_start::text,send_end::text FROM welcome_config WHERE id=1`)
      if (cfg.rows[0]?.paused) return
      const nowEc = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }))
      const minutos = nowEc.getHours() * 60 + nowEc.getMinutes()
      const aMinutos = (v) => { const [h,m] = String(v || '').split(':').map(Number); return h * 60 + m }
      if (minutos < aMinutos(cfg.rows[0]?.send_start || '08:30') || minutos >= aMinutos(cfg.rows[0]?.send_end || '20:00')) return
      const res = await query(
        `SELECT * FROM welcome_notifications
         WHERE (status IN ('pending', 'failed')
                OR (status='processing' AND updated_at < NOW() - INTERVAL '5 minutes'))
           AND attempts < 3
           AND scheduled_at <= NOW()
         ORDER BY scheduled_at ASC
         LIMIT 1`
      )

      for (const tarea of res.rows) {
        const tomada = await query(
          `UPDATE welcome_notifications
           SET status='processing', email_sent=true, updated_at=NOW()
           WHERE id=$1
             AND (status IN ('pending', 'failed')
                  OR (status='processing' AND updated_at < NOW() - INTERVAL '5 minutes'))
           RETURNING *`,
          [tarea.id]
        )
        if (!tomada.rows.length) continue

        let whatsappSent = tarea.whatsapp_sent
        const errores = []

        try {
          const registroRes = await query(
            `SELECT * FROM public.envios_ventas WHERE id=$1`,
            [tarea.registro_id]
          )
          const registro = registroRes.rows[0]
          if (!registro) throw new Error('Registro de Welcome no encontrado')

          if (!whatsappSent) {
            try {
              const preparado = await prepararWhatsappBienvenida(registro)
              if (!preparado.ok) throw new Error(preparado.motivo)
              const enviado = await this.baileysManager.sendText(
                preparado.linea_id,
                preparado.telefono,
                preparado.mensaje
              )
              whatsappSent = true
              await query(
                `UPDATE welcome_notifications SET whatsapp_sent=true,variant_id=COALESCE(variant_id,$2),
                 wa_message_id=$3,delivery_status='SENT',updated_at=NOW() WHERE id=$1`,
                [tarea.id, preparado.variante_id, enviado?.key?.id || null]
              )
            } catch (error) {
              errores.push(`WhatsApp: ${error.message}`)
            }
          }

          if (whatsappSent) {
            await query(
              `UPDATE welcome_notifications
               SET status='completed', completed_at=NOW(), updated_at=NOW(), last_error=NULL
               WHERE id=$1`,
              [tarea.id]
            )
            await query(
              `UPDATE public.envios_ventas
               SET estado_welcome='NOTIFICADO', fecha_notificacion_welcome=NOW()
               WHERE id=$1`,
              [tarea.registro_id]
            )
            this.io.emit('welcome:notificado', { registroId: tarea.registro_id })
            const atrasados = await query(`SELECT id FROM welcome_notifications WHERE status IN ('pending','failed') AND scheduled_at<=NOW() ORDER BY scheduled_at,id`)
            let cursor = Date.now()
            for (const pendiente of atrasados.rows) {
              cursor += (Math.floor(Math.random()*3)+5) * 60000
              await query(`UPDATE welcome_notifications SET scheduled_at=$2,status='pending',updated_at=NOW() WHERE id=$1`, [pendiente.id,new Date(cursor)])
            }
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

  async _classifyWelcomeResponses() {
    try {
      const respuestas = await query(`
        SELECT DISTINCT ON (wn.id) wn.id,m.content,m.timestamp,m.conversation_id
        FROM welcome_notifications wn
        JOIN envios_ventas ev ON ev.id=wn.registro_id
        JOIN lines l ON UPPER(TRIM(l.name))=(SELECT UPPER(TRIM(line_name)) FROM welcome_config WHERE id=1)
        JOIN messages m ON m.line_id=l.id AND m.direction='in'
        LEFT JOIN conversations c ON c.id=m.conversation_id
        LEFT JOIN contacts ct ON ct.id=c.contact_id
        WHERE right(regexp_replace(COALESCE(ct.metadata->>'real_phone',m.wa_number),'[^0-9]','','g'),9) = right(regexp_replace(COALESCE(ev.telf_celular_pin,ev.telf_celular_2,ev.telf_fijo),'[^0-9]','','g'),9)
          AND m.timestamp >= wn.completed_at
          AND wn.status='completed' AND wn.response_status IS NULL
        ORDER BY wn.id,m.timestamp ASC`)
      for (const r of respuestas.rows) {
        const texto = String(r.content || '').trim().toLowerCase()
        const positiva = /^(1|si|sí|ok|entendi|entendí|gracias|todo claro)/.test(texto)
        const estado = positiva ? 'POSITIVA' : 'DUDA'
        await query(`UPDATE welcome_notifications SET response_status=$2,response_text=$3,responded_at=$4,conversation_id=$5,updated_at=NOW() WHERE id=$1 AND response_status IS NULL`, [r.id,estado,r.content,r.timestamp,r.conversation_id])
        this.io.emit('welcome:respuesta', { id:r.id,estado,conversationId:r.conversation_id })
      }
    } catch (error) { console.warn('[Scheduler] classifyWelcomeResponses:', error.message) }
  }
}

module.exports = SchedulerService
