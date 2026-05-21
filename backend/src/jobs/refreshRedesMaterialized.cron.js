// JOB CRON: Refresca vistas materializadas del módulo Redes cada 30 minutos
// Vistas: mv_monitoreo_publicidad, mv_monitoreo_hora, mv_monitoreo_ciudad
// Ejecuta automáticamente cada 30 minutos para mantener datos frescos

const cron = require('node-cron');
const pool = require('../config/db');

const VISTAS = [
  'public.mv_monitoreo_publicidad',
  'public.mv_monitoreo_hora',
  'public.mv_monitoreo_ciudad',
];

let isRefreshing = false;
let lastRefreshTime = null;
let refreshCount = 0;
let refreshErrors = 0;

const refreshRedesMVs = async () => {
  if (isRefreshing) {
    console.warn('[REFRESH-MV-REDES] Ya hay un refresh en progreso, ignorando esta ejecución');
    return;
  }

  isRefreshing = true;
  const startTime = Date.now();

  try {
    console.log('[REFRESH-MV-REDES] Iniciando refresco de vistas materializadas de Redes...');

    for (const vista of VISTAS) {
      const t0 = Date.now();
      await pool.query(`REFRESH MATERIALIZED VIEW ${vista}`);
      console.log(`[REFRESH-MV-REDES] ✅ ${vista} refrescada en ${Date.now() - t0}ms`);
    }

    const duration = Date.now() - startTime;
    lastRefreshTime = new Date();
    refreshCount++;

    console.log(`[REFRESH-MV-REDES] ✅ Todas las vistas refrescadas en ${duration}ms (total: ${refreshCount})`);
  } catch (err) {
    refreshErrors++;
    console.error(`[REFRESH-MV-REDES] ❌ Error al refrescar vistas:`, err.message);
    console.error(`[REFRESH-MV-REDES] Errores totales: ${refreshErrors}`);
  } finally {
    isRefreshing = false;
  }
};

// Ejecutar refresh cada 30 minutos
const job = cron.schedule('*/30 * * * *', () => {
  refreshRedesMVs();
});

// Refresh inicial al arrancar el servidor
const runInitialRefresh = async () => {
  console.log('[REFRESH-MV-REDES] Ejecutando refresco inicial de vistas de Redes...');
  await refreshRedesMVs();
};

const getRefreshStatus = () => ({
  isRefreshing,
  lastRefreshTime,
  refreshCount,
  refreshErrors,
  nextRefreshTime: new Date(Date.now() + 30 * 60000),
});

module.exports = {
  job,
  runInitialRefresh,
  getRefreshStatus,
  refreshRedesMVs,
};
