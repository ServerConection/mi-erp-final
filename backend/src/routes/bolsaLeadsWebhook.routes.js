/**
 * Webhook de Bolsa Leads (Bitrix24 NOVONET, pipeline "Bolsa Leads").
 * Montado SIN prefijo en app.js:
 *   ANY /bitrix_webhook_bolsa_leads.php?token=...&id={{ID}}
 */
const router = require('express').Router();
const { recibirBolsaLead } = require('../controllers/bolsaLeads.controller');

router.all('/bitrix_webhook_bolsa_leads.php', recibirBolsaLead);

module.exports = router;
