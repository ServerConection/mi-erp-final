/**
 * Conexiones colgadas que dejan sin pool al dashboard.
 *   node scripts/revisar_lentitud.js            -> diagnostica
 *   node scripts/revisar_lentitud.js --matar    -> cierra las transacciones zombis (>2 min)
 */
require('dotenv').config()
const { Pool } = require('pg')
const MATAR = process.argv.includes('--matar')

const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT||5432,
  database: process.env.DB_NAME||process.env.DB_DATABASE,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  const { rows: max } = await pool.query(`SHOW max_connections`)
  const { rows: por } = await pool.query(`
    SELECT state, COUNT(*)::int n FROM pg_stat_activity
     WHERE datname = current_database() GROUP BY state ORDER BY 2 DESC`)
  console.log(`\n═══ Conexiones (máximo ${max[0].max_connections}) ═══`)
  por.forEach(r => console.log(`   ${String(r.n).padStart(4)}  ${r.state || 'sin estado'}`))
  const total = por.reduce((a,b)=>a+b.n,0)
  console.log(`   ────\n   ${String(total).padStart(4)}  TOTAL`)
  if (total > max[0].max_connections * 0.8)
    console.log('   ⚠️  Cerca del límite: por eso el dashboard se queda esperando.')

  console.log('\n═══ Transacciones colgadas (idle in transaction) ═══')
  const { rows: zombis } = await pool.query(`
    SELECT pid, application_name,
           EXTRACT(EPOCH FROM (now()-state_change))::int AS segundos,
           left(regexp_replace(query,'\\s+',' ','g'), 80) AS q
      FROM pg_stat_activity
     WHERE datname = current_database() AND state = 'idle in transaction'
     ORDER BY state_change`)
  if (!zombis.length) console.log('   (ninguna)')
  zombis.forEach(r => console.log(`   pid ${r.pid} · ${Math.round(r.segundos/60)} min · ${r.application_name||'-'}\n      ${r.q}`))

  console.log('\n═══ Consultas lentas en curso (>30s) ═══')
  const { rows: lentas } = await pool.query(`
    SELECT pid, EXTRACT(EPOCH FROM (now()-query_start))::int AS segundos,
           left(regexp_replace(query,'\\s+',' ','g'), 80) AS q
      FROM pg_stat_activity
     WHERE datname=current_database() AND state='active' AND pid<>pg_backend_pid()
       AND now()-query_start > INTERVAL '30 seconds'`)
  console.log(lentas.length ? lentas.map(r=>`   pid ${r.pid} · ${r.segundos}s\n      ${r.q}`).join('\n') : '   (ninguna)')

  if (!MATAR) { console.log('\nCorre con --matar para cerrar las transacciones colgadas de más de 2 minutos.\n'); await pool.end(); return }

  const viejas = zombis.filter(z => z.segundos > 120)
  console.log(`\n═══ Cerrando ${viejas.length} transacción(es) colgada(s) ═══`)
  for (const z of viejas) {
    const { rows } = await pool.query(`SELECT pg_terminate_backend($1) AS ok`, [z.pid])
    console.log(`   pid ${z.pid}: ${rows[0].ok ? '✅ cerrada' : 'no se pudo'}`)
  }
  console.log('\nProbá Indicadores otra vez.\n')
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
