const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function main() {
  const migration = path.join(__dirname, '../migrations/20261116_welcome_variantes_pdf.sql');
  await pool.query(fs.readFileSync(migration, 'utf8'));
  const { rows } = await pool.query(`
    SELECT code, name, active, sort_order, length(body) AS caracteres
    FROM welcome_variants
    WHERE code LIKE 'WELCOME_%'
    ORDER BY sort_order
  `);
  console.table(rows);
}

main()
  .catch((error) => {
    console.error('[WELCOME VARIANTES]', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

