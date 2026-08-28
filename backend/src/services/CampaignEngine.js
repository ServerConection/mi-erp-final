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

// ── Protección anti-bloqueo adicional (2026-08-27) ─────────────────────────
// Además del throttling propio de cada campaña (min/max delay, batch), se
// agregan dos guardas que NO dependen de cómo esté configurada la campaña:
//
//  1. Piso de seguridad: aunque una campaña se configure de forma agresiva
//     (delay muy bajo, lotes muy grandes), el motor nunca baja de estos
//     mínimos. Con los valores por defecto de una campaña (8-20s, lote 50,
//     pausa 120s) esto no cambia nada — solo actúa si alguien configura algo
//     más arriesgado que estos pisos.
//  2. Calentamiento de líneas nuevas: una línea recién creada no debería
//     salir a campaña masiva el día 1. Mientras esté "nueva" (por defecto,
//     sus primeros WA_CALENTAMIENTO_DIAS días desde que se creó la fila en
//     `lines`), se limita cuántos mensajes de campaña puede mandar por día,
//     sin importar qué diga la campaña. Al llegar al tope, se PAUSA la
//     campaña entera (no se saltan destinatarios) para no seguir arriesgando
//     el número; se reanuda manualmente cuando el operador lo decida.
//
// Todo ajustable por variable de entorno; nada de esto requiere migración
// (usa columnas que ya existen: lines.created_at, messages.timestamp).
const DELAY_MIN_SEGURO_SEGS      = parseInt(process.env.WA_CAMPANA_DELAY_MIN_SEGURO || '5', 10)
const LOTE_MAX_SEGURO            = parseInt(process.env.WA_CAMPANA_LOTE_MAX_SEGURO || '100', 10)
const PAUSA_LOTE_MIN_SEGURA_SEGS = parseInt(process.env.WA_CAMPANA_PAUSA_LOTE_MIN_SEGURA || '60', 10)
const CALENTAMIENTO_DIAS         = parseInt(process.env.WA_CALENTAMIENTO_DIAS || '14', 10)
const TOPE_CALENTAMIENTO_DIARIO  = parseInt(process.env.WA_TOPE_CALENTAMIENTO_DIARIO || '60', 10)

// ¿La línea sigue en su ventana de calentamiento? Funcion pura para poder
// probarla sin base de datos.
function lineaEnCalentamiento(createdAt, ahora = new Date()) {
  if (!createdAt) return false
  const dias = (ahora - new Date(createdAt)) / (1000 * 60 * 60 * 24)
  return dias < CALENTAMIENTO_DIAS
}

// ── Numeros de control (2026-08-27) ─────────────────────────────────────
// Numeros propios que SIEMPRE contestan. Se les manda primero (antes que a
// cualquier destinatario frio) y luego cada WA_CONTROL_CADA_N envios reales,
// para mantener una tasa de respuesta sana durante TODA la campaña, no solo
// al arrancar. Ajustable/reemplazable con WA_NUMEROS_CONTROL (separados por
// coma) sin tocar codigo.
const CONTROL_CADA_N = parseInt(process.env.WA_CONTROL_CADA_N || '14', 10)

// Normaliza a formato internacional de Ecuador (593XXXXXXXXX). Numeros que no
// calzan ningun patron conocido se devuelven tal cual (con un digito de mas o
// de menos, por ejemplo) para no inventar un numero que podria ser el de otra
// persona — se avisa por consola para que se revisen a mano.
function normalizarNumeroControl(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '')
  if (!digits) return null
  if (digits.startsWith('593') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 10) return '593' + digits.slice(1)
  if (digits.length === 9) return '593' + digits
  console.warn(`[CampaignEngine] ⚠️ Número de control "${raw}" no tiene un formato reconocido (esperado: 593 + 9 dígitos). Se usa tal cual: ${digits}`)
  return digits
}

const NUMEROS_CONTROL_RAW = (process.env.WA_NUMEROS_CONTROL || '59396028844,593958650281,958790214,0983336118')
  .split(',').map(s => s.trim()).filter(Boolean)
const NUMEROS_CONTROL = NUMEROS_CONTROL_RAW.map(normalizarNumeroControl).filter(Boolean)

// ── Aviso de exclusión automático (opt-out) ─────────────────────────────
const AGREGAR_OPT_OUT = process.env.WA_AGREGAR_OPT_OUT !== 'false'
const TEXTO_OPT_OUT = process.env.WA_TEXTO_OPT_OUT ||
  '\n\n_Responde *STOP* si no deseas volver a recibir mensajes nuestros._'

// Agrega el aviso de exclusion al final del mensaje, salvo que el texto ya
// mencione "stop" (para no duplicarlo si alguien ya lo escribio a mano).
function conOptOut(body) {
  if (!AGREGAR_OPT_OUT || !TEXTO_OPT_OUT) return body
  if (/stop/i.test(body || '')) return body
  return `${body || ''}${TEXTO_OPT_OUT}`
}

// ── Horario de envio permitido (2026-08-28) ─────────────────────────────
// Dias y rango de horas en que una campaña puede enviar. Fuera de esa
// ventana, la campaña se pausa sola (paused_for_schedule=true) y el
// SchedulerService la reanuda automaticamente en cuanto vuelve a estar
// dentro del horario, sin que nadie tenga que hacerlo a mano.
//
// send_days: 0=domingo, 1=lunes ... 6=sabado (igual que Date#getDay()).
//            null/vacio = todos los dias.
// send_hour_from / send_hour_to: hora local 0-23 en horario de Ecuador.
//            null/null = sin restriccion de horas.
const OFFSET_HORAS_ECUADOR = -5 // Ecuador es UTC-5 todo el año, sin horario de verano

// Se calcula el offset a mano (en vez de Intl con timeZone) para no
// depender de que el build de Node tenga los datos de zona horaria
// completos (ICU) — así funciona igual en cualquier entorno.
function horaYDiaEcuador(ahora = new Date()) {
  const ms = ahora.getTime() + OFFSET_HORAS_ECUADOR * 60 * 60 * 1000
  const local = new Date(ms)
  return { dia: local.getUTCDay(), hora: local.getUTCHours() }
}

function dentroDeHorarioPermitido(camp, ahora = new Date()) {
  const sendDays  = camp?.send_days
  const horaDesde = camp?.send_hour_from
  const horaHasta = camp?.send_hour_to
  const sinRestriccionDias  = !Array.isArray(sendDays) || sendDays.length === 0
  const sinRestriccionHoras = horaDesde === null || horaDesde === undefined || horaHasta === null || horaHasta === undefined
  if (sinRestriccionDias && sinRestriccionHoras) return true

  const { dia, hora } = horaYDiaEcuador(ahora)

  if (!sinRestriccionDias && !sendDays.includes(dia)) return false

  if (!sinRestriccionHoras && horaDesde !== horaHasta) {
    if (horaDesde < horaHasta) {
      // ventana normal dentro del mismo dia (ej: 8 a 20)
      if (hora < horaDesde || hora >= horaHasta) return false
    } else {
      // ventana que cruza la medianoche (ej: 22 a 6)
      if (hora < horaDesde && hora >= horaHasta) return false
    }
  }
  return true
}

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
      `UPDATE campaigns SET status='running', started_at=COALESCE(started_at, NOW()), paused_for_schedule=false WHERE id=$1`,
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
    await query(`UPDATE campaigns SET status='paused', paused_for_schedule=false WHERE id=$1`, [campaignId])
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
    const linea  = await this._cargarLinea(camp.line_id)
    let processedInBatch = 0
    let enviosDesdeControl = 0
    const rotState = {}  // estado de rotación de variantes (cola barajada)

    // Envío inicial a los números de control: solo la PRIMERA vez que corre
    // esta campaña (sent_count sigue en 0), no cada vez que se reanuda tras
    // una pausa — así no se repite en cada resume. Se manda DENTRO del loop,
    // después de la guarda de calentamiento, para que una línea ya en su
    // tope diario no reciba ni siquiera los envíos de control.
    let burstInicialPendiente = (camp.sent_count || 0) === 0

    while (camp.status === 'running') {
      if (this.running[campaignId]?.abortFlag) {
        console.log(`[CampaignEngine] ⏸ Abort en ${campaignId}`)
        break
      }

      // 🕐 Guarda de horario: si la campaña tiene días/horas configurados y
      // ahora mismo está fuera de esa ventana, se pausa sola. El
      // SchedulerService la reanuda automáticamente apenas vuelva a estar
      // dentro del horario permitido — no hace falta reanudarla a mano.
      if (!dentroDeHorarioPermitido(camp)) {
        console.log(
          `[CampaignEngine] 🕐 "${camp.name}" está fuera de su horario de envío configurado. ` +
          `Se pausa hasta que vuelva a entrar en la ventana permitida.`
        )
        await query(`UPDATE campaigns SET status='paused', paused_for_schedule=true WHERE id=$1`, [campaignId])
        this._emit(campaignId, 'campaign:paused', { campaignId, motivo: 'fuera_de_horario' })
        delete this.running[campaignId]
        return
      }

      // 🛡️ Guarda de calentamiento: una línea nueva no sale a campaña sin
      // límite solo porque la campaña lo permita. Se revisa en cada vuelta
      // porque el conteo de "enviados hoy" sube con cada mensaje.
      if (lineaEnCalentamiento(linea?.created_at)) {
        const enviadosHoy = await this._contarEnviadosHoyPorLinea(camp.line_id)
        if (enviadosHoy >= TOPE_CALENTAMIENTO_DIARIO) {
          console.warn(
            `[CampaignEngine] 🛡️ Línea "${linea?.name || camp.line_id}" en calentamiento ` +
            `(creada hace menos de ${CALENTAMIENTO_DIAS} días): alcanzó su tope diario de ` +
            `${TOPE_CALENTAMIENTO_DIARIO} mensajes de campaña. Se pausa "${camp.name}" para ` +
            `proteger el número — se puede reanudar cuando el operador lo decida.`
          )
          await query(`UPDATE campaigns SET status='paused' WHERE id=$1`, [campaignId])
          this._emit(campaignId, 'campaign:paused', {
            campaignId, motivo: 'calentamiento_linea_nueva', tope: TOPE_CALENTAMIENTO_DIARIO,
          })
          delete this.running[campaignId]
          return
        }
      }

      if (burstInicialPendiente && NUMEROS_CONTROL.length) {
        await this._enviarBurstControl(camp, this._nextVariant(rotState, variants))
        burstInicialPendiente = false
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
      enviosDesdeControl++

      // Cada WA_CONTROL_CADA_N envíos reales, se vuelve a tocar a los
      // números de control — mantiene la tasa de respuesta sana durante
      // toda la campaña, no solo al arrancar.
      if (enviosDesdeControl >= CONTROL_CADA_N && NUMEROS_CONTROL.length) {
        await this._enviarBurstControl(camp, variant)
        enviosDesdeControl = 0
      }

      // Refrescar stats
      camp = await this._loadCampaign(campaignId)
      this._emitProgress(camp)

      // Pausa entre lotes — con piso de seguridad: aunque la campaña se haya
      // configurado con un lote más grande o una pausa más corta que el
      // mínimo seguro, nunca se baja de ahí.
      const loteSeguro = Math.min(camp.batch_size || 50, LOTE_MAX_SEGURO)
      if (processedInBatch >= loteSeguro) {
        const batchPause = Math.max(camp.batch_pause_secs || 120, PAUSA_LOTE_MIN_SEGURA_SEGS) * 1000
        console.log(`[CampaignEngine] 🛌 Pausa de lote: ${batchPause / 1000}s`)
        this._emit(campaignId, 'campaign:batch_pause', { campaignId, seconds: batchPause / 1000 })
        await this._sleep(batchPause)
        processedInBatch = 0
      } else {
        // Delay anti-bloqueo entre mensajes — igual con piso de seguridad
        const minD = Math.max(camp.min_delay_secs || 8, DELAY_MIN_SEGURO_SEGS)
        const maxD = Math.max(camp.max_delay_secs || 20, minD)
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
      const body = conOptOut(this._interpolate(msgText, vars))
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

  // ── Números de control: se les manda al empezar y cada N envíos ───
  // reales, para mantener una tasa de respuesta sana durante toda la
  // campaña. Van SIN el aviso de opt-out (son gente propia, no un
  // destinatario real de la campaña) y no tocan campaign_recipients — no
  // son parte del público objetivo, así que no deben afectar el % de
  // progreso ni las estadísticas de la campaña.
  async _enviarBurstControl(camp, variant) {
    const msgText = variant ? (variant.message_text || '') : (camp.body || '')
    for (const numero of NUMEROS_CONTROL) {
      try {
        const body = this._interpolate(msgText, { nombre: '', numero })
        const sendResult = await this.baileysManager.sendText(camp.line_id, numero, body)
        console.log(`[CampaignEngine] 🧪 Envío de control a ${numero} (mantiene la tasa de respuesta sana de la línea)`)
        try {
          await query(
            `INSERT INTO messages (line_id, wa_number, direction, type, content, campaign_id, timestamp)
             VALUES ($1,$2,'out','text',$3,$4,NOW())`,
            [camp.line_id, numero, body, camp.id]
          )
        } catch (e) {}
        try {
          await query(
            `INSERT INTO campaign_events (campaign_id, recipient_id, variant_id, event, wa_number, detail)
             VALUES ($1,NULL,$2,'control_sent',$3,'numero de control')`,
            [camp.id, variant ? variant.id : null, numero]
          )
        } catch (e) {}
        void sendResult
      } catch (e) {
        console.warn(`[CampaignEngine] No se pudo enviar el mensaje de control a ${numero}: ${e.message}`)
      }

      // Mismo ritmo anti-bloqueo que el resto de la campaña (con piso de
      // seguridad), para no crear una ráfaga distinta al resto de envíos.
      const minD = Math.max(camp.min_delay_secs || 8, DELAY_MIN_SEGURO_SEGS)
      const maxD = Math.max(camp.max_delay_secs || 20, minD)
      await this._sleep((minD + Math.random() * Math.max(0, maxD - minD)) * 1000)
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

  async _cargarLinea(lineId) {
    const r = await query('SELECT id, name, created_at FROM lines WHERE id=$1', [lineId])
    return r.rows[0]
  }

  // Mensajes de CAMPAÑA (no Inbox ni bot) enviados por esta línea desde la
  // medianoche de hoy. Solo cuenta lo que ya quedó en `messages`, así que es
  // consistente con lo que WhatsApp realmente vio salir.
  async _contarEnviadosHoyPorLinea(lineId) {
    const r = await query(
      `SELECT COUNT(*)::int AS total FROM messages
       WHERE line_id=$1 AND direction='out' AND campaign_id IS NOT NULL
         AND timestamp >= date_trunc('day', NOW())`,
      [lineId]
    )
    return r.rows[0]?.total || 0
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

CampaignEngine.lineaEnCalentamiento = lineaEnCalentamiento
CampaignEngine.normalizarNumeroControl = normalizarNumeroControl
CampaignEngine.conOptOut = conOptOut
CampaignEngine.NUMEROS_CONTROL = NUMEROS_CONTROL
CampaignEngine.CONTROL_CADA_N = CONTROL_CADA_N
CampaignEngine.dentroDeHorarioPermitido = dentroDeHorarioPermitido

module.exports = CampaignEngine
