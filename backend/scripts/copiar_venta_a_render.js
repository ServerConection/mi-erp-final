/**
 * Copia la venta 48832 de la base LOCAL (donde está completa) a Render,
 * y refresca los indicadores. Si el sync la vuelve a borrar, se corre otra vez.
 *   node scripts/copiar_venta_a_render.js
 */
require('dotenv').config()
const { Pool } = require('pg')
const B = '48832'
const T = 'vw_jotform_velsa_netlife_completo'

const local = new Pool({
  host: process.env.LOCAL_DB_HOST, port: process.env.LOCAL_DB_PORT||5432,
  database: process.env.LOCAL_DB_NAME, user: process.env.LOCAL_DB_USER,
  password: process.env.LOCAL_DB_PASSWORD,
})
const render = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT||5432,
  database: process.env.DB_NAME||process.env.DB_DATABASE,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  const { rows } = await local.query(
    `SELECT * FROM public."${T}" WHERE id_bitrix_ghl::text = $1 LIMIT 1`, [B])
  if (!rows.length) { console.log('\n⛔ No está en local.\n'); process.exit(1) }
  const fila = rows[0]

  const colsRender = (await render.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1`, [T])).rows.map(r => r.column_name)

  const datos = {}
  for (const [k, v] of Object.entries(fila))
    if (colsRender.includes(k) && v !== null) datos[k] = v

  await render.query(`DELETE FROM public."${T}" WHERE id_bitrix_ghl::text = $1`, [B])
  const cl = Object.keys(datos)
  await render.query(
    `INSERT INTO public."${T}" (${cl.map(c=>`"${c}"`).join(',')})
     VALUES (${cl.map((_,i)=>'$'+(i+1)).join(',')})`, Object.values(datos))
  console.log(`\n✅ Copiada con ${cl.length} campos`)

  await render.query('REFRESH MATERIALIZED VIEW public.mv_indicadores_velsa_completo')
  console.log('✅ Indicadores refrescados')

  const { rows: fin } = await render.query(
    `SELECT id_crm, inicio_sesion_netlife, estado_venta, plan_casa
       FROM public.mv_indicadores_velsa_completo WHERE id_crm::text=$1`, [B])
  console.log('\n' + JSON.stringify(fin[0] || null))
  console.log(fin[0]?.inicio_sesion_netlife ? '\n✅ LISTA — búscala en JUNIO 2026\n' : '\n❌ falló\n')
  await local.end(); await render.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
