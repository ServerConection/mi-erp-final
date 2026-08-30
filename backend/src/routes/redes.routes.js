const express = require('express');
const router  = express.Router();

const {
  getMonitoreoRedes,
  getMonitoreoCiudad,
  getMonitoreoHora,
  getMonitoreoAtc,
  getMonitoreoCosto,
  getMonitoreoMetas,
  getReporteData,
  getAgenciasCanal,
  upsertAgenciaCanal,
  getInversionAgencias,
  upsertInversionAgencias,
  getResumenPorAgencia,
} = require('../controllers/redesWebhook.controller');
const { verificarToken, noAsesor } = require('../middleware/auth');
const { forceSyncInversion } = require('../controllers/redesWintracker.controller');

// ─── AUTENTICACIÓN OBLIGATORIA PARA TODO EL MÓDULO ──────────────────────────
// Hasta ahora las 7 rutas de monitoreo eran públicas: cualquiera con la URL
// del API veía leads, inversión, CPL y efectividad de NOVONET sin token.
// redesVelsa.routes.js ya usaba este mismo router.use(verificarToken) — aquí
// se iguala el criterio. El frontend (Redes.jsx y los Tab*.jsx) manda el
// Bearer con cabecerasSesion().
router.use(verificarToken);

router.get('/monitoreo-redes',   getMonitoreoRedes);
router.get('/monitoreo-ciudad',  getMonitoreoCiudad);
router.get('/monitoreo-hora',    getMonitoreoHora);
router.get('/monitoreo-atc',     getMonitoreoAtc);
router.get('/monitoreo-costo',   getMonitoreoCosto);
router.get('/monitoreo-metas',   getMonitoreoMetas);
router.get('/reporte-data',      getReporteData);

// Módulo "Agencias" (catálogo origen -> agencia + inversión por origen).
// El token ya lo aplica el router.use() de arriba; aquí solo queda el
// control de perfil para las escrituras.
router.get('/agencias',          getAgenciasCanal);
router.post('/agencias',         noAsesor, upsertAgenciaCanal);
router.get('/inversion',         getInversionAgencias);
router.post('/inversion',        noAsesor, upsertInversionAgencias);
router.get('/resumen-agencias',  getResumenPorAgencia);
router.post('/sync-inversion',   noAsesor, forceSyncInversion);

module.exports = router;