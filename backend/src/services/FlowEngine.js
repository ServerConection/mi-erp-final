const { query } = require('../config/db')
const emailService = require('../services/email.service')
const webhookService = require('../services/webhook.service')

// ── Guardas de seguridad (2026-08-28) ────────────────────────────────────
// Un flujo de chatbot lo arma alguien arrastrando nodos en un editor visual;
// es facil (sin querer) dejar un ciclo — un nodo que termina apuntando de
// vuelta a uno anterior sin pasar por un nodo de espera. Sin freno, eso
// dispara mensajes al cliente sin parar (spam puro, la señal de bloqueo mas
// obvia que existe) y puede colgar el proceso. Dos guardas independientes:
//
//  1. Tope de nodos por turno: si UN mensaje entrante dispara mas de esta
//     cantidad de nodos seguidos, se corta — casi seguro es un ciclo.
//  2. Un turno a la vez por conversacion: si llegan varios mensajes muy
//     rapido del mismo contacto, el segundo no se procesa mientras el
//     primero sigue corriendo (evita respuestas cruzadas/duplicadas). El
//     mensaje igual queda guardado en el historial, solo no dispara el bot.
const MAX_NODOS_POR_TURNO = parseInt(process.env.WA_FLOW_MAX_NODOS_POR_TURNO || '25', 10)
const conversacionesEnProceso = new Set()

class FlowEngine {
  constructor(baileysManager, io) {
    this.baileysManager = baileysManager
    this.io = io
  }

  async process({ lineId, sock, waNumber, text, conv, botId, isPollVote = false }) {
    if (conversacionesEnProceso.has(conv.id)) {
      console.log(
        `[FlowEngine] Ya hay un turno en curso para la conversación ${conv.id} — ` +
        `se ignora este mensaje para no cruzar respuestas (igual queda guardado en el historial).`
      )
      return
    }
    conversacionesEnProceso.add(conv.id)
    const turno = { nodos: 0 }
    try {
      const botRes = await query('SELECT flow_json FROM bots WHERE id=$1 AND is_active=true', [botId])
      if (!botRes.rows.length) return
      const flow = botRes.rows[0].flow_json
      if (!flow?.nodes?.length) return

      const convRes = await query('SELECT * FROM conversations WHERE id=$1', [conv.id])
      const freshConv = convRes.rows[0]
      if (!freshConv) return

      const context = freshConv.context_data || {}
      context._lastInput = text
      context._waNumber = waNumber
      context._lineId = lineId
      context._convId = freshConv.id

      // ── Caso 1: Esperando respuesta del cliente (nodo waitResponse) ──
      if (freshConv.current_node_id && context._waitingResponse) {
        const waitingNodeId = context._waitingResponse
        const varName = context._waitingResponseVar

        // Guardar la respuesta del cliente en la variable configurada
        if (varName && text) {
          context[varName] = text
          console.log(`[FlowEngine] Guardando respuesta "${text}" en variable {{${varName}}}`)

          // Persistir en metadata del contacto
          try {
            await query(
              `UPDATE contacts SET metadata = metadata || $1::jsonb, last_seen=NOW()
               WHERE wa_number=$2 AND line_id=$3`,
              [JSON.stringify({ [varName]: text }), waNumber.replace('@s.whatsapp.net','').replace('@lid','').replace(/\D/g,''), lineId]
            )
          } catch (e) {}
        }

        // Limpiar estado de espera
        delete context._waitingResponse
        delete context._waitingResponseVar

        await query(
          'UPDATE conversations SET context_data=$1 WHERE id=$2',
          [JSON.stringify(context), freshConv.id]
        )

        // Continuar al siguiente nodo desde el waitResponseNode
        const waitNode = flow.nodes.find(n => n.id === waitingNodeId)
        if (waitNode) {
          await this._next(waitNode, flow, { lineId, sock, waNumber, conv: freshConv, context, botId, turno })
          return
        }
      }

      // ── Caso 2: Esperando voto de poll ────────────────────────────
      if (freshConv.current_node_id && context._waitingPollNode) {
        const waitingNode = flow.nodes.find(n => n.id === context._waitingPollNode)
        if (waitingNode) {
          // Buscar la opción seleccionada y su destino directo
          const selectedOption = (waitingNode.data?.options || []).find(
            o => (typeof o === 'object' ? o.label : o) === text
          )

          delete context._waitingPollNode
          delete context._pollOptions
          context._lastInput = text

          await query(
            'UPDATE conversations SET context_data=$1 WHERE id=$2',
            [JSON.stringify(context), freshConv.id]
          )

          // Si la opción tiene destino directo, ir a ese nodo
          if (selectedOption && typeof selectedOption === 'object' && selectedOption.nextNodeId) {
            const targetNode = flow.nodes.find(n => n.id === selectedOption.nextNodeId)
            if (targetNode) {
              await this._executeNode(targetNode, flow, { lineId, sock, waNumber, conv: freshConv, context, botId, turno })
              return
            }
          }

          // Si no tiene destino directo, ir al siguiente por edge
          await this._next(waitingNode, flow, { lineId, sock, waNumber, conv: freshConv, context, botId, turno })
          return
        }
      }

      // ── Caso 3: Flujo normal ──────────────────────────────────────
      let currentNode = null
      if (!freshConv.current_node_id) {
        currentNode = flow.nodes.find(n => n.type === 'startNode')
      } else {
        currentNode = flow.nodes.find(n => n.id === freshConv.current_node_id)
        if (!currentNode) currentNode = flow.nodes.find(n => n.type === 'startNode')
      }

      if (!currentNode) return
      await this._executeNode(currentNode, flow, { lineId, sock, waNumber, conv: freshConv, context, botId, turno })
    } catch (err) {
      console.error('[FlowEngine] Error:', err.message)
      console.error(err.stack)
    } finally {
      conversacionesEnProceso.delete(conv.id)
    }
  }

  async _executeNode(node, flow, ctx) {
    const { lineId, sock, waNumber, conv, context, botId, turno } = ctx
    if (!node) return

    if (turno) {
      turno.nodos++
      if (turno.nodos > MAX_NODOS_POR_TURNO) {
        console.error(
          `[FlowEngine] 🛑 Se alcanzó el límite de ${MAX_NODOS_POR_TURNO} nodos en un solo turno ` +
          `(conversación ${conv?.id}, línea ${lineId}). Probable ciclo en el flujo — se detiene aquí ` +
          `para no floodear al cliente. Revisa el flujo del bot buscando un nodo que vuelva a otro ya ` +
          `visitado sin pasar por un nodo de "esperar respuesta".`
        )
        return
      }
    }

    console.log(`[FlowEngine] Ejecutando nodo: ${node.type} (${node.id})`)

    await query(
      'UPDATE conversations SET current_node_id=$1, context_data=$2 WHERE id=$3',
      [node.id, JSON.stringify(context), conv.id]
    )

    try {
      await query(
        `INSERT INTO messages (conversation_id, line_id, wa_number, direction, type, node_id, node_type, timestamp)
         VALUES ($1,$2,$3,'out','system',$4,$5,NOW())`,
        [conv.id, lineId, waNumber, node.id, node.type]
      )
    } catch (e) {}

    switch (node.type) {

      case 'startNode':
        await this._next(node, flow, ctx)
        break

      case 'messageNode': {
        const msgText = this._interpolate(node.data?.text || '', context)
        console.log(`[FlowEngine] Enviando mensaje a ${waNumber}: "${msgText}"`)
        try {
          await this.baileysManager.sendText(lineId, waNumber, msgText)
          console.log(`[FlowEngine] Mensaje enviado OK`)
        } catch (e) {
          console.error(`[FlowEngine] Error enviando mensaje:`, e.message)
        }
        await this._sleep(500)
        await this._next(node, flow, ctx)
        break
      }

      // ── Nodo Esperar Respuesta ──────────────────────────────────
      case 'waitResponseNode': {
        const question = this._interpolate(node.data?.question || '', context)
        const varName = node.data?.variable || 'respuesta'

        // Enviar la pregunta al cliente
        if (question) {
          console.log(`[FlowEngine] Enviando pregunta: "${question}"`)
          try {
            await this.baileysManager.sendText(lineId, waNumber, question)
          } catch (e) {
            console.error(`[FlowEngine] Error enviando pregunta:`, e.message)
          }
          await this._sleep(300)
        }

        // Guardar estado de espera
        context._waitingResponse = node.id
        context._waitingResponseVar = varName
        await query(
          'UPDATE conversations SET current_node_id=$1, context_data=$2 WHERE id=$3',
          [node.id, JSON.stringify(context), conv.id]
        )
        console.log(`[FlowEngine] Esperando respuesta del cliente → guardará en {{${varName}}}`)
        break
      }

      // ── Nodo Poll con rutas por opción ─────────────────────────
      case 'pollNode': {
        const title = this._interpolate(node.data?.title || 'Selecciona una opción', context)

        // Soportar opciones como strings simples O como objetos {label, nextNodeId}
        const rawOptions = node.data?.options || []
        const options = rawOptions
          .map(o => (typeof o === 'object' && o !== null) ? (o.label || '') : (o || ''))
          .filter(o => typeof o === 'string' && o.trim() !== '')

        if (options.length === 0) {
          console.warn('[FlowEngine] pollNode sin opciones, saltando...')
          await this._next(node, flow, ctx)
          break
        }

        console.log(`[FlowEngine] Enviando imagen+poll a ${waNumber}: "${title}" (${options.length} opciones)`)

        // 1. Enviar imagen visual del menú (opcional: solo si el servicio existe)
        try {
          let generateMenuImage = null
          try { ({ generateMenuImage } = require('../services/imageMenu.service')) } catch (_) {
            // imageMenu.service no instalado → se envía solo el menú de texto
          }
          if (generateMenuImage) {
            const imgBuffer = await generateMenuImage(title, options)
            await this.baileysManager.sendMedia(lineId, waNumber, {
              type: 'image',
              buffer: imgBuffer,
              mimetype: 'image/png',
              filename: 'menu.png',
              caption: '',
            })
            console.log(`[FlowEngine] Imagen de menú enviada OK`)
          }
        } catch (e) {
          console.error(`[FlowEngine] Error enviando imagen de menú:`, e.message)
        }


        await this._sleep(800)

        // 2. Enviar lista interactiva (botón "Ver opciones") con fallback a poll
        try {
          await this.baileysManager.sendList(lineId, waNumber, {
            title,
            description: title,
            buttonText: 'Ver opciones',
            options: rawOptions,
          })
          console.log(`[FlowEngine] Lista interactiva enviada OK`)
        } catch (listErr) {
          console.warn(`[FlowEngine] Lista no soportada, usando poll:`, listErr.message)
          try {
            await this.baileysManager.sendPoll(lineId, waNumber, title, options)
            console.log(`[FlowEngine] Poll enviado OK (fallback)`)
          } catch (e) {
            console.error(`[FlowEngine] Error enviando poll:`, e.message)
          }
        }


        // Guardar estado de espera del poll
        context._waitingPollNode = node.id
        context._pollOptions = options
        await query(
          'UPDATE conversations SET current_node_id=$1, context_data=$2 WHERE id=$3',
          [node.id, JSON.stringify(context), conv.id]
        )
        break
      }

      case 'conditionNode': {
        const input = (context._lastInput || '').toLowerCase().trim()
        const conditions = node.data?.conditions || []
        let matched = false
        for (const cond of conditions) {
          if (this._evalCondition(input, cond)) {
            const nextNode = flow.nodes.find(n => n.id === cond.nextNodeId)
            if (nextNode) {
              await this._executeNode(nextNode, flow, ctx)
              matched = true
              break
            }
          }
        }
        if (!matched) await this._next(node, flow, ctx)
        break
      }

      case 'waitNode': {
        const seconds = parseInt(node.data?.seconds || 1)
        await this._sleep(seconds * 1000)
        await this._next(node, flow, ctx)
        break
      }

      case 'mediaNode': {
        const fs = require('fs')
        const filePath = node.data?.filePath
        if (filePath && fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath)
          try {
            await this.baileysManager.sendMedia(lineId, waNumber, {
              type: node.data?.mediaType || 'document',
              buffer,
              mimetype: node.data?.mimetype || 'application/octet-stream',
              filename: node.data?.filename || 'archivo',
              caption: this._interpolate(node.data?.caption || '', context),
            })
          } catch (e) {
            console.error(`[FlowEngine] Error enviando media:`, e.message)
          }
        }
        await this._next(node, flow, ctx)
        break
      }

      case 'emailNode': {
        try {
          await emailService.send({
            to: this._interpolate(node.data?.to || '', context),
            subject: this._interpolate(node.data?.subject || '', context),
            body: this._interpolate(node.data?.body || '', context),
          })
        } catch (e) {
          console.error(`[FlowEngine] Error enviando email:`, e.message)
        }
        await this._next(node, flow, ctx)
        break
      }

      case 'webhookNode': {
        try {
          const payload = this._interpolateObj(node.data?.payload || {}, context)
          const result = await webhookService.call({
            url: node.data?.url,
            method: node.data?.method || 'POST',
            headers: node.data?.headers || {},
            payload,
          })
          // Guardar respuesta del webhook en contexto
          if (result) context._webhookResponse = JSON.stringify(result)
        } catch (e) {
          console.error(`[FlowEngine] Error en webhook:`, e.message)
        }
        await this._next(node, flow, ctx)
        break
      }

      case 'notifyWaNode': {
        const targetNumber = node.data?.targetNumber
        const message = this._interpolate(node.data?.message || '', context)
        if (targetNumber) {
          try {
            await this.baileysManager.sendText(lineId, targetNumber, message)
          } catch (e) {
            console.error(`[FlowEngine] Error en notifyWaNode:`, e.message)
          }
        }
        await this._next(node, flow, ctx)
        break
      }

      case 'saveDataNode': {
        const key = node.data?.key
        const value = this._interpolate(node.data?.value || '', context)
        if (key) {
          context[key] = value
          try {
            await query(
              `UPDATE contacts SET metadata = metadata || $1::jsonb, last_seen=NOW()
               WHERE wa_number=$2 AND line_id=$3`,
              [JSON.stringify({ [key]: value }), waNumber.replace('@s.whatsapp.net','').replace('@lid','').replace(/\D/g,''), lineId]
            )
          } catch (e) {
            console.error(`[FlowEngine] Error en saveDataNode:`, e.message)
          }
        }
        await this._next(node, flow, ctx)
        break
      }

      case 'tagNode': {
        const tag = node.data?.tag
        if (tag) {
          try {
            await query(
              `UPDATE contacts SET tags = array_append(tags, $1)
               WHERE wa_number=$2 AND line_id=$3 AND NOT ($1 = ANY(tags))`,
              [tag, waNumber.replace('@s.whatsapp.net','').replace('@lid','').replace(/\D/g,''), lineId]
            )
          } catch (e) {
            console.error(`[FlowEngine] Error en tagNode:`, e.message)
          }
        }
        await this._next(node, flow, ctx)
        break
      }

      case 'endNode': {
        try {
          await query(
            `UPDATE conversations SET status='closed', closed_at=NOW(), current_node_id=NULL WHERE id=$1`,
            [conv.id]
          )
          if (node.data?.farewellText) {
            await this.baileysManager.sendText(
              lineId, waNumber,
              this._interpolate(node.data.farewellText, context)
            )
          }
        } catch (e) {
          console.error(`[FlowEngine] Error en endNode:`, e.message)
        }
        break
      }

      default:
        console.warn(`[FlowEngine] Tipo de nodo desconocido: ${node.type}`)
        await this._next(node, flow, ctx)
    }
  }

  async _next(node, flow, ctx) {
    const edge = flow.edges?.find(e => e.source === node.id)
    if (!edge) return
    const nextNode = flow.nodes.find(n => n.id === edge.target)
    if (nextNode) await this._executeNode(nextNode, flow, ctx)
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

  _interpolate(text, context) {
    if (!text) return ''
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? `{{${key}}}`)
  }

  _interpolateObj(obj, context) {
    try {
      return JSON.parse(this._interpolate(JSON.stringify(obj), context))
    } catch (e) {
      return obj
    }
  }

  _evalCondition(input, cond) {
    const val = input.toLowerCase().trim()
    const comp = (cond.value || '').toLowerCase().trim()
    switch (cond.operator) {
      case 'equals':   return val === comp
      case 'contains': return val.includes(comp)
      case 'starts':   return val.startsWith(comp)
      case 'regex':    try { return new RegExp(comp, 'i').test(val) } catch { return false }
      case 'any':      return true
      default:         return val === comp
    }
  }
}

module.exports = FlowEngine