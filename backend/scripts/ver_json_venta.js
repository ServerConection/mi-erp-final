/**
 * Muestra las preguntas de PLAN dentro del JSON crudo de una venta.
 * Uso: node scripts/ver_json_venta.js 65582
 */
require('dotenv').config()
const { Pool } = require('pg')
const ID = process.argv[2] || '65582'

const local = new Pool({
  host: process.env.LOCAL_DB_HOST, port: process.env.LOCAL_DB_PORT||5432,
  database: process.env.LOCAL_DB_NAME, user: process.env.LOCAL_DB_USER,
  password: process.env.LOCAL_DB_PASSWORD, statement_timeout: 10000,
})

async function main() {
  console.log(`\nVenta ${ID} — buscando las preguntas de plan en el JSON\n`)
  for (const [tabla, colJson, colId] of [
    ['maestra_velsa_jotform_netlife', 'answers',     'id_bitrix_ghl'],
    ['maestra_velsa_jotform_netlife', 'raw_payload', 'id_bitrix_ghl'],
    ['jotform_velsa_netlife',         'answers',     null],
  ]) {
    try {
      const sql = colId
        ? `SELECT "${colJson}" AS j FROM public."${tabla}" WHERE "${colId}"::text=$1 LIMIT 1`
        : `SELECT "${colJson}" AS j FROM public."${tabla}" WHERE "${colJson}"::text ILIKE '%'||$1||'%' LIMIT 1`
      const { rows } = await local.query(sql, [ID])
      if (!rows.length) { console.log(`── ${tabla}.${colJson}: sin fila`); continue }
      const j = typeof rows[0].j === 'string' ? JSON.parse(rows[0].j) : rows[0].j
      const answers = j.answers || j
      console.log(`\n── ${tabla}.${colJson}`)
      let hallado = 0
      for (const [qid, campo] of Object.entries(answers)) {
        if (!campo || typeof campo !== 'object') continue
        const name = campo.name || '', text = campo.text || '', ans = campo.answer
        const esPlan = /plan/i.test(name) || /plan/i.test(text)
        const tieneGamer = ans && String(ans).toUpperCase().includes('GAMER')
        if (esPlan || tieneGamer) {
          hallado++
          const val = ans === undefined || ans === '' ? '(vacío)' : String(ans).slice(0,55)
          console.log(`   ${tieneGamer ? '🎮' : '  '} q${qid}_${name.padEnd(22)} = ${val}`)
        }
      }
      if (!hallado) console.log('   (ninguna pregunta de plan en este JSON)')
    } catch (e) { console.log(`── ${tabla}.${colJson}: ${e.message.slice(0,70)}`) }
  }
  await local.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
