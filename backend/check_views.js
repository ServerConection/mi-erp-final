require('dotenv').config({ path: '/sessions/eager-kind-feynman/mnt/V1/backend/.env' });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // Columnas de la vista VELSA
  const velsa = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'vw_jotform_velsa_netlife_completo'
    ORDER BY ordinal_position
  `);
  console.log('=== VELSA COLUMNS ===');
  velsa.rows.forEach(r => console.log(r.column_name, '-', r.data_type));

  // Columnas de la vista NOVONET
  const novo = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'vista_analisis_novonet'
    ORDER BY ordinal_position
  `);
  console.log('\n=== NOVONET COLUMNS ===');
  novo.rows.forEach(r => console.log(r.column_name, '-', r.data_type));

  await pool.end();
}
main().catch(console.error);
