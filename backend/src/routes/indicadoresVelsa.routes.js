const express = require('express');
const router = express.Router();

const {
  getIndicadoresDashboardVelsa,
  getMonitoreoDiarioVelsa,
  getReporte180Velsa,
  getConsultaDescargaVelsa,
  getDebugFechasVelsa,
} = require('../controllers/indicadoresVelsa.controller');

router.get('/dashboard', getIndicadoresDashboardVelsa);
router.get('/monitoreo-diario', getMonitoreoDiarioVelsa);
router.get('/reporte180', getReporte180Velsa);
router.get('/consulta-descarga', getConsultaDescargaVelsa);
router.get('/debug-fechas', getDebugFechasVelsa);

module.exports = router;