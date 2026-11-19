/**
 * Inserta la venta 48832 (KARLA ORTIZ VILLACIS · md-ambklortizv5) donde falte,
 * refresca los indicadores y verifica que aparezca en el ERP.
 *   node scripts/insertar_venta_48832.js              -> simula
 *   node scripts/insertar_venta_48832.js --ejecutar   -> escribe
 */
require('dotenv').config()
const { Pool } = require('pg')
const EJECUTAR = process.argv.includes('--ejecutar')
const BITRIX='48832', LOGIN='md-ambklortizv5', CEDULA='1803534807'
const OBS='SE VERIFICA EN CAMPO NO EXISTE POSTERIA/DUCTERIA PARA LLEGAR A CLIENTE se trabajo con tarea a gis 159625460 geo en donde se determina que el cliente esta en zona restringida centro de la ciudad de ambato'

// valor por nombre de columna. Solo se usan las que existan de verdad.
const D = {
  id_bitrix_ghl:BITRIX, id_negociacion_bitrix:BITRIX, id_crm:BITRIX, id_bitrix:BITRIX,
  inicio_sesion_netlife:LOGIN, netlife_login:LOGIN,
  numero_identificacion:CEDULA, cedula:CEDULA, identificacion:CEDULA,
  nombres:'KARLA LISETH', apellidos:'ORTIZ VILLACIS',
  nombre_del_asesor:'KARLA ARELLANO', codigo_asesor:'4039LK', supervisor:'DARIANA',
  distribuidor_autorizado:'VELSA SAS', nombre_del_distribuidor_autorizado:'VELSA SAS',
  estado_venta:'ACTIVO', estado_venta_netlife:'ACTIVO', estado_de_la_venta_netlife:'ACTIVO',
  ciudad:'1801. Ambato', provincia:'18. Tungurahua', parroquia_barrio:'MIRAFLORES/AMBATO CENTRO',
  forma_pago:'CUENTA DE AHORRO.', forma_de_pago:'CUENTA DE AHORRO.',
  aplica_descuento:'NO', plan_casa:'PLAN HOME 400Mbps+SERVIC ADICIONALES',
  estado_regularizacion:'REGULARIZADO', detalle_regularizacion:'REGULARIZADO OK , 2DA REVISIO AR',
  observacion_auditoria:'REGULARIZADO OK , 2DA REVISIO AR', observacion_venta_original:OBS,
  novedades_atc:OBS, calidad_venta:'APROBADO', auditado_por:'MARCOS MARQUEZ',
  origen_venta:'Bitrix 593987133635', venta_nueva_o_reingreso:'VENTA NUEVA.',
  tipo_documento:'CEDULA DE IDENTIDAD', servicios_digitales:'1 EXTENDER EMPAQUETADO',
  coordenadas_gps:'1°14\'42.0"S 78°37\'46.8"W', clausulas:'PEDIR BIOMETRICO',
  submission_id:'6580479528395732377',
  fecha_registro_jotform:'2026-06-23', fecha_activacion:'2026-08-24',
  fecha_agenda:'2026-08-24', fecha_ingresa_telcos:'2026-08-14',
}

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })
  const V = 'vw_jotform_velsa_netlife_completo'

  // Candidatos: la vista primero (Postgres deja insertar en vistas simples),
  // luego sus tablas base.
  const candidatos = [V]
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT c.relname FROM pg_depend dep
        JOIN pg_rewrite r ON r.oid=dep.objid JOIN pg_class c ON c.oid=dep.refobjid
       WHERE r.ev_class=$1::regclass AND c.relkind='r' AND c.relname<>$2`, ['public.'+V, V])
    rows.forEach(r => candidatos.push(r.relname))
  } catch (e) {}
  console.log('\nSe intentará en este orden:', candidatos.join(' → '))

  let ok = false
  for (const t of candidatos) {
    const { rows: c } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1`, [t])
    const cols = c.map(x => x.column_name)
    if (!cols.length) continue

    // ¿ya está?
    let existe = false
    for (const col of cols) for (const v of [BITRIX, LOGIN, CEDULA]) {
      try { const { rows } = await pool.query(
        `SELECT 1 FROM public."${t}" WHERE "${col}"::text=$1 LIMIT 1`, [v])
        if (rows.length) existe = true } catch (e) {}
    }
    if (existe) { console.log(`\n${t}: ya tiene la venta, se salta`); continue }

    const fila = {}
    for (const [k, v] of Object.entries(D)) if (cols.includes(k)) fila[k] = v
    if (!Object.keys(fila).length) { console.log(`\n${t}: ninguna columna calzó`); continue }

    console.log(`\n${t}: insertar ${Object.keys(fila).length} campos → ${Object.keys(fila).join(', ')}`)
    if (!EJECUTAR) { console.log('   (simulación)'); continue }

    const cl = Object.keys(fila)
    try {
      await pool.query(
        `INSERT INTO public."${t}" (${cl.map(x=>`"${x}"`).join(',')})
         VALUES (${cl.map((_,i)=>'$'+(i+1)).join(',')})`, Object.values(fila))
      console.log(`   ✅ Insertado en ${t}`)
      ok = true
      break
    } catch (e) { console.log(`   ❌ ${e.message}`) }
  }

  if (EJECUTAR) {
    console.log('\nRefrescando indicadores...')
    try { await pool.query('REFRESH MATERIALIZED VIEW public.mv_indicadores_velsa_completo'); console.log('   ok') }
    catch (e) { console.log('   ' + e.message) }

    const { rows: fin } = await pool.query(
      `SELECT b_id, j_netlife_login, j_netlife_estatus_real, j_plan_contratado_final
         FROM public.vw_bitrix_velsa WHERE b_id::text=$1`, [BITRIX])
    console.log('\nEn el ERP:', JSON.stringify(fin[0] || null))
    console.log(fin[0] && fin[0].j_netlife_login ? '\n✅ YA APARECE\n' : '\n❌ Sigue vacío\n')
  }
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
