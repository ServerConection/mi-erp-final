    // src/config/socket.js
// Instancia Socket.io compartida — importar donde se necesite
// NO modifica app.js existente — solo se inicializa desde ahí con initSocket(server)

let _io = null;

const initSocket = (httpServer) => {
  const { Server } = require('socket.io');
  _io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  _io.on('connection', (socket) => {
    console.log(`[SOCKET] Cliente conectado: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`[SOCKET] Cliente desconectado: ${socket.id}`);
    });
  });

  return _io;
};

const getIO = () => {
  if (!_io) throw new Error('Socket.io no inicializado — llama initSocket(server) primero');
  return _io;
};

module.exports = { initSocket, getIO };