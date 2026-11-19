/**
 * PLAN GAMER en el reporte de NOVONET.
 *
 * En Novonet el formulario guarda el plan en UNA sola columna (plan_contratado),
 * mientras que el export lee vista_analisis_novonet, que tiene los planes
 * separados por tipo y no contempla el gamer → esas ventas salen en blanco.
 *
 * Esto crea la columna plan_gamer en vista_analisis_novonet (Render), la llena
 * con los planes GAMER que están en la base local, y añade PLAN_GAMER al export.
 *
 *   node scripts/plan_gamer_novonet.js              -> diagnóstico
 *   node scripts/plan_gamer_novonet.js --ejecutar   -> aplica
 */
require('dotenv').config()
const { Pool } = require('pg')
const fs = require('fs'), path = require('path')
const EJECUTAR = process.argv.includes('--ejecutar')
const CTRL = path.join(__dirname, '../src/controllers/indicadores.controller.js')

const local = new Pool({
  host: process.env.LOCAL_DB_HOST, port: process.env.LOCAL_DB_PORT || 5432,
  database: process.env.LOCAL_DB_NAME, user: process.env.LOCAL_DB_USER,
  password: process.env.LOCAL_DB_PASSWORD,
})
const render = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || process.env.DB_DATABASE,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

const colsDe = async (pool, t) => (await pool.query(
  `SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1`, [t])).rows.map(r => r.column_name)

async function main() {
  // ── 1. LOCAL: de dónde sacar los planes gamer ──
  console.log('\n═══ 1) Origen en LOCAL ═══')
  const CANDIDATAS = [
    ['jotform_maestra_final', 'plan_contratado_final'],
    ['jotform_submissions',   'plan_contratado'],
    ['jotform_base_analista', 'plan_contratado'],
  ]
  const IDS = ['id_bitrix','id_negociacion_bitrix','id_bitrix_ghl','bitrix_id','id_crm','id_negociacion']
  let fuente = null
  for (const [t, colPlan] of CANDIDATAS) {
    const cols = await colsDe(local, t)
    if (!cols.includes(colPlan)) continue
    const colId = IDS.find(c => cols.includes(c))
    const colLogin = ['netlife_login','inicio_sesion_netlife'].find(c => cols.includes(c))
    if (!colId) { console.log(`   ${t}: tiene el plan pero no ID de Bitrix — no se puede cruzar`); continue }
    const { rows } = await local.query(
      `SELECT "${colId}"::text AS id, ${colLogin ? `"${colLogin}"::text` : 'NULL'} AS login, "${colPlan}" AS plan
         FROM public."${t}"
        WHERE "${colPlan}" ILIKE '%GAMER%'
          AND "${colId}" IS NOT NULL AND TRIM("${colId}"::text) <> ''`)
    console.log(`   ${t}.${colPlan} (id: ${colId}) → ${rows.length} ventas gamer con ID`)
    if (rows.length && (!fuente || rows.length > fuente.rows.length)) fuente = { t, colPlan, colId, rows }
  }
  if (!fuente) { console.log('\n⛔ Ninguna tabla local tiene planes gamer con ID de Bitrix.\n'); await local.end(); await render.end(); return }
  console.log(`\n   → se usará ${fuente.t}.${fuente.colPlan} (${fuente.rows.length} ventas)`)
  fuente.rows.slice(0,5).forEach(r => console.log(`      ${r.id} | ${r.login || '-'} | ${r.plan}`))

  // ── 2. RENDER: destino ──
  console.log('\n═══ 2) Destino en RENDER ═══')
  const ct = await colsDe(render, 'vista_analisis_novonet')
  const enlace = ['id_bitrix','id_negociacion_bitrix'].find(c => ct.includes(c))
  console.log(`   vista_analisis_novonet · enlace: ${enlace} · plan_gamer: ${ct.includes('plan_gamer') ? 'ya existe' : 'falta'}`)

  if (!EJECUTAR) {
    console.log('\n═══ Con --ejecutar ═══')
    console.log('   1. ALTER TABLE vista_analisis_novonet ADD COLUMN plan_gamer text')
    console.log(`   2. Cargar ${fuente.rows.length} planes gamer desde local`)
    console.log('   3. Agregar PLAN_GAMER al export (indicadores.controller.js)\n')
    await local.end(); await render.end(); return
  }

  if (!ct.includes('plan_gamer')) {
    await render.query('ALTER TABLE public.vista_analisis_novonet ADD COLUMN plan_gamer text')
    console.log('\n   ✅ columna plan_gamer creada')
  }
  let n = 0
  for (const r of fuente.rows) {
    const { rowCount } = await render.query(
      `UPDATE public.vista_analisis_novonet SET plan_gamer = $1 WHERE "${enlace}"::text = $2`,
      [r.plan, String(r.id).trim()])
    n += rowCount
  }
  console.log(`   ✅ ${n} de ${fuente.rows.length} cruzaron por ${enlace}`)
  if (n === 0) console.log('   ⚠️  Ninguna cruzó: los IDs de local no coinciden con los de Render.')

  // ── 3. EXPORT ──
  let s = fs.readFileSync(CTRL, 'utf8')
  if (!s.includes('plan_gamer')) {
    fs.writeFileSync(CTRL + '.bak_plan_gamer', s, 'utf8')
    s = s.replace('        MAX(plan_centro_comercial)   AS plan_centro_comercial\n    FROM public.vista_analisis_novonet',
      '        MAX(plan_centro_comercial)   AS plan_centro_comercial,\n        MAX(plan_gamer)              AS plan_gamer\n    FROM public.vista_analisis_novonet')
    s = s.replace('                van.plan_centro_comercial   AS "PLAN_CENTRO_RED_COMERCIAL",',
      '                van.plan_centro_comercial   AS "PLAN_CENTRO_RED_COMERCIAL",\n                van.plan_gamer              AS "PLAN_GAMER",')
    s = s.replace("    (van.plan_centro_comercial IS NOT NULL AND TRIM(van.plan_centro_comercial::text) <> '')",
      "    (van.plan_centro_comercial IS NOT NULL AND TRIM(van.plan_centro_comercial::text) <> '') OR\n    (van.plan_gamer IS NOT NULL AND TRIM(van.plan_gamer::text) <> '')")
    fs.writeFileSync(CTRL, s, 'utf8')
    console.log(`   ✅ export actualizado (${(s.match(/plan_gamer/g)||[]).length} referencias)`)
  } else console.log('   el export ya lo tenía')

  console.log('\nReinicia el backend y descarga el reporte de Novonet: sale PLAN_GAMER.\n')
  await local.end(); await render.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
