// =============================================================================
// REPORTE JEFATURA - Rutas
// =============================================================================
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth');
const C = require('../controllers/reporteJefatura.controller');

router.use(verificarToken);

router.get('/novonet', C.getNovonet);
router.get('/velsa',   C.getVelsa);
router.get('/ambas',   C.getAmbas);

module.exports = router;
