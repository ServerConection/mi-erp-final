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
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const { verificarToken } = require('../middleware/auth');
const { accesoEvaluaciones, puedeCrearEvaluacion, soloAdministrador, cargarEvaluacion } = require('../middleware/evaluacionesAcceso');

const ev = require('../controllers/evaluaciones.controller');
const cursos = require('../controllers/evaluacionesCursos.controller');

const cursosDir = process.env.EVALUACIONES_UPLOADS_DIR || path.resolve(__dirname, '..', '..', 'uploads', 'evaluaciones');
fs.mkdirSync(cursosDir, { recursive: true });
const subirVideo = multer({
  storage: multer.diskStorage({
    destination: cursosDir,
    filename: (_req, file, cb) => {
      const extensiones = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extensiones[file.mimetype] || ''}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024, fieldSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.mimetype)),
});

router.use(verificarToken, accesoEvaluaciones);

// ── Panel de quien crea ───────────────────────────────────────────────────────
router.get ('/',  ev.listar);
router.post('/',  puedeCrearEvaluacion, ev.crear);

// ── Mis evaluaciones (cualquier usuario) ─────────────────────────────────────
router.get('/mias', ev.misEvaluaciones);

// Cursos en video + evaluación corta. Deben ir antes de /:evaluacionId.
router.get('/cursos/lista', cursos.listar);
router.post('/cursos', puedeCrearEvaluacion, subirVideo.single('video'), cursos.crear);
router.post('/cursos/:cursoId/video-completado', cursos.completarVideo);
router.patch('/cursos/:cursoId/archivar', puedeCrearEvaluacion, cursos.archivar);

// ── Tomar / responder ────────────────────────────────────────────────────────
router.get ('/:evaluacionId', cargarEvaluacion(false), ev.detalleParaTomar);
router.post('/:evaluacionId/responder', cargarEvaluacion(false), ev.responder);

// ── Gestión y resultados (solo creador/admin) ────────────────────────────────
router.patch ('/:evaluacionId/archivar',           cargarEvaluacion(true), ev.archivar);
router.delete('/:evaluacionId',                    cargarEvaluacion(true), soloAdministrador, ev.eliminar);
router.get  ('/:evaluacionId/resultados',          cargarEvaluacion(true), ev.resultados);
router.get  ('/:evaluacionId/resultados/exportar', cargarEvaluacion(true), ev.exportarResultados);

module.exports = router;
