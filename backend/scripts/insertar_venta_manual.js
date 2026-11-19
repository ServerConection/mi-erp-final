/**
 * Completa a mano los campos de Jotform (j_*) de UNA venta que ya existe en
 * public.mestra_bitrix con sus datos de Bitrix (b_*).
 *
 * Para qué existe: cuando el ETL trajo el lado Bitrix pero no el de Jotform, la
 * venta queda a medias y no se puede cobrar. Esto rellena el lado que falta.
 * NO crea filas nuevas: si no encuentra la venta, se detiene y avisa.
 *
 * Uso (desde backend/):
 *   node scripts/insertar_venta_manual.js              -> SOLO muestra qué haría
 *   node scripts/insertar_venta_manual.js --ejecutar   -> escribe en la base
 */
require('dotenv').config()
const { Pool } = require('pg')

// ── Cómo ubicar la venta ya existente ────────────────────────────────────────
const BUSCAR = { b_id: '48832', b_cedula: '1803534807' }

// ── Datos del formulario ─────────────────────────────────────────────────────
// Fuente: NOVONET_NETLIFEBASE_PRINCIPAL_V20260908_16_03_00.xlsx
// Jotform VELSA (form 251603619851660) · submission 6580479528395732377
// Registro: 23-06-2026 (MARTES) · Activación: 24/08/2026 (LUNES)
const OBS = 'SE VERIFICA EN CAMPO NO EXISTE POSTERIA/DUCTERIA PARA LLEGAR A CLIENTE se trabajo con tarea a gis 159625460 geo en donde se determina que el cliente esta en zona restringida centro de la ciudad de ambato'

const VENTA = {
  j_fecha_registro_sistema:      '23-06-2026 13:19:13',
  j_año_registro_sistema:        '2026',
  j_mes_registro_sistema:        'JUNIO',
  j_dia_num_registro_sistema:    '23',
  j_dia_abc_registro_sistema:    'MARTES',
  j_codigo_asesor:               '4039LK',
  j_id_bitrix:                   '48832',
  j_distribuidor_autorizado:     'VELSA SAS',
  j_supervisor:                  'DARIANA',
  j_origen_venta:                'Bitrix 593987133635',
  j_venta_nueva_o_reingreso:     'VENTA NUEVA.',
  j_tipo_documento:              'CEDULA DE IDENTIDAD',
  j_aplica_descuento_3ra_edad:   'NO',
  j_provincia:                   '18. Tungurahua',
  j_ciudad:                      '1801. Ambato',
  j_netlife_login:               'md-ambklortizv5',
  j_netlife_estatus_real:        'ACTIVO',
  j_fecha_activacion_netlife:    '24/08/2026',
  j_año_activacion_netlife:      '2026',
  j_mes_activacion_netlife:      'AGOSTO',
  j_dia_num_activacion_netlife:  '24',
  j_dia_abc_activacion_netlife:  'LUNES',
  j_calidad_venta_analista:      'APROBADO',
  j_novedades_atc:               OBS,
  j_auditado_por:                'MARCOS MARQUEZ',
  j_estatus_regularizacion:      'REGULARIZADO',
  j_detalle_regularizacion:      'REGULARIZADO OK , 2DA REVISIO AR',
  j_mes_regularizacion:          'JUNIO',
  j_observacion_venta_original:  OBS,
  j_plan_contratado_final:       'PLAN HOME 400Mbps+SERVIC ADICIONALES',
  j_servicios_digitales:         '1 EXTENDER EMPAQUETADO',
  j_forma_pago:                  'CUENTA DE AHORRO.',
  j_fecha_agenda:                'ago 24, 2026',
}

// Columnas cuyo formato lo decide el ETL (mes en texto vs número, etc.). Se
// muestran ejemplos reales de la tabla antes de escribir, para no meter un
// formato distinto al que ya usan los reportes.
const A_VERIFICAR = [
  'j_año_registro_sistema', 'j_mes_registro_sistema', 'j_dia_num_registro_sistema',
  'j_dia_abc_registro_sistema', 'j_fecha_registro_sistema', 'j_fecha_activacion_netlife',
  'j_mes_activacion_netlife', 'j_fecha_agenda', 'j_mes_regularizacion',
]

const EJECUTAR = process.argv.includes('--ejecutar')

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })

  // 1. Ubicar la venta. Primero por ID de Bitrix; si no, por cédula.
  let objetivo = null, criterio = ''
  for (const [col, val] of Object.entries(BUSCAR)) {
    const { rows } = await pool.query(
      `SELECT * FROM public.mestra_bitrix WHERE ${col}::text = $1`, [val]
    )
    if (rows.length === 1) { objetivo = rows[0]; criterio = `${col} = ${val}`; break }
    if (rows.length > 1) {
      console.log(`\n⛔ ${col} = ${val} devuelve ${rows.length} filas. Revisar a mano cuál es.`)
      console.log(rows.map(r => ({ id_unificado: r.id_unificado, b_id: r.b_id, b_nombre: r.b_nombre })))
      await pool.end(); return
    }
  }
  if (!objetivo) {
    console.log('\n⛔ No se encontró la venta con', JSON.stringify(BUSCAR))
    console.log('   No se crea ninguna fila. Verifica el ID de Bitrix o la cédula.\n')
    await pool.end(); return
  }

  console.log(`\n✅ Venta encontrada por ${criterio}`)
  console.log('   id_unificado :', objetivo.id_unificado)
  console.log('   b_nombre     :', objetivo.b_nombre)
  console.log('   b_cedula     :', objetivo.b_cedula)
  console.log('   b_etapa      :', objetivo.b_etapa_de_la_negociacion)
  console.log('   j_netlife_login actual:', objetivo.j_netlife_login)

  // 2. Formatos que ya usa la tabla, para comparar antes de escribir
  console.log('\n── Formato que usan otras filas (para comparar) ──')
  for (const col of A_VERIFICAR) {
    const { rows } = await pool.query(
      `SELECT DISTINCT ${col}::text AS v FROM public.mestra_bitrix
        WHERE ${col} IS NOT NULL AND ${col}::text <> '' LIMIT 3`
    )
    const ejemplos = rows.map(r => r.v).join(' | ') || '(sin datos)'
    console.log(`   ${col.padEnd(30)} tabla: ${ejemplos}`)
    console.log(`   ${''.padEnd(30)} nuevo: ${VENTA[col]}`)
  }

  // 3. Solo se escriben campos que están vacíos: no se pisa nada que ya exista
  const aEscribir = {}, yaTenian = []
  for (const [col, val] of Object.entries(VENTA)) {
    const actual = objetivo[col]
    if (actual === null || actual === undefined || String(actual).trim() === '') aEscribir[col] = val
    else yaTenian.push(`${col} (ya tiene: ${String(actual).slice(0, 30)})`)
  }

  if (yaTenian.length) console.log('\n⏭️  Ya tenían valor, NO se tocan:\n   - ' + yaTenian.join('\n   - '))
  console.log(`\n✍️  Se van a completar ${Object.keys(aEscribir).length} campos:`)
  for (const [k, v] of Object.entries(aEscribir)) console.log(`   ${k.padEnd(30)} = ${String(v).slice(0, 55)}`)

  if (!EJECUTAR) {
    console.log('\n--- SIMULACIÓN. Nada se escribió. Corre con --ejecutar para aplicar. ---\n')
    await pool.end(); return
  }
  if (!Object.keys(aEscribir).length) {
    console.log('\nNada que escribir.\n'); await pool.end(); return
  }

  const claves = Object.keys(aEscribir)
  const sets = claves.map((c, i) => `"${c}" = $${i + 1}`).join(', ')
  const { rowCount } = await pool.query(
    `UPDATE public.mestra_bitrix SET ${sets}, updated_at = NOW() WHERE id_unificado = $${claves.length + 1}`,
    [...Object.values(aEscribir), objetivo.id_unificado]
  )
  console.log(`\n✅ ${rowCount} fila actualizada (id_unificado ${objetivo.id_unificado})`)

  const { rows: check } = await pool.query(
    `SELECT id_unificado, b_id, b_nombre, j_netlife_login, j_netlife_estatus_real, j_plan_contratado_final
       FROM public.mestra_bitrix WHERE j_netlife_login = $1`, [VENTA.j_netlife_login]
  )
  console.log('\nVerificación (consulta por j_netlife_login):')
  console.log(check)
  await pool.end()
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
