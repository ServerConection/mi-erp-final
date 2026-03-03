const express = require('express');
const router = express.Router();

const {
  getIndicadoresDashboard,
  getMonitoreoDiario,
  getReporte180
} = require('../controllers/indicadores.controller');

router.get('/dashboard', getIndicadoresDashboard);
router.get('/monitoreo-diario', getMonitoreoDiario);
router.get('/reporte180', getReporte180);

module.exports = router;