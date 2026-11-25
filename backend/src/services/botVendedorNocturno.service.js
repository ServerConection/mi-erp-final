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
const poolErp = require('../config/dbErp');
const { bitrixCallNovonet } = require('./bitrix.service');
const bot = require('./botVendedor.service');

// Linea por defecto desde la que escribe el bot (si no se elige otra en el modulo).
const TELEFONO_LINEA_DEFECTO = process.env.BOT_NOCTURNO_TELEFONO || '593962517928';
const CATEGORIA_NOVONET = String(process.env.RECONCILIACION_BITRIX_CATEGORIA || '19');

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
  let linea = cfg.nocturno_linea;
  if (!linea) {
    const sufijo = TELEFONO_LINEA_DEFECTO.slice(-9);
    const r = await pool.query(
      `SELECT id::text AS id FROM lines WHERE regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') LIKE $1 LIMIT 1`,
      ['%' + sufijo]).catch(() => ({ rows: [] }));
    linea = r.rows[0]?.id || '';
  }
  return {
    activo: cfg.nocturno_activo === 'true',
    linea,
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
let ultimoEstado = { msg: '', en: 0 };

// Guarda en bv_config el resultado del ultimo chequeo, para verlo en el modulo
// (el modulo corre en otro proceso). Solo escribe si cambia o cada 5 minutos.
async function estado(msg) {
  if (msg === ultimoEstado.msg && Date.now() - ultimoEstado.en < 5 * 60 * 1000) return;
  ultimoEstado = { msg, en: Date.now() };
  await pool.query(
    `INSERT INTO public.bv_config (clave, valor, actualizado_por, actualizado_en) VALUES ('nocturno_estado', $1, 'wabot', NOW())
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_por = 'wabot', actualizado_en = NOW()`,
    [msg]).catch(() => {});
}

async function tick() {
  if (ocupado || !manager) return;
  ocupado = true;
  try {
    const cfg = await leerConfig();
    if (!cfg.activo) return estado('Apagado: la atencion nocturna no esta activa.');
    if (!cfg.linea) return estado(`No se encontro la linea ${TELEFONO_LINEA_DEFECTO} en WABOT: elegila en el modulo.`);
    if (!bot.enHorario(cfg.inicio, cfg.fin)) return estado(`En espera: fuera del horario ${cfg.inicio} a ${cfg.fin}.`);
    // Solo trabaja el proceso que tiene la linea conectada (evita envios dobles).
    if (manager.getStatus(cfg.linea) !== 'connected') return estado(`La linea elegida no esta conectada en WABOT (estado: ${manager.getStatus(cfg.linea)}).`);

    // 1) Deals nuevos de NOVONET: los que el bot de gestionables recibio en "Contacto nuevo"
    //    (estacion/cola fuera de horario + log del webhook) y, de respaldo, bitrix_webhook_leads.
    const candidatos = new Map(); // bitrix_id -> { creado, phone }
    try {
      const erp = await poolErp.query(
        `SELECT bitrix_id, MIN(creado_en) AS creado FROM (
           SELECT bitrix_deal_id::text AS bitrix_id, creado_en FROM gestionables_cola
            WHERE creado_en > NOW() - ($1 || ' minutes')::interval
           UNION ALL
           SELECT bitrix_id::text, creado_en FROM gestionables_webhook_log
            WHERE creado_en > NOW() - ($1 || ' minutes')::interval AND bitrix_id ~ '^[0-9]+$'
         ) x GROUP BY bitrix_id`,
        [String(VENTANA_DEAL_MIN)]);
      for (const r of erp.rows) candidatos.set(String(r.bitrix_id), { creado: r.creado, phone: null });
    } catch (e) {
      console.error('[BOT-NOCTURNO] no se pudo leer gestionables:', e.message);
    }
    const bwl = await pool.query(
      `SELECT bitrix_id::text AS bitrix_id, phone, created_at FROM bitrix_webhook_leads
        WHERE empresa = 'novonet' AND created_at > NOW() - ($1 || ' minutes')::interval`,
      [String(VENTANA_DEAL_MIN)]).catch(() => ({ rows: [] }));
    for (const r of bwl.rows) {
      const c = candidatos.get(r.bitrix_id);
      if (c) c.phone = c.phone || r.phone;
      else candidatos.set(r.bitrix_id, { creado: r.created_at, phone: r.phone });
    }
    const ids = [...candidatos.keys()];
    const ya = ids.length
      ? (await pool.query('SELECT bitrix_id FROM public.bv_nocturno WHERE bitrix_id = ANY($1)', [ids])).rows.map((r) => r.bitrix_id)
      : [];
    let registrados = 0;
    for (const id of ids.filter((x) => !ya.includes(x)).slice(0, 20)) {
      const c = candidatos.get(id);
      if (!bot.enHorario(cfg.inicio, cfg.fin, new Date(c.creado))) continue; // entro fuera del horario nocturno
      let phone = c.phone;
      let detalle = null;
      try {
        const deal = (await bitrixCallNovonet('crm.deal.get', { id })).result;
        if (!deal) continue;
        if (String(deal.CATEGORY_ID) !== CATEGORIA_NOVONET) continue; // no es del pipeline NOVONET
        if (!phone && deal.CONTACT_ID && deal.CONTACT_ID !== '0') {
          const ct = (await bitrixCallNovonet('crm.contact.get', { id: deal.CONTACT_ID })).result;
          phone = ct?.PHONE?.[0]?.VALUE || '';
        }
      } catch (e) {
        detalle = `Bitrix: ${String(e.message).slice(0, 150)}`;
      }
      const telefono = normalizarTelefono(phone);
      await pool.query(
        `INSERT INTO public.bv_nocturno (bitrix_id, telefono, grupo, line_id, estado, detalle, deal_creado)
         VALUES ($1, $2, 'BOT', $3, $4, $5, $6) ON CONFLICT (bitrix_id) DO NOTHING`,
        [id, telefono, cfg.linea, telefono ? 'pendiente' : 'error',
          telefono ? null : (detalle || `Sin telefono valido: ${phone || 'vacio'}`), c.creado]);
      registrados++;
    }
    if (registrados) console.log(`[BOT-NOCTURNO] ${registrados} deal(s) nuevo(s) registrados`);

    // 2) Tope por noche.
    const enviadosNoche = await pool.query(
      `SELECT COUNT(*)::int n FROM public.bv_nocturno WHERE estado = 'enviado' AND enviado_en > NOW() - INTERVAL '12 hours'`);
    if (enviadosNoche.rows[0].n >= cfg.max) return estado(`Tope alcanzado: ${cfg.max} saludos esta noche.`);

    // 3) Enviar UN saludo por minuto (el mas antiguo pendiente, de hasta 2 horas).
    const pend = await pool.query(
      `UPDATE public.bv_nocturno SET estado = 'enviando'
        WHERE bitrix_id = (
          SELECT bitrix_id FROM public.bv_nocturno
           WHERE estado = 'pendiente' AND grupo = 'BOT' AND creado_en > NOW() - INTERVAL '2 hours'
           ORDER BY creado_en LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING bitrix_id, telefono`);
    const p = pend.rows[0];
    if (!p) return estado(`Trabajando: sin deals pendientes por saludar (revisado ${ids.length} candidato(s)).`);
    try {
      const enviado = await manager.sendText(cfg.linea, p.telefono, cfg.mensaje);
      if (enviado?.key?.id) {
        await pool.query(
          `UPDATE messages SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"bot_vendedor": true, "nocturno": true}'::jsonb WHERE wa_msg_id = $1`,
          [enviado.key.id]).catch(() => {});
      }
      await pool.query(`UPDATE public.bv_nocturno SET estado = 'enviado', enviado_en = NOW() WHERE bitrix_id = $1`, [p.bitrix_id]);
      console.log(`[BOT-NOCTURNO] saludo enviado al deal ${p.bitrix_id}`);
      await estado(`Trabajando: ultimo saludo enviado al deal ${p.bitrix_id}.`);
    } catch (e) {
      await pool.query(`UPDATE public.bv_nocturno SET estado = 'error', detalle = $2 WHERE bitrix_id = $1`,
        [p.bitrix_id, String(e.message).slice(0, 300)]);
      console.error(`[BOT-NOCTURNO] no se pudo escribir al deal ${p.bitrix_id}:`, e.message);
    }
  } catch (e) {
    console.error('[BOT-NOCTURNO]', e.message);
    await estado(`Error: ${String(e.message).slice(0, 200)}`);
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

// ¿Esta linea es la del bot nocturno y estamos en su horario? (cache 30 s)
let cacheCfg = { cfg: null, en: 0 };
async function lineaNocturnaActiva(lineId) {
  if (!cacheCfg.cfg || Date.now() - cacheCfg.en > 30 * 1000) {
    try { cacheCfg = { cfg: await leerConfig(), en: Date.now() }; } catch (_) { return false; }
  }
  const c = cacheCfg.cfg;
  return !!(c && c.activo && c.linea && String(c.linea) === String(lineId) && bot.enHorario(c.inicio, c.fin));
}

module.exports = { iniciar, leerConfig, normalizarTelefono, lineaNocturnaActiva, DEFECTOS };
