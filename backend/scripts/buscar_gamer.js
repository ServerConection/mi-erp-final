/**
 * Busca la palabra GAMER en TODA la base (local y Render) y dice
 * exactamente en qué tabla y columna está. Solo lee.
 */
require('dotenv').config()
const { Pool } = require('pg')

const BASES = [
  ['LOCAL', {
    host: process.env.LOCAL_DB_HOST, port: process.env.LOCAL_DB_PORT || 5432,
    database: process.env.LOCAL_DB_NAME, user: process.env.LOCAL_DB_USER,
    password: process.env.LOCAL_DB_PASSWORD,
  }],
  ['RENDER', {
    host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  }],
]

async function buscar(nombre, cfg) {
  const pool = new Pool({ ...cfg, statement_timeout: 8000 })
  console.log(`\n${'='.repeat(60)}\n  ${nombre}  (${cfg.database} @ ${cfg.host})\n${'='.repeat(60)}`)
  try {
    // A) columnas que se llamen gamer
    const { rows: porNombre } = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema='public' AND column_name ILIKE '%gamer%' ORDER BY 1`)
    console.log(`\n── Columnas llamadas *gamer*: ${porNombre.length}`)
    porNombre.forEach(r => console.log(`   ${r.table_name}.${r.column_name}`))

    // B) el VALOR "GAMER" en cualquier columna de texto o jsonb
    const { rows: cols } = await pool.query(
      `SELECT c.table_name, c.column_name, c.data_type
         FROM information_schema.columns c
         JOIN pg_class p ON p.relname = c.table_name
        WHERE c.table_schema='public'
          AND c.data_type IN ('text','character varying','jsonb','json')
          AND p.relkind IN ('r','m','v')
        ORDER BY c.table_name`)
    console.log(`\n── Buscando el texto "GAMER" en ${cols.length} columnas...`)
    const hits = []
    for (const c of cols) {
      const expr = c.data_type.startsWith('json') ? `"${c.column_name}"::text` : `"${c.column_name}"`
      try {
        const { rows } = await pool.query(
          `SELECT ${expr} AS v FROM public."${c.table_name}"
            WHERE ${expr} ILIKE '%GAMER%' LIMIT 1`)
        if (rows.length) {
          const { rows: n } = await pool.query(
            `SELECT COUNT(*)::int c FROM public."${c.table_name}" WHERE ${expr} ILIKE '%GAMER%'`)
          hits.push({ t: c.table_name, col: c.column_name, n: n[0].c, ej: String(rows[0].v).slice(0,70) })
          console.log(`   ✅ ${c.table_name}.${c.column_name} → ${n[0].c} filas | ${String(rows[0].v).slice(0,60)}`)
        }
      } catch (e) {}
    }
    if (!hits.length) console.log('   (no se encontró "GAMER" en ninguna columna)')
  } catch (e) {
    console.log(`   ⛔ ${e.message}`)
  }
  await pool.end()
}

;(async () => {
  for (const [n, c] of BASES) await buscar(n, c)
  console.log('\nListo.\n')
})()
