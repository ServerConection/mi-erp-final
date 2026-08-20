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
} = require('../controllers/redes.controller');
const { verificarToken, noAsesor } = require('../middleware/auth');

router.get('/monitoreo-redes',   getMonitoreoRedes);
router.get('/monitoreo-ciudad',  getMonitoreoCiudad);
router.get('/monitoreo-hora',    getMonitoreoHora);
router.get('/monitoreo-atc',     getMonitoreoAtc);
router.get('/monitoreo-costo',   getMonitoreoCosto);
router.get('/monitoreo-metas',   getMonitoreoMetas);
router.get('/reporte-data',      getReporteData);

// Módulo "Agencias" (catálogo origen -> agencia + inversión por origen).
// NOTA: el resto de rutas de este archivo NO tienen verificarToken (así ya
// estaban) — estas sí lo llevan porque tocan datos de inversión/asignación
// y se escriben desde el ERP. Vale la pena revisar el resto del archivo en
// algún momento por el mismo motivo, pero no se tocó aquí para no romper
// nada que ya esté funcionando.
router.get('/agencias',          verificarToken, getAgenciasCanal);
router.post('/agencias',         verificarToken, noAsesor, upsertAgenciaCanal);
router.get('/inversion',         verificarToken, getInversionAgencias);
router.post('/inversion',        verificarToken, noAsesor, upsertInversionAgencias);
router.get('/resumen-agencias',  verificarToken, getResumenPorAgencia);

module.exports = router;