const express = require('express');
const router = express.Router();

const {
  getIndicadoresDashboardVelsa,
  getMonitoreoDiarioVelsa,
  getReporte180Velsa,
  getConsultaDescargaVelsa,
  getStatusMaterializedView,
  getDetalleCRMData,
  getActivasVelsa,
  getBacklogVelsa,
  getActivacionesPorDiaVelsa,
  forceRefreshVelsa,
} = require('../controllers/indicadoresVelsaMaterialized.controller');
const { verificarToken } = require('../middleware/auth');

// /dashboard requiere sesión: alimenta la Vista Asesor Velsa y debe saber
// QUIÉN pide los datos para forzar el filtro a su propio nombre cuando el
// perfil es ASESOR (ver getIndicadoresDashboardVelsa).
router.get('/dashboard', verificarToken, getIndicadoresDashboardVelsa);
router.get('/monitoreo-diario', getMonitoreoDiarioVelsa);
router.get('/reporte180', getReporte180Velsa);
router.get('/consulta-descarga', getConsultaDescargaVelsa);
router.get('/status-mv', getStatusMaterializedView);
router.get('/detalle-crm-data', getDetalleCRMData);
router.get('/activas', getActivasVelsa);
router.get('/backlog', getBacklogVelsa);
router.get('/activaciones-dia', getActivacionesPorDiaVelsa);
router.post('/force-refresh', forceRefreshVelsa);

module.exports = router;