/**
 * Trae UNA sola submission de Jotform y la mete en la base. Segundos, no minutos.
 * Venta: KARLA ORTIZ VILLACIS · md-ambklortizv5 · Bitrix 48832
 */
require('dotenv').config()
const { Pool } = require('pg')

const SUBMISSION = '6580479528395732377'
const FORM_ID    = process.env.JOTFORM_FORM_ID_VELSA || '251603619851660'
const TABLA      = 'jotform_submissions_velsa'
const HISTORIAL  = 'jotform_submissions_velsa_historial'
const BITRIX     = '48832'

// Mismo formato que produce el webhook: q<qid>_<name>
function normalizarAnswers(answers) {
  const plano = {}
  for (const [qid, campo] of Object.entries(answers || {})) {
    if (!campo || campo.type === 'control_button' || campo.type === 'control_head') continue
    if (campo.answer === undefined || campo.answer === '') continue
    plano[`q${qid}_${campo.name}`] = campo.answer
  }
  return plano
}

async function main() {
  if (!process.env.JOTFORM_API_KEY) { console.error('Falta JOTFORM_API_KEY en el .env'); process.exit(1) }

  console.log(`\n1) Pidiendo la submission ${SUBMISSION} a Jotform...`)
  const resp = await fetch(`https://api.jotform.com/submission/${SUBMISSION}?apiKey=${process.env.JOTFORM_API_KEY}`)
  if (!resp.ok) { console.error(`   Jotform respondió ${resp.status}`); process.exit(1) }
  const sub = (await resp.json()).content
  const data = normalizarAnswers(sub.answers)
  console.log(`   OK · ${Object.keys(data).length} campos · creada ${sub.created_at}`)

  const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })

  console.log(`\n2) Guardando en ${TABLA}...`)
  const { rows } = await pool.query(
    `INSERT INTO ${TABLA} (submission_id, form_id, data, submitted_at)
     VALUES ($1, $2, $3, ($4::timestamp AT TIME ZONE 'America/Guayaquil'))
     ON CONFLICT (submission_id) DO UPDATE
       SET data = EXCLUDED.data, form_id = EXCLUDED.form_id, updated_at = now()
     RETURNING id`,
    [sub.id, FORM_ID, data, sub.created_at])
  if (rows.length) {
    console.log(`   ✅ Guardada (id ${rows[0].id})`)
    try { await pool.query(`INSERT INTO ${HISTORIAL} (submission_id, form_id, data) VALUES ($1,$2,$3)`,
      [sub.id, FORM_ID, data]) } catch (e) {}
  } else {
    console.log('   Ya estaba con los mismos datos (sin cambios)')
  }

  console.log('\n3) Refrescando indicadores...')
  try { await pool.query('REFRESH MATERIALIZED VIEW public.mv_indicadores_velsa_completo'); console.log('   ok') }
  catch (e) { console.log('   ' + e.message) }

  console.log('\n4) Cómo se ve ahora en el ERP:')
  const { rows: fin } = await pool.query(
    `SELECT b_id, j_netlife_login, j_netlife_estatus_real, j_plan_contratado_final, j_ciudad
       FROM public.vw_bitrix_velsa WHERE b_id::text = $1`, [BITRIX])
  console.log('   ', JSON.stringify(fin[0] || null))
  console.log(fin[0] && fin[0].j_netlife_login ? '\n✅ YA APARECE EN EL ERP\n' : '\n❌ Sigue vacío\n')
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
