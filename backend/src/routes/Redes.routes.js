const express = require('express');
const router = express.Router();

const {
  getMonitoreoRedes,
  getMonitoreoCosto
} = require('../controllers/redes.controller');

router.get('/monitoreo-redes', getMonitoreoRedes);
router.get('/monitoreo-costo', getMonitoreoCosto);

module.exports = router;