// src/services/botVendedorNocturno.service.js
// ============================================================
// ATENCION NOCTURNA — el bot le escribe primero a los deals nuevos de NOVONET.
//
// Cada minuto (solo en el proceso que tiene WABOT):
//   1. Si la atencion nocturna esta activa y estamos en su horario (ej. 22:30-07:00),
//      busca deals de NOVONET creados en los ultimos 20 min en bitrix_webhook_leads.
//   2. Registra cada deal en bv_nocturno (una sola vez por deal). Al dia siguiente el
//      repartidor tambien se lo asigna a un asesor: se mide quien cierra primero
//      (bot = cliente confirma con el bot; asesor = venta registrada en envios_ventas).
//   3. A UN deal por minuto le envia el saludo desde la linea elegida
//      (ritmo lento a proposito, para cuidar la linea de bloqueos).
//   4. Las respuestas del cliente las atiende el bot (la linea debe tener el bot
//      activo con el mismo horario). A la hora fin, el bot se calla y sigue el asesor.
//
// Configuracion en bv_config (claves nocturno_*), editable desde el modulo.
// Nunca tumba el proceso: los errores solo se registran.
// ============================================================
'use strict';

const pool = require('../config/db');
const bot = require('./botVendedor.service');

const INTERVALO_MS = 60 * 1000;
const VENTANA_DEAL_MIN = 20;

const MENSAJE_DEFECTO =
  '¡Hola! 👋 Soy tu asesor de ventas de NETLIFE. Vi que nos dejaste tus datos para el servicio de internet de fibra óptica. ' +
  '¿Buscas contratar un plan nuevo o necesitas ayuda de servicio al cliente?';

const DEFECTOS = {
  nocturno_activo: 'false',
  nocturno_linea: '',
  nocturno_inicio: '20:30',
  nocturno_fin: '07:30',
  nocturno_max: '80',
  nocturno_mensaje: MENSAJE_DEFECTO,
};

async function leerConfig() {
  await bot.asegurarTablas();
  const { rows } = await pool.query("SELECT clave, valor FROM public.bv_config WHERE clave LIKE 'nocturno_%'");
  const cfg = { ...DEFECTOS };
  for (const r of rows) cfg[r.clave] = r.valor;
  return {
    activo: cfg.nocturno_activo === 'true',
    linea: cfg.nocturno_linea,
    inicio: cfg.nocturno_inicio,
    fin: cfg.nocturno_fin,
    max: Math.max(1, parseInt(cfg.nocturno_max, 10) || 80),
    mensaje: cfg.nocturno_mensaje || MENSAJE_DEFECTO,
  };
}

// Telefono de Ecuador a formato internacional (593XXXXXXXXX).
function normalizarTelefono(valor) {
  let d = String(valor || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = '593' + d.slice(1);
  else if (d.length === 9 && d.startsWith('9')) d = '593' + d;
  return /^593\d{9}$/.test(d) ? d : null;
}

let manager = null;
let ocupado = false;

async function tick() {
  if (ocupado || !manager) return;
  ocupado = true;
  try {
    const cfg = await leerConfig();
    if (!cfg.activo || !cfg.linea) return;
    if (!bot.enHorario(cfg.inicio, cfg.fin)) return;
    // Solo trabaja el proceso que tiene la linea conectada (evita envios dobles).
    if (manager.getStatus(cfg.linea) !== 'connected') return;

    // 1) Registrar deals nuevos. ON CONFLICT: un deal se registra una sola vez.
    const nuevos = await pool.query(
      `SELECT l.bitrix_id::text AS bitrix_id, l.phone, l.created_at
         FROM bitrix_webhook_leads l
        WHERE l.empresa = 'novonet'
          AND l.created_at > NOW() - ($1 || ' minutes')::interval
          AND NOT EXISTS (SELECT 1 FROM public.bv_nocturno n WHERE n.bitrix_id = l.bitrix_id::text)
        ORDER BY l.created_at
        LIMIT 50`,
      [String(VENTANA_DEAL_MIN)]);
    for (const d of nuevos.rows) {
      if (!bot.enHorario(cfg.inicio, cfg.fin, new Date(d.created_at))) continue; // creado fuera del horario
      const telefono = normalizarTelefono(d.phone);
      const grupo = 'BOT';
      await pool.query(
        `INSERT INTO public.bv_nocturno (bitrix_id, telefono, grupo, line_id, estado, detalle, deal_creado)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (bitrix_id) DO NOTHING`,
        [d.bitrix_id, telefono, grupo, cfg.linea,
          telefono ? 'pendiente' : 'error',
          telefono ? null : `Telefono invalido: ${d.phone || 'vacio'}`, d.created_at]);
    }

    // 2) Tope por noche.
    const enviadosNoche = await pool.query(
      `SELECT COUNT(*)::int n FROM public.bv_nocturno WHERE estado = 'enviado' AND enviado_en > NOW() - INTERVAL '12 hours'`);
    if (enviadosNoche.rows[0].n >= cfg.max) return;

    // 3) Enviar UN saludo por minuto (el mas antiguo pendiente, de hasta 2 horas).
    const pend = await pool.query(
      `UPDATE public.bv_nocturno SET estado = 'enviando'
        WHERE bitrix_id = (
          SELECT bitrix_id FROM public.bv_nocturno
           WHERE estado = 'pendiente' AND grupo = 'BOT' AND creado_en > NOW() - INTERVAL '2 hours'
           ORDER BY creado_en LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING bitrix_id, telefono`);
    const p = pend.rows[0];
    if (!p) return;
    try {
      const enviado = await manager.sendText(cfg.linea, p.telefono, cfg.mensaje);
      if (enviado?.key?.id) {
        await pool.query(
          `UPDATE messages SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"bot_vendedor": true, "nocturno": true}'::jsonb WHERE wa_msg_id = $1`,
          [enviado.key.id]).catch(() => {});
      }
      await pool.query(`UPDATE public.bv_nocturno SET estado = 'enviado', enviado_en = NOW() WHERE bitrix_id = $1`, [p.bitrix_id]);
      console.log(`[BOT-NOCTURNO] saludo enviado al deal ${p.bitrix_id}`);
    } catch (e) {
      await pool.query(`UPDATE public.bv_nocturno SET estado = 'error', detalle = $2 WHERE bitrix_id = $1`,
        [p.bitrix_id, String(e.message).slice(0, 300)]);
      console.error(`[BOT-NOCTURNO] no se pudo escribir al deal ${p.bitrix_id}:`, e.message);
    }
  } catch (e) {
    console.error('[BOT-NOCTURNO]', e.message);
  } finally {
    ocupado = false;
  }
}

function iniciar(baileysManager) {
  if (manager) return;
  manager = baileysManager;
  const t = setInterval(tick, INTERVALO_MS);
  if (t.unref) t.unref();
  console.log('[BOT-NOCTURNO] servicio iniciado (revisa cada minuto)');
}

module.exports = { iniciar, leerConfig, normalizarTelefono, DEFECTOS };
