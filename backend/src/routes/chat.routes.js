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
const multer  = require('multer');
const router  = express.Router();

const { verificarToken } = require('../middleware/auth');
const { accesoChat, exigeParticipante } = require('../middleware/chatAcceso');

const chat = require('../controllers/chat.controller');

const subirArchivo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 2, parts: 3 },
}).single('archivo');

const recibirArchivo = (req, res, next) => subirArchivo(req, res, (error) => {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: 'El archivo supera el límite de 25 MB.' });
  }
  return res.status(400).json({ success: false, error: error.message || 'No se pudo recibir el archivo.' });
});

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
router.post('/conversaciones/:conversacionId/archivos', exigeParticipante, recibirArchivo, chat.enviarArchivo);
router.get ('/archivos/:archivoId/descargar', chat.descargarArchivo);
router.delete('/mensajes/:mensajeId', chat.eliminarMensaje);
router.patch('/conversaciones/:conversacionId/leido',   exigeParticipante, chat.marcarLeido);

// ── Participantes (grupos) ───────────────────────────────────────────────────
router.get   ('/conversaciones/:conversacionId/participantes',    exigeParticipante, chat.listarParticipantes);
router.post  ('/conversaciones/:conversacionId/participantes',    exigeParticipante, chat.agregarParticipante);
router.delete('/conversaciones/:conversacionId/participantes/me', exigeParticipante, chat.salirDeGrupo);

module.exports = router;
