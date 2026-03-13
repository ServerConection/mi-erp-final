const express = require('express');
const router = express.Router();

const {
  getMonitoreoRedes,
  getMonitoreoCiudad,
  getMonitoreoHora,
  getMonitoreoAtc,
  getMonitoreoCosto,
} = require('../controllers/redes.controller');

router.get('/monitoreo-redes',   getMonitoreoRedes);
router.get('/monitoreo-ciudad',  getMonitoreoCiudad);
router.get('/monitoreo-hora',    getMonitoreoHora);
router.get('/monitoreo-atc',     getMonitoreoAtc);
router.get('/monitoreo-costo',   getMonitoreoCosto);

module.exports = router;