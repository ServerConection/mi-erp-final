/** Diagnostico de solo lectura para el modulo Uso y Cobertura. */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const db = require('../config/db');
const erp = require('../config/dbErp');

async function columnas(pool, tablas) {
  const { rows } = await pool.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position
  `, [tablas]);
  return rows;
}

async function main() {
  const primarias = ['messages', 'conversations', 'lines', 'campaigns', 'campaign_recipients',
    'usuarios', 'coverage_consultas', 'wa_ai_usage', 'nexo_ia_sugerencias'];
  const reparto = ['gestionables_asignaciones', 'velsa_gestionables_asignaciones',
    'semillero_gestionables_asignaciones'];

  const [colsDb, colsErp, tablasUso] = await Promise.all([
    columnas(db, primarias),
    columnas(erp, reparto),
    db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name ILIKE '%usage%' OR table_name ILIKE '%uso%' OR table_name ILIKE '%plume%')
      ORDER BY table_name
    `),
  ]);

  console.log(JSON.stringify({
    tablas_uso: tablasUso.rows.map((r) => r.table_name),
    principal: colsDb,
    reparto: colsErp,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  await Promise.allSettled([db.end(), erp.end()]);
});
