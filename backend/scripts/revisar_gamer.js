/** Lista las ventas con PLAN GAMER en Novonet y Velsa. Solo lee. */
require('dotenv').config()
const { Pool } = require('pg')

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })

  const { rows: tablas } = await pool.query(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema='public' AND column_name='plan_gamer' ORDER BY table_name`)

  if (!tablas.length) { console.log('\nNingún objeto tiene columna plan_gamer.\n'); await pool.end(); return }

  for (const { table_name: t } of tablas) {
    // columnas útiles que existan en esa tabla
    const { rows: c } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1`, [t])
    const hay = n => c.some(x => x.column_name === n)
    const sel = ['id_bitrix','id_negociacion_bitrix','submission_id','nombres','apellidos',
                 'codigo_asesor','estado_venta','inicio_sesion_netlife','fecha_registro_jotform']
                 .filter(hay).map(x => `"${x}"`)
    sel.push('plan_gamer')

    const { rows } = await pool.query(
      `SELECT ${sel.join(', ')} FROM public."${t}"
        WHERE plan_gamer IS NOT NULL AND TRIM(plan_gamer::text) <> ''
        ORDER BY 1 DESC LIMIT 50`)
    console.log(`\n══════ ${t} — ${rows.length} venta(s) con plan gamer ══════`)
    rows.forEach((r, i) => console.log(`${String(i+1).padStart(3)}. ${JSON.stringify(r)}`))
  }
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
