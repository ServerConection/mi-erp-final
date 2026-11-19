/**
 * Completa los campos que faltaron en la venta 48832 — sobre todo las FECHAS,
 * que son por las que filtra el módulo Indicadores. Luego refresca y verifica.
 *
 *   node scripts/completar_venta_48832.js              -> simula
 *   node scripts/completar_venta_48832.js --ejecutar   -> escribe
 */
require('dotenv').config()
const { Pool } = require('pg')
const EJECUTAR = process.argv.includes('--ejecutar')
const TABLA = 'vw_jotform_velsa_netlife_completo'
const BITRIX = '48832', LOGIN = 'md-ambklortizv5'

// Del Excel NOVONET_NETLIFEBASE_PRINCIPAL_V20260908_16_03_00.xlsx
const FALTANTES = {
  fecha_registro_jotform: '2026-06-23 13:19:13',  // Fecha de envío
  fecha_activacion:       '2026-08-24',           // FECHA DE ACTIVACION TELCOS
  fecha_ingresa_telcos:   '2026-08-14',           // FECHA INGRESA TELCOS
  fecha_agenda:           '2026-08-24',           // 39. FECHA DE AGENDA
  estado_venta:           'ACTIVO',
  nombres:                'KARLA LISETH',
  apellidos:              'ORTIZ VILLACIS',
  nombre_completo:        'KARLA LISETH ORTIZ VILLACIS',
  telefono:               '0987017482',
  celular:                '0987017482',
  telefono_cliente:       '0992770815',
  correo:                 'karlitaortizvillacis@hotmail.com',
  correo_cliente:         'karlitaortizvillacis@hotmail.com',
  calle_primaria:         'CALLE PRINCIPAL GUAYAQUIL',
  calle_secundaria:       'CALLE SECUNDARIA JUAN BENIGNO VELA',
  referencia:             'EN EL CUARTO PISO DE NAILS',
  manzana_villa_lote:     '04-52',
  tipo_documento:         'CEDULA DE IDENTIDAD',
  estado_civil:           'CASADO/A',
  genero:                 'MUJER.',
  tipo_cliente:           'Natural',
  venta_nueva_o_reingreso:'VENTA NUEVA.',
  servicios_digitales:    '1 EXTENDER EMPAQUETADO',
  estado_regularizacion:  'REGULARIZADO',
  mes_regularizacion:     'JUNIO',
  quien_ingresa_venta:    'KARLA ARELLANO',
  turno:                  '427',
  vivienda:               'PROPIA',
  tipo_vivienda:          'CASA NO REQUIERE LIBERAR',
}

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })

  const { rows: c } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1`, [TABLA])
  const existe = new Set(c.map(x => x.column_name))

  // Se busca por varios criterios: la fila puede no salir por el login
  let actual = { rows: [] }, criterio = ''
  for (const [col, val] of [['id_bitrix_ghl', BITRIX], ['id_negociacion_bitrix', BITRIX],
                            ['inicio_sesion_netlife', LOGIN], ['submission_id', '6580479528395732377']]) {
    if (!existe.has(col)) continue
    const r = await pool.query(`SELECT * FROM public."${TABLA}" WHERE "${col}"::text = $1`, [val])
    if (r.rows.length) { actual = r; criterio = `${col} = ${val}`; break }
  }
  if (!actual.rows.length) { console.log('\n⛔ No se encontró la fila por ningún criterio.\n'); await pool.end(); return }
  console.log(`\nFila encontrada por ${criterio}`)
  const fila = actual.rows[0]

  const set = {}, omitidos = [], yaTenian = []
  for (const [k, v] of Object.entries(FALTANTES)) {
    if (!existe.has(k)) { omitidos.push(k); continue }
    const val = fila[k]
    if (val === null || val === undefined || String(val).trim() === '') set[k] = v
    else yaTenian.push(`${k} (${String(val).slice(0,25)})`)
  }

  if (omitidos.length) console.log('\nNo existen en la tabla:', omitidos.join(', '))
  if (yaTenian.length) console.log('\nYa tenían valor (no se tocan):\n   ' + yaTenian.join('\n   '))
  console.log(`\n✍️  Se van a completar ${Object.keys(set).length} campos:`)
  for (const [k, v] of Object.entries(set)) console.log(`   ${k.padEnd(26)} = ${v}`)

  if (!EJECUTAR) { console.log('\nSIMULACIÓN. Corre con --ejecutar\n'); await pool.end(); return }
  if (!Object.keys(set).length) { console.log('\nNada que completar.\n'); await pool.end(); return }

  const cl = Object.keys(set)
  const { rowCount } = await pool.query(
    `UPDATE public."${TABLA}" SET ${cl.map((x,i)=>`"${x}" = $${i+1}`).join(', ')}
      WHERE "${criterio.split(' = ')[0]}"::text = $${cl.length+1}`, [...Object.values(set), criterio.split(' = ')[1]])
  console.log(`\n✅ ${rowCount} fila actualizada`)

  console.log('\nRefrescando indicadores...')
  try { await pool.query('REFRESH MATERIALIZED VIEW public.mv_indicadores_velsa_completo'); console.log('   ok') }
  catch (e) { console.log('   ' + e.message) }

  const { rows: mv } = await pool.query(
    `SELECT id_crm, inicio_sesion_netlife, estado_venta, codigo_asesor,
            (fecha_registro_jotform - INTERVAL '5 hours')::date AS registro,
            fecha_activacion::date AS activacion
       FROM public.mv_indicadores_velsa_completo WHERE id_crm::text = $1`, [BITRIX])
  console.log('\nEn la MV de Indicadores:', JSON.stringify(mv[0] || null))
  if (mv[0] && mv[0].activacion) {
    const a = new Date(mv[0].activacion).toISOString().slice(0,7)
    const r = mv[0].registro ? new Date(mv[0].registro).toISOString().slice(0,7) : '—'
    console.log(`\n➡️  En Indicadores búscala en: activación ${a} · registro ${r}\n`)
  }
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
