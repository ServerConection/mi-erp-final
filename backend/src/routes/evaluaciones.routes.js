/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RUTAS: Evaluaciones
 * Base: /api/evaluaciones
 * ═══════════════════════════════════════════════════════════════════════════════
 *   PERFILES_CREADORES (ADMINISTRADOR, GERENCIA, ANALISTA, SUPERVISOR) → crean,
 *   editan, ven resultados. Cualquier usuario autenticado → responde las suyas.
 */

const express = require('express');
const router  = express.Router();

const { verificarToken } = require('../middleware/auth');
const { accesoEvaluaciones, puedeCrearEvaluacion, cargarEvaluacion } = require('../middleware/evaluacionesAcceso');

const ev = require('../controllers/evaluaciones.controller');

router.use(verificarToken, accesoEvaluaciones);

// ── Panel de quien crea ───────────────────────────────────────────────────────
router.get ('/',  ev.listar);
router.post('/',  puedeCrearEvaluacion, ev.crear);

// ── Mis evaluaciones (cualquier usuario) ─────────────────────────────────────
router.get('/mias', ev.misEvaluaciones);

// ── Tomar / responder ────────────────────────────────────────────────────────
router.get ('/:evaluacionId', cargarEvaluacion(false), ev.detalleParaTomar);
router.post('/:evaluacionId/responder', cargarEvaluacion(false), ev.responder);

// ── Gestión y resultados (solo creador/admin) ────────────────────────────────
router.patch('/:evaluacionId/archivar',           cargarEvaluacion(true), ev.archivar);
router.get  ('/:evaluacionId/resultados',          cargarEvaluacion(true), ev.resultados);
router.get  ('/:evaluacionId/resultados/exportar', cargarEvaluacion(true), ev.exportarResultados);

module.exports = router;
