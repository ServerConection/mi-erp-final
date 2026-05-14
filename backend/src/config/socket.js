const jwt = require('jsonwebtoken');

let _io = null;

const initSocket = (httpServer) => {
  const { Server } = require('socket.io');

  const defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://erp-frontend-v1.onrender.com'
  ];

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : defaultOrigins;

  _io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    },
  });

  // Middleware de autenticacion
  _io.use((socket, next) => {
    try {
      const token    = socket.handshake.auth.token;
      const isTvMode = socket.handshake.auth.tv === true
                    || socket.handshake.query?.tv === 'true';

      // Sin token o modo TV -> permitir como pantalla TV
      if (!token || isTvMode) {
        socket.user = { id: null, rol: 'TV', perfil: 'TV', empresa: '' };
        console.log('[SOCKET] Conexion TV/guest permitida:', socket.id);
        return next();
      }

      // Usuario autenticado con JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = {
        id:      decoded.id,
        rol:     decoded.rol,
        perfil:  (decoded.perfil  || '').toUpperCase(),
        empresa: (decoded.empresa || '').toUpperCase(),
      };
      socket.userId = decoded.id;
      console.log('[SOCKET] Usuario autenticado:', decoded.id, socket.user.perfil + '.' + socket.user.empresa);
      next();

    } catch (error) {
      console.error('[SOCKET] Error de autenticacion:', error.message);
      next(new Error('Token invalido o expirado'));
    }
  });

  // Manejo de conexiones
  _io.on('connection', (socket) => {
    const { perfil, empresa } = socket.user;

    if (perfil === 'ADMINISTRADOR') {
      socket.join('broadcast:all');
      console.log('[SOCKET] Conectado:', socket.id, '(ADMIN) -> broadcast:all');
    } else if (perfil === 'TV') {
      socket.join('tv:all');
      console.log('[SOCKET] Conectado:', socket.id, '(TV) -> tv:all');
    } else {
      socket.join('empresa:' + empresa);
      console.log('[SOCKET] Conectado:', socket.id, '(' + perfil + '.' + empresa + ') -> empresa:' + empresa);
    }

    socket.emit('connected', {
      userId:  socket.userId,
      perfil:  socket.user.perfil,
      empresa: socket.user.empresa,
    });

    socket.on('disconnect', () => {
      console.log('[SOCKET] Desconectado:', socket.id);
    });

    socket.on('error', (error) => {
      console.error('[SOCKET] Error:', error);
    });
  });

  return _io;
};

const getIO = () => {
  if (!_io) throw new Error('Socket.io no inicializado - llama initSocket(server) primero');
  return _io;
};

module.exports = { initSocket, getIO };
