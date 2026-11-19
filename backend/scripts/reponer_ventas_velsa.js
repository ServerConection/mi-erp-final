/**
 * Mantiene la venta 48832 (KARLA ORTIZ · md-ambklortizv5) presente en Render.
 *
 * Por qué: en Render, vw_jotform_velsa_netlife_completo es una TABLA que un ETL
 * rellena parcialmente, y esta venta queda fuera. Cada vez que el ETL pasa, la
 * borra. Esto la vuelve a poner desde la base local, donde sí está completa.
 *
 * Corre solo cada hora con PM2 y no hace nada si la venta ya está.
 * Para cubrir otra venta, agrega su id de Bitrix a VENTAS.
 */
require('dotenv').config()
const { Pool } = require('pg')

const VENTAS = ['48832']
const T = 'vw_jotform_velsa_netlife_completo'

const local = new Pool({
  host: process.env.LOCAL_DB_HOST, port: process.env.LOCAL_DB_PORT||5432,
  database: process.env.LOCAL_DB_NAME, user: process.env.LOCAL_DB_USER,
  password: process.env.LOCAL_DB_PASSWORD, statement_timeout: 60000,
})
const render = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT||5432,
  database: process.env.DB_NAME||process.env.DB_DATABASE,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }, statement_timeout: 60000,
})
const ts = () => new Date().toISOString().slice(0,19).replace('T',' ')

async function main() {
  const cols = (await render.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1`, [T])).rows.map(r => r.column_name)

  let repuestas = 0
  for (const id of VENTAS) {
    const { rows: yaEsta } = await render.query(
      `SELECT 1 FROM public."${T}" WHERE id_bitrix_ghl::text=$1 LIMIT 1`, [id])
    if (yaEsta.length) { console.log(`[${ts()}] ${id}: ya está`); continue }

    const { rows } = await local.query(
      `SELECT * FROM public."${T}" WHERE id_bitrix_ghl::text=$1 LIMIT 1`, [id])
    if (!rows.length) { console.log(`[${ts()}] ${id}: no está en local`); continue }

    const d = {}
    for (const [k, v] of Object.entries(rows[0]))
      if (cols.includes(k) && v !== null) d[k] = v
    const cl = Object.keys(d)
    await render.query(
      `INSERT INTO public."${T}" (${cl.map(c=>`"${c}"`).join(',')})
       VALUES (${cl.map((_,i)=>'$'+(i+1)).join(',')})`, Object.values(d))
    console.log(`[${ts()}] ${id}: REPUESTA (${cl.length} campos)`)
    repuestas++
  }

  if (repuestas) {
    await render.query('REFRESH MATERIALIZED VIEW public.mv_indicadores_velsa_completo')
    console.log(`[${ts()}] indicadores refrescados`)
  }
  await local.end(); await render.end()
}
main().catch(e => { console.error(`[${ts()}] ERROR:`, e.message); process.exit(1) })
