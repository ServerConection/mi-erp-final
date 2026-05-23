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

module.exports = pool;
