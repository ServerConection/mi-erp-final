const express = require('express');
const router  = express.Router();
const {
  triggerSync,
  getSyncStatus,
  getResumenVelsaBitrix,
  getTablaBitrix,
  getLiveActividad,
} = require('../controllers/bitrix.controller');

const { verificarToken } = require('../middleware/auth');

// Sync manual — sí requiere auth (acción que modifica datos)
router.post('/sync',        verificarToken, triggerSync);
router.get('/sync/status',  verificarToken, getSyncStatus);

// Consultas de solo lectura — sin verificarToken igual que indicadoresVelsa.routes.js
router.get('/velsa',        getResumenVelsaBitrix);
router.get('/velsa/tabla',  getTablaBitrix);
router.get('/live-actividad', getLiveActividad);

module.exports = router;
