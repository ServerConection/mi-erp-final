/**
 * Coverage Routes
 * Rutas para validación de cobertura de internet
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const coverageController = require('../controllers/coverage.controller');
const { verificarToken } = require('../middleware/auth');

// Configurar multer para subida de archivos
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB max
});

/**
 * POST /api/coverage/load
 * Carga un archivo KML/KMZ
 * Requiere autenticación
 */
router.post('/load', verificarToken, upload.single('file'), coverageController.loadCoverage);

/**
 * GET /api/coverage/check
 * Valida si un punto tiene cobertura
 * Query params: lat, lon
 * Requiere autenticación
 */
router.get('/check', verificarToken, coverageController.checkCoverage);

/**
 * POST /api/coverage/check-batch
 * Valida múltiples puntos
 * Body: { points: [{latitude, longitude}, ...] }
 * Requiere autenticación
 */
router.post('/check-batch', verificarToken, coverageController.checkBatch);

/**
 * GET /api/coverage/zones
 * Lista zonas cargadas
 * Requiere autenticación
 */
router.get('/zones', verificarToken, coverageController.getZones);

/**
 * GET /api/coverage/status
 * Estado del servicio
 * Public endpoint (sin autenticación)
 */
router.get('/status', coverageController.getCoverageStatus);

/**
 * POST /api/coverage/resolve-link
 * Parsea un enlace de WhatsApp / Google Maps / Apple Maps y extrae coordenadas.
 * Body: { "link": "https://maps.google.com/?q=LAT,LNG" }
 * También acepta coordenadas directas: { "link": "-2.4189, -79.3459" }
 * Requiere autenticación
 */
router.post('/resolve-link', verificarToken, coverageController.resolveLink);

module.exports = router;
