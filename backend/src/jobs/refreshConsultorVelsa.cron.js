// ============================================================================
// JOB CRON: Refresco de la vista materializada mv_consultor_velsa
// ============================================================================
//
// Alimenta la API externa /api/consultor-velsa/buscar. El MV es pequeño
// (4 columnas, 1 fila por id_bitrix_ghl) y su refresco es barato comparado
// con el MV grande del dashboard.
//
// SEGURIDAD (mismo patrón probado de refreshVelsaMaterialized.cron.js):
//   - Cliente DEDICADO con statement_timeout = 0: el refresco puede leer la
//     vista base pesada sin que lo mate el límite de 90 s del pool.
//   - REFRESH ... CONCURRENTLY: NO bloquea las lecturas de la API. Requiere el
//     índice ÚNICO idx_mv_consultor_velsa_id (creado en la migración
//     mv_consultor_velsa.sql). Si el MV o el índice no existen todavía, NO hace
//     un refresco bloqueante: registra una advertencia y termina.
//   - Valida contra pg_matviews que el MV exista antes de tocarlo.
//   - Encendido por defecto (el MV es liviano). Se apaga con
//     CONSULTOR_VELSA_AUTOREFRESH='off'.
//
// VARIABLES DE ENTORNO (opcionales):
//   CONSULTOR_VELSA_AUTOREFRESH   'off' para desactivar.   (default: on)
//   CONSULTOR_VELSA_REFRESH_CRON  expresión cron.          (default: '*/30 * * * *')
// ============================================================================

const cron = require('node-cron');
const pool = require('../config/db');

const MV_NAME   = 'public.mv_consultor_velsa';
const AUTO      = String(process.env.CONSULTOR_VELSA_AUTOREFRESH || 'on').toLowerCase() !== 'off';
const CRON_EXPR = process.env.CONSULTOR_VELSA_REFRESH_CRON || '*/30 * * * *';

let isRefreshing = false;
let job = null;

const matviewExiste = async () => {
  const { rows } = await pool.query(
    `SELECT 1 FROM pg_matviews WHERE schemaname='public' AND matviewname='mv_consultor_velsa' LIMIT 1`
  );
  return rows.length > 0;
};

const refreshConsultorVelsa = async () => {
  if (isRefreshing) {
    console.warn('[REFRESH-MV-CONSULTOR-VELSA] Ya hay un refresh en progreso, ignorando.');
    return { skipped: true };
  }
  if (!(await matviewExiste())) {
    console.warn(`[REFRESH-MV-CONSULTOR-VELSA] ${MV_NAME} no existe todavía. `
      + 'Aplica la migración mv_consultor_velsa.sql en pgAdmin. Omitido.');
    return { skipped: true, reason: 'no_matview' };
  }

  isRefreshing = true;
  const startTime = Date.now();
  const client = await pool.connect();
  try {
    // El refresco lee la vista base pesada: desactivamos el límite SOLO aquí.
    await client.query('SET statement_timeout = 0');
    await client.query('SET lock_timeout = 0');
    try {
      await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${MV_NAME}`);
    } catch (err) {
      // Caso típico: falta el índice único -> no forzamos un refresco bloqueante.
      if (/concurrently/i.test(String(err.message || ''))) {
        console.warn('[REFRESH-MV-CONSULTOR-VELSA] Falta el índice ÚNICO idx_mv_consultor_velsa_id. '
          + 'Aplica la migración mv_consultor_velsa.sql. No se ejecutó refresco bloqueante.');
        return { ok: false, reason: 'missing_unique_index' };
      }
      throw err;
    }
    const durationMs = Date.now() - startTime;
    console.log(`[REFRESH-MV-CONSULTOR-VELSA] OK refrescado en ${durationMs}ms`);
    return { ok: true, durationMs };
  } catch (err) {
    console.error('[REFRESH-MV-CONSULTOR-VELSA] Error al refrescar:', err.message);
    return { ok: false, error: err.message };
  } finally {
    client.release();
    isRefreshing = false;
  }
};

// Inicialización desde server.js. Programa el cron y dispara un refresco
// inicial EN SEGUNDO PLANO (no bloquea el arranque del servidor).
const initConsultorVelsaRefresh = () => {
  if (!AUTO) {
    console.log('[REFRESH-MV-CONSULTOR-VELSA] Auto-refresh DESACTIVADO (CONSULTOR_VELSA_AUTOREFRESH=off).');
    return null;
  }
  if (!cron.validate(CRON_EXPR)) {
    console.error(`[REFRESH-MV-CONSULTOR-VELSA] CRON inválido: "${CRON_EXPR}". No activado.`);
    return null;
  }
  // Refresco inicial en background (tras 20 s, para no competir con el arranque).
  setTimeout(() => { refreshConsultorVelsa().catch(() => {}); }, 20000);
  job = cron.schedule(CRON_EXPR, () => { refreshConsultorVelsa(); });
  console.log(`[REFRESH-MV-CONSULTOR-VELSA] Auto-refresh ACTIVADO - cron="${CRON_EXPR}".`);
  return job;
};

module.exports = {
  initConsultorVelsaRefresh,
  refreshConsultorVelsa,
};
