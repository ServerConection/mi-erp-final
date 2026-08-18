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

// Indicador de códigos de origen (NOVONET): declaradas ANTES de '/:id' por la
// misma razón que config-prompt (Express interpretaría "indicador-codigos"
// como un id de auditoría).
router.get('/indicador-codigos/config', C.obtenerConfigIndicadorCodigos);
router.put('/indicador-codigos/config', soloAdmin, C.actualizarConfigIndicadorCodigos);
router.get('/indicador-codigos', C.listarIndicadorCodigos);

router.get('/:id', C.obtenerDetalle);
router.get('/', C.listarAuditorias);

module.exports = router;
