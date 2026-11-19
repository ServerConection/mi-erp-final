/**
 * PLAN GAMER en VELSA.
 * El valor vive en answers->'241'->>'answer' (q241_planGamer) y nunca se
 * extrajo a columna, por eso el reporte sale sin plan. Esto lo copia a
 * plan_casa (que está vacía en esas ventas y es la que el reporte ya lleva).
 *
 *   node scripts/plan_gamer_velsa.js              -> simula
 *   node scripts/plan_gamer_velsa.js --ejecutar   -> aplica
 */
require('dotenv').config()
const { Pool } = require('pg')
const EJECUTAR = process.argv.includes('--ejecutar')

const BASES = [
  ['LOCAL', { host: process.env.LOCAL_DB_HOST, port: process.env.LOCAL_DB_PORT||5432,
    database: process.env.LOCAL_DB_NAME, user: process.env.LOCAL_DB_USER,
    password: process.env.LOCAL_DB_PASSWORD }],
  ['RENDER', { host: process.env.DB_HOST, port: process.env.DB_PORT||5432,
    database: process.env.DB_NAME||process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false } }],
]
const TABLA = 'maestra_velsa_jotform_netlife'

async function trabajar(nombre, cfg) {
  const pool = new Pool({ ...cfg, statement_timeout: 60000 })
  console.log(`\n${'='.repeat(64)}\n  ${nombre}\n${'='.repeat(64)}`)
  try {
    const cols = (await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1`, [TABLA])).rows.map(r=>r.column_name)
    if (!cols.length) { console.log('   (la tabla no existe aquí)'); await pool.end(); return }

    const EXPR = `NULLIF(TRIM(answers->'241'->>'answer'), '')`
    const { rows: n } = await pool.query(
      `SELECT COUNT(*)::int total,
              COUNT(*) FILTER (WHERE plan_casa IS NULL OR TRIM(plan_casa)='')::int sin_plan
         FROM public."${TABLA}" WHERE ${EXPR} IS NOT NULL`)
    console.log(`   ventas con plan gamer en el JSON : ${n[0].total}`)
    console.log(`   de esas, con plan_casa vacío     : ${n[0].sin_plan}`)

    const { rows: ej } = await pool.query(
      `SELECT id_bitrix_ghl, inicio_sesion_netlife, ${EXPR} AS gamer
         FROM public."${TABLA}" WHERE ${EXPR} IS NOT NULL LIMIT 5`)
    ej.forEach(r => console.log(`      ${r.id_bitrix_ghl} | ${r.inicio_sesion_netlife || '-'} | ${r.gamer}`))

    if (!EJECUTAR) { console.log('\n   (simulación)'); await pool.end(); return }

    const { rowCount } = await pool.query(
      `UPDATE public."${TABLA}" SET plan_casa = ${EXPR}
        WHERE ${EXPR} IS NOT NULL AND (plan_casa IS NULL OR TRIM(plan_casa) = '')`)
    console.log(`   ✅ ${rowCount} venta(s) actualizadas`)

    if (nombre === 'RENDER') {
      try { await pool.query('REFRESH MATERIALIZED VIEW public.mv_indicadores_velsa_completo')
        console.log('   ✅ MV refrescada') } catch (e) { console.log('   MV: ' + e.message.slice(0,60)) }
    }
  } catch (e) { console.log('   ⛔ ' + e.message.slice(0,90)) }
  await pool.end()
}

;(async () => {
  for (const [n, c] of BASES) await trabajar(n, c)
  console.log(EJECUTAR ? '\nDescarga el reporte de Velsa: el plan gamer sale en PLAN_CASA.\n' : '\nCorre con --ejecutar para aplicar.\n')
})()
