// src/services/botAtc.service.js
// ============================================================
// BOT ATC (piloto) — filtra en los primeros segundos de cada chat nuevo si el
// cliente quiere VENTAS o SERVICIO AL CLIENTE, para que los asesores de venta
// no reciban casos de ATC.
//
// Flujo en las lineas donde el administrador lo activa (modulo "Bot ATC"):
//   1. Llega el primer mensaje de un chat nuevo -> el bot pregunta
//      "1 ventas / 2 servicio al cliente" (sesion PENDIENTE).
//   2. Cliente responde (texto, numero, audio o imagen):
//        ATC    -> envia la plantilla con los canales de servicio al cliente y
//                  mueve el deal de Bitrix (NOVONET) a la etapa ATC configurada.
//        VENTAS -> se aparta: sigue el bot vendedor (si esta activo) o el asesor.
//   3. Si en N segundos (default 90) no se detecta -> NO_DETECTADO y, si esta
//      configurada, mueve el deal a esa etapa.
// Mientras la sesion esta PENDIENTE, el reparto de gestionables espera
// (msEsperaReparto) para no entregar el lead a un asesor antes de tiempo.
//
// Solo mueve deals de la categoria NOVONET creados en los ultimos 3 dias que
// sigan en una etapa "CONTACTO NUEVO". Nunca lanza errores hacia BaileysManager.
// ============================================================
'use strict';

const pool = require('../config/db');
const bot = require('./botVendedor.service');
const { bitrixCallNovonet } = require('./bitrix.service');

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
  pregunta: '¡Hola! 👋 Gracias por escribir a *NETLIFE*.\nPara atenderte mejor, responde con un número:\n\n*1* Quiero contratar internet (ventas)\n*2* Ya soy cliente (servicio al cliente)',
  repregunta: '¿Me confirmas por favor? Responde *1* si quieres contratar o *2* si ya eres cliente 🙏',
  plantilla: `Estimado cliente, este es un canal exclusivo de *ventas*. Para servicio al cliente comunícate por estos canales:\n\n${CANALES_DEFECTO}`,
  confirmacion_ventas: '¡Perfecto! 😊 En un momento un asesor de ventas te atiende.',
  segundos: '90',
  reinicio_horas: '24',
  etapa_atc: 'ATC/SOPORTE',
  etapa_no_detectado: '',
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

async function clasificarIA(texto) {
  const r = await bot._llamarConRespaldo([
    { role: 'system', content:
      'Clasificas el mensaje de un cliente que escribe a la linea de VENTAS de NETLIFE (internet de fibra en Ecuador). ' +
      'Antes se le pregunto si quiere contratar (1) o si ya es cliente (2). Responde SOLO una palabra:\n' +
      'VENTAS = quiere contratar, conocer planes, precios, cobertura o instalar un servicio nuevo.\n' +
      'ATC = ya es cliente y necesita soporte, facturacion, pagos de su servicio, fallas, reclamos, cambios, traslado o cancelacion.\n' +
      'NO_SE = no se puede saber (solo saludo, emoji, mensaje sin sentido).' },
    { role: 'user', content: String(texto).slice(0, 800) },
  ]);
  const m = /\b(VENTAS|ATC|NO_SE)\b/.exec(String(r.texto || '').toUpperCase());
  return m && m[1] !== 'NO_SE' ? m[1] : null;
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
    const desdeValida = actual && (normalizar(actual.nombre).startsWith('contacto nuevo') ||
      (cfg.etapa_no_detectado && mismoNombre(actual.nombre, cfg.etapa_no_detectado)));
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

async function resolver(sesion, tipo, metodo, respuesta, ctx) {
  const cfg = await leerConfig();
  const etapa = tipo === 'ATC' ? cfg.etapa_atc : (tipo === 'NO_DETECTADO' ? cfg.etapa_no_detectado : '');
  const { rowCount } = await pool.query(
    `UPDATE public.batc_sesiones SET estado = $2, metodo = $3, respuesta = $4, resuelto_en = NOW(),
            etapa_objetivo = NULLIF($5, ''), etapa_intentos = 0, etapa_estado = CASE WHEN NULLIF($5, '') IS NULL THEN NULL ELSE 'pendiente' END
      WHERE id = $1 AND estado IN ('PENDIENTE', 'NO_DETECTADO')`,
    [sesion.id, tipo, metodo, String(respuesta || '').slice(0, 500), etapa || '']);
  if (!rowCount) return;
  console.log(`[BOT-ATC] conv ${sesion.conversation_id}: ${tipo} (${metodo})`);
  if (tipo === 'ATC' && ctx) {
    await enviar(ctx.manager, ctx.lineId, ctx.remoteJid, cfg.plantilla);
    await pool.query('UPDATE public.batc_sesiones SET plantilla_en = NOW() WHERE id = $1', [sesion.id]);
  }
  if (etapa) moverEtapa(sesion.id).catch(() => {});
}

// Cola por conversacion (un mensaje a la vez).
const colas = new Map();
function enCola(clave, tarea) {
  const sig = (colas.get(clave) || Promise.resolve()).then(tarea).catch((e) => console.error('[BOT-ATC]', e.message));
  colas.set(clave, sig);
  sig.finally(() => { if (colas.get(clave) === sig) colas.delete(clave); });
}

async function atenderPendiente(sesion, ctx) {
  const { manager, lineId, msg, conv, remoteJid, text, msgType } = ctx;
  const { rows } = await pool.query('SELECT estado, repreguntado FROM public.batc_sesiones WHERE id = $1', [sesion.id]);
  if (!rows[0] || rows[0].estado !== 'PENDIENTE') {
    // Se resolvio mientras esperaba en la cola: si fue VENTAS, que siga el bot vendedor.
    if (rows[0]?.estado === 'VENTAS') await pasarAVentas(ctx, false);
    return;
  }
  const texto = await textoDelMensaje(manager, lineId, msg, text, msgType);
  let c = clasificarRapido(texto);
  if (!c && normalizar(texto).length >= 3) {
    try { const t = await clasificarIA(texto); if (t) c = { tipo: t, metodo: 'ia' }; }
    catch (e) { console.error('[BOT-ATC] IA no disponible:', e.message); }
  }
  if (!c) {
    if (!rows[0].repreguntado) {
      await pool.query('UPDATE public.batc_sesiones SET repreguntado = TRUE WHERE id = $1', [sesion.id]);
      await enviar(manager, lineId, remoteJid, (await leerConfig()).repregunta);
    }
    return;
  }
  await resolver(sesion, c.tipo, c.metodo, texto, ctx);
  if (c.tipo === 'VENTAS') await pasarAVentas(ctx, true);
  void conv;
}

// El chat es de ventas: responde el bot vendedor si la linea lo tiene; si no, confirma y espera al asesor.
async function pasarAVentas(ctx, confirmar) {
  let tomado = false;
  try { tomado = await require('./botVendedorWa.service').atenderSiAplica(ctx); } catch (_) { tomado = false; }
  if (!tomado && confirmar) await enviar(ctx.manager, ctx.lineId, ctx.remoteJid, (await leerConfig()).confirmacion_ventas);
}

/**
 * Llamado por BaileysManager antes del bot vendedor. Devuelve true si el bot ATC
 * se encarga del mensaje (el bot vendedor y el FlowEngine no deben correr).
 */
async function atenderSiAplica(ctx) {
  const { lineId, msg, conv, remoteJid, text } = ctx;
  try {
    if (!conv?.id || !remoteJid || remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) return false;
    if (!(await lineaActiva(lineId))) return false;
    const ts = Number(msg?.messageTimestamp || 0) * 1000;
    if (ts && Date.now() - ts > MAX_ANTIGUEDAD_MS) return false;
    const cfg = await leerConfig();

    const { rows } = await pool.query(
      `SELECT * FROM public.batc_sesiones WHERE conversation_id = $1 AND inicio > NOW() - ($2 || ' hours')::interval
        ORDER BY inicio DESC LIMIT 1`, [conv.id, String(cfg.reinicioN)]);
    const s = rows[0];

    if (s?.estado === 'PENDIENTE') { enCola(conv.id, () => atenderPendiente(s, ctx)); return true; }
    if (s?.estado === 'VENTAS') return false;
    if (s?.estado === 'ATC') {
      // Sigue escribiendo un cliente de ATC: se le recuerda la plantilla (1 vez cada 6 h).
      if (!s.plantilla_en || Date.now() - new Date(s.plantilla_en).getTime() > REENVIO_PLANTILLA_HORAS * 3600 * 1000) {
        enCola(conv.id, async () => {
          await enviar(ctx.manager, lineId, remoteJid, cfg.plantilla);
          await pool.query('UPDATE public.batc_sesiones SET plantilla_en = NOW() WHERE id = $1', [s.id]);
        });
      }
      return true;
    }
    if (s?.estado === 'NO_DETECTADO') {
      // Respuesta tardia: solo se actua si es claramente ATC y el asesor aun no escribio.
      const c = clasificarRapido(text);
      if (c?.tipo !== 'ATC' || Date.now() - new Date(s.resuelto_en).getTime() > TARDE_MIN * 60 * 1000) return false;
      const asesor = await pool.query(
        `SELECT 1 FROM messages WHERE conversation_id = $1 AND direction = 'out' AND timestamp > $2
            AND COALESCE(metadata->>'bot_atc', '') <> 'true' AND COALESCE(metadata->>'bot_vendedor', '') <> 'true' LIMIT 1`,
        [conv.id, s.resuelto_en]);
      if (asesor.rows.length) return false;
      enCola(conv.id, () => resolver(s, 'ATC', `${c.metodo}_tarde`, text, ctx));
      return true;
    }

    // Sin sesion: ¿es un chat nuevo? (sin mensajes previos en las ultimas N horas)
    const prev = await pool.query(
      `SELECT 1 FROM messages WHERE conversation_id = $1 AND (wa_msg_id IS DISTINCT FROM $2)
          AND timestamp > NOW() - ($3 || ' hours')::interval LIMIT 1`,
      [conv.id, msg?.key?.id || null, String(cfg.reinicioN)]);
    if (prev.rows.length) return false; // chat en curso: el piloto no interviene

    const ins = await pool.query(
      `INSERT INTO public.batc_sesiones (conversation_id, line_id, telefono) VALUES ($1, $2, $3) RETURNING *`,
      [conv.id, lineId, normalizarTelefono(conv.wa_number)]);
    const nueva = ins.rows[0];
    enCola(conv.id, async () => {
      const c = clasificarRapido(text);
      if (c?.tipo === 'ATC') return resolver(nueva, 'ATC', c.metodo, text, ctx); // lo dijo en el primer mensaje
      await enviar(ctx.manager, lineId, remoteJid, cfg.pregunta);
    });
    return true;
  } catch (e) {
    console.error(`[BOT-ATC] linea ${lineId}:`, e.message);
    return false;
  }
}

// ─── Timer: vencimiento de 90 s y reintentos de etapa ─────────────────────────
let timer = null; let ocupado = false; let ultimoReintento = 0;
async function revisar() {
  if (ocupado) return; ocupado = true;
  try {
    const cfg = await leerConfig();
    const { rows } = await pool.query(
      `SELECT * FROM public.batc_sesiones WHERE estado = 'PENDIENTE' AND inicio < NOW() - ($1 || ' seconds')::interval
        ORDER BY inicio LIMIT 50`, [String(cfg.segundosN)]);
    for (const s of rows) await resolver(s, 'NO_DETECTADO', 'tiempo', null, null);
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
function iniciar() {
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
