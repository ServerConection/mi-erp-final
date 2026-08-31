const http    = require('http');
const app     = require('./app');
const { initSocket }      = require('./config/socket');
const { initAlertas }     = require('./jobs/alertas.cron');
const { iniciarWhatsApp } = require('./services/whatsapp.service');
const { refreshMaterializedView, initVelsaAutoRefresh } = require('./jobs/refreshVelsaMaterialized.cron');
const { initConsultorVelsaRefresh } = require('./jobs/refreshConsultorVelsa.cron');
const { runInitialRefresh: refreshRedesMVs } = require('./jobs/refreshRedesMaterialized.cron');
const { initJotformSync } = require('./jobs/jotformSync.cron');
const { initWinTrackerSync } = require('./jobs/syncWinTracker.cron');
const { initContactabilidadSync } = require('./jobs/contactabilidad.cron');
const { initContactabilidadTiempoReal } = require('./jobs/contactabilidadTiempoReal.cron');
const { initNexoIa } = require('./jobs/nexoIa.cron');

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
  // Refresh VELSA: el refresco masivo se movio a un cron seguro y APAGADO por
  // defecto. Solo se activa con VELSA_MV_AUTOREFRESH='on' en el .env (usa
  // REFRESH CONCURRENTLY + cliente dedicado sin statement_timeout). Sin esa
  // variable, initVelsaAutoRefresh() no programa nada y el sistema queda igual.
  initVelsaAutoRefresh();
  // Refresco del MV pequeño de la API consultor externo Velsa (encendido por
  // defecto; refresco CONCURRENTLY con cliente dedicado, no bloquea nada).
  initConsultorVelsaRefresh();
  await refreshRedesMVs();
  initJotformSync();
  initContactabilidadSync();
  initContactabilidadTiempoReal();
  initNexoIa();
  initWinTrackerSync();
  iniciarWhatsApp();
});

// Apagado limpio (Render envia SIGTERM antes de reiniciar)
const SHUTDOWN_TIMEOUT = 25000;

async function gracefulShutdown(signal) {
  console.log('[Server] ' + signal + ' recibido - apagado limpio en curso...');
  // Cerrar los sockets de WhatsApp ANTES de morir para no dejar sesiones
  // duplicadas que choquen con la nueva instancia (causa de 401/428 en deploys).
  try {
    const wa = require('./services/whatsapp.service');
    const bm = wa.getBaileysManager && wa.getBaileysManager();
    if (bm && bm.shutdown) await bm.shutdown();
  } catch (e) {
    console.warn('[Server] No se pudo cerrar WhatsApp limpio:', e.message);
  }
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
