const express = require('express');
const router = express.Router();

const {
  getIndicadoresDashboard,
  getMonitoreoDiario,
  getReporte180,
  getConsultaDescargaNovonet
} = require('../controllers/indicadores.controller');

router.get('/dashboard', getIndicadoresDashboard);
router.get('/monitoreo-diario', getMonitoreoDiario);
router.get('/reporte180', getReporte180);
router.get('/consulta-descarga', getConsultaDescargaNovonet);

module.exports = router;