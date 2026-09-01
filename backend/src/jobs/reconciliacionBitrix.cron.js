/**
 * Cron: red de seguridad de bitrix_webhook_leads.
 *
 * El webhook de etapas de Bitrix es "dispara y olvida": si la automatización
 * no corre (deal que ya pasó por esa etapa, negociación repetida, movimiento
 * por REST, backend dormido en ese instante...), el lead nunca entra a la
 * tabla y NADIE se entera. Este job vuelve a preguntarle a Bitrix y rellena
 * lo que falte, así el hueco se cierra solo en menos de una hora.
 *
 * Ventana corta y frecuente (últimos 3 días, cada hora) para no castigar el
 * rate limit de Bitrix. Para rellenar histórico viejo, usar el CLI:
 *   node scripts/reconciliar_bitrix_leads.js --desde=2026-01-01 --aplicar
 *
 * Se apaga con  RECONCILIACION_BITRIX=off  en el .env.
 */
const cron = require('node-cron');
const pool = require('../config/db');
const { reconciliarLeads } = require('../services/reconciliacionBitrix.service');

const DIAS_VENTANA = Number(process.env.RECONCILIACION_BITRIX_DIAS || 3);

// El ERP corre en varios procesos (server.js monolito, entries/workers.js, y
// posibles multi-instancia en Render). Un advisory lock de Postgres garantiza
// que solo UNO reconcilie a la vez: es idempotente igual, pero duplicar el
// trabajo quema el rate limit de Bitrix sin ganar nada.
const LOCK_ID = 771902;

const correr = async () => {
  const desde = new Date(Date.now() - DIAS_VENTANA * 864e5).toISOString().slice(0, 10);
  let lock;
  try {
    lock = await pool.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_ID]);
    if (!lock.rows[0].ok) return; // otro proceso ya lo está haciendo
  } catch (e) {
    console.error('💥 [reconciliacion] no se pudo tomar el lock:', e.message);
    return;
  }
  try {
    const r = await reconciliarLeads({ empresa: 'novonet', desde, aplicar: true, log: () => {} });
    if (r.escritos > 0 || r.errores > 0) {
      console.log(`🩹 [reconciliacion] deals=${r.deals} faltaban=${r.faltantes.length} desfasados=${r.desfasados.length} escritos=${r.escritos} errores=${r.errores}`);
      // Señal para investigar: si esto crece día a día, hay automatizaciones
      // rotas en Bitrix, no es solo ruido puntual.
      if (r.faltantes.length > 20) {
        console.warn(`⚠️  [reconciliacion] ${r.faltantes.length} leads faltaban en la tabla — revisar las automatizaciones de Bitrix.`);
      }
    }
  } catch (e) {
    console.error('💥 [reconciliacion] Error:', e.message);
  } finally {
    try { await pool.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]); } catch (_) {}
  }
};

function initReconciliacionBitrix() {
  if ((process.env.RECONCILIACION_BITRIX || 'on').toLowerCase() === 'off') {
    console.log('[reconciliacion] desactivada por RECONCILIACION_BITRIX=off');
    return;
  }
  // Al minuto 20 de cada hora, para no chocar con los otros jobs en punto.
  cron.schedule('20 * * * *', correr, { timezone: 'America/Guayaquil' });
  console.log(`[reconciliacion] activa — cada hora, ventana de ${DIAS_VENTANA} días`);
  setTimeout(correr, 30000); // una corrida a los 30 s de arrancar
}

module.exports = { initReconciliacionBitrix, correr };
