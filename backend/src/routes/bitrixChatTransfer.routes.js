/**
 * Rutas de transferencia de chat de Canal Abierto cuando cambia el Responsable
 * del Trato/Lead en Bitrix24.
 * Montado SIN prefijo en app.js, igual que bitrixEvento.routes.js:
 *   - ANY /bitrix_chat_transfer.php → recepción (Bitrix dispara el webhook saliente,
 *     por eso router.all() en vez de solo GET/POST).
 */
const express = require('express');
const router  = express.Router();
const { handleDealResponsibleChanged } = require('../controllers/bitrixChatTransfer.controller');

router.all('/bitrix_chat_transfer.php', handleDealResponsibleChanged);

module.exports = router;
