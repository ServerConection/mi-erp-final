// =============================================================================
// SOCKET COMPARTIDO — una sola conexion para toda la app
//
// Antes cada modulo creaba la suya: DashboardLayout, Notificaciones, WaInbox,
// WaLineas, WaCampanas, Mundialito, useChat y useHojas tenian cada uno su
// propio `io(...)`. En los logs del backend se veia a UN usuario abriendo 7
// sockets a la vez, y varios de esos efectos dependian de estado (`[torneo]`,
// `[load]`), asi que se creaban y destruian en cada cambio: conectado ->
// desconectado cada pocos segundos, en bucle.
//
// Ademas casi todos forzaban `transports: ["websocket", ...]`. Con el upgrade
// forzado, si el WebSocket no prospera el cliente se cae y reintenta en bucle.
// Aqui NO se fuerza: socket.io arranca en polling y sube a websocket solo si el
// upgrade funciona — es el comportamiento recomendado y el que sobrevive a
// proxies.
//
// Regla para quien lo use: registra tus listeners con .on() y en la limpieza
// quita SOLO los tuyos con .off(evento, handler). NUNCA llames a .disconnect():
// la conexion es de toda la app, no del componente.
// =============================================================================
import { io } from "socket.io-client";

let socket = null;

export function getSocketCompartido() {
  if (socket) return socket;

  socket = io(import.meta.env.VITE_API_URL, {
    auth: { token: localStorage.getItem("token") },
    reconnection: true,
    reconnectionAttempts: Infinity,   // broadcasts y TV nunca deben rendirse
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
  });

  // Tras reconectar, reenviar el token vigente: si el usuario renovo sesion, el
  // handshake viejo ya no sirve y entraria como invitado.
  socket.on("reconnect_attempt", () => {
    socket.auth = { token: localStorage.getItem("token") };
  });

  return socket;
}

/** Cierra la conexion compartida. Solo al cerrar sesion. */
export function cerrarSocketCompartido() {
  if (!socket) return;
  try { socket.removeAllListeners(); socket.disconnect(); } catch (_) {}
  socket = null;
}

export default getSocketCompartido;
