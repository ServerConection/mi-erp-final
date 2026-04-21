const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port:     process.env.DB_PORT,

  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : false,

  max:                    15,      // máx conexiones simultáneas
  idleTimeoutMillis:      10000,   // cerrar inactivas antes de que Render las mate (30s)
  connectionTimeoutMillis: 10000,  // esperar hasta 10s por una conexión libre
  allowExitOnIdle:        false,
});

// Keepalive: evita que Render cierre conexiones idle abruptamente
setInterval(() => {
  pool.query('SELECT 1').catch(() => {}); // silencioso — solo mantiene el pool activo
}, 8000);

pool.on('error', (err) => {
  console.error('[DB] Error en pool de conexiones:', err.message);
});

module.exports = pool;
