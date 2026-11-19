/**
 * Valida por qué la venta 48832 aparece (o no) en Indicadores Velsa.
 * Solo lee: muestra las fechas reales y simula el filtro del módulo.
 */
require('dotenv').config()
const { Pool } = require('pg')
const BITRIX = '48832', LOGIN = 'md-ambklortizv5'

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })

  console.log('\n═══ 1) La venta en la MV que usa Indicadores ═══')
  const { rows } = await pool.query(
    `SELECT id_crm, inicio_sesion_netlife, estado_venta, codigo_asesor, asesor, supervisor,
            fecha_registro_jotform,
            (fecha_registro_jotform - INTERVAL '5 hours')::date AS fecha_jot_ec,
            fecha_activacion::date  AS fecha_activacion,
            fecha_creacion_crm::date AS fecha_crm
       FROM public.mv_indicadores_velsa_completo WHERE id_crm::text = $1`, [BITRIX])
  if (!rows.length) {
    console.log('   ❌ NO está en la MV. Falta refrescarla:')
    console.log('      REFRESH MATERIALIZED VIEW public.mv_indicadores_velsa_completo;\n')
    await pool.end(); return
  }
  const v = rows[0]
  Object.entries(v).forEach(([k, x]) => console.log(`   ${k.padEnd(24)} ${x}`))

  const fmt = d => d ? new Date(d).toISOString().slice(0,10) : null
  const jot = fmt(v.fecha_jot_ec), act = fmt(v.fecha_activacion), crm = fmt(v.fecha_crm)

  console.log('\n═══ 2) Rango que debes poner en Indicadores ═══')
  console.log(`   Si filtras por REGISTRO JOTFORM  → ${jot}`)
  console.log(`   Si filtras por ACTIVACIÓN        → ${act}`)
  console.log(`   Si filtras por CREACIÓN CRM      → ${crm}`)

  console.log('\n═══ 3) Simulación del filtro del módulo ═══')
  const pruebas = [
    ['registro jotform', `(fecha_registro_jotform - INTERVAL '5 hours')::date`, jot],
    ['activación',       `fecha_activacion::date`,                              act],
    ['creación crm',     `fecha_creacion_crm::date`,                            crm],
  ]
  for (const [nombre, campo, fecha] of pruebas) {
    if (!fecha) { console.log(`   ${nombre.padEnd(18)} (sin fecha)`); continue }
    const mesIni = fecha.slice(0,8) + '01'
    const { rows: r } = await pool.query(
      `SELECT COUNT(*)::int n FROM public.mv_indicadores_velsa_completo
        WHERE id_crm::text = $1 AND ${campo} BETWEEN $2::date AND ($2::date + INTERVAL '1 month' - INTERVAL '1 day')`,
      [BITRIX, mesIni])
    console.log(`   ${nombre.padEnd(18)} mes ${mesIni.slice(0,7)} → ${r[0].n ? '✅ SALE' : '❌ no sale'}`)
  }

  console.log('\n═══ 4) Catálogo de asesores del mes (puede excluirla) ═══')
  try {
    const { rows: c } = await pool.query(
      `SELECT * FROM public.catalogo_asesores_velsa
        WHERE UPPER(TRIM(codigo)) = UPPER(TRIM($1)) LIMIT 5`, [v.codigo_asesor || '4039LK'])
    console.log(c.length ? JSON.stringify(c, null, 1) : `   ⚠️ El código ${v.codigo_asesor} NO está en el catálogo`)
  } catch (e) { console.log('   (catálogo no disponible: ' + e.message.slice(0,60) + ')') }

  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
