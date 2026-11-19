/** Muestra qué tiene y qué le falta a la venta 48832 en cada capa. Solo lee. */
require('dotenv').config()
const { Pool } = require('pg')
const B='48832', L='md-ambklortizv5'

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })

  console.log('\n═══ MV que usa Indicadores (mv_indicadores_velsa_completo) ═══')
  const { rows } = await pool.query(
    `SELECT id_crm, fecha_creacion_crm::date AS crm,
            fecha_registro_jotform, fecha_activacion::date AS activacion,
            inicio_sesion_netlife, estado_venta, codigo_asesor, asesor, supervisor,
            plan_casa, forma_pago, ciudad
       FROM public.mv_indicadores_velsa_completo WHERE id_crm::text = $1`, [B])
  if (!rows.length) { console.log('   ❌ no está'); await pool.end(); return }
  for (const [k, v] of Object.entries(rows[0])) {
    const vacio = v === null || String(v).trim() === ''
    console.log(`   ${vacio ? '❌ FALTA ' : '✅ ok    '} ${k.padEnd(24)} ${vacio ? '' : v}`)
  }

  console.log('\n═══ Por qué los KPI de Jotform dan 0 ═══')
  const { rows: k } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE fecha_registro_jotform IS NOT NULL)::int AS con_fecha_jot,
       COUNT(*) FILTER (WHERE estado_venta ILIKE '%ACTIVO%')::int      AS activa
     FROM public.mv_indicadores_velsa_completo WHERE id_crm::text = $1`, [B])
  console.log(`   cuenta en INGRESOS JOT: ${k[0].con_fecha_jot ? 'SÍ' : 'NO (fecha_registro_jotform vacía)'}`)
  console.log(`   cuenta en ACTIVAS:      ${k[0].activa ? 'SÍ' : 'NO (estado_venta no dice ACTIVO)'}`)

  console.log('\n═══ Vista intermedia (de donde la MV toma lo de Jotform) ═══')
  for (const [col, val] of [['id_bitrix_ghl', B], ['id_negociacion_bitrix', B], ['inicio_sesion_netlife', L]]) {
    try {
      const { rows: r } = await pool.query(
        `SELECT id_bitrix_ghl, id_negociacion_bitrix, inicio_sesion_netlife,
                fecha_registro_jotform, estado_venta
           FROM public.vw_jotform_velsa_netlife_completo WHERE "${col}"::text = $1`, [val])
      console.log(`   por ${col.padEnd(24)} → ${r.length} fila(s) ${r.length ? JSON.stringify(r[0]) : ''}`)
    } catch (e) { console.log(`   por ${col}: ${e.message.slice(0,50)}`) }
  }

  console.log('\n═══ Maestra (donde sí está el dato original) ═══')
  const { rows: m } = await pool.query(
    `SELECT j_id_bitrix_ghl, j_inicio_sesion_netlife, j_fecha_registro_sistema,
            j_estado_venta_netlife, j_fecha_activacion_telcos
       FROM public.velsa_netlife_maestra_cons WHERE j_id_bitrix_ghl::text = $1`, [B])
  console.log('   ', JSON.stringify(m[0] || null))
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
