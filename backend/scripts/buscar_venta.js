/**
 * Busca UNA venta por login o ID en las dos bases y muestra todos sus campos
 * de plan. Uso:  node scripts/buscar_venta.js md-lojmportiza1 65582
 */
require('dotenv').config()
const { Pool } = require('pg')
const BUSCAR = process.argv.slice(2).filter(a => !a.startsWith('--'))
if (!BUSCAR.length) { console.log('Uso: node scripts/buscar_venta.js <login> [id]'); process.exit(0) }

const BASES = [
  ['LOCAL', { host: process.env.LOCAL_DB_HOST, port: process.env.LOCAL_DB_PORT||5432,
    database: process.env.LOCAL_DB_NAME, user: process.env.LOCAL_DB_USER,
    password: process.env.LOCAL_DB_PASSWORD }],
  ['RENDER', { host: process.env.DB_HOST, port: process.env.DB_PORT||5432,
    database: process.env.DB_NAME||process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false } }],
]

async function enBase(nombre, cfg) {
  const pool = new Pool({ ...cfg, statement_timeout: 8000 })
  console.log(`\n${'='.repeat(70)}\n  ${nombre}\n${'='.repeat(70)}`)
  try {
    const { rows: cols } = await pool.query(
      `SELECT c.table_name, c.column_name FROM information_schema.columns c
         JOIN pg_class p ON p.relname=c.table_name
        WHERE c.table_schema='public' AND p.relkind IN ('r','m','v')
          AND c.data_type IN ('text','character varying')
          AND (c.column_name ILIKE '%login%' OR c.column_name ILIKE '%sesion%'
               OR c.column_name ILIKE '%id_bitrix%' OR c.column_name='id_crm')`)
    const vistas = new Set()
    for (const c of cols) {
      for (const val of BUSCAR) {
        try {
          const { rows } = await pool.query(
            `SELECT * FROM public."${c.table_name}" WHERE "${c.column_name}"::text = $1 LIMIT 1`, [val])
          if (!rows.length) continue
          const key = c.table_name
          if (vistas.has(key)) continue
          vistas.add(key)
          const planes = Object.entries(rows[0])
            .filter(([k]) => /plan|megas|servicio/i.test(k))
          console.log(`\n── ${c.table_name}  (por ${c.column_name} = ${val})`)
          if (!planes.length) { console.log('     (sin columnas de plan)'); continue }
          planes.forEach(([k, v]) =>
            console.log(`     ${v ? '✅' : '  '} ${k.padEnd(32)} ${v ?? '(vacío)'}`))
        } catch (e) {}
      }
    }
    if (!vistas.size) console.log('   (no se encontró en ninguna tabla)')
  } catch (e) { console.log('   ⛔ ' + e.message.slice(0,80)) }
  await pool.end()
}

;(async () => {
  console.log(`\nBuscando: ${BUSCAR.join(' , ')}`)
  for (const [n, c] of BASES) await enBase(n, c)
  console.log('')
})()
