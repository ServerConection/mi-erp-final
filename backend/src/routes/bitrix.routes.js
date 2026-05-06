const express   = require('express');
const router    = express.Router();
const { verificarToken } = require('../middlewares/auth.middleware');
const { triggerSync, getSyncStatus, getResumenVelsaBitrix } = require('../controllers/bitrix.controller');

// Sync manual (requiere auth)
router.post('/sync',        verificarToken, triggerSync);
router.get('/sync/status',  verificarToken, getSyncStatus);

// Dashboard CRM VELSA
router.get('/velsa',        verificarToken, getResumenVelsaBitrix);

module.exports = router;
