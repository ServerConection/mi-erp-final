/** Refresca la vista materializada de VELSA y verifica una venta. */
require('dotenv').config()
const { Pool } = require('pg')
const BITRIX = '48832'

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })

  console.log('\nAntes del refresh:')
  const antes = await pool.query(
    `SELECT b_id, j_netlife_login FROM public.vw_bitrix_velsa WHERE b_id::text = $1`, [BITRIX])
  console.log('  ', JSON.stringify(antes.rows[0] || null))

  console.log('\nRefrescando mv_indicadores_velsa_completo... (puede tardar unos minutos)')
  const t0 = Date.now()
  try {
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_indicadores_velsa_completo')
  } catch (e) {
    console.log('  CONCURRENTLY no se pudo (' + e.message + '), reintentando normal...')
    await pool.query('REFRESH MATERIALIZED VIEW public.mv_indicadores_velsa_completo')
  }
  console.log(`  Listo en ${Math.round((Date.now() - t0) / 1000)}s`)

  console.log('\nDespués del refresh:')
  const despues = await pool.query(
    `SELECT b_id, j_netlife_login, j_netlife_estatus_real, j_plan_contratado_final, j_ciudad
       FROM public.vw_bitrix_velsa WHERE b_id::text = $1`, [BITRIX])
  const r = despues.rows[0]
  console.log('  ', JSON.stringify(r || null))
  console.log(r && r.j_netlife_login ? '\n✅ LISTO: el login ya aparece.\n' : '\n❌ Sigue vacío. Avísame.\n')
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
