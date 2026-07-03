/**
 * Rutas del webhook receptor de Bitrix24.
 * Este router se monta SIN prefijo en app.js (app.use(bitrixWebhookRoutes)),
 * por eso las rutas llevan la ruta completa aquí mismo:
 *   - GET /bitrix_webhook.php            → recepción del webhook (compatibilidad
 *                                           exacta con la URL vieja de reportingvidika.online,
 *                                           solo cambia el dominio en la automatización de Bitrix)
 *   - GET /api/bitrix-webhook/leads      → consulta de lo recibido (requiere sesión del ERP)
 */

const express = require('express');
const router  = express.Router();
const { recibirLead, listarLeads, historialLead } = require('../controllers/bitrixWebhook.controller');
const { verificarToken } = require('../middleware/auth');

// Recepción del webhook — público (protegido por ?token=... contra el .env)
// Mismo endpoint para las 53 etapas; solo cambia &etapa=... en cada automatización.
router.get('/bitrix_webhook.php', recibirLead);

// Consulta interna: estado actual (?etapa=slug opcional para filtrar) — requiere sesión del ERP
router.get('/api/bitrix-webhook/leads', verificarToken, listarLeads);

// Consulta interna: recorrido completo de un lead por sus etapas — requiere sesión del ERP
router.get('/api/bitrix-webhook/historial', verificarToken, historialLead);

module.exports = router;
