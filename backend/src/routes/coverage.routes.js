/**
 * Coverage Routes
 * Rutas para validación de cobertura de internet
 */

const express = require('express');
const router = express.Router();
const coverageController = require('../controllers/coverage.controller');
const authMiddleware = require('../middleware/auth');

/**
 * POST /api/coverage/load
 * Carga un archivo KML/KMZ
 * Requiere autenticación
 */
router.post('/load', authMiddleware, ...coverageController.loadCoverage);

/**
 * GET /api/coverage/check
 * Valida si un punto tiene cobertura
 * Query params: lat, lon
 * Requiere autenticación
 */
router.get('/check', authMiddleware, coverageController.checkCoverage);

/**
 * POST /api/coverage/check-batch
 * Valida múltiples puntos
 * Body: { points: [{latitude, longitude}, ...] }
 * Requiere autenticación
 */
router.post('/check-batch', authMiddleware, coverageController.checkBatch);

/**
 * GET /api/coverage/zones
 * Lista zonas cargadas
 * Requiere autenticación
 */
router.get('/zones', authMiddleware, coverageController.getZones);

/**
 * GET /api/coverage/status
 * Estado del servicio
 * Public endpoint (sin autenticación)
 */
router.get('/status', coverageController.getCoverageStatus);

module.exports = router;
