// src/services/botAtc.service.js
// ============================================================
// BOT ATC (piloto) — en cada chat nuevo pregunta si el cliente quiere VENTAS o
// SERVICIO AL CLIENTE y escucha la conversacion durante N segundos (default 90).
// Al terminar, la IA lee TODO lo que escribio el cliente (texto, audio, imagen) —
// no se fia solo de que marque 1 o 2 — y recomienda:
//   ATC/SOPORTE      -> el cliente ya tiene servicio y busca soporte/facturacion/etc.
//   CONTACTO NUEVO   -> quiere contratar (o no se sabe): sigue el bot vendedor/asesor.
// Sin respuesta del cliente -> NO_DETECTADO (recomienda dejar en Contacto nuevo).
//
// Modos (modulo "Bot ATC"):
//   recomendar (default) -> solo registra la recomendacion. No envia plantilla,
//                           no mueve etapas y el reparto NO espera.
//   aplicar              -> si es ATC envia la plantilla de canales y mueve el
//                           deal a la etapa ATC; el reparto espera al bot.
// Durante la escucha el bot NO bloquea: el bot vendedor / asesor atiende normal.
// Nunca lanza errores hacia BaileysManager.
// ============================================================
'use strict';

const pool = require('../config/db');
const bot = require('./botVendedor.service');
const { bitrixCallNovonet } = require('./bitrix.service');
const poolErp = require('../config/dbErp');

const CATEGORIA = String(process.env.RECONCILIACION_BITRIX_CATEGORIA || '19');
const MAX_ANTIGUEDAD_MS = 5 * 60 * 1000;
const CACHE_MS = 30 * 1000;
const REENVIO_PLANTILLA_HORAS = 6;
const TARDE_MIN = 30; // tras NO_DETECTADO, aun se reconoce un ATC claro durante este tiempo

const CANALES_DEFECTO = `*CANALES DE ATENCIÓN NETLIFE*

*Línea Móvil:*
📲 0985970000
*Línea Fija:*
☎️ (02) 3920000
*Línea Whatsapp:*
🤳 0962992996 *ARA*
*Correo Electrónico:*
✉ soporte@netlife.ec
✉ atencionalcliente@netlife.ec
*Agendar Cita Virtual*
Agenda una cita para ser atendido por un asesor en línea 🧑🏻‍💻
https://www.netlife.ec/atencion-al-cliente/agendar-cita/`;

const DEFECTOS = {
  modo: 'recomendar',
  pregunta: '¡Hola! 👋 Gracias por escribir a *NETLIFE*.\nCuéntanos qué necesitas:\n\n*1* Quiero contratar internet (ventas)\n*2* Ya soy cliente (servicio al cliente)',
  plantilla: `Estimado cliente, este es un canal exclusivo de *ventas*. Para servicio al cliente comunícate por estos canales:\n\n${CANALES_DEFECTO}`,
  segundos: '90',
  reinicio_horas: '24',
  etapa_atc: 'ATC/SOPORTE',
  // Atencion a CONTACTO NUEVO: el bot escribe primero, desde su propia linea, a cada deal nuevo de NOVONET.
  saliente_activo: 'false',
  saliente_linea: '',
  saliente_inicio: '07:30',
  saliente_fin: '20:30',
  saliente_intervalo: '45',
  saliente_max: '600',
  saliente_pregunta: '¡Hola! 👋 Te escribimos de *NETLIFE* porque recibimos tu solicitud. ¿Buscas contratar internet o necesitas ayuda con un servicio que ya tienes? Cuéntanos en un mensaje 🙂',
  saliente_plantilla: 'true',
  confirmacion_ventas: '¡Genial! 😊 En breve un asesor de ventas te contacta para ayudarte con tu plan.',
};

// ─── Tablas ──────────────────────────────────────────────────────────────────
let tablasListas = null;
function asegurarTablas() {
  if (!tablasListas) {
    tablasListas = pool.query(`
      CREATE TABLE IF NOT EXISTS public.batc_config (
        clave TEXT PRIMARY KEY, valor TEXT, actualizado_por TEXT, actualizado_en TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS public.batc_lineas (
        line_id UUID PRIMARY KEY, activo BOOLEAN NOT NULL DEFAULT FALSE,
        horario_inicio TEXT, horario_fin TEXT, actualizado_por TEXT, actualizado_en TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS public.batc_sesiones (
        id BIGSERIAL PRIMARY KEY,
        conversation_id UUID NOT NULL,
        line_id UUID NOT NULL,
        telefono TEXT,
        estado TEXT NOT NULL DEFAULT 'PENDIENTE',   -- PENDIENTE | ATC | VENTAS | NO_DETECTADO
        metodo TEXT,                                -- numero | palabra | ia | tiempo
        respuesta TEXT,
        repreguntado BOOLEAN NOT NULL DEFAULT FALSE,
        bitrix_id TEXT,
        etapa_objetivo TEXT,
        etapa_anterior TEXT,
        etapa_estado TEXT,                          -- pendiente | hecho | sin_deal | omitido | error
        etapa_detalle TEXT,
        etapa_intentos INT NOT NULL DEFAULT 0,
        plantilla_en TIMESTAMPTZ,
        inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resuelto_en TIMESTAMPTZ);
      ALTER TABLE public.batc_sesiones ADD COLUMN IF NOT EXISTS textos JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE public.batc_sesiones ADD COLUMN IF NOT EXISTS recomendacion TEXT;
      ALTER TABLE public.batc_sesiones ADD COLUMN IF NOT EXISTS confianza TEXT;
      ALTER TABLE public.batc_sesiones ADD COLUMN IF NOT EXISTS motivo TEXT;
      ALTER TABLE public.batc_sesiones ADD COLUMN IF NOT EXISTS modo TEXT;
      ALTER TABLE public.batc_sesiones ADD COLUMN IF NOT EXISTS jid TEXT;
      ALTER TABLE public.batc_sesiones ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'entrante';
      ALTER TABLE public.batc_sesiones ADD COLUMN IF NOT EXISTS enviado_en TIMESTAMPTZ;
      ALTER TABLE public.batc_sesiones ADD COLUMN IF NOT EXISTS ultimo_cliente_en TIMESTAMPTZ;
      ALTER TABLE public.batc_sesiones ALTER COLUMN conversation_id DROP NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS batc_sesiones_saliente_deal_idx ON public.batc_sesiones (bitrix_id) WHERE origen = 'saliente';
      CREATE INDEX IF NOT EXISTS batc_sesiones_conv_idx ON public.batc_sesiones (conversation_id, inicio DESC);
      CREATE INDEX IF NOT EXISTS batc_sesiones_estado_idx ON public.batc_sesiones (estado, inicio);
    `).catch((e) => { tablasListas = null; throw e; });
  }
  return tablasListas;
}

// ─── Configuracion ───────────────────────────────────────────────────────────
let cfgCache = null; let cfgEn = 0;
async function leerConfig(sinCache = false) {
  if (!sinCache && cfgCache && Date.now() - cfgEn < CACHE_MS) return cfgCache;
  await asegurarTablas();
  const { rows } = await pool.query('SELECT clave, valor FROM public.batc_config');
  const cfg = { ...DEFECTOS };
  for (const r of rows) if (r.clave in DEFECTOS && r.valor !== null) cfg[r.clave] = r.valor;
  cfg.segundosN = Math.min(600, Math.max(30, parseInt(cfg.segundos, 10) || 90));
  cfg.aplicar = cfg.modo === 'aplicar';
  cfg.salienteActivo = cfg.saliente_activo === 'true';
  cfg.salienteIntervalo = Math.min(600, Math.max(20, parseInt(cfg.saliente_intervalo, 10) || 45));
  cfg.salienteMax = Math.max(1, parseInt(cfg.saliente_max, 10) || 600);
  cfg.reinicioN = Math.min(24 * 30, Math.max(1, parseInt(cfg.reinicio_horas, 10) || 24));
  cfgCache = cfg; cfgEn = Date.now();
  return cfg;
}
async function guardarConfig(valores, usuario) {
  await asegurarTablas();
  for (const [clave, valor] of Object.entries(valores || {})) {
    if (!(clave in DEFECTOS)) continue;
    await pool.query(
      `INSERT INTO public.batc_config (clave, valor, actualizado_por, actualizado_en) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = NOW()`,
      [clave, String(valor ?? ''), usuario || null]);
  }
  cfgEn = 0;
}

// ─── Lineas activas ──────────────────────────────────────────────────────────
let lineas = new Map(); let lineasEn = 0;
async function lineaActiva(lineId) {
  if (Date.now() - lineasEn > CACHE_MS) {
    try {
      await asegurarTablas();
      const { rows } = await pool.query('SELECT line_id::text AS id, horario_inicio, horario_fin FROM public.batc_lineas WHERE activo = TRUE');
      lineas = new Map(rows.map((r) => [r.id, r]));
    } catch (e) { console.error('[BOT-ATC] no se pudieron leer las lineas:', e.message); }
    lineasEn = Date.now();
  }
  const l = lineas.get(String(lineId));
  return !!l && bot.enHorario(l.horario_inicio, l.horario_fin);
}
const hayLineasActivas = async () => { await lineaActiva('-'); return lineas.size > 0; };
function invalidarLineas() { lineasEn = 0; }

// ─── Clasificacion ───────────────────────────────────────────────────────────
const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();

const RE_UNO = /^(1|uno|opcion 1|la 1|el 1|ventas?|1 ventas?)$/;
const RE_DOS = /^(2|dos|opcion 2|la 2|el 2|2 servicio al cliente|servicio al cliente)$/;
const RE_ATC = /\b(ya soy cliente|soy cliente|ya tengo (el |un |mi )?(servicio|internet|plan)|mi servicio|servicio al cliente|atencion al cliente|soporte|factura|facturacion|estado de cuenta|no tengo internet|sin internet|sin servicio|sin senal|no (me )?funciona|se fue el internet|se cayo|corte|cortaron|suspendid|reclamo|queja|visita tecnica|tecnico|cancelar (el |mi )?servicio|dar de baja|darme de baja|anular|traslado|mudanza|cambio de domicilio|contrasena|clave del wifi|reactivar|reconexion|intermitente|lentitud)\b/;
const RE_VENTAS = /\b(contratar|contrato nuevo|planes?|precios?|costos?|cuanto (cuesta|vale|sale|es)|informacion|info|instalar|instalacion|cobertura|promocion|promo|quiero internet|adquirir|nuevo servicio|me interesa)\b/;

// Devuelve 'ATC' | 'VENTAS' | null (no se sabe con palabras)
function clasificarRapido(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  if (RE_UNO.test(t)) return { tipo: 'VENTAS', metodo: 'numero' };
  if (RE_DOS.test(t)) return { tipo: 'ATC', metodo: 'numero' };
  const atc = RE_ATC.test(t); const ven = RE_VENTAS.test(t);
  if (atc && !ven) return { tipo: 'ATC', metodo: 'palabra' };
  if (ven && !atc) return { tipo: 'VENTAS', metodo: 'palabra' };
  return null;
}

// Lee toda la conversacion de la ventana y recomienda la etapa.
// Devuelve { etapa: 'ATC/SOPORTE'|'CONTACTO NUEVO', confianza, motivo, modelo }.
async function evaluarIA(transcripcion) {
  const r = await bot._llamarConRespaldo([
    { role: 'system', content:
      'Auditas chats que llegan a la linea de VENTAS de NETLIFE (internet de fibra en Ecuador). ' +
      'Al inicio el bot le pregunto si busca contratar internet o si necesita ayuda con un servicio que ya tiene. ' +
      'NO te fies solo de un numero (1 o 2) o de una palabra suelta: juzga por lo que el cliente ESCRIBE o DICE en toda la conversacion.\n' +
      'ATC/SOPORTE = ya tiene el servicio y busca soporte tecnico, facturacion, pagos de su cuenta, fallas, cortes, reclamos, ' +
      'cambio de plan de su servicio actual, traslado, cancelacion o datos de su contrato.\n' +
      'CONTACTO NUEVO = quiere contratar, conocer planes, precios, cobertura o instalar un servicio nuevo, o no hay forma de saberlo.\n' +
      'Responde SOLO JSON: {"etapa":"ATC/SOPORTE" o "CONTACTO NUEVO","confianza":"alta"|"media"|"baja","motivo":"maximo 15 palabras en espanol"}' },
    { role: 'user', content: transcripcion.slice(-3500) },
  ]);
  const m = /\{[\s\S]*\}/.exec(r.texto || '');
  const j = m ? JSON.parse(m[0]) : {};
  const etapa = /ATC|SOPORTE/i.test(j.etapa || '') ? 'ATC/SOPORTE' : 'CONTACTO NUEVO';
  return { etapa, confianza: ['alta', 'media', 'baja'].includes(j.confianza) ? j.confianza : 'media', motivo: String(j.motivo || '').slice(0, 200), modelo: r.modelo };
}

// Texto del mensaje (transcribe audios y describe imagenes).
async function textoDelMensaje(manager, lineId, msg, text, msgType) {
  const m = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessageV2?.message || msg.message || {};
  try {
    if (msgType === 'audio' && m.audioMessage) {
      return await bot.transcribirAudio(await manager._bajarMedia(lineId, msg), m.audioMessage.mimetype || 'audio/ogg') || '';
    }
    if (msgType === 'image' && m.imageMessage) {
      const cap = m.imageMessage.caption || '';
      const d = await bot.describirImagen(await manager._bajarMedia(lineId, msg), m.imageMessage.mimetype || 'image/jpeg', cap).catch(() => '');
      return `${cap} [imagen: ${d}]`.trim();
    }
  } catch (e) { console.error(`[BOT-ATC] linea ${lineId}: no pude procesar ${msgType}:`, e.message); }
  return String(text || '').trim();
}

// ─── Bitrix ──────────────────────────────────────────────────────────────────
function normalizarTelefono(valor) {
  let d = String(valor || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = '593' + d.slice(1);
  else if (d.length === 9 && d.startsWith('9')) d = '593' + d;
  return /^593\d{9}$/.test(d) ? d : null;
}

let etapasCache = null; let etapasEn = 0;
async function etapasBitrix() {
  if (etapasCache && Date.now() - etapasEn < 10 * 60 * 1000) return etapasCache;
  const r = await bitrixCallNovonet('crm.dealcategory.stage.list', { id: CATEGORIA });
  etapasCache = (r.result || []).map((e) => ({ id: e.STATUS_ID, nombre: e.NAME, orden: Number(e.SORT) || 0 }));
  etapasEn = Date.now();
  return etapasCache;
}
const mismoNombre = (a, b) => normalizar(a) === normalizar(b);

// Deal reciente (3 dias) de NOVONET para ese telefono.
async function buscarDeal(telefono) {
  const local = '0' + telefono.slice(3);
  const r = await bitrixCallNovonet('crm.duplicate.findbycomm', { entity_type: 'CONTACT', type: 'PHONE', values: [`+${telefono}`, telefono, local] });
  const contactos = r.result?.CONTACT || [];
  const desde = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  let mejor = null;
  for (const c of contactos.slice(0, 5)) {
    const d = await bitrixCallNovonet('crm.deal.list', {
      filter: { CONTACT_ID: c, CATEGORY_ID: CATEGORIA, '>=DATE_CREATE': desde },
      order: { ID: 'DESC' }, select: ['ID', 'STAGE_ID', 'DATE_CREATE'],
    });
    for (const deal of d.result || []) if (!mejor || Number(deal.ID) > Number(mejor.ID)) mejor = deal;
  }
  return mejor;
}

async function telefonoDelDeal(bitrixId) {
  const d = (await bitrixCallNovonet('crm.deal.get', { id: bitrixId })).result;
  if (!d?.CONTACT_ID) return null;
  const c = (await bitrixCallNovonet('crm.contact.get', { id: d.CONTACT_ID })).result;
  for (const p of c?.PHONE || []) { const t = normalizarTelefono(p.VALUE); if (t) return t; }
  return null;
}

// Intenta mover el deal de la sesion a su etapa objetivo. Se reintenta desde el timer.
async function moverEtapa(sesionId) {
  const { rows } = await pool.query('SELECT * FROM public.batc_sesiones WHERE id = $1', [sesionId]);
  const s = rows[0];
  if (!s || s.etapa_estado !== 'pendiente') return;
  const fin = (estado, detalle, extra = {}) => pool.query(
    `UPDATE public.batc_sesiones SET etapa_estado = $2, etapa_detalle = $3, etapa_intentos = etapa_intentos + 1,
            bitrix_id = COALESCE($4, bitrix_id), etapa_anterior = COALESCE($5, etapa_anterior) WHERE id = $1`,
    [s.id, estado, String(detalle || '').slice(0, 300), extra.bitrixId || null, extra.anterior || null]);
  try {
    if (!s.telefono) return fin('sin_deal', 'El chat no tiene un teléfono válido');
    const etapas = await etapasBitrix();
    const destino = etapas.find((e) => mismoNombre(e.nombre, s.etapa_objetivo));
    if (!destino) return fin('error', `No existe la etapa "${s.etapa_objetivo}" en Bitrix`);
    const deal = await buscarDeal(s.telefono);
    if (!deal) {
      // Bitrix puede tardar en crear el deal: se reintenta (hasta 5 veces, 1 por minuto).
      if (s.etapa_intentos + 1 < 5) return pool.query('UPDATE public.batc_sesiones SET etapa_intentos = etapa_intentos + 1, etapa_detalle = $2 WHERE id = $1', [s.id, 'Esperando que Bitrix cree el deal']);
      return fin('sin_deal', 'No se encontró un deal reciente de NOVONET con ese teléfono');
    }
    const actual = etapas.find((e) => e.id === deal.STAGE_ID);
    const cfg = await leerConfig();
    const desdeValida = actual && normalizar(actual.nombre).startsWith('contacto nuevo');
    if (actual?.id === destino.id) return fin('hecho', `Ya estaba en ${destino.nombre}`, { bitrixId: deal.ID, anterior: actual.nombre });
    if (!desdeValida) {
      return fin('omitido', `El deal ya estaba en ${actual?.nombre || deal.STAGE_ID}; no se movió`, { bitrixId: deal.ID, anterior: actual?.nombre });
    }
    await bitrixCallNovonet('crm.deal.update', { id: deal.ID, fields: { STAGE_ID: destino.id } });
    await bitrixCallNovonet('crm.timeline.comment.add', { fields: {
      ENTITY_ID: deal.ID, ENTITY_TYPE: 'deal',
      COMMENT: `🤖 Bot ATC: ${s.estado === 'ATC' ? 'el cliente pidió servicio al cliente; se le enviaron los canales de ATC' : `sin respuesta del cliente en ${cfg.segundosN} s`}. Etapa: ${destino.nombre}.` } }).catch(() => {});
    await fin('hecho', `Movido a ${destino.nombre}`, { bitrixId: deal.ID, anterior: actual.nombre });
    console.log(`[BOT-ATC] deal ${deal.ID} -> ${destino.nombre}`);
  } catch (e) {
    console.error(`[BOT-ATC] sesion ${s.id}: no se pudo mover la etapa:`, e.message);
    if (s.etapa_intentos + 1 >= 5) await fin('error', e.message);
    else await pool.query('UPDATE public.batc_sesiones SET etapa_intentos = etapa_intentos + 1, etapa_detalle = $2 WHERE id = $1', [s.id, e.message.slice(0, 300)]);
  }
}

// ─── WhatsApp ────────────────────────────────────────────────────────────────
async function enviar(manager, lineId, remoteJid, texto) {
  const r = await manager.sendText(lineId, remoteJid, texto);
  if (r?.key?.id) {
    await pool.query(`UPDATE messages SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"bot_atc": true}'::jsonb WHERE wa_msg_id = $1`, [r.key.id]).catch(() => {});
  }
  return r;
}

// Cola por conversacion (un mensaje a la vez).
const colas = new Map();
function enCola(clave, tarea) {
  const sig = (colas.get(clave) || Promise.resolve()).then(tarea).catch((e) => console.error('[BOT-ATC]', e.message));
  colas.set(clave, sig);
  sig.finally(() => { if (colas.get(clave) === sig) colas.delete(clave); });
  return sig;
}

// Guarda lo que dijo el cliente (audio transcrito, imagen descrita) para evaluarlo al final.
async function guardarTexto(sesionId, ctx) {
  const t = await textoDelMensaje(ctx.manager, ctx.lineId, ctx.msg, ctx.text, ctx.msgType);
  const etiqueta = ctx.msgType === 'audio' ? '[audio] ' : (ctx.msgType === 'image' ? '[imagen] ' : '');
  if (!t) return;
  await pool.query(
    `UPDATE public.batc_sesiones SET textos = textos || $2::jsonb, ultimo_cliente_en = NOW() WHERE id = $1`,
    [sesionId, JSON.stringify([{ en: new Date().toISOString(), texto: (etiqueta + t).slice(0, 1000) }])]);
}

/**
 * Llamado por BaileysManager antes del bot vendedor. Devuelve true solo cuando el
 * bot ATC envia la pregunta inicial (ese mensaje no lo responde el bot vendedor).
 * Durante la escucha devuelve false: el bot vendedor / asesor atienden normal.
 */
async function atenderSiAplica(ctx) {
  const { lineId, msg, conv, remoteJid } = ctx;
  try {
    if (!conv?.id || !remoteJid || remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) return false;
    const ts = Number(msg?.messageTimestamp || 0) * 1000;
    if (ts && Date.now() - ts > MAX_ANTIGUEDAD_MS) return false;
    const cfg = await leerConfig();

    // Respuesta a un mensaje que el bot envio a un deal de Contacto nuevo (linea saliente).
    if (cfg.saliente_linea && String(cfg.saliente_linea) === String(lineId)) {
      const tel = normalizarTelefono(conv.wa_number);
      const { rows: sal } = await pool.query(
        `SELECT * FROM public.batc_sesiones
          WHERE origen = 'saliente' AND line_id = $1 AND enviado_en > NOW() - INTERVAL '24 hours'
            AND (conversation_id = $2 OR (conversation_id IS NULL AND telefono = $3))
          ORDER BY enviado_en DESC LIMIT 1`, [lineId, conv.id, tel]);
      const s = sal[0];
      if (s) {
        if (!s.conversation_id) await pool.query('UPDATE public.batc_sesiones SET conversation_id = $2, jid = $3 WHERE id = $1', [s.id, conv.id, remoteJid]);
        if (s.estado === 'PENDIENTE' || s.estado === 'NO_DETECTADO') {
          // Respuesta (aunque llegue tarde): se guarda y se evalua en cuanto el cliente termina de escribir.
          if (s.estado === 'NO_DETECTADO') await pool.query(`UPDATE public.batc_sesiones SET estado = 'PENDIENTE' WHERE id = $1 AND estado = 'NO_DETECTADO'`, [s.id]);
          enCola(conv.id, () => guardarTexto(s.id, ctx));
          return true;
        }
        if (s.estado === 'EVALUANDO') { enCola(conv.id, () => guardarTexto(s.id, ctx)); return true; }
        if (s.estado === 'ATC') {
          if (!s.plantilla_en || Date.now() - new Date(s.plantilla_en).getTime() > REENVIO_PLANTILLA_HORAS * 3600 * 1000) {
            enCola(conv.id, async () => {
              await enviar(ctx.manager, lineId, remoteJid, cfg.plantilla);
              await pool.query('UPDATE public.batc_sesiones SET plantilla_en = NOW() WHERE id = $1', [s.id]);
            });
          }
          return true;
        }
        return false; // VENTAS: sigue el bot vendedor de la linea (si lo tiene) o el asesor
      }
    }

    if (!(await lineaActiva(lineId))) return false;

    const { rows } = await pool.query(
      `SELECT * FROM public.batc_sesiones WHERE conversation_id = $1 AND inicio > NOW() - ($2 || ' hours')::interval
        ORDER BY inicio DESC LIMIT 1`, [conv.id, String(cfg.reinicioN)]);
    const s = rows[0];

    if (s?.estado === 'PENDIENTE') { enCola(conv.id, () => guardarTexto(s.id, ctx)); return false; }
    if (s?.estado === 'ATC' && s.modo === 'aplicar') {
      // Cliente de ATC que sigue escribiendo: se le recuerda la plantilla (1 vez cada 6 h).
      if (!s.plantilla_en || Date.now() - new Date(s.plantilla_en).getTime() > REENVIO_PLANTILLA_HORAS * 3600 * 1000) {
        enCola(conv.id, async () => {
          await enviar(ctx.manager, lineId, remoteJid, cfg.plantilla);
          await pool.query('UPDATE public.batc_sesiones SET plantilla_en = NOW() WHERE id = $1', [s.id]);
        });
      }
      return true;
    }
    if (s) return false; // ya evaluado: no interviene

    // Sin sesion: ¿es un chat nuevo? (sin mensajes previos en las ultimas N horas)
    const prev = await pool.query(
      `SELECT 1 FROM messages WHERE conversation_id = $1 AND (wa_msg_id IS DISTINCT FROM $2)
          AND timestamp > NOW() - ($3 || ' hours')::interval LIMIT 1`,
      [conv.id, msg?.key?.id || null, String(cfg.reinicioN)]);
    if (prev.rows.length) return false; // chat en curso: el piloto no interviene

    const ins = await pool.query(
      `INSERT INTO public.batc_sesiones (conversation_id, line_id, telefono, modo, jid) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [conv.id, lineId, normalizarTelefono(conv.wa_number), cfg.aplicar ? 'aplicar' : 'recomendar', remoteJid]);
    const nueva = ins.rows[0];
    enCola(conv.id, async () => {
      await guardarTexto(nueva.id, ctx);
      await enviar(ctx.manager, lineId, remoteJid, cfg.pregunta);
    });
    return true;
  } catch (e) {
    console.error(`[BOT-ATC] linea ${lineId}:`, e.message);
    return false;
  }
}

// Al vencer la ventana: evalua toda la conversacion y registra la recomendacion.
async function evaluar(s, cfg) {
  const { rows: tomada } = await pool.query(
    `UPDATE public.batc_sesiones SET estado = 'EVALUANDO' WHERE id = $1 AND estado = 'PENDIENTE' RETURNING textos`, [s.id]);
  if (!tomada.length) return;
  const textos = tomada[0].textos || [];
  // Lo que respondio el bot vendedor / asesor en la ventana (contexto para la IA).
  const { rows: salidas } = await pool.query(
    `SELECT content, timestamp, COALESCE(metadata->>'bot_atc', '') = 'true' AS atc FROM messages
      WHERE conversation_id = $1 AND direction = 'out' AND timestamp >= $2 ORDER BY timestamp LIMIT 20`,
    [s.conversation_id, s.inicio]);
  const lineas = [
    ...textos.map((t) => ({ en: new Date(t.en).getTime(), l: `Cliente: ${t.texto}` })),
    ...salidas.filter((m) => m.content).map((m) => ({ en: new Date(m.timestamp).getTime(), l: `${m.atc ? 'Bot' : 'Asesor/bot ventas'}: ${String(m.content).slice(0, 300)}` })),
  ].sort((a, b) => a.en - b.en).map((x) => x.l);
  const respuesta = textos.map((t) => t.texto).join(' | ');

  let estado; let rec;
  const saliente = s.origen === 'saliente';
  if (saliente ? textos.length === 0 : (textos.length <= 1 && clasificarRapido(respuesta)?.tipo !== 'ATC')) {
    // Solo el primer mensaje (saludo o anuncio) y no respondio la pregunta.
    estado = 'NO_DETECTADO';
    rec = { etapa: 'CONTACTO NUEVO', confianza: 'baja', motivo: 'El cliente no respondió a la pregunta', metodo: 'tiempo' };
  } else {
    try {
      rec = { ...(await evaluarIA(lineas.join('\n'))), metodo: 'ia' };
    } catch (e) {
      console.error('[BOT-ATC] IA no disponible, uso reglas:', e.message);
      const c = clasificarRapido(respuesta);
      rec = { etapa: c?.tipo === 'ATC' ? 'ATC/SOPORTE' : 'CONTACTO NUEVO', confianza: 'baja', motivo: 'Evaluado por palabras clave (IA no disponible)', metodo: 'palabra' };
    }
    estado = rec.etapa === 'ATC/SOPORTE' ? 'ATC' : 'VENTAS';
  }
  const mover = s.modo === 'aplicar' && estado === 'ATC' && cfg.etapa_atc;
  await pool.query(
    `UPDATE public.batc_sesiones SET estado = $2, metodo = $3, respuesta = $4, recomendacion = $5, confianza = $6, motivo = $7,
            resuelto_en = NOW(), etapa_objetivo = $8, etapa_intentos = 0, etapa_estado = $9
      WHERE id = $1`,
    [s.id, estado, rec.metodo, respuesta.slice(0, 1000), rec.etapa, rec.confianza, rec.motivo,
      mover ? cfg.etapa_atc : null, mover ? 'pendiente' : 'consulta']);
  console.log(`[BOT-ATC] conv ${s.conversation_id}: ${estado} -> recomienda ${rec.etapa} (${rec.confianza})`);

  if (saliente) {
    // Contacto nuevo: si no es intencion de compra se envian los canales de ATC; si es venta, se confirma.
    const destino = s.jid || s.telefono;
    try {
      if (gestor && destino && estado === 'ATC' && cfg.saliente_plantilla !== 'false') {
        await enviar(gestor, s.line_id, destino, cfg.plantilla);
        await pool.query('UPDATE public.batc_sesiones SET plantilla_en = NOW() WHERE id = $1', [s.id]);
      } else if (gestor && destino && estado === 'VENTAS' && cfg.confirmacion_ventas.trim()) {
        await enviar(gestor, s.line_id, destino, cfg.confirmacion_ventas);
      }
    } catch (e) { console.error('[BOT-ATC] no se pudo responder al deal', s.bitrix_id, e.message); }
    if (mover) await moverEtapa(s.id);
    return;
  }
  if (mover) {
    if (gestor && s.jid) {
      try {
        await enviar(gestor, s.line_id, s.jid, cfg.plantilla);
        await pool.query('UPDATE public.batc_sesiones SET plantilla_en = NOW() WHERE id = $1', [s.id]);
      } catch (e) { console.error('[BOT-ATC] no se pudo enviar la plantilla:', e.message); }
    }
    await moverEtapa(s.id);
  } else {
    await identificarDeal(s.id);
  }
}

// Modo recomendar: solo anota el deal y su etapa actual (para revisar en el modulo).
async function identificarDeal(sesionId) {
  try {
    const { rows } = await pool.query('SELECT telefono FROM public.batc_sesiones WHERE id = $1', [sesionId]);
    if (!rows[0]?.telefono) return;
    const deal = await buscarDeal(rows[0].telefono);
    if (!deal) {
      await pool.query(`UPDATE public.batc_sesiones SET etapa_detalle = 'Sin deal reciente en Bitrix' WHERE id = $1`, [sesionId]);
      return;
    }
    const etapa = (await etapasBitrix()).find((e) => e.id === deal.STAGE_ID);
    await pool.query('UPDATE public.batc_sesiones SET bitrix_id = $2, etapa_anterior = $3 WHERE id = $1',
      [sesionId, deal.ID, etapa?.nombre || deal.STAGE_ID]);
  } catch (e) { console.warn('[BOT-ATC] identificarDeal:', e.message); }
}

// ─── Timer: vencimiento de la ventana y reintentos de etapa ──────────────────
let timer = null; let ocupado = false; let ultimoReintento = 0; let gestor = null;
async function revisar() {
  if (ocupado) return; ocupado = true;
  try {
    const cfg = await leerConfig();
    // Sesiones que quedaron en EVALUANDO por un reinicio: se vuelven a evaluar.
    await pool.query(`UPDATE public.batc_sesiones SET estado = 'PENDIENTE' WHERE estado = 'EVALUANDO' AND inicio < NOW() - INTERVAL '10 minutes'`);
    const { rows } = await pool.query(
      `SELECT * FROM public.batc_sesiones WHERE estado = 'PENDIENTE' AND (
          (origen = 'entrante' AND inicio < NOW() - ($1 || ' seconds')::interval)
          OR (origen = 'saliente' AND enviado_en IS NOT NULL AND (
                (jsonb_array_length(textos) = 0 AND enviado_en < NOW() - ($1 || ' seconds')::interval)
                OR ultimo_cliente_en < NOW() - INTERVAL '15 seconds'
                OR (ultimo_cliente_en IS NOT NULL AND enviado_en < NOW() - ($1 || ' seconds')::interval))))
        ORDER BY inicio LIMIT 20`, [String(cfg.segundosN)]);
    for (const s of rows) await evaluar(s, cfg);
    await salienteTick(cfg);
    if (Date.now() - ultimoReintento > 60 * 1000) {
      ultimoReintento = Date.now();
      const p = await pool.query(
        `SELECT id FROM public.batc_sesiones WHERE etapa_estado = 'pendiente' AND resuelto_en < NOW() - INTERVAL '50 seconds'
            AND resuelto_en > NOW() - INTERVAL '1 day' ORDER BY id LIMIT 20`);
      for (const r of p.rows) await moverEtapa(r.id);
    }
  } catch (e) { console.error('[BOT-ATC] revision:', e.message); }
  finally { ocupado = false; }
}
// ─── Atencion a CONTACTO NUEVO (el bot escribe primero) ──────────────────────
let ultimaDeteccion = 0; let ultimoEnvio = 0; let ultimoEstadoSal = { msg: '', en: 0 };
async function estadoSaliente(msg) {
  if (msg === ultimoEstadoSal.msg && Date.now() - ultimoEstadoSal.en < 5 * 60 * 1000) return;
  ultimoEstadoSal = { msg, en: Date.now() };
  await pool.query(
    `INSERT INTO public.batc_config (clave, valor, actualizado_por, actualizado_en) VALUES ('saliente_estado', $1, 'wabot', NOW())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_por = 'wabot', actualizado_en = NOW()`, [msg]).catch(() => {});
}

// Deals que el bot de gestionables recibio en "Contacto nuevo" en los ultimos 20 min (+ respaldo bitrix_webhook_leads).
async function detectarDeals(cfg) {
  const candidatos = new Map();
  try {
    const erp = await poolErp.query(
      `SELECT bitrix_id, MIN(creado_en) AS creado FROM (
         SELECT bitrix_deal_id::text AS bitrix_id, creado_en FROM gestionables_cola WHERE creado_en > NOW() - INTERVAL '20 minutes'
         UNION ALL
         SELECT bitrix_id::text, creado_en FROM gestionables_webhook_log
          WHERE creado_en > NOW() - INTERVAL '20 minutes' AND bitrix_id ~ '^[0-9]+$'
       ) x GROUP BY bitrix_id`);
    for (const r of erp.rows) candidatos.set(String(r.bitrix_id), { creado: r.creado, phone: null });
  } catch (e) { console.error('[BOT-ATC] no se pudo leer gestionables:', e.message); }
  const bwl = await pool.query(
    `SELECT bitrix_id::text AS bitrix_id, phone, created_at FROM bitrix_webhook_leads
      WHERE empresa = 'novonet' AND created_at > NOW() - INTERVAL '20 minutes'`).catch(() => ({ rows: [] }));
  for (const r of bwl.rows) {
    const c = candidatos.get(r.bitrix_id);
    if (c) c.phone = c.phone || r.phone; else candidatos.set(r.bitrix_id, { creado: r.created_at, phone: r.phone });
  }
  const ids = [...candidatos.keys()];
  if (!ids.length) return 0;
  const ya = new Set((await pool.query(
    `SELECT bitrix_id FROM public.batc_sesiones WHERE origen = 'saliente' AND bitrix_id = ANY($1)`, [ids])).rows.map((r) => String(r.bitrix_id)));
  // El bot nocturno ya le escribio: no se le escribe dos veces.
  const noct = new Set((await pool.query('SELECT bitrix_id FROM public.bv_nocturno WHERE bitrix_id = ANY($1)', [ids])
    .catch(() => ({ rows: [] }))).rows.map((r) => String(r.bitrix_id)));
  let nuevos = 0;
  for (const id of ids.filter((x) => !ya.has(x) && !noct.has(x)).slice(0, 15)) {
    const c = candidatos.get(id);
    if (!bot.enHorario(cfg.saliente_inicio, cfg.saliente_fin, new Date(c.creado))) continue;
    let phone = c.phone; let detalle = null;
    try {
      const deal = (await bitrixCallNovonet('crm.deal.get', { id })).result;
      if (!deal || String(deal.CATEGORY_ID) !== CATEGORIA) continue;
      if (!phone && deal.CONTACT_ID && deal.CONTACT_ID !== '0') {
        const ct = (await bitrixCallNovonet('crm.contact.get', { id: deal.CONTACT_ID })).result;
        phone = (ct?.PHONE || []).map((p) => p.VALUE).find((v) => normalizarTelefono(v)) || '';
      }
    } catch (e) { detalle = `Bitrix: ${String(e.message).slice(0, 150)}`; }
    const telefono = normalizarTelefono(phone);
    await pool.query(
      `INSERT INTO public.batc_sesiones (origen, bitrix_id, line_id, telefono, jid, estado, modo, etapa_detalle)
       VALUES ('saliente', $1, $2, $3, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [id, cfg.saliente_linea, telefono, telefono ? 'POR_ENVIAR' : 'ERROR', cfg.aplicar ? 'aplicar' : 'recomendar',
        telefono ? null : (detalle || `Sin teléfono válido: ${phone || 'vacío'}`)]);
    nuevos++;
  }
  return nuevos;
}

async function salienteTick(cfg) {
  if (!gestor) return;
  if (!cfg.salienteActivo) return estadoSaliente('Apagado: la atención a Contacto nuevo no está activa.');
  if (!cfg.saliente_linea) return estadoSaliente('Falta elegir la línea desde la que escribe el bot.');
  if (!bot.enHorario(cfg.saliente_inicio, cfg.saliente_fin)) return estadoSaliente(`En espera: fuera del horario ${cfg.saliente_inicio} a ${cfg.saliente_fin}.`);
  if (gestor.getStatus(cfg.saliente_linea) !== 'connected') return estadoSaliente(`La línea elegida no está conectada en WABOT (estado: ${gestor.getStatus(cfg.saliente_linea)}).`);
  if (Date.now() - ultimaDeteccion > 60 * 1000) {
    ultimaDeteccion = Date.now();
    try { const n = await detectarDeals(cfg); if (n) console.log(`[BOT-ATC] ${n} deal(s) nuevo(s) de Contacto nuevo`); }
    catch (e) { console.error('[BOT-ATC] deteccion:', e.message); }
  }
  if (Date.now() - ultimoEnvio < cfg.salienteIntervalo * 1000) return;
  const hoy = await pool.query(
    `SELECT COUNT(*)::int n FROM public.batc_sesiones WHERE origen = 'saliente' AND enviado_en > date_trunc('day', NOW() AT TIME ZONE 'America/Guayaquil') AT TIME ZONE 'America/Guayaquil'`);
  if (hoy.rows[0].n >= cfg.salienteMax) return estadoSaliente(`Tope alcanzado: ${cfg.salienteMax} mensajes hoy.`);
  const { rows } = await pool.query(
    `UPDATE public.batc_sesiones SET estado = 'ENVIANDO' WHERE id = (
       SELECT id FROM public.batc_sesiones WHERE origen = 'saliente' AND estado = 'POR_ENVIAR' AND inicio > NOW() - INTERVAL '2 hours'
        ORDER BY inicio LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`);
  const p = rows[0];
  if (!p) return estadoSaliente('Trabajando: sin deals nuevos pendientes por escribir.');
  ultimoEnvio = Date.now();
  try {
    await enviar(gestor, cfg.saliente_linea, p.telefono, cfg.saliente_pregunta);
    await pool.query(`UPDATE public.batc_sesiones SET estado = 'PENDIENTE', enviado_en = NOW(), inicio = NOW() WHERE id = $1`, [p.id]);
    console.log(`[BOT-ATC] mensaje enviado al deal ${p.bitrix_id}`);
    await estadoSaliente(`Trabajando: último mensaje enviado al deal ${p.bitrix_id}.`);
  } catch (e) {
    await pool.query(`UPDATE public.batc_sesiones SET estado = 'ERROR', etapa_detalle = $2 WHERE id = $1`, [p.id, String(e.message).slice(0, 300)]);
    console.error(`[BOT-ATC] no se pudo escribir al deal ${p.bitrix_id}:`, e.message);
  }
}

function iniciar(manager) {
  if (manager) gestor = manager;
  if (timer) return;
  asegurarTablas().catch((e) => console.error('[BOT-ATC] tablas:', e.message));
  timer = setInterval(revisar, 10 * 1000);
  timer.unref?.();
  console.log('[BOT-ATC] activo (revisa cada 10 s)');
}

/**
 * Para el reparto de gestionables (NOVONET): ms que debe esperar antes de repartir
 * este deal porque el bot ATC aun esta preguntando. 0 = repartir ya.
 */
async function msEsperaReparto(bitrixId) {
  try {
    if (!(await hayLineasActivas())) return 0;
    const cfg = await leerConfig();
    if (!cfg.aplicar) return 0; // modo recomendar: el reparto no espera
    const { rows } = await pool.query(
      `SELECT telefono, bitrix_id, inicio FROM public.batc_sesiones
        WHERE estado = 'PENDIENTE' AND inicio > NOW() - INTERVAL '10 minutes'`);
    if (!rows.length) return 0;
    let s = rows.find((r) => String(r.bitrix_id) === String(bitrixId));
    if (!s) {
      const tel = await telefonoDelDeal(bitrixId);
      s = tel && rows.find((r) => r.telefono === tel);
    }
    if (!s) return 0;
    const restante = cfg.segundosN * 1000 - (Date.now() - new Date(s.inicio).getTime()) + 15 * 1000;
    return Math.max(5000, restante);
  } catch (e) {
    console.warn('[BOT-ATC] msEsperaReparto:', e.message);
    return 0;
  }
}

module.exports = {
  asegurarTablas, leerConfig, guardarConfig, DEFECTOS, lineaActiva, invalidarLineas, atenderSiAplica,
  iniciar, msEsperaReparto, etapasBitrix,
  _clasificarRapido: clasificarRapido, _normalizarTelefono: normalizarTelefono, // pruebas
};
