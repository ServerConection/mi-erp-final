const express = require('express');
const router = express.Router();
const {
  getCanalesDisponibles,
  getMonitoreoRedesVelsa,
  getTendenciaDiaria,
  getInversion,
  upsertInversion,
  getMonitoreoCiudad,
  getMonitoreoHora,
  getMonitoreoAtc,
  getReporteData,
} = require('../controllers/redesVelsa.controller');
const { verificarToken, noAsesor } = require('../middleware/auth');

router.use(verificarToken);

router.get('/canales', getCanalesDisponibles);
router.get('/monitoreo', getMonitoreoRedesVelsa);
router.get('/tendencia', getTendenciaDiaria);
router.get('/inversion', getInversion);
router.post('/inversion', noAsesor, upsertInversion);
router.get('/monitoreo-ciudad', getMonitoreoCiudad);
router.get('/monitoreo-hora', getMonitoreoHora);
router.get('/monitoreo-atc', getMonitoreoAtc);
router.get('/reporte', getReporteData);

module.exports = router;
