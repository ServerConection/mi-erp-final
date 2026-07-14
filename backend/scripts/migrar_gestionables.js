/**
 * Corre la migración de gestionables_asesores contra erp_database.
 * Seguro de repetir (todo el SQL usa IF NOT EXISTS / ON CONFLICT DO NOTHING).
 *
 * Uso: node scripts/migrar_gestionables.js
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
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

const sqlPath = path.resolve(__dirname, '..', 'src', 'db', 'migrations', 'gestionables_asesores.sql');

(async () => {
  console.log('Base destino:', config.database, '@', config.host);
  const pool = new Pool(config);
  try {
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('✅ Migración gestionables_asesores aplicada correctamente.');

    const r = await pool.query('SELECT nombre_bitrix_asesor, gestionables_permitidos, fecha_carga FROM gestionables_asesores ORDER BY fecha_carga DESC, nombre_bitrix_asesor');
    console.log(`\nFilas actuales en gestionables_asesores (${r.rows.length}):`);
    r.rows.forEach(row => console.log(`  ${row.nombre_bitrix_asesor} — ${row.gestionables_permitidos} — ${row.fecha_carga.toISOString().slice(0,10)}`));
    process.exit(0);
  } catch (err) {
    console.error('❌ Error aplicando la migración:', err.message);
    process.exit(1);
  }
})();
