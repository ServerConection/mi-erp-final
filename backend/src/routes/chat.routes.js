/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * RUTAS: Chat Interno
 * Base: /api/chat
 * ═══════════════════════════════════════════════════════════════════════════════
 * Cualquier usuario autenticado puede usar el chat. El aislamiento por empresa
 * se valida al crear conversaciones o agregar participantes (chatAcceso.js),
 * no en la lectura: quien no es participante simplemente no ve la conversación.
 */

const express = require('express');
const router  = express.Router();

const { verificarToken } = require('../middleware/auth');
const { accesoChat, exigeParticipante } = require('../middleware/chatAcceso');

const chat = require('../controllers/chat.controller');

// Puerta de entrada del módulo
router.use(verificarToken, accesoChat);

// ── Catálogo ──────────────────────────────────────────────────────────────────
router.get('/usuarios', chat.usuariosDisponibles);

// ── Conversaciones ───────────────────────────────────────────────────────────
router.get ('/conversaciones', chat.listarConversaciones);
router.post('/conversaciones', chat.crearConversacion);

// ── Mensajes ──────────────────────────────────────────────────────────────────
router.get ('/conversaciones/:conversacionId/mensajes', exigeParticipante, chat.listarMensajes);
router.post('/conversaciones/:conversacionId/mensajes', exigeParticipante, chat.enviarMensaje);
router.patch('/conversaciones/:conversacionId/leido',   exigeParticipante, chat.marcarLeido);

// ── Participantes (grupos) ───────────────────────────────────────────────────
router.get   ('/conversaciones/:conversacionId/participantes',    exigeParticipante, chat.listarParticipantes);
router.post  ('/conversaciones/:conversacionId/participantes',    exigeParticipante, chat.agregarParticipante);
router.delete('/conversaciones/:conversacionId/participantes/me', exigeParticipante, chat.salirDeGrupo);

module.exports = router;
