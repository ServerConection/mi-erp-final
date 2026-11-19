/** Ventas con PLAN GAMER en Novonet y Velsa. Detecta solo los nombres de columna. */
require('dotenv').config()
const { Pool } = require('pg')

const cfg = process.argv.includes('--render')
  ? { host: process.env.DB_HOST, port: process.env.DB_PORT||5432,
      database: process.env.DB_NAME||process.env.DB_DATABASE,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false } }
  : { host: process.env.LOCAL_DB_HOST, port: process.env.LOCAL_DB_PORT||5432,
      database: process.env.LOCAL_DB_NAME, user: process.env.LOCAL_DB_USER,
      password: process.env.LOCAL_DB_PASSWORD }

// tabla → columna del plan  (empresa)
const OBJETIVOS = [
  ['NOVONET', 'jotform_submissions',            'plan_contratado'],
  ['NOVONET', 'jotform_maestra_final',          'plan_contratado_final'],
  ['NOVONET', 'jotform_base_analista',          'plan_contratado'],
  ['VELSA',   'maestra_velsa_jotform_netlife',  'plan_casa'],
  ['VELSA',   'velsa_netlife_maestra_cons',     'j_plan_casa'],
]

// qué mostrar, si existe
const DESEADAS = ['id_bitrix','id_bitrix_ghl','id_negociacion_bitrix','id_crm',
  'netlife_login','inicio_sesion_netlife','j_inicio_sesion_netlife',
  'estado_venta','estado_venta_netlife','j_estado_venta_netlife',
  'codigo_asesor','j_codigo_asesor','fecha_activacion','fecha_activacion_telcos']

async function main() {
  const pool = new Pool(cfg)
  console.log(`\nBase: ${cfg.database} @ ${cfg.host}`)

  for (const [emp, tabla, colPlan] of OBJETIVOS) {
    console.log(`\n${'═'.repeat(72)}\n  ${emp} · ${tabla}.${colPlan}\n${'═'.repeat(72)}`)
    let cols
    try {
      cols = (await pool.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1`, [tabla])).rows.map(r=>r.column_name)
    } catch (e) { console.log('   ⛔ ' + e.message.slice(0,70)); continue }
    if (!cols.length) { console.log('   (la tabla no existe en esta base)'); continue }
    if (!cols.includes(colPlan)) { console.log(`   (no tiene la columna ${colPlan})`); continue }

    const sel = [...DESEADAS.filter(c => cols.includes(c)), colPlan]
    try {
      const { rows: n } = await pool.query(
        `SELECT COUNT(*)::int c FROM public."${tabla}" WHERE "${colPlan}" ILIKE '%GAMER%'`)
      console.log(`   TOTAL con GAMER: ${n[0].c}`)
      if (!n[0].c) continue
      const { rows } = await pool.query(
        `SELECT ${sel.map(c=>`"${c}"`).join(', ')} FROM public."${tabla}"
          WHERE "${colPlan}" ILIKE '%GAMER%' LIMIT 15`)
      console.log('   ' + sel.join(' | '))
      rows.forEach(r => console.log('   ' + Object.values(r).map(v => v===null?'-':String(v).slice(0,30)).join(' | ')))
    } catch (e) { console.log('   ⛔ ' + e.message.slice(0,70)) }
  }
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
