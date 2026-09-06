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
const {
  getEfectividadDiariaVelsa,
  getAgenciasEfectividadVelsa,
} = require('../controllers/efectividadDiaria.controller');
const { verificarToken } = require('../middleware/auth');

// /dashboard requiere sesión: alimenta la Vista Asesor Velsa y debe saber
// QUIÉN pide los datos para forzar el filtro a su propio nombre cuando el
// perfil es ASESOR (ver getIndicadoresDashboardVelsa).
// SEGURIDAD (2026-09): todos estos endpoints devuelven datos comerciales y de
// clientes de Velsa y estaban PUBLICOS: solo /dashboard exigia token. Con la
// URL cualquiera bajaba /consulta-descarga o disparaba /force-refresh contra la
// vista materializada. El CORS no protege esto (solo aplica a navegadores).
// Se exige token para TODO el router; el frontend ya manda el Bearer en cada
// fetch (ver frontend/src/utils/sesion.js).
router.use(verificarToken);

router.get('/dashboard', getIndicadoresDashboardVelsa);
router.get('/monitoreo-diario', getMonitoreoDiarioVelsa);
router.get('/reporte180', getReporte180Velsa);
router.get('/consulta-descarga', getConsultaDescargaVelsa);
router.get('/status-mv', getStatusMaterializedView);
router.get('/detalle-crm-data', getDetalleCRMData);
router.get('/activas', getActivasVelsa);
router.get('/backlog', getBacklogVelsa);
router.get('/activaciones-dia', getActivacionesPorDiaVelsa);
router.post('/force-refresh', forceRefreshVelsa);

// EFECTIVIDAD DIARIA — mismo módulo que Novonet, apuntando al catálogo de
// agencias de Velsa (velsa_lineas_canal).
router.get('/efectividad-diaria', getEfectividadDiariaVelsa);
router.get('/efectividad-diaria/agencias', getAgenciasEfectividadVelsa);

module.exports = router;