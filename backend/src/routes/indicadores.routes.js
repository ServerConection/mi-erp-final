const express = require('express');
const router = express.Router();

const {
  getIndicadoresDashboard,
  getMonitoreoDiario,
  getReporte180,
  getConsultaDescargaNovonet,
  getActivacionesPorDia,
  forceRefreshNovonet
} = require('../controllers/indicadores.controller');
const {
  getEfectividadDiariaNovonet,
  getAgenciasEfectividadNovonet,
} = require('../controllers/efectividadDiaria.controller');
const { verificarToken } = require('../middleware/auth');

// /dashboard requiere sesión: alimenta la Vista Asesor y debe saber QUIÉN
// está pidiendo los datos para poder forzar el filtro a su propio nombre
// cuando el perfil es ASESOR (ver getIndicadoresDashboard).
// SEGURIDAD (2026-09): todos estos endpoints devuelven datos comerciales y de
// clientes de Novonet y estaban PUBLICOS: solo /dashboard exigia token. Con la
// URL cualquiera bajaba /consulta-descarga o disparaba /force-refresh contra la
// vista materializada. El CORS no protege esto (solo aplica a navegadores).
// Se exige token para TODO el router; el frontend ya manda el Bearer en cada
// fetch (ver frontend/src/utils/sesion.js).
router.use(verificarToken);

router.get('/dashboard', getIndicadoresDashboard);
router.get('/monitoreo-diario', getMonitoreoDiario);
router.get('/reporte180', getReporte180);
router.get('/consulta-descarga', getConsultaDescargaNovonet);
router.get('/activaciones-dia', getActivacionesPorDia);
router.post('/force-refresh', forceRefreshNovonet);

// EFECTIVIDAD DIARIA — por agencia y fecha de creación del lead (ver
// controllers/efectividadDiaria.controller.js). Solo lectura, no toca nada
// de lo existente.
router.get('/efectividad-diaria', getEfectividadDiariaNovonet);
router.get('/efectividad-diaria/agencias', getAgenciasEfectividadNovonet);

module.exports = router;