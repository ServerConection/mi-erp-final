/** Saca la definición de la vista por 3 vías distintas. Solo lee. */
require('dotenv').config()
const { Pool } = require('pg')
const fs = require('fs'), path = require('path')
const V = 'vw_jotform_velsa_netlife_completo'
const SALIDA = path.join(__dirname, '../../DEF_VISTA.txt')

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })
  let def = null
  const vias = [
    ['pg_views', `SELECT definition AS d FROM pg_views WHERE viewname=$1`, [V]],
    ['matviews', `SELECT definition AS d FROM pg_matviews WHERE matviewname=$1`, [V]],
    ['infoschema', `SELECT view_definition AS d FROM information_schema.views WHERE table_name=$1`, [V]],
    ['viewdef', `SELECT pg_get_viewdef(('public.'||$1)::regclass, true) AS d`, [V]],
  ]
  for (const [nombre, sql, p] of vias) {
    try {
      const { rows } = await pool.query(sql, p)
      const d = rows[0] && rows[0].d
      console.log(`   ${nombre}: ${d ? d.length + ' caracteres ✅' : 'vacío'}`)
      if (d && !def) def = d
    } catch (e) { console.log(`   ${nombre}: ${e.message.slice(0, 60)}`) }
  }

  const { rows: u } = await pool.query('SELECT current_user AS u')
  const { rows: o } = await pool.query(
    `SELECT tableowner AS dueno FROM pg_tables WHERE tablename='velsa_netlife_maestra_cons'
      UNION ALL SELECT viewowner FROM pg_views WHERE viewname=$1`, [V])
  console.log(`\n   usuario actual: ${u[0].u} · dueños: ${o.map(x=>x.dueno).join(', ')}`)

  if (def) { fs.writeFileSync(SALIDA, def, 'utf8'); console.log(`\n📄 Guardada en ${SALIDA}`) }
  else console.log('\n❌ Ninguna vía devolvió la definición (falta permiso).')
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
