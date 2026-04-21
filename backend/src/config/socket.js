/**
 * 🔐 CONFIGURACIÓN DE SOCKET.IO CON AUTENTICACIÓN JWT
 *
 * Este archivo configura WebSockets seguros con validación de tokens
 * Solo usuarios autenticados pueden conectar
 *
 * USO FRONTEND:
 * const socket = io('http://localhost:5000', {
 *   auth: { token: localStorage.getItem('token') }
 * });
 *
 * BACKEND: socket.user contiene { id, rol, empresa }
 */

const jwt = require('jsonwebtoken');

let _io = null;

const initSocket = (httpServer) => {
  const { Server } = require('socket.io');

  // Obtener orígenes permitidos (mismo CORS que Express)
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];

  _io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,           // 🔐 Solo orígenes confiables
      methods: ['GET', 'POST'],
      credentials: true
    },
  });

  /**
   * 🔐 MIDDLEWARE: Validar JWT antes de conectar socket
   * Se ejecuta ANTES de 'connection' event
   *
   * ¿Qué hace?
   * 1. Busca token en socket.handshake.auth.token
   * 2. Verifica que JWT sea válido con JWT_SECRET
   * 3. Si es válido, permite la conexión
   * 4. Si no, rechaza con error
   */
  _io.use((socket, next) => {
    try {
      // Obtener token del cliente
      const token = socket.handshake.auth.token;

      if (!token) {
        console.warn(`[SOCKET] Conexión rechazada - sin token: ${socket.id}`);
        return next(new Error('⚠️ Token de autenticación requerido'));
      }

      // Verificar que JWT es válido y no expiró
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Guardar datos del usuario EN el socket para usar después
      socket.user = {
        id: decoded.id,
        rol: decoded.rol,
        empresa: decoded.empresa
      };
      socket.userId = decoded.id;

      console.log(`[SOCKET] ✅ Usuario ${decoded.id} autenticado`);
      next(); // ✅ Permitir conexión

    } catch (error) {
      console.error(`[SOCKET] ❌ Error de autenticación:`, error.message);
      next(new Error('Token inválido o expirado'));
    }
  });

  /**
   * 📡 MANEJO DE CONEXIONES
   * Solo usuarios con JWT válido llegan aquí
   */
  _io.on('connection', (socket) => {
    console.log(`[SOCKET] Cliente conectado: ${socket.id} (Usuario: ${socket.userId})`);

    // Evento opcional: Confirmar conexión al cliente
    socket.emit('connected', {
      userId: socket.userId,
      role: socket.user.rol,
      empresa: socket.user.empresa
    });

    /**
     * Desconexión: Limpiar recursos
     */
    socket.on('disconnect', () => {
      console.log(`[SOCKET] Cliente desconectado: ${socket.id}`);
    });

    /**
     * Manejo de errores en el socket
     */
    socket.on('error', (error) => {
      console.error(`[SOCKET] Error:`, error);
    });
  });

  return _io;
};

const getIO = () => {
  if (!_io) throw new Error('Socket.io no inicializado — llama initSocket(server) primero');
  return _io;
};

module.exports = { initSocket, getIO };