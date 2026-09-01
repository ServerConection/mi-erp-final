/**
 * PROCESO: WORKERS / JOBS  (background worker, sin HTTP)
 *
 * Ejecuta los cron pesados fuera del camino de las peticiones: refresco de
 * vistas materializadas (VELSA, consultor VELSA, redes), sync de Jotform,
 * y el cierre diario de leads (bitrix_webhook_leads -> reportegeneral_d1).
 * Así el trabajo programado deja de competir con los dashboards en vivo.
 *
 * alertas.cron NO va aquí: emite por Socket.io y vive en el proceso WABOT.
 */
require('dotenv').config();

const { initVelsaAutoRefresh }       = require('../jobs/refreshVelsaMaterialized.cron');
const { initConsultorVelsaRefresh }  = require('../jobs/refreshConsultorVelsa.cron');
const { runInitialRefresh: refreshRedesMVs } = require('../jobs/refreshRedesMaterialized.cron');
const { initJotformSync }            = require('../jobs/jotformSync.cron');
const { initCierreDiario }           = require('../jobs/cierreDiario.cron');
const { initWinTrackerSync }         = require('../jobs/syncWinTracker.cron');
const { initNexoIa }                 = require('../jobs/nexoIa.cron');

(async () => {
  console.log('[workers] iniciando jobs programados...');
  try {
    initVelsaAutoRefresh();       // apagado por defecto salvo VELSA_MV_AUTOREFRESH=on
    initConsultorVelsaRefresh();  // refresco del MV pequeño de consultor externo
    await refreshRedesMVs();      // refresco inicial de MVs de redes
    initJotformSync();            // sync programado de Jotform
    initWinTrackerSync();         // inversión Arts/Velsa al arrancar y cada 30 minutos
    initCierreDiario();           // cierre diario 23:30 (America/Guayaquil) -> reportegeneral_d1
    initNexoIa();                 // borradores NEXO: cola cada 5 s, concurrencia 1
    console.log('[workers] jobs activos');
  } catch (e) {
    console.error('[workers] error inicializando jobs:', e.message);
  }
})();

// Sin servidor HTTP: mantener el proceso vivo y apagar limpio
process.on('SIGTERM', () => { console.log('[workers] SIGTERM - saliendo'); process.exit(0); });
process.on('SIGINT',  () => { console.log('[workers] SIGINT - saliendo');  process.exit(0); });
process.on('unhandledRejection', (r) => console.error('[workers] unhandledRejection:', r));
process.on('uncaughtException',  (e) => console.error('[workers] uncaughtException:', e));
