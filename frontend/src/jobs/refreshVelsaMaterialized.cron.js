const cron = require('node-cron');
const pool = require('../config/db');

let isRefreshing = false;

const refreshMaterializedView = async () => {
  if (isRefreshing) return;
  
  isRefreshing = true;
  try {
    console.log('[REFRESH-MV] Refrescando vista materializada...');
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_indicadores_velsa_completo');
    console.log('[REFRESH-MV] ✅ Vista refrescada');
  } catch (err) {
    console.error('[REFRESH-MV] ❌ Error:', err.message);
  } finally {
    isRefreshing = false;
  }
};

// Ejecutar cada 15 minutos
cron.schedule('*/15 * * * *', refreshMaterializedView);

// Ejecutar al iniciar
module.exports = { refreshMaterializedView };