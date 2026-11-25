// src/services/botVendedorWa.service.js
// ============================================================
// BOT VENDEDOR IA en las lineas de WABOT.
//
// El administrador activa el bot por linea en el modulo "Bot Vendedor IA"
// (tabla bv_lineas). BaileysManager llama a atenderSiAplica() por cada mensaje
// entrante; si la linea tiene el bot activo, el bot responde (texto, audio,
// imagen, ubicacion) y el FlowEngine de esa linea NO se ejecuta.
//
// El bot se calla en una conversacion cuando:
//   - paso el chat a un asesor (ESCALAR / FUERA_HORARIO), o
//   - un asesor escribio a mano en esa conversacion,
// durante BOT_PAUSA_MIN minutos (default 120).
//
// Nunca lanza errores hacia BaileysManager: si algo falla, solo registra en log.
// ============================================================
'use strict';

const pool = require('../config/db');
const bot = require('./botVendedor.service');

const PAUSA_MIN = Number(process.env.BOT_PAUSA_MIN || 120);
const CACHE_LINEAS_MS = 30 * 1000;
const MAX_ANTIGUEDAD_MS = 5 * 60 * 1000; // no responder mensajes viejos (sincronizacion al reconectar)

let lineasActivas = new Map(); // line_id -> { inicio, fin }
let lineasEn = 0;
let cargando = null;

async function lineaActiva(lineId) {
  if (Date.now() - lineasEn > CACHE_LINEAS_MS) {
    if (!cargando) {
      cargando = (async () => {
        try {
          await bot.asegurarTablas();
          const { rows } = await pool.query(
            'SELECT line_id::text AS id, horario_inicio, horario_fin FROM public.bv_lineas WHERE activo = TRUE');
          lineasActivas = new Map(rows.map((r) => [r.id, { inicio: r.horario_inicio, fin: r.horario_fin }]));
          lineasEn = Date.now();
        } catch (e) {
          console.error('[BOT-VENDEDOR-WA] no se pudieron leer las lineas:', e.message);
          lineasEn = Date.now(); // reintenta en el siguiente ciclo de cache
        } finally {
          cargando = null;
        }
      })();
    }
    await cargando;
  }
  const cfg = lineasActivas.get(String(lineId));
  if (cfg && bot.enHorario(cfg.inicio, cfg.fin)) return true;
  // La linea del bot nocturno responde en su horario aunque no este activada en "Lineas".
  try { return await require('./botVendedorNocturno.service').lineaNocturnaActiva(lineId); } catch (_) { return false; }
}

function invalidarLineas() { lineasEn = 0; }

// Aviso de "dame un momento" ya enviado por conversacion (para no repetirlo).
const avisosEspera = new Map();

// Pausas por conversacion tras pasar a un asesor (en memoria).
const pausas = new Map(); // conversation_id -> timestamp hasta

// ¿Un asesor escribio a mano en los ultimos PAUSA_MIN minutos?
async function asesorActivo(conversationId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM messages
      WHERE conversation_id = $1 AND direction = 'out'
        AND timestamp > NOW() - ($2 || ' minutes')::interval
        AND COALESCE(metadata->>'bot_vendedor', '') <> 'true'
      LIMIT 1`,
    [conversationId, String(PAUSA_MIN)]);
  return rows.length > 0;
}

// Historial de la conversacion para el modelo (sin el mensaje actual).
async function historial(conversationId, waMsgIdActual) {
  const { rows } = await pool.query(
    `SELECT direction, type, content FROM messages
      WHERE conversation_id = $1 AND (wa_msg_id IS DISTINCT FROM $2)
      ORDER BY timestamp DESC LIMIT 10`,
    [conversationId, waMsgIdActual || null]);
  return rows.reverse()
    .map((m) => ({
      role: m.direction === 'out' ? 'assistant' : 'user',
      content: m.content || (m.type && m.type !== 'text' ? `[${m.type}]` : ''),
    }))
    .filter((m) => m.content);
}

async function construirEntrada(manager, lineId, msg, text, msgType) {
  const m = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessageV2?.message || msg.message || {};
  try {
    if (msgType === 'audio' && m.audioMessage) {
      const texto = await bot.transcribirAudio(await manager._bajarMedia(lineId, msg), m.audioMessage.mimetype || 'audio/ogg');
      return `[Audio: ${texto || 'no se entendio el audio'}]`;
    }
    if (msgType === 'image' && m.imageMessage) {
      const caption = m.imageMessage.caption || '';
      let descripcion = 'no disponible';
      try {
        descripcion = await bot.describirImagen(await manager._bajarMedia(lineId, msg), m.imageMessage.mimetype || 'image/jpeg', caption);
      } catch (e) {
        console.error(`[BOT-VENDEDOR-WA] linea ${lineId}: no pude analizar la imagen:`, e.message);
      }
      return `[Image: ${descripcion}]${caption ? ' ' + caption : ''}`;
    }
    if (msgType === 'location' && m.locationMessage) {
      const l = m.locationMessage;
      return `[Ubicacion compartida: lat ${l.degreesLatitude}, lng ${l.degreesLongitude}${l.address ? ', ' + l.address : ''}]`;
    }
    if (msgType === 'document') return `[Documento: ${m.documentMessage?.fileName || 'archivo'}] ${text || ''}`.trim();
    if (msgType === 'sticker') return '';
  } catch (e) {
    console.error(`[BOT-VENDEDOR-WA] linea ${lineId}: error procesando ${msgType}:`, e.message);
    return '[El cliente envio un archivo que no se pudo procesar]';
  }
  return String(text || '').trim();
}

// Cola por conversacion: un cliente no recibe dos respuestas en paralelo.
const colas = new Map();
function enCola(clave, tarea) {
  const siguiente = (colas.get(clave) || Promise.resolve()).then(tarea).catch((e) =>
    console.error('[BOT-VENDEDOR-WA]', e.message));
  colas.set(clave, siguiente);
  siguiente.finally(() => { if (colas.get(clave) === siguiente) colas.delete(clave); });
  return siguiente;
}

async function atender({ manager, lineId, msg, conv, remoteJid, text, msgType }) {
  const hasta = pausas.get(conv.id);
  if (hasta && Date.now() < hasta) return;
  if (hasta) pausas.delete(conv.id);
  if (await asesorActivo(conv.id)) return;

  const entrada = await construirEntrada(manager, lineId, msg, text, msgType);
  if (!entrada) return;

  const hist = await historial(conv.id, msg.key?.id);
  hist.push({ role: 'user', content: entrada });

  // Si la IA falla (limite por minuto, red, clave), se reintenta 2 veces con espera.
  // Una falla tecnica NO pasa el chat a un asesor: el cliente recibe a lo sumo un
  // "dame un momento" y el error queda visible en el modulo.
  let r = null;
  for (let intento = 1; intento <= 3 && !r; intento++) {
    try {
      r = await bot.responder(hist);
    } catch (e) {
      console.error(`[BOT-VENDEDOR-WA] linea ${lineId}: IA no disponible (intento ${intento}/3):`, e.message);
      await bot.registrarErrorIA(`${new Date().toISOString()} · linea ${lineId} · intento ${intento}/3 · ${e.message}`);
      if (intento < 3) await new Promise((res) => setTimeout(res, 20000 * intento));
    }
  }
  if (!r) {
    const yaAviso = avisosEspera.get(conv.id);
    if (yaAviso && Date.now() - yaAviso < 30 * 60 * 1000) return; // no repetir el aviso
    avisosEspera.set(conv.id, Date.now());
    r = { texto: 'Dame un momento por favor, ya te ayudo 🙏', accion: null, imagenes: [], ms: 0, modelo: '-' };
  }

  const enviado = await manager.sendText(lineId, remoteJid, r.texto);
  const waMsgId = enviado?.key?.id;
  if (waMsgId) {
    await pool.query(
      `UPDATE messages SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE wa_msg_id = $1`,
      [waMsgId, JSON.stringify({ bot_vendedor: true, accion: r.accion || null })]).catch(() => {});
  }
  // Imagenes de los planes recomendados (despues del texto).
  for (const id of r.imagenes || []) {
    try {
      const img = await bot.imagenPlan(id);
      if (!img) continue;
      const res = await manager.sendMedia(lineId, remoteJid, { type: 'image', buffer: img.buffer, mimetype: img.mime, caption: `Plan ${img.nombre}` });
      if (res?.key?.id) {
        await pool.query(
          `UPDATE messages SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"bot_vendedor": true}'::jsonb WHERE wa_msg_id = $1`,
          [res.key.id]).catch(() => {});
      }
    } catch (e) {
      console.error(`[BOT-VENDEDOR-WA] linea ${lineId}: no se pudo enviar la imagen del plan ${id}:`, e.message);
    }
  }
  console.log(`[BOT-VENDEDOR-WA] linea ${lineId} conv ${conv.id}: respondio en ${(r.ms / 1000).toFixed(1)} s${r.accion ? ` <<${r.accion}>>` : ''}`);

  if (r.ventaCerrada) {
    // Carrera nocturna: primera confirmacion de venta del cliente con el bot.
    const marca = await pool.query(
      `UPDATE public.bv_nocturno SET bot_venta_en = NOW()
        WHERE line_id = $1 AND telefono = $2 AND bot_venta_en IS NULL AND enviado_en > NOW() - INTERVAL '7 days'
        RETURNING bitrix_id`,
      [lineId, String(conv.wa_number || '').replace(/\D/g, '')]).catch(() => ({ rows: [] }));
    console.log(`[BOT-VENDEDOR-WA] linea ${lineId} conv ${conv.id}: VENTA CONFIRMADA con el bot${marca.rows[0] ? ` (deal ${marca.rows[0].bitrix_id})` : ''}`);
  }

  if (r.accion) {
    pausas.set(conv.id, Date.now() + PAUSA_MIN * 60 * 1000);
    console.log(`[BOT-VENDEDOR-WA] *** PASAR A ASESOR: linea ${lineId} conv ${conv.id} ***`);
  }
}

/**
 * Llamado por BaileysManager._handleIncomingMessage despues de guardar el mensaje.
 * Devuelve true si la linea tiene el bot vendedor activo (el FlowEngine no debe correr).
 * La respuesta se procesa en segundo plano para no frenar la recepcion de mensajes.
 */
async function atenderSiAplica({ manager, lineId, msg, conv, remoteJid, text, msgType }) {
  try {
    if (!conv?.id || !remoteJid || remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) return false;
    if (!(await lineaActiva(lineId))) return false;
    const ts = Number(msg?.messageTimestamp || 0) * 1000;
    if (ts && Date.now() - ts > MAX_ANTIGUEDAD_MS) return true; // mensaje viejo: no responder, pero tampoco correr el flujo
    enCola(conv.id, () => atender({ manager, lineId, msg, conv, remoteJid, text, msgType }));
    return true;
  } catch (e) {
    console.error(`[BOT-VENDEDOR-WA] linea ${lineId}:`, e.message);
    return false;
  }
}

module.exports = { atenderSiAplica, invalidarLineas, lineaActiva };
