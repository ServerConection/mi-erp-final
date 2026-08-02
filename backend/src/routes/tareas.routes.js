/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RUTAS: Módulo de Tareas y Acuerdos
 * Base: /api/tareas
 * ═══════════════════════════════════════════════════════════════════════════════
 * Todas requieren token válido + área y cargo asignados.
 * Los asesores comerciales no tienen área/cargo, así que quedan fuera del módulo.
 */

const express = require('express');
const router  = express.Router();

const { verificarToken } = require('../middleware/auth');
const { accesoTareas, soloJefaturaTareas } = require('../middleware/tareasAcceso');

const ctrl      = require('../controllers/tareas.controller');
const proyectos = require('../controllers/tareasProyectos.controller');
const dash      = require('../controllers/tareasDashboard.controller');

// Puerta de entrada única del módulo
router.use(verificarToken, accesoTareas);

// ── Catálogos ─────────────────────────────────────────────────────────────────
router.get('/catalogos', ctrl.catalogos);

// ── Notificaciones ────────────────────────────────────────────────────────────
router.get  ('/notificaciones',             ctrl.listarNotificaciones);
router.patch('/notificaciones/leer-todas',  ctrl.marcarTodasLeidas);
router.patch('/notificaciones/:id/leida',   ctrl.marcarNotificacionLeida);

// ── Proyectos ─────────────────────────────────────────────────────────────────
router.get  ('/proyectos',              proyectos.listar);
router.post ('/proyectos',              soloJefaturaTareas, proyectos.crear);
router.patch('/proyectos/:id',          soloJefaturaTareas, proyectos.editar);
router.patch('/proyectos/:id/archivar', soloJefaturaTareas, proyectos.archivar);

// ── Dashboard y exportación ───────────────────────────────────────────────────
router.get('/dashboard', soloJefaturaTareas, dash.dashboard);
router.get('/exportar',  dash.exportar);

// ── Bandeja personal ──────────────────────────────────────────────────────────
router.get('/mis-tareas', ctrl.misTareas);

// ── Comentarios (rutas fijas antes que /:id para no chocar) ───────────────────
router.patch ('/comentarios/:comentarioId', ctrl.editarComentario);
router.delete('/comentarios/:comentarioId', ctrl.eliminarComentario);

// ── Tareas ────────────────────────────────────────────────────────────────────
router.get   ('/',                ctrl.listar);
router.post  ('/',                ctrl.crear);
router.get   ('/:id',             ctrl.detalle);
router.patch ('/:id',             ctrl.editar);
router.patch ('/:id/estado',      ctrl.cambiarEstado);
router.patch ('/:id/reasignar',   ctrl.reasignar);
router.post  ('/:id/comentarios', ctrl.comentar);
router.delete('/:id',             ctrl.cancelar);

module.exports = router;
