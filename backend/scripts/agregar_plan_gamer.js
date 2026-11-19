/**
 * PLAN GAMER en el reporte de Novonet.
 * La tabla madre (jotform_submissions) vive en el Postgres LOCAL; el reporte
 * se arma en Render. Este script lee local, escribe en Render y ajusta el export.
 *
 *   node scripts/agregar_plan_gamer.js              -> solo consulta
 *   node scripts/agregar_plan_gamer.js --ejecutar   -> aplica
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

async function main() {
  // ── 1. TABLA MADRE (LOCAL) ──
  console.log('\n═══ 1) Tabla madre en LOCAL ═══')
  let fuente = null
  for (const [t, sql] of [
    ['jotform_submissions', `SELECT data->>'q179_idDe' AS id_bitrix, data->>'q148_planGamer' AS plan
                               FROM public.jotform_submissions
                              WHERE data->>'q148_planGamer' IS NOT NULL
                                AND TRIM(data->>'q148_planGamer') <> ''`],
    ['jotform_submissions_wide', `SELECT id_negociacion_bitrix AS id_bitrix, plan_gamer AS plan
                                    FROM public.jotform_submissions_wide
                                   WHERE plan_gamer IS NOT NULL AND TRIM(plan_gamer) <> ''`],
  ]) {
    try {
      const { rows } = await local.query(sql)
      console.log(`   ✅ ${t}: ${rows.length} ventas con PLAN GAMER`)
      rows.slice(0,5).forEach(r => console.log(`      bitrix ${r.id_bitrix} → ${r.plan}`))
      if (rows.length) { fuente = rows; break }
    } catch (e) { console.log(`   ${t}: ${e.message.slice(0,60)}`) }
  }
  if (!fuente) { console.log('\nNo se encontraron ventas gamer en local.\n'); await local.end(); await render.end(); return }

  const conId = fuente.filter(r => r.id_bitrix && String(r.id_bitrix).trim())
  console.log(`\n   ${conId.length} de ${fuente.length} tienen ID de Bitrix (las demás no se pueden cruzar)`)

  if (!EJECUTAR) {
    console.log('\n═══ Con --ejecutar se hará ═══')
    console.log('   1. ALTER TABLE vista_analisis_novonet ADD COLUMN plan_gamer (en Render)')
    console.log(`   2. Cargar los ${conId.length} planes gamer desde local`)
    console.log('   3. Agregar la columna PLAN_GAMER al export\n')
    await local.end(); await render.end(); return
  }

  // ── 2. RENDER: columna + carga ──
  console.log('\n═══ 2) Cargando en Render ═══')
  const ct = (await render.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='vista_analisis_novonet'`)).rows.map(r=>r.column_name)
  if (!ct.includes('plan_gamer')) {
    await render.query('ALTER TABLE public.vista_analisis_novonet ADD COLUMN plan_gamer text')
    console.log('   ✅ columna plan_gamer creada')
  } else console.log('   la columna ya existía')

  const enlace = ['id_bitrix','id_negociacion_bitrix'].find(c => ct.includes(c))
  let n = 0
  for (const r of conId) {
    const { rowCount } = await render.query(
      `UPDATE public.vista_analisis_novonet SET plan_gamer = $1 WHERE "${enlace}"::text = $2`,
      [r.plan, String(r.id_bitrix).trim()])
    n += rowCount
  }
  console.log(`   ✅ ${n} fila(s) actualizadas (enlace: ${enlace})`)

  // ── 3. EXPORT ──
  console.log('\n═══ 3) Export ═══')
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
    console.log(`   ✅ actualizado (${(s.match(/plan_gamer/g)||[]).length} referencias)`)
  } else console.log('   ya lo tenía')

  console.log('\nReinicia el backend y descarga el reporte: sale PLAN_GAMER.\n')
  await local.end(); await render.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
