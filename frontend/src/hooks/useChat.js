/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLIENTE API + SOCKET: Chat Interno
 * ═══════════════════════════════════════════════════════════════════════════════
 * Todo lo que habla con /api/chat pasa por aquí. Mismo patrón que useHojas.js:
 * una sola conexión de socket compartida para toda la app.
 */

import { useCallback, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const BASE = `${import.meta.env.VITE_API_URL}/api/chat`;

const cabeceras = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

/** Lanza un Error con el mensaje que devolvió el backend, no un genérico. */
async function pedir(ruta, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    method,
    headers: cabeceras(),
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try { data = await res.json(); } catch { /* respuesta sin cuerpo */ }

  if (!res.ok || data.success === false) {
    const err = new Error(data.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const chatApi = {
  usuarios: (q = '') => pedir(`/usuarios${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  listarConversaciones: () => pedir('/conversaciones'),
  crearConversacion:    (body) => pedir('/conversaciones', { method: 'POST', body }),

  mensajes: (conversacionId, antes) =>
    pedir(`/conversaciones/${conversacionId}/mensajes${antes ? `?antes=${antes}` : ''}`),
  enviarMensaje: (conversacionId, contenido) =>
    pedir(`/conversaciones/${conversacionId}/mensajes`, { method: 'POST', body: { contenido } }),
  marcarLeido: (conversacionId) =>
    pedir(`/conversaciones/${conversacionId}/leido`, { method: 'PATCH' }),

  participantes:      (conversacionId) => pedir(`/conversaciones/${conversacionId}/participantes`),
  agregarParticipante: (conversacionId, usuarioId) =>
    pedir(`/conversaciones/${conversacionId}/participantes`, { method: 'POST', body: { usuarioId } }),
  salirDeGrupo: (conversacionId) =>
    pedir(`/conversaciones/${conversacionId}/participantes/me`, { method: 'DELETE' }),
};

// ══════════════════════════════════════════════════════════════════════════════
// SOCKET
// ══════════════════════════════════════════════════════════════════════════════
// El chat no necesita "entrar/salir" de una sala por conversación: todo socket
// autenticado ya está en su sala `user:{id}` (ver config/socket.js), así que
// los eventos 'chat:mensaje' y 'chat:conversacion_nueva' llegan solos apenas
// se emiten desde el backend, sin importar qué pantalla tenga abierta.

let socketCompartido = null;

function obtenerSocket() {
  if (socketCompartido?.connected || socketCompartido?.connecting) return socketCompartido;

  socketCompartido = io(import.meta.env.VITE_API_URL, {
    auth: { token: localStorage.getItem('token') },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1500,
  });
  return socketCompartido;
}

/**
 * Suscribe manejadores a los eventos globales del chat.
 * `manejadores` = { 'chat:mensaje': fn, 'chat:conversacion_nueva': fn }.
 */
export function useSocketChat(manejadores) {
  const refManejadores = useRef(manejadores);
  useEffect(() => { refManejadores.current = manejadores; });

  useEffect(() => {
    const socket = obtenerSocket();
    const eventos = ['chat:mensaje', 'chat:conversacion_nueva'];

    const despachar = {};
    for (const evento of eventos) {
      despachar[evento] = (payload) => refManejadores.current?.[evento]?.(payload);
      socket.on(evento, despachar[evento]);
    }

    return () => {
      for (const evento of eventos) socket.off(evento, despachar[evento]);
    };
  }, []);
}

export const useConectarSocketChat = () => {
  useEffect(() => { obtenerSocket(); }, []);
};
