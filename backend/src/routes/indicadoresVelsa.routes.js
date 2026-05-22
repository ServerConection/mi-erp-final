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
} = require('../controllers/indicadoresVelsaMaterialized.controller');

router.get('/dashboard', getIndicadoresDashboardVelsa);
router.get('/monitoreo-diario', getMonitoreoDiarioVelsa);
router.get('/reporte180', getReporte180Velsa);
router.get('/consulta-descarga', getConsultaDescargaVelsa);
router.get('/status-mv', getStatusMaterializedView);
router.get('/detalle-crm-data', getDetalleCRMData);
router.get('/activas', getActivasVelsa);
router.get('/backlog', getBacklogVelsa);
router.get('/activaciones-dia', getActivacionesPorDiaVelsa);

module.exports = router;