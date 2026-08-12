/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SERVICIO: Chat Interno
 * ═══════════════════════════════════════════════════════════════════════════════
 * A diferencia de Archivos Compartidos (que usa una sala por hoja), el chat
 * empuja directo a la sala privada de cada usuario (`user:{id}`), que YA existe
 * para todo socket autenticado (ver config/socket.js). No hace falta que el
 * destinatario tenga la conversación abierta para recibir el evento: así el
 * sidebar puede actualizar el badge de "no leídos" en toda la app.
 */

const nombreCompleto = (r) =>
  [r.nombres, r.apellidos].filter(Boolean).join(' ').trim() || r.usuario;

/**
 * Emite un evento a un usuario puntual (todas sus pestañas/dispositivos).
 * Nunca lanza: si socket.io no está levantado, el guardado en BD ya ocurrió
 * y eso es lo que importa — el usuario lo verá al abrir/recargar el chat.
 */
function emitirAUsuario(usuarioId, evento, payload) {
  try {
    const { getIO } = require('../config/socket');
    getIO().to(`user:${usuarioId}`).emit(evento, payload);
  } catch (error) {
    console.warn('[chat.service] No se pudo emitir', evento, '-', error.message);
  }
}

/** Emite el mismo evento a una lista de usuarios (los participantes de una conversación). */
function emitirAParticipantes(usuarioIds, evento, payload) {
  for (const id of usuarioIds) emitirAUsuario(id, evento, payload);
}

module.exports = { nombreCompleto, emitirAUsuario, emitirAParticipantes };
