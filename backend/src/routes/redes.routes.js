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
} = require('../controllers/redes.controller');

router.get('/monitoreo-redes',   getMonitoreoRedes);
router.get('/monitoreo-ciudad',  getMonitoreoCiudad);
router.get('/monitoreo-hora',    getMonitoreoHora);
router.get('/monitoreo-atc',     getMonitoreoAtc);
router.get('/monitoreo-costo',   getMonitoreoCosto);
router.get('/monitoreo-metas',   getMonitoreoMetas);
router.get('/reporte-data',      getReporteData);

module.exports = router;