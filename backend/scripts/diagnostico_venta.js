/** Vuelca a un archivo la fila VELSA de la venta 48832. Solo lee la base. */
require('dotenv').config()
const { Pool } = require('pg')
const fs = require('fs'), path = require('path')
const BITRIX = '48832'
const SALIDA = path.join(__dirname, '../../DIAGNOSTICO_VENTA_48832.txt')

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })
  const L = []
  const log = s => L.push(s)

  const { rows: tipo } = await pool.query(
    `SELECT relname, relkind FROM pg_class
      WHERE relname IN ('velsa_netlife_maestra_cons','vw_bitrix_velsa','jotform_submissions_velsa')`)
  log('== TIPO DE OBJETO ==')
  tipo.forEach(t => log(`  ${t.relname}: ${{r:'TABLA',v:'VISTA',m:'MATERIALIZADA'}[t.relkind] || t.relkind}`))

  for (const [tabla, col] of [['velsa_netlife_maestra_cons','j_id_bitrix_ghl'], ['vw_bitrix_velsa','b_id']]) {
    const { rows } = await pool.query(
      `SELECT * FROM public."${tabla}" WHERE "${col}"::text = $1 LIMIT 1`, [BITRIX])
    log(`\n== ${tabla} ==`)
    if (!rows.length) { log('  (sin fila)'); continue }
    for (const [k, v] of Object.entries(rows[0])) {
      const vacio = v === null || String(v).trim() === ''
      log(`  ${vacio ? '[VACIO]' : '[  OK  ]'} ${k.padEnd(34)} ${vacio ? '' : String(v).slice(0,70)}`)
    }
  }

  // Definición de la vista: dice de qué tabla sale cada columna
  const { rows: def } = await pool.query(
    `SELECT pg_get_viewdef('public.vw_bitrix_velsa'::regclass, true) AS d`).catch(() => ({rows:[]}))
  if (def.length) log('\n== DEFINICION vw_bitrix_velsa ==\n' + def[0].d)

  fs.writeFileSync(SALIDA, L.join('\n'), 'utf8')
  console.log(`\nEscrito en: ${SALIDA}\n(${L.length} líneas)`)
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
