/**
 * startHttp — arranque HTTP estándar para cada proceso.
 *
 * Aplica los mismos timeouts del monolito, inicializa Socket.io solo si el
 * proceso lo necesita, y hace apagado limpio (SIGTERM/SIGINT) además de
 * capturar promesas/errores no manejados para que un fallo puntual NO tumbe
 * el proceso en silencio.
 */
const http = require('http');

function startHttp(app, { serviceName = 'service', withSocket = false, onReady, onShutdown } = {}) {
  const server = http.createServer(app);

  // Timeouts (idénticos al monolito) para no dejar conexiones colgadas
  server.keepAliveTimeout = 65000;
  server.headersTimeout   = 66000;
  server.requestTimeout   = 120000;

  let io = null;
  if (withSocket) {
    const { initSocket } = require('../config/socket');
    io = initSocket(server);
  }

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, async () => {
    console.log(`[${serviceName}] escuchando en :${PORT}`);
    if (onReady) {
      try { await onReady({ server, io }); }
      catch (e) { console.error(`[${serviceName}] error en onReady:`, e.message); }
    }
  });

  const SHUTDOWN_TIMEOUT = 25000;
  let cerrando = false;
  async function gracefulShutdown(signal) {
    if (cerrando) return;
    cerrando = true;
    console.log(`[${serviceName}] ${signal} recibido - apagado limpio...`);
    try { if (onShutdown) await onShutdown(); }
    catch (e) { console.warn(`[${serviceName}] error en onShutdown:`, e.message); }
    server.close(() => {
      console.log(`[${serviceName}] HTTP cerrado correctamente`);
      process.exit(0);
    });
    setTimeout(() => {
      console.warn(`[${serviceName}] timeout de apagado - forzando salida`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => console.error(`[${serviceName}] unhandledRejection:`, reason));
  process.on('uncaughtException',  (err)    => console.error(`[${serviceName}] uncaughtException:`, err));

  return { server, getIo: () => io };
}

module.exports = startHttp;
