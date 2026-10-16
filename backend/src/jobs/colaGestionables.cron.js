/**
 * Cron: cada minuto entrega los leads que esperan en la "estación"
 * (Bryan Pineda) del reparto de gestionables — ver
 * controllers/gestionablesWebhook.controller.js → procesarCola().
 *
 * procesarCola() ya se cuida sola: no hace nada fuera de horario
 * (22:16–07:59), con el reparto apagado o si la cola está vacía, y usa un
 * candado de Postgres para que dos instancias no entreguen el mismo lead.
 */
const cron = require('node-cron');
const { procesarCola, sincronizarManuales } = require('../controllers/gestionablesWebhook.controller');

function initColaGestionables() {
  if (String(process.env.GESTIONABLES_COLA_WORKER || 'true').toLowerCase() === 'false') return null;
  // Cada 5 min: registra los leads que un humano asignó a mano en Bitrix
  // (cuentan en el cupo del asesor junto con los del bot).
  cron.schedule('*/5 * * * *', () => {
    // Novonet y Velsa por separado (cada una no hace nada si está apagada)
    for (const empresa of ['novonet', 'velsa']) {
      sincronizarManuales(empresa).catch((err) => console.error(`💥 [Gestionables ${empresa}] Manuales:`, err.message));
    }
  }, { timezone: 'America/Guayaquil' });

  return cron.schedule('* * * * *', () => {
    for (const empresa of ['novonet', 'velsa']) {
      procesarCola(empresa).catch((err) => console.error(`💥 [Gestionables ${empresa}] Cola:`, err.message));
    }
  }, { timezone: 'America/Guayaquil' });
}

module.exports = { initColaGestionables };
