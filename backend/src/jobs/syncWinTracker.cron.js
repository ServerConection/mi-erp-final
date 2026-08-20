/**
 * Cron: sincroniza la inversión/pauta diaria desde WinTracker (Vidika) para
 * las agencias con apikey configurada — ver services/wintracker.service.js.
 *
 * Corre cada hora en el minuto :15 (el número de "hoy" en WinTracker puede
 * seguir subiendo durante el día, así que se refresca varias veces, no solo
 * una vez al día). También corre una vez al arrancar el servidor.
 */
const cron = require('node-cron');
const { syncTodasLasAgencias } = require('../services/wintracker.service');

function initWinTrackerSync() {
  // Sync inicial en background — no bloquea el arranque del server.
  syncTodasLasAgencias().catch((err) =>
    console.error('💥 [WinTracker] Error en sync inicial:', err.message)
  );

  cron.schedule('15 * * * *', () => {
    console.log('🔄 [WinTracker] Sincronizando inversión...');
    syncTodasLasAgencias().catch((err) =>
      console.error('💥 [WinTracker] Error:', err.message)
    );
  });
}

module.exports = { initWinTrackerSync };
