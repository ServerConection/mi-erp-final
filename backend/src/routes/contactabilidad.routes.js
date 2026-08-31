// =============================================================================
// Contactabilidad — Rutas del tablero
// Montadas bajo /api/bot-auditor/contactabilidad (ya autenticadas y con permiso
// de modulo verificado por botAuditor.routes.js).
// El orden importa: las rutas literales van ANTES que cualquier parametrica.
// =============================================================================
const express = require('express');
const { soloAdmin } = require('../middleware/auth');
const C = require('../controllers/contactabilidad.controller');

const router = express.Router();

// Lectura
router.get('/stats', C.stats);
router.get('/analytics', C.analytics);
router.get('/filtros', C.filtros);
router.get('/alertas', C.alertas);
router.get('/estado', C.estado);
// Conversacion en vivo (no persiste texto); va antes de '/' por el parametro.
router.get('/conversacion/:empresa/:id', C.conversacion);
router.get('/export', C.exportar);
router.get('/vistas', C.listarVistas);

// Escritura: forzar actualizacion
router.post('/vistas', C.guardarVista);
router.delete('/vistas/:id', C.eliminarVista);
router.post('/refrescar', soloAdmin, C.refrescarGlobal);
router.post('/refrescar/:empresa/:id', C.refrescarLead);

router.get('/', C.listar);

module.exports = router;
