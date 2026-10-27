// ============================================================================
// JOB CRON: Refresco de la vista materializada public.mestra_bitrix
// ============================================================================
//
// mestra_bitrix pasó a ser una VISTA (mestra_bitrix_ev + vw_ev_live_mestra).
// Sin índices, cada consulta de Indicadores tardaba ~40 s y saturaba el CPU.
// Se convirtió en VISTA MATERIALIZADA con índices; la vista original quedó
// como public.mestra_bitrix_vista. Este job la mantiene al día.
//
// - Cliente dedicado con statement_timeout = 0 (el refresco lee la vista pesada).
// - Usa CONCURRENTLY si existe un índice único (no bloquea lecturas); si no,
//   hace un refresco normal (bloquea lecturas solo durante el refresco).
// - Solo actúa si mestra_bitrix es realmente una vista materializada.
//
// VARIABLES DE ENTORNO (opcionales):
//   MESTRA_BITRIX_AUTOREFRESH   'off' para desactivar.   (default: on)
//   MESTRA_BITRIX_REFRESH_CRON  expresión cron.          (default: '*/10 * * * *')
// ============================================================================

const cron = require('node-cron');
const pool = require('../config/db');

const MV_NAME   = 'public.mestra_bitrix';
const AUTO      = String(process.env.MESTRA_BITRIX_AUTOREFRESH || 'on').toLowerCase() !== 'off';
const CRON_EXPR = process.env.MESTRA_BITRIX_REFRESH_CRON || '*/10 * * * *';
const TAG = '[REFRESH-MV-MESTRA-BITRIX]';

let isRefreshing = false;
let job = null;

const estadoMatview = async () => {
  const { rows } = await pool.query(
    `SELECT
       EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname='public' AND matviewname='mestra_bitrix') AS es_mv,
       EXISTS (SELECT 1 FROM pg_indexes  WHERE schemaname='public' AND tablename='mestra_bitrix'
                 AND indexdef ILIKE 'CREATE UNIQUE INDEX%') AS tiene_unico`
  );
  return rows[0] || { es_mv: false, tiene_unico: false };
};

const refreshMestraBitrix = async () => {
  if (isRefreshing) {
    console.warn(`${TAG} Ya hay un refresh en progreso, ignorando.`);
    return { skipped: true };
  }
  const { es_mv, tiene_unico } = await estadoMatview();
  if (!es_mv) return { skipped: true, reason: 'no_matview' };

  isRefreshing = true;
  const startTime = Date.now();
  const client = await pool.connect();
  try {
    await client.query('SET statement_timeout = 0');
    await client.query('SET lock_timeout = 0');
    await client.query(`REFRESH MATERIALIZED VIEW ${tiene_unico ? 'CONCURRENTLY ' : ''}${MV_NAME}`);
    const durationMs = Date.now() - startTime;
    console.log(`${TAG} OK ${tiene_unico ? '(concurrente) ' : ''}en ${durationMs}ms`);
    return { ok: true, durationMs };
  } catch (err) {
    console.error(`${TAG} Error al refrescar:`, err.message);
    return { ok: false, error: err.message };
  } finally {
    client.release();
    isRefreshing = false;
  }
};

const initMestraBitrixRefresh = () => {
  if (!AUTO) {
    console.log(`${TAG} Auto-refresh DESACTIVADO (MESTRA_BITRIX_AUTOREFRESH=off).`);
    return null;
  }
  if (!cron.validate(CRON_EXPR)) {
    console.error(`${TAG} CRON inválido: "${CRON_EXPR}". No activado.`);
    return null;
  }
  setTimeout(() => { refreshMestraBitrix().catch(() => {}); }, 30000);
  job = cron.schedule(CRON_EXPR, () => { refreshMestraBitrix().catch(() => {}); });
  console.log(`${TAG} Auto-refresh ACTIVADO - cron="${CRON_EXPR}".`);
  return job;
};

module.exports = { initMestraBitrixRefresh, refreshMestraBitrix };
