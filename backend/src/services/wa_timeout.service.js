const { query } = require('../config/db')

class TimeoutService {
  constructor(baileysManager, io) {
    this.baileysManager = baileysManager
    this.io = io
    this.interval = null
  }

  start() {
    // Revisar cada 60 segundos
    this.interval = setInterval(() => this.checkTimeouts(), 60 * 1000)
    console.log('[TimeoutService] Iniciado — revisando cada 60s')
  }

  stop() {
    if (this.interval) clearInterval(this.interval)
  }

  async checkTimeouts() {
    try {
      // Buscar conversaciones activas con timeout configurado
      const result = await query(`
        SELECT id, line_id, wa_number, bot_id, context_data
        FROM conversations
        WHERE status = 'active'
          AND context_data->>'_timeoutAt' IS NOT NULL
          AND (context_data->>'_timeoutAt')::timestamptz <= NOW()
      `)

      for (const conv of result.rows) {
        const context = conv.context_data || {}
        console.log(`[TimeoutService] Timeout disparado para conv ${conv.id}`)

        // Enviar mensaje de recordatorio si hay uno configurado
        if (context._timeoutMessage) {
          try {
            await this.baileysManager.sendText(conv.line_id, conv.wa_number, context._timeoutMessage)
          } catch (e) {}
        }

        // Limpiar timeout del contexto
        delete context._timeoutNodeId
        delete context._timeoutMinutes
        delete context._timeoutAt
        delete context._timeoutMessage

        // Cargar flujo y ejecutar siguiente nodo
        try {
          const botRes = await query('SELECT flow_json FROM bots WHERE id=$1', [conv.bot_id])
          if (botRes.rows[0]) {
            const flow = botRes.rows[0].flow_json
            const FlowEngine = require('../engine/FlowEngine')
            const engine = new FlowEngine(this.baileysManager, this.io)
            await engine.process({
              lineId: conv.line_id,
              sock: null,
              waNumber: conv.wa_number,
              text: '__timeout__',
              conv,
              botId: conv.bot_id,
            })
          }
        } catch (e) {
          console.error('[TimeoutService] Error ejecutando flujo:', e.message)
          // Al menos limpiar el estado
          await query(
            'UPDATE conversations SET context_data=$1 WHERE id=$2',
            [JSON.stringify(context), conv.id]
          )
        }
      }
    } catch (err) {
      console.error('[TimeoutService] Error:', err.message)
    }
  }
}

module.exports = TimeoutService