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

    // FIX (2026-07-22): validar contra pg_matviews ANTES de refrescar.
    // "mv_monitoreo_publicidad" existía como vista NORMAL (no materializada)
    // y el REFRESH abortaba el loop completo → las demás vistas tampoco se
    // refrescaban y el contador de errores crecía en cada ciclo (cada 30 min).
    const { rows } = await pool.query(
      `SELECT schemaname || '.' || matviewname AS nombre FROM pg_matviews`
    );
    const matviewsReales = new Set(rows.map(r => r.nombre));

    let refrescadas = 0;
    for (const vista of VISTAS) {
      if (!matviewsReales.has(vista)) {
        console.warn(`[REFRESH-MV-REDES] ⏭️ ${vista} no es una vista materializada — omitida. ` +
          `(Si debe serlo: DROP VIEW ${vista}; CREATE MATERIALIZED VIEW ${vista} AS ...)`);
        continue;
      }
      // try/catch por vista: un fallo individual no aborta las demás
      const t0 = Date.now();
      try {
        await pool.query(`REFRESH MATERIALIZED VIEW ${vista}`);
        refrescadas++;
        console.log(`[REFRESH-MV-REDES] ✅ ${vista} refrescada en ${Date.now() - t0}ms`);
      } catch (err) {
        refreshErrors++;
        console.error(`[REFRESH-MV-REDES] ❌ Error refrescando ${vista}:`, err.message);
      }
    }

    const duration = Date.now() - startTime;
    lastRefreshTime = new Date();
    refreshCount++;

    console.log(`[REFRESH-MV-REDES] ✅ ${refrescadas}/${VISTAS.length} vistas refrescadas en ${duration}ms (ciclos: ${refreshCount} | errores acumulados: ${refreshErrors})`);
  } catch (err) {
    refreshErrors++;
    console.error(`[REFRESH-MV-REDES] ❌ Error al refrescar vistas:`, err.message);
    console.error(`[REFRESH-MV-REDES] Errores totales: ${refreshErrors}`);
  } finally {
    isRefreshing = false;
  }
};

// Ejecutar refresh cada 30 minutos, desfasado a :07 y :37
// para NO coincidir con el cron de VELSA (*/15 → :00, :15, :30, :45).
// Dos REFRESH simultáneos saturaban la memoria de Postgres en Render.
const job = cron.schedule('7,37 * * * *', () => {
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
