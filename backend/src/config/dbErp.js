const { Pool } = require('pg');
require('dotenv').config();

/**
 * Pool secundario hacia "erp_database" — el nuevo desarrollo más optimizado.
 * Vive en el MISMO servidor Postgres de Render que "bddgeneral" (mismo host,
 * puerto, usuario y contraseña), solo cambia el nombre de la base. Por eso
 * Render no la muestra como un recurso aparte en el dashboard: no es una
 * instancia nueva, es otra base creada dentro de la instancia existente.
 *
 * Uso: el webhook de Bitrix (bitrixWebhook.controller.js) escribe primero en
 * el pool principal (config/db.js -> bddgeneral, como siempre) y DESPUÉS
 * replica esa misma escritura aquí. Si esta base falla o no existe todavía,
 * el error se registra pero NUNCA rompe la respuesta del webhook — Bitrix
 * jamás se entera y las URLs/token no cambian en nada.
 */
const pool = new Pool({
  host:     process.env.ERP_DB_HOST || process.env.DB_HOST,
  user:     process.env.ERP_DB_USER || process.env.DB_USER,
  password: process.env.ERP_DB_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.ERP_DB_NAME || 'erp_database',
  port:     process.env.ERP_DB_PORT || process.env.DB_PORT,

  ssl: { rejectUnauthorized: false },

  max:                     5,
  min:                     0,
  idleTimeoutMillis:       10000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle:         true,
  keepAlive:               true, // evita que Render/la red corte la conexión en procesos largos (igual que config/db.js)
});

pool.on('error', (err) => {
  // Igual que en config/db.js y config/dbLocal.js: un error en esta conexión
  // secundaria nunca debe tumbar el backend principal.
  console.error('[DB-ERP] Error en pool de conexiones (erp_database):', err.message);
});

module.exports = pool;
