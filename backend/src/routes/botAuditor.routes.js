// =============================================================================
// BOT AUDITOR - Rutas
// Acceso restringido: solo ADMINISTRADOR y GERENCIA (ver permisos.config.js)
// =============================================================================
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth');
const requierePermiso = require('../middleware/requierePermiso');
const C = require('../controllers/botAuditor.controller');

router.use(verificarToken);
router.use(requierePermiso('BotAuditor'));

router.get('/stats', C.obtenerEstadisticas);
router.get('/:id', C.obtenerDetalle);
router.get('/', C.listarAuditorias);

module.exports = router;
