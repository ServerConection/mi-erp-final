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
  getReporteDataMensual,
  getAgenciasCanal,
  upsertAgenciaCanal,
  getResumenPorAgencia,
  getAsesoresVsPauta,
  getGraficosRedesVelsa,
  getMetasVelsa,
  upsertMetasVelsa,
} = require('../controllers/redesVelsaWebhook.controller');
const { verificarToken, noAsesor } = require('../middleware/auth');
const { forceSyncInversionVelsa } = require('../controllers/redesWintracker.controller');

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
// Reporte Data mensual — mismo contrato que /api/redes/reporte-data de NOVONET,
// para que la pantalla sea literalmente la misma con otra URL base.
router.get('/reporte-data', getReporteDataMensual);
router.get('/agencias', getAgenciasCanal);
router.post('/agencias', noAsesor, upsertAgenciaCanal);
router.get('/resumen-agencias', getResumenPorAgencia);
router.get('/asesores-vs-pauta', getAsesoresVsPauta);
router.get('/graficos', getGraficosRedesVelsa);
router.get('/metas', getMetasVelsa);
router.post('/metas', noAsesor, upsertMetasVelsa);
router.post('/sync-inversion', noAsesor, forceSyncInversionVelsa);

module.exports = router;
