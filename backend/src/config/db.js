const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port:     process.env.DB_PORT,

  ssl: { rejectUnauthorized: false },

  // PERFORMANCE: pool tuning conservador (no cambia comportamiento)
  max:                    20,      // ligero aumento: 15 -> 20 conexiones simultaneas
  min:                    2,       // mantener 2 conexiones calientes
  idleTimeoutMillis:      10000,   // cerrar inactivas
  connectionTimeoutMillis: 10000,  // esperar hasta 10s por una conexion libre
  allowExitOnIdle:        false,
  // statement_timeout: aborta queries colgadas que bloquean el pool
  statement_timeout:      90000,   // 90s maximo por query
  query_timeout:          90000,
  keepAlive:              true,
});

// Keepalive: evita que Render cierre conexiones idle abruptamente
const keepaliveInterval = setInterval(() => {
  pool.query('SELECT 1').catch(() => {}); // silencioso
}, 8000);
if (keepaliveInterval.unref) keepaliveInterval.unref();

pool.on('error', (err) => {
  // NO hacer process.exit aqui - un error en una conexion idle
  // no debe tumbar todo el servidor. El pool se recupera solo.
  console.error('[DB] Error en pool de conexiones:', err.message);
});

// ─────────────────────────────────────────────────────────────────────────────
// parse_fecha_flex: función IMMUTABLE usada por los índices funcionales del
// dashboard (ver migrations/fix_dashboard_performance.sql). Se auto-provisiona
// al arrancar para que el deploy no dependa del orden código/migración.
// CREATE OR REPLACE es idempotente y barato.
// ─────────────────────────────────────────────────────────────────────────────
const PARSE_FECHA_FLEX_DDL = `
CREATE OR REPLACE FUNCTION public.parse_fecha_flex(valor text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
    IF valor IS NULL OR TRIM(valor) = '' THEN
        RETURN NULL;
    END IF;
    IF valor ~ '^\\d{4}-\\d{2}-\\d{2}' THEN
        RETURN SUBSTRING(valor FROM 1 FOR 10)::date;
    END IF;
    RETURN TO_DATE(SUBSTRING(valor FROM 5 FOR 11), 'Mon DD YYYY');
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;`;

const ensureParseFechaFlex = async (intento = 1) => {
  try {
    await pool.query(PARSE_FECHA_FLEX_DDL);
    console.log('[DB] Función parse_fecha_flex lista');
  } catch (err) {
    console.error(`[DB] Error creando parse_fecha_flex (intento ${intento}):`, err.message);
    if (intento < 3) setTimeout(() => ensureParseFechaFlex(intento + 1), 5000 * intento);
  }
};
ensureParseFechaFlex();

// ── Helpers para el módulo WhatsApp (aditivo, no cambia el uso existente) ──
// Permiten `const { query, transaction } = require('../config/db')` con bind correcto.
// El código existente que hace `pool.query(...)` sigue funcionando igual.
const _query = pool.query.bind(pool);
pool.query = _query; // propiedad propia ya enlazada → destructurar es seguro

pool.transaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
};

pool.pool = pool; // compatibilidad con `const { pool } = require(...)`

module.exports = pool;
