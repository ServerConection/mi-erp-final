/** Deja vista_analisis_novonet como estaba: quita la columna plan_gamer vacía. */
require('dotenv').config()
const { Pool } = require('pg')
const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT||5432,
  database: process.env.DB_NAME||process.env.DB_DATABASE,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
})
async function main() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int c FROM information_schema.columns
      WHERE table_schema='public' AND table_name='vista_analisis_novonet' AND column_name='plan_gamer'`)
  if (!rows[0].c) { console.log('\nLa columna ya no existe.\n'); await pool.end(); return }

  const { rows: n } = await pool.query(
    `SELECT COUNT(*)::int c FROM public.vista_analisis_novonet
      WHERE plan_gamer IS NOT NULL AND TRIM(plan_gamer) <> ''`)
  console.log(`\nplan_gamer tiene ${n[0].c} valores.`)
  if (n[0].c > 0) { console.log('Tiene datos: NO se borra. Revisar antes.\n'); await pool.end(); return }

  await pool.query('ALTER TABLE public.vista_analisis_novonet DROP COLUMN plan_gamer')
  await pool.query('ANALYZE public.vista_analisis_novonet')
  console.log('✅ Columna eliminada y tabla re-analizada. Todo como antes.\n')
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
