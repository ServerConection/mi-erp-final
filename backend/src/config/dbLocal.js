const { Pool } = require('pg');
require('dotenv').config();

/**
 * Pool secundario hacia la Postgres LOCAL (localhost), separado del pool
 * principal en config/db.js (que apunta a Render `bddgeneral`).
 *
 * Por qué existe: `bitrix_contacts` y `public.velsa_inversion_diaria` viven
 * únicamente en esta instancia local (confirmado por código en
 * contactos-bitrix-sync/src/config/database.js y
 * reporte-automatizado/src/services/vidikaService.js -> config/dbLocal.js).
 * El backend ERP nunca tuvo una conexión a esta base porque ningún
 * controller la consultaba.
 *
 * Importante en producción (Render): si este backend corre como servicio
 * en Render (no vía PM2 en la máquina local), esta conexión NO podrá
 * alcanzar `localhost` y las queries que la usan fallarán de forma
 * controlada (ver controllers/datosAdicionales.controller.js) sin tumbar
 * el resto del ERP, gracias al pool.on('error') de abajo.
 */
const pool = new Pool({
  host:     process.env.LOCAL_DB_HOST || 'localhost',
  user:     process.env.LOCAL_DB_USER || 'postgres',
  password: process.env.LOCAL_DB_PASSWORD,
  database: process.env.LOCAL_DB_NAME || 'postgres',
  port:     process.env.LOCAL_DB_PORT || 5432,

  max:                     5,
  min:                     0,
  idleTimeoutMillis:       10000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle:         true,
});

pool.on('error', (err) => {
  // Igual que en config/db.js: nunca tumbar el proceso por un error
  // de conexión en este pool secundario.
  console.error('[DB-LOCAL] Error en pool de conexiones:', err.message);
});

module.exports = pool;
