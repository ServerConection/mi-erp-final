/** Inserta la venta 48832 con los nombres de columna REALES y refresca. */
require('dotenv').config()
const { Pool } = require('pg')
const EJECUTAR = process.argv.includes('--ejecutar')
const V = 'vw_jotform_velsa_netlife_completo'
const B = '48832', L = 'md-ambklortizv5'

const FILA = {
  submission_id:            '6580479528395732377',
  form_id:                  '251603619851660',
  status:                   'ACTIVE',
  created_at:               '2026-06-23 13:19:13',
  updated_at:               '2026-09-08 11:31:48',
  payload_created_at:       '2026-06-23 13:19:13',
  payload_updated_at:       '2026-09-08 11:31:48',
  id_bitrix_ghl:            B,
  id_negociacion_bitrix:    B,
  inicio_sesion_netlife:    L,
  estado_venta_netlife:     'ACTIVO',
  fecha_activacion_telcos:  '2026-08-24',
  fecha_ingresa_telcos:     '2026-08-14',
  fecha_agenda:             '2026-08-24',
  codigo_asesor:            '4039LK',
  nombre_del_asesor:        'KARLA ARELLANO',
  supervisor:               'DARIANA',
  distribuidor_autorizado:  'VELSA SAS',
  plan_casa:                'PLAN HOME 400Mbps+SERVIC ADICIONALES',
  forma_pago:               'CUENTA DE AHORRO.',
  ciudad:                   '1801. Ambato',
  provincia:                '18. Tungurahua',
  parroquia_barrio:         'MIRAFLORES/AMBATO CENTRO',
  numero_identificacion:    '1803534807',
  tipo_documento_identidad: 'CEDULA DE IDENTIDAD',
  cliente_nombres:          'KARLA LISETH',
  cliente_apellidos:        'ORTIZ VILLACIS',
  cliente_nombre_completo:  'KARLA LISETH ORTIZ VILLACIS',
  cliente_tipo:             'Natural',
  estado_civil:             'CASADO/A',
  genero_cliente:           'MUJER.',
  correo_cliente:           'karlitaortizvillacis@hotmail.com',
  telefono_pin:             '0987017482',
  telefono_celular:         '0992770815',
  calle_principal_numero:   'CALLE PRINCIPAL GUAYAQUIL',
  calle_secundaria:         'CALLE SECUNDARIA JUAN BENIGNO VELA',
  manzana_villa_lote:       '04-52',
  referencia_como_llegar:   'EN EL CUARTO PISO DE NAILS',
  vivienda_propiedad:       'PROPIA',
  tipo_vivienda_edificio:   'CASA NO REQUIERE LIBERAR',
  coordenadas_gps:          '1°14\'42.0"S 78°37\'46.8"W',
  clausulas:                'PEDIR BIOMETRICO',
  aplica_descuento:         'NO',
  origen_venta:             'Bitrix 593987133635',
  venta_nueva_reingreso:    'VENTA NUEVA.',
  servicio_empaquetado_feb2025: '1 EXTENDER EMPAQUETADO',
  calidad_venta:            'APROBADO',
  auditado_por:             'MARCOS MARQUEZ',
  auditoria_documentos:     'DOCUMENTOS CORRECTOS',
  inconsistencia_documental:'DOCUMENTOS CORRECTOS',
  detalle_regularizacion:   'REGULARIZADO OK , 2DA REVISIO AR',
  observacion_auditoria:    'REGULARIZADO OK , 2DA REVISIO AR',
  regularizado:             'INGRESO REGULARIZADO',
  atc_meses_regularizar:    'JUNIO',
  ingreso_telcos_vendedores:'KARLA ARELLANO',
  turno:                    '427',
  correo_respaldo_venta:    'velsagrupoventas@gmail.com',
  observacion_venta:        'SE VERIFICA EN CAMPO NO EXISTE POSTERIA/DUCTERIA PARA LLEGAR A CLIENTE se trabajo con tarea a gis 159625460 geo en donde se determina que el cliente esta en zona restringida centro de la ciudad de ambato',
  ip:                       '157.100.139.38',
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
      WHERE table_schema='public' AND table_name=$1`, [V])
  const reales = new Set(c.map(x => x.column_name))
  const fila = {}
  for (const [k, v] of Object.entries(FILA)) if (reales.has(k)) fila[k] = v

  console.log(`\nInsertando ${Object.keys(fila).length} campos en ${V}`)
  if (!EJECUTAR) {
    for (const [k, v] of Object.entries(fila)) console.log(`   ${k.padEnd(28)} = ${String(v).slice(0,50)}`)
    console.log('\nSIMULACIÓN — corre con --ejecutar\n'); await pool.end(); return
  }

  // borra un intento anterior incompleto, si quedó
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM public."${V}" WHERE inicio_sesion_netlife = $1 OR submission_id = $2`,
      [L, FILA.submission_id])
    if (rowCount) console.log(`   (se limpiaron ${rowCount} intento(s) anterior(es))`)
  } catch (e) {}

  const cl = Object.keys(fila)
  await pool.query(
    `INSERT INTO public."${V}" (${cl.map(x=>`"${x}"`).join(',')})
     VALUES (${cl.map((_,i)=>'$'+(i+1)).join(',')})`, Object.values(fila))
  console.log('✅ Insertada')

  await pool.query('REFRESH MATERIALIZED VIEW public.mv_indicadores_velsa_completo')
  console.log('✅ MV refrescada')

  const { rows: fin } = await pool.query(
    `SELECT id_crm, fecha_registro_jotform, fecha_activacion::date AS activacion,
            inicio_sesion_netlife, estado_venta, codigo_asesor, plan_casa, ciudad
       FROM public.mv_indicadores_velsa_completo WHERE id_crm::text=$1`, [B])
  console.log('\nMV ahora:')
  if (fin[0]) for (const [k,v] of Object.entries(fin[0]))
    console.log(`   ${v === null ? '❌' : '✅'} ${k.padEnd(24)} ${v ?? ''}`)
  console.log(fin[0] && fin[0].inicio_sesion_netlife ? '\n✅ LISTO — recarga Indicadores con el rango en JUNIO 2026\n' : '\n❌ sigue vacío\n')
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
