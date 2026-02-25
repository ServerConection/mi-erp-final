const express = require('express');
const router = express.Router();

const {
  getIndicadoresDashboard,
  getMonitoreoDiario
} = require('../controllers/indicadores.controller');

router.get('/dashboard', getIndicadoresDashboard);
router.get('/monitoreo-diario', getMonitoreoDiario);

module.exports = router;