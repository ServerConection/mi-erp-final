/**
 * Rutas de instalación/eventos de la app local "Chat Transfer Bot".
 * Montado SIN prefijo en app.js, igual que bitrixEvento.routes.js:
 *   - ANY /bitrix_chat_transfer_install.php
 *   - ANY /bitrix_chat_transfer_events.php
 */
const express = require('express');
const router  = express.Router();
const { install, events } = require('../controllers/bitrixChatTransferInstall.controller');

router.all('/bitrix_chat_transfer_install.php', install);
router.all('/bitrix_chat_transfer_events.php', events);

module.exports = router;
