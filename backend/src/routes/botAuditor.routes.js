// =============================================================================
// BOT AUDITOR - Rutas
// Acceso restringido: solo ADMINISTRADOR y GERENCIA (ver permisos.config.js)
// =============================================================================
const express = require('express');
const router = express.Router();
const { verificarToken, soloAdmin } = require('../middleware/auth');
const requierePermiso = require('../middleware/requierePermiso');
const C = require('../controllers/botAuditor.controller');

router.use(verificarToken);
router.use(requierePermiso('BotAuditor'));

router.get('/stats', C.obtenerEstadisticas);
// Config del prompt: declaradas ANTES de '/:id' para que Express no interprete
// "config-prompt" como un id de auditoría. GET la puede ver cualquiera con
// acceso al módulo; PUT (editar) queda restringido a ADMINISTRADOR.
router.get('/config-prompt', C.obtenerConfigPrompt);
router.put('/config-prompt', soloAdmin, C.actualizarConfigPrompt);
router.get('/:id', C.obtenerDetalle);
router.get('/', C.listarAuditorias);

module.exports = router;
