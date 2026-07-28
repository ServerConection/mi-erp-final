// ============================================================================
// JOB CRON: Refresco de la vista materializada mv_indicadores_velsa_completo
// ============================================================================
//
// HISTORIA:
//   El refresco original corría cada 15 min con:
//       await pool.query('REFRESH MATERIALIZED VIEW public.mv_indicadores_velsa_completo')
//   Eso tomaba un LOCK exclusivo (AccessExclusive) durante >90 s en horario
//   laboral y bloqueaba TODAS las lecturas del dashboard -> se acumulaban
//   conexiones -> la BD parecia "caida". Ademas, el pool tiene statement_timeout
//   de 90 s (config/db.js), por lo que un refresco largo podia abortarse a la
//   mitad. Por eso el cron quedo DESACTIVADO.
//
// ESTA VERSION (segura, reversible, apagada por defecto):
//   - Corre sobre un CLIENTE DEDICADO con statement_timeout = 0 (no lo mata el
//     limite de 90 s del pool).
//   - Modo "concurrent" (por defecto): usa REFRESH ... CONCURRENTLY, que NO
//     bloquea las lecturas del dashboard. Requiere un indice UNICO en la MV
//     (ver migracion enable_mv_velsa_concurrent_refresh.sql). Si ese indice no
//     existe, NO hace un refresco bloqueante: registra una advertencia clara y
//     termina, para nunca volver a tumbar la BD.
//   - Modo "blocking": hace el REFRESH clasico (toma lock). Usalo SOLO en
//     horario de bajo trafico (de madrugada). No necesita indice unico.
//   - Valida contra pg_matviews que la MV exista antes de tocarla.
//   - Esta APAGADO salvo que VELSA_MV_AUTOREFRESH='on'. Sin esa variable, el
//     comportamiento del sistema no cambia en absoluto.
//
// VARIABLES DE ENTORNO (.env del backend):
//   VELSA_MV_AUTOREFRESH   'on' para activar el cron.           (default: off)
//   VELSA_MV_REFRESH_MODE  'concurrent' | 'blocking'.           (default: concurrent)
//   VELSA_MV_REFRESH_CRON  expresion cron del refresco.         (default: '0 6 * * *' = 6:00 a diario)
//
// Reactivar de forma segura:
//   1) (Opcional, para modo concurrent) aplicar enable_mv_velsa_concurrent_refresh.sql
//   2) En .env:  VELSA_MV_AUTOREFRESH=on
//   3) Reiniciar el backend.
// Revertir: quitar VELSA_MV_AUTOREFRESH (o ='off') y reiniciar. Nada mas.
// ============================================================================

const cron = require('node-cron');
const pool = require('../config/db');

const MV_NAME   = 'public.mv_indicadores_velsa_completo';
const AUTO      = String(process.env.VELSA_MV_AUTOREFRESH || 'off').toLowerCase() === 'on';
const MODE      = String(process.env.VELSA_MV_REFRESH_MODE || 'concurrent').toLowerCase();
const CRON_EXPR = process.env.VELSA_MV_REFRESH_CRON || '0 6 * * *';

// Estado para el endpoint de status
let isRefreshing    = false;
let lastRefreshTime = null;
let lastDurationMs  = null;
let refreshCount    = 0;
let refreshErrors   = 0;
let lastError       = null;
let job             = null;

// -- La MV existe realmente como vista materializada? (evita errores raros) --
const matviewExiste = async () => {
  const { rows } = await pool.query(
    `SELECT 1 FROM pg_matviews WHERE schemaname='public' AND matviewname='mv_indicadores_velsa_completo' LIMIT 1`
  );
  return rows.length > 0;
};

// -- Refresco principal ------------------------------------------------------
const refreshMaterializedView = async () => {
  if (isRefreshing) {
    console.warn('[REFRESH-MV-VELSA] Ya hay un refresh en progreso, ignorando esta ejecucion');
    return { skipped: true };
  }

  if (!(await matviewExiste())) {
    console.warn(`[REFRESH-MV-VELSA] ${MV_NAME} no existe como vista materializada - omitido.`);
    return { skipped: true, reason: 'no_matview' };
  }

  isRefreshing = true;
  const startTime = Date.now();
  // Cliente DEDICADO: asi podemos desactivar el statement_timeout SOLO aqui,
  // sin afectar al resto del pool.
  const client = await pool.connect();

  try {
    await client.query('SET statement_timeout = 0');
    await client.query('SET lock_timeout = 0');

    const concurrent = MODE !== 'blocking';
    console.log(`[REFRESH-MV-VELSA] Iniciando refresco (${concurrent ? 'CONCURRENTLY' : 'BLOQUEANTE'})...`);

    try {
      await client.query(
        `REFRESH MATERIALIZED VIEW ${concurrent ? 'CONCURRENTLY ' : ''}${MV_NAME}`
      );
    } catch (err) {
      // Caso tipico: modo concurrent pero la MV no tiene indice unico todavia.
      const msg = String(err.message || '');
      if (concurrent && /concurrently/i.test(msg)) {
        console.warn('[REFRESH-MV-VELSA] No se puede refrescar CONCURRENTLY: falta un indice UNICO en la MV.');
        console.warn('[REFRESH-MV-VELSA]   Aplica la migracion enable_mv_velsa_concurrent_refresh.sql');
        console.warn('[REFRESH-MV-VELSA]   o usa VELSA_MV_REFRESH_MODE=blocking en horario de baja carga.');
        console.warn('[REFRESH-MV-VELSA]   NO se ejecuto un refresco bloqueante (para no tumbar la BD).');
        refreshErrors++;
        lastError = 'missing_unique_index';
        return { ok: false, reason: 'missing_unique_index' };
      }
      throw err;
    }

    lastDurationMs  = Date.now() - startTime;
    lastRefreshTime = new Date();
    refreshCount++;
    lastError = null;
    console.log(`[REFRESH-MV-VELSA] OK Vista refrescada en ${lastDurationMs}ms (total: ${refreshCount})`);
    return { ok: true, durationMs: lastDurationMs };

  } catch (err) {
    refreshErrors++;
    lastError = err.message;
    console.error('[REFRESH-MV-VELSA] Error al refrescar:', err.message);
    return { ok: false, error: err.message };
  } finally {
    client.release();
    isRefreshing = false;
  }
};

// -- Refresco inicial (opcional) al arrancar ---------------------------------
const runInitialRefresh = async () => {
  console.log('[REFRESH-MV-VELSA] Ejecutando refresco inicial...');
  return refreshMaterializedView();
};

// -- Estado (para un posible endpoint de monitoreo) --------------------------
const getRefreshStatus = () => ({
  enabled: AUTO,
  mode: MODE,
  cron: CRON_EXPR,
  isRefreshing,
  lastRefreshTime,
  lastDurationMs,
  refreshCount,
  refreshErrors,
  lastError,
});

// -- Forzar refresco manual (por si se quiere exponer en una ruta admin) -----
const forceRefresh = async () => {
  console.log('[REFRESH-MV-VELSA] Refresco manual forzado');
  return refreshMaterializedView();
};

// -- Inicializacion del cron (llamada desde server.js) -----------------------
// Sin VELSA_MV_AUTOREFRESH='on' esto NO programa nada: el sistema queda igual.
const initVelsaAutoRefresh = () => {
  if (!AUTO) {
    console.log('[REFRESH-MV-VELSA] Auto-refresh DESACTIVADO (define VELSA_MV_AUTOREFRESH=on para activarlo).');
    return null;
  }
  if (!cron.validate(CRON_EXPR)) {
    console.error(`[REFRESH-MV-VELSA] VELSA_MV_REFRESH_CRON invalido: "${CRON_EXPR}". Cron no activado.`);
    return null;
  }
  job = cron.schedule(CRON_EXPR, () => { refreshMaterializedView(); });
  console.log(`[REFRESH-MV-VELSA] Auto-refresh ACTIVADO - modo=${MODE}, cron="${CRON_EXPR}".`);
  return job;
};

module.exports = {
  job,
  initVelsaAutoRefresh,
  runInitialRefresh,
  getRefreshStatus,
  forceRefresh,
  refreshMaterializedView,
};
