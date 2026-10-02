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
const { procesarCola } = require('../controllers/gestionablesWebhook.controller');

function initColaGestionables() {
  if (String(process.env.GESTIONABLES_COLA_WORKER || 'true').toLowerCase() === 'false') return null;
  return cron.schedule('* * * * *', () => {
    procesarCola().catch((err) => console.error('💥 [Gestionables] Cola:', err.message));
  }, { timezone: 'America/Guayaquil' });
}

module.exports = { initColaGestionables };
