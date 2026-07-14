/**
 * Rutas del webhook de "gestionables permitidos" (Bitrix24 NOVONET).
 * Montado SIN prefijo en app.js, igual que bitrixWebhook.routes.js:
 *   - ANY /bitrix_webhook_gestionables.php  → recepción (Bitrix dispara por POST,
 *     aunque los datos vayan por query string; por eso router.all()).
 */

const express = require('express');
const router  = express.Router();
const { recibirGestionable } = require('../controllers/gestionablesWebhook.controller');

router.all('/bitrix_webhook_gestionables.php', recibirGestionable);

module.exports = router;
