const http    = require('http');
const app     = require('./app');
const { initSocket }      = require('./config/socket');
const { initAlertas }     = require('./jobs/alertas.cron');
const { iniciarWhatsApp } = require('./services/whatsapp.service');
const { refreshMaterializedView } = require('./jobs/refreshVelsaMaterialized.cron');
const { runInitialRefresh: refreshRedesMVs } = require('./jobs/refreshRedesMaterialized.cron');
const { initJotformSync } = require('./jobs/jotformSync.cron');

// SEGURIDAD: Verifica variables de entorno criticas al arrancar
const requiredEnv = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'PORT'];
const missingEnv = requiredEnv.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.error('[Server] Faltan variables de entorno criticas:', missingEnv.join(', '));
  console.error('[Server] Revisa tu archivo .env antes de arrancar.');
  process.exit(1);
}
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 24) {
  console.warn('[Server] JWT_SECRET es muy corto (<24 chars). Se recomienda al menos 32 caracteres aleatorios.');
}

const server = http.createServer(app);

// Timeouts del servidor para evitar conexiones colgadas
server.keepAliveTimeout = 65000;
server.headersTimeout   = 66000;
server.requestTimeout   = 120000;

// Inicializar Socket.io sobre el mismo servidor HTTP
initSocket(server);

server.listen(process.env.PORT, async () => {
  console.log('Backend corriendo en http://localhost:' + process.env.PORT);
  await initAlertas();
  // ⛔ Refresh VELSA desactivado temporalmente (tumbaba la BD). Reactivar cuando
  // se optimice la vista: await refreshMaterializedView();
  await refreshRedesMVs();
  initJotformSync();
  iniciarWhatsApp();
});

// Apagado limpio (Render envia SIGTERM antes de reiniciar)
const SHUTDOWN_TIMEOUT = 25000;

function gracefulShutdown(signal) {
  console.log('[Server] ' + signal + ' recibido - apagado limpio en curso...');
  server.close(() => {
    console.log('[Server] HTTP cerrado correctamente');
    process.exit(0);
  });
  setTimeout(() => {
    console.warn('[Server] Timeout de apagado - forzando salida');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// No dejar caer el proceso por una promesa sin manejar
process.on('unhandledRejection', (reason) => {
  console.error('[Server] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Server] uncaughtException:', err);
});
