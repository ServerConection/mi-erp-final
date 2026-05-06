const express   = require('express');
const router    = express.Router();
const { verificarToken } = require('../middleware/auth');
const {
  triggerSync,
  getSyncStatus,
  getResumenVelsaBitrix,
  getTablaBitrix,
} = require('../controllers/bitrix.controller');

// Sync manual
router.post('/sync',         verificarToken, triggerSync);
router.get('/sync/status',   verificarToken, getSyncStatus);

// Dashboard CRM VELSA (KPIs + gráficos)
router.get('/velsa',         verificarToken, getResumenVelsaBitrix);

// Tabla consumible completa (deals cruzados con catálogos + campos custom)
router.get('/velsa/tabla',   verificarToken, getTablaBitrix);

module.exports = router;
