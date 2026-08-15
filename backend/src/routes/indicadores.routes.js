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
const { verificarToken } = require('../middleware/auth');

// /dashboard requiere sesión: alimenta la Vista Asesor y debe saber QUIÉN
// está pidiendo los datos para poder forzar el filtro a su propio nombre
// cuando el perfil es ASESOR (ver getIndicadoresDashboard).
router.get('/dashboard', verificarToken, getIndicadoresDashboard);
router.get('/monitoreo-diario', getMonitoreoDiario);
router.get('/reporte180', getReporte180);
router.get('/consulta-descarga', getConsultaDescargaNovonet);
router.get('/activaciones-dia', getActivacionesPorDia);
router.post('/force-refresh', forceRefreshNovonet);

module.exports = router;