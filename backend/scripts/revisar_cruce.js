/** Qué es vw_jotform_velsa_netlife_completo y por qué no tiene la venta. Solo lee. */
require('dotenv').config()
const { Pool } = require('pg')
const fs = require('fs'), path = require('path')
const SALIDA = path.join(__dirname, '../../DEF_VISTA_JOTFORM_VELSA.txt')
const LOGIN = 'md-ambklortizv5', BITRIX = '48832', CEDULA = '1803534807'

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })

  const { rows: k } = await pool.query(
    `SELECT relkind FROM pg_class WHERE oid = 'public.vw_jotform_velsa_netlife_completo'::regclass`)
  const tipo = {r:'TABLA', v:'VISTA', m:'VISTA MATERIALIZADA', f:'TABLA FORANEA'}[k[0].relkind] || k[0].relkind
  console.log(`\nvw_jotform_velsa_netlife_completo es: ${tipo}`)

  if (k[0].relkind === 'v' || k[0].relkind === 'm') {
    const { rows: d } = await pool.query(
      `SELECT pg_get_viewdef('public.vw_jotform_velsa_netlife_completo'::regclass, true) AS d`)
    fs.writeFileSync(SALIDA, d[0].d || '(vacia)', 'utf8')
    console.log(`Definición guardada en: ${SALIDA}`)
  }

  const a = await pool.query('SELECT COUNT(*)::int n FROM public.velsa_netlife_maestra_cons')
  const b = await pool.query('SELECT COUNT(*)::int n FROM public.vw_jotform_velsa_netlife_completo')
  console.log(`\nvelsa_netlife_maestra_cons          : ${a.rows[0].n} filas`)
  console.log(`vw_jotform_velsa_netlife_completo   : ${b.rows[0].n} filas`)

  // Buscar la venta ahí por cualquier vía
  const { rows: cols } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='vw_jotform_velsa_netlife_completo'`)
  console.log('\nBuscando la venta en esa tabla/vista:')
  for (const c of cols.map(x => x.column_name)) {
    for (const [et, v] of [['login', LOGIN], ['bitrix', BITRIX], ['cédula', CEDULA]]) {
      try {
        const { rows } = await pool.query(
          `SELECT COUNT(*)::int n FROM public.vw_jotform_velsa_netlife_completo WHERE "${c}"::text = $1`, [v])
        if (rows[0].n > 0) console.log(`   ✅ ${c} = ${v} (${et}) → ${rows[0].n}`)
      } catch (e) {}
    }
  }
  console.log('   (si no salió ningún ✅, la venta no está ahí)')

  // ¿Hasta qué fecha llegó esa tabla?
  try {
    const { rows } = await pool.query(
      `SELECT MAX(fecha_registro_jotform::text) AS ultima FROM public.vw_jotform_velsa_netlife_completo`)
    console.log(`\nÚltimo registro de jotform ahí: ${rows[0].ultima}`)
  } catch (e) {}
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
