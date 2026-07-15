// JOB CRON: Sincroniza Jotform (Novonet + Velsa) cada 20 minutos
// Trae el estado COMPLETO de cada envío desde la API de Jotform (lo mismo
// que ve la Tabla, incluyendo columnas de auditoría/estado que el equipo
// llena a mano ahí) y actualiza jotform_submissions / jotform_submissions_velsa
// (+ sus tablas _historial, solo si algo realmente cambió).

const cron = require('node-cron');
const { sincronizarTodos } = require('../services/jotformSync.service');

let isSyncing = false;
let lastSyncTime = null;
let syncCount = 0;
let syncErrors = 0;

const ejecutarSync = async () => {
  if (isSyncing) {
    console.warn('[JOTFORM-SYNC] Ya hay una sincronización en progreso, se ignora esta ejecución');
    return;
  }
  if (!process.env.JOTFORM_API_KEY) {
    console.warn('[JOTFORM-SYNC] Falta JOTFORM_API_KEY en el .env — job saltado');
    return;
  }

  isSyncing = true;
  const startTime = Date.now();
  try {
    console.log('[JOTFORM-SYNC] Iniciando sincronización...');
    const resultados = await sincronizarTodos();
    const duration = Date.now() - startTime;
    lastSyncTime = new Date();
    syncCount++;

    resultados.forEach(r => {
      if (r.error) {
        console.error(`[JOTFORM-SYNC] ❌ ${r.formId}: ${r.error}`);
      } else {
        console.log(`[JOTFORM-SYNC] ✅ ${r.empresa}: ${r.total} envíos revisados, ${r.actualizados} actualizados, ${r.sinCambios} sin cambios`);
      }
    });
    console.log(`[JOTFORM-SYNC] Terminado en ${duration}ms — próxima corrida: ${new Date(Date.now() + 20 * 60000).toISOString()}`);
  } catch (err) {
    syncErrors++;
    console.error('[JOTFORM-SYNC] ❌ Error general:', err.message);
  } finally {
    isSyncing = false;
  }
};

// Cada 20 minutos, todo el día (los envíos pueden llegar a cualquier hora)
const initJotformSync = () => {
  cron.schedule('*/20 * * * *', ejecutarSync, { timezone: 'America/Guayaquil' });
  console.log('[JOTFORM-SYNC] Job programado cada 20 minutos');
};

const getSyncStatus = () => ({
  isSyncing,
  lastSyncTime,
  syncCount,
  syncErrors,
  nextSyncTime: new Date(Date.now() + 20 * 60000),
});

module.exports = { initJotformSync, ejecutarSync, getSyncStatus };
