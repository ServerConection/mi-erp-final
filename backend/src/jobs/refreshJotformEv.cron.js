// ============================================================================
// JOB: refresco "al instante" de las MVs *_ev (ventas de envios_ventas)
// ============================================================================
// Desde el 2026-10-02 mestra_bitrix / vista_analisis_novonet /
// vw_jotform_velsa_netlife_completo son VISTAS sobre MVs *_ev que leen de
// envios_ventas. Si nadie llama refresh_jotform_ev(), los indicadores
// (Reporte D-1, backoffice, etc.) no ven las ventas nuevas.
//
// Cómo funciona:
//   1. Un trigger en envios_ventas hace pg_notify('envios_ventas_cambio')
//      en cada INSERT/UPDATE/DELETE (ver migrations/trigger_notify_envios_ventas.sql).
//   2. Este job escucha (LISTEN) y, con un debounce corto, ejecuta
//      refresh_jotform_ev() y luego refresca mv_indicadores_velsa_completo.
//   3. Respaldo: refresco cada 5 min por si se pierde una notificación.
//
// Apagar: JOTFORM_EV_AUTOREFRESH=off en .env y reiniciar el worker.
// ============================================================================
const cron = require('node-cron');
const pool = require('../config/db');

const AUTO        = String(process.env.JOTFORM_EV_AUTOREFRESH || 'on').toLowerCase() !== 'off';
const DEBOUNCE_MS = Number(process.env.JOTFORM_EV_DEBOUNCE_MS || 5000);
const CRON_EXPR   = process.env.JOTFORM_EV_REFRESH_CRON || '*/5 * * * *';
const CANAL       = 'envios_ventas_cambio';

let corriendo = false;
let pendiente = false;
let timer     = null;
let listener  = null;

const refrescar = async (motivo) => {
  if (corriendo) { pendiente = true; return; }
  corriendo = true;
  const t0 = Date.now();
  const client = await pool.connect();
  try {
    await client.query('SET statement_timeout = 0');
    await client.query('SELECT public.refresh_jotform_ev()');
    // Velsa: la MV de indicadores lee de las vistas anteriores.
    try {
      await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_indicadores_velsa_completo');
    } catch (e) {
      console.warn('[JOTFORM-EV] MV Velsa no refrescada:', e.message);
    }
    console.log(`[JOTFORM-EV] OK (${motivo}) en ${Date.now() - t0}ms`);
  } catch (e) {
    console.error('[JOTFORM-EV] Error al refrescar:', e.message);
  } finally {
    client.release();
    corriendo = false;
    if (pendiente) { pendiente = false; programar('cambio durante refresco'); }
  }
};

const programar = (motivo) => {
  clearTimeout(timer);
  timer = setTimeout(() => refrescar(motivo), DEBOUNCE_MS);
};

const escuchar = async () => {
  try {
    listener = await pool.connect();
    await listener.query('SET statement_timeout = 0');
    await listener.query(`LISTEN ${CANAL}`);
    listener.on('notification', () => programar('envios_ventas cambió'));
    listener.on('error', (e) => {
      console.error('[JOTFORM-EV] Listener caído:', e.message);
      try { listener.release(true); } catch (_) {}
      listener = null;
      setTimeout(escuchar, 10000);
    });
    console.log(`[JOTFORM-EV] Escuchando ${CANAL}`);
  } catch (e) {
    console.error('[JOTFORM-EV] No se pudo escuchar:', e.message);
    setTimeout(escuchar, 10000);
  }
};

const initJotformEvRefresh = () => {
  if (!AUTO) { console.log('[JOTFORM-EV] Apagado (JOTFORM_EV_AUTOREFRESH=off)'); return; }
  escuchar();
  cron.schedule(CRON_EXPR, () => refrescar('respaldo cron'));
  refrescar('arranque');
};

module.exports = { initJotformEvRefresh, refrescar };
