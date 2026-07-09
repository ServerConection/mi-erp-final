/**
 * Prueba SOLAMENTE la conexión a erp_database y muestra el error completo
 * (código + mensaje) si falla, para saber la causa exacta.
 *
 * Uso: node scripts/probar_conexion_erp.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const config = {
  host:     process.env.ERP_DB_HOST || process.env.DB_HOST,
  user:     process.env.ERP_DB_USER || process.env.DB_USER,
  password: process.env.ERP_DB_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.ERP_DB_NAME || 'erp_database',
  port:     process.env.ERP_DB_PORT || process.env.DB_PORT,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
};

console.log('Conectando con:', { ...config, password: '(oculta)' });

const pool = new Pool(config);

pool.query('SELECT current_database(), now(), version()')
  .then((r) => {
    console.log('\n✅ CONEXIÓN OK:', r.rows[0]);
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ ERROR AL CONECTAR');
    console.error('code:', err.code);
    console.error('message:', err.message);
    console.error(err);
    process.exit(1);
  });
