// JOB CRON: Refresca vista materializada cada 15 minutos
// Vista: mv_indicadores_velsa_completo
// Ejecuta automáticamente cada 15 minutos

const cron = require('node-cron');
const pool = require('../config/db');

// Variables para tracking
let isRefreshing = false;
let lastRefreshTime = null;
let refreshCount = 0;
let refreshErrors = 0;

const refreshMaterializedView = async () => {
  if (isRefreshing) {
    console.warn('[REFRESH-MV-VELSA] Ya hay un refresh en progreso, ignorando esta ejecución');
    return;
  }

  isRefreshing = true;
  const startTime = Date.now();

  try {
    console.log(`[REFRESH-MV-VELSA] Iniciando refresco de vista materializada...`);

    await pool.query('REFRESH MATERIALIZED VIEW public.mv_indicadores_velsa_completo');

    const duration = Date.now() - startTime;
    lastRefreshTime = new Date();
    refreshCount++;

    console.log(`[REFRESH-MV-VELSA] ✅ Vista refrescada exitosamente en ${duration}ms`);
    console.log(`[REFRESH-MV-VELSA] Total de refreshes: ${refreshCount}`);
    console.log(`[REFRESH-MV-VELSA] Próximo refresco: ${new Date(Date.now() + 15 * 60000).toISOString()}`);

  } catch (err) {
    refreshErrors++;
    console.error(`[REFRESH-MV-VELSA] ❌ Error al refrescar vista materializada:`, err.message);
    console.error(`[REFRESH-MV-VELSA] Errores totales: ${refreshErrors}`);
  } finally {
    isRefreshing = false;
  }
};

// Ejecutar refresco cada 15 minutos
// ⛔ DESACTIVADO temporalmente (scheduled: false) — el refresh tardaba >90s
// y contribuyó a la caída de la BD. Para reactivar: quitar { scheduled: false }.
const job = cron.schedule('*/15 * * * *', () => {
  refreshMaterializedView();
}, { scheduled: false });

// Ejecutar refresco inicial al iniciar la aplicación
const runInitialRefresh = async () => {
  console.log('[REFRESH-MV-VELSA] Ejecutando refresco inicial...');
  await refreshMaterializedView();
};

// Endpoint para ver estado del refresco (opcional)
const getRefreshStatus = () => {
  return {
    isRefreshing,
    lastRefreshTime,
    refreshCount,
    refreshErrors,
    nextRefreshTime: new Date(Date.now() + 15 * 60000)
  };
};

// Endpoint para forzar refresco manual
const forceRefresh = async () => {
  console.log('[REFRESH-MV-VELSA] Refresco manual forzado por usuario');
  return refreshMaterializedView();
};

module.exports = {
  job,
  runInitialRefresh,
  getRefreshStatus,
  forceRefresh,
  refreshMaterializedView
};
