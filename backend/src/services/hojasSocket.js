/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CANAL EN VIVO: Archivos Compartidos
 * ═══════════════════════════════════════════════════════════════════════════════
 * Registra los handlers de socket.io del módulo. Vive aparte de config/socket.js
 * para que ese archivo siga siendo la infraestructura y este sea la función.
 *
 * QUÉ HACE
 *   · Sala por hoja: solo recibe eventos quien tiene permiso sobre esa hoja
 *   · Presencia: quién está mirando la hoja ahora mismo
 *   · Foco: en qué celda está parada cada persona (el borde de color)
 *
 * QUÉ NO HACE
 *   · No guarda datos. Los cambios se escriben por HTTP y el servidor los
 *     reemite desde el controlador. Un socket caído nunca pierde información.
 *
 * NOTA DE DESPLIEGUE
 *   Esto asume que quien atiende /api/hojas es el mismo proceso que tiene
 *   socket.io (hoy: el monolito). Si algún día se separa con el gateway, hay
 *   que enrutar /api/hojas al proceso con websocket o añadir el adaptador de
 *   Redis de socket.io.
 */

const { resolverAcceso } = require('../middleware/hojasAcceso');
const { salaDeHoja }     = require('./hojas.service');

/**
 * Presencia en memoria: hojaId → Map(socketId → { usuarioId, nombre, color })
 * Se pierde si el proceso reinicia, y está bien: al reconectar cada cliente
 * vuelve a anunciarse solo.
 */
const presencia = new Map();

// Colores estables por usuario: el mismo asesor siempre sale del mismo color.
const PALETA = ['#2563EB', '#DB2777', '#059669', '#D97706', '#7C3AED', '#0891B2', '#DC2626', '#65A30D'];
const colorDe = (usuarioId) => PALETA[Math.abs(Number(usuarioId) || 0) % PALETA.length];

const ocupantes = (hojaId) => {
  const sala = presencia.get(hojaId);
  if (!sala) return [];
  // Un usuario con dos pestañas abiertas debe contar una sola vez.
  const unicos = new Map();
  for (const p of sala.values()) unicos.set(p.usuarioId, p);
  return [...unicos.values()];
};

function anunciarPresencia(io, hojaId) {
  io.to(salaDeHoja(hojaId)).emit('hoja:presencia', {
    hojaId,
    usuarios: ocupantes(hojaId),
  });
}

function salirDeHoja(io, socket, hojaId) {
  const sala = presencia.get(hojaId);
  if (!sala) return;

  sala.delete(socket.id);
  if (sala.size === 0) presencia.delete(hojaId);

  socket.leave(salaDeHoja(hojaId));
  anunciarPresencia(io, hojaId);
}

/**
 * Se llama una vez por socket conectado, desde config/socket.js.
 */
function registrarHandlersHojas(io, socket) {
  // Hojas en las que está este socket concreto (normalmente una).
  const abiertas = new Set();

  socket.on('hoja:entrar', async ({ hojaId } = {}) => {
    try {
      // Un socket sin usuario (modo TV / invitado) no entra a ninguna hoja.
      if (!socket.user?.id) return;

      const id = parseInt(hojaId, 10);
      if (!Number.isInteger(id)) return;

      // Se revalida contra la BD: el token dice quién eres, no a qué tienes
      // acceso. Si le quitaron el permiso hace un minuto, aquí se entera.
      const { hoja, nivel } = await resolverAcceso(id, socket.user);
      if (!hoja || !nivel) {
        socket.emit('hoja:denegado', { hojaId: id });
        return;
      }

      socket.join(salaDeHoja(id));
      abiertas.add(id);

      if (!presencia.has(id)) presencia.set(id, new Map());
      presencia.get(id).set(socket.id, {
        usuarioId: socket.user.id,
        nombre:    socket.user.usuario || `Usuario ${socket.user.id}`,
        color:     colorDe(socket.user.id),
        nivel,
      });

      anunciarPresencia(io, id);
    } catch (error) {
      console.error('[hojasSocket] Error en hoja:entrar:', error.message);
    }
  });

  socket.on('hoja:salir', ({ hojaId } = {}) => {
    const id = parseInt(hojaId, 10);
    if (!Number.isInteger(id) || !abiertas.has(id)) return;
    abiertas.delete(id);
    salirDeHoja(io, socket, id);
  });

  /**
   * Marca en qué celda está parado alguien. Es puro adorno visual, así que
   * se retransmite sin tocar la BD — pero solo dentro de la sala, y solo si
   * el socket ya está dentro de ella.
   */
  socket.on('hoja:foco', ({ hojaId, filaId, columnaId } = {}) => {
    const id = parseInt(hojaId, 10);
    if (!Number.isInteger(id) || !abiertas.has(id) || !socket.user?.id) return;

    socket.to(salaDeHoja(id)).emit('hoja:foco', {
      hojaId:    id,
      filaId:    filaId ?? null,
      columnaId: columnaId ?? null,
      usuarioId: socket.user.id,
      nombre:    socket.user.usuario || `Usuario ${socket.user.id}`,
      color:     colorDe(socket.user.id),
    });
  });

  socket.on('disconnect', () => {
    for (const id of abiertas) salirDeHoja(io, socket, id);
    abiertas.clear();
  });
}

module.exports = { registrarHandlersHojas, ocupantes };
