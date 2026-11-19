/** Arregla la venta 48832 de punta a punta: inserta donde falte, refresca, verifica. */
require('dotenv').config()
const { Pool } = require('pg')
const BITRIX='48832', LOGIN='md-ambklortizv5', CEDULA='1803534807'
const EJECUTAR = process.argv.includes('--ejecutar')

// Datos del Excel. Se usa el que calce con el nombre real de cada columna.
const DATOS = {
  id_bitrix_ghl:'48832', id_negociacion_bitrix:'48832', id_crm:'48832',
  inicio_sesion_netlife: LOGIN, netlife_login: LOGIN,
  numero_identificacion: CEDULA, cedula: CEDULA,
  nombres:'KARLA LISETH', apellidos:'ORTIZ VILLACIS',
  nombre_del_asesor:'KARLA ARELLANO', codigo_asesor:'4039LK', supervisor:'DARIANA',
  estado_venta:'ACTIVO', estado_venta_netlife:'ACTIVO',
  ciudad:'1801. Ambato', provincia:'18. Tungurahua',
  forma_pago:'CUENTA DE AHORRO.', aplica_descuento:'NO',
  plan_casa:'PLAN HOME 400Mbps+SERVIC ADICIONALES',
  estado_regularizacion:'REGULARIZADO', detalle_regularizacion:'REGULARIZADO OK , 2DA REVISIO AR',
  fecha_registro_jotform:'2026-06-23', fecha_activacion:'2026-08-24',
  fecha_agenda:'2026-08-24', fecha_ingresa_telcos:'2026-08-14',
  submission_id:'6580479528395732377',
}

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })
  const V = 'vw_jotform_velsa_netlife_completo'

  const { rows: k } = await pool.query(`SELECT relkind FROM pg_class WHERE oid=$1::regclass`, ['public.'+V])
  let destinos = []
  if (k[0].relkind === 'r') destinos = [V]
  else {
    const { rows: base } = await pool.query(`
      SELECT DISTINCT c.relname FROM pg_depend dep
        JOIN pg_rewrite r ON r.oid=dep.objid JOIN pg_class c ON c.oid=dep.refobjid
       WHERE r.ev_class=$1::regclass AND c.relkind='r' AND c.relname<>$2`, ['public.'+V, V])
    destinos = base.map(b => b.relname)
  }
  console.log('\nTablas detrás de la vista:', destinos.join(', ') || '(ninguna)')

  // La tabla destino: la que NO tenga la venta
  let objetivo = null
  for (const t of destinos) {
    const { rows: cols } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [t])
    const nombres = cols.map(c => c.column_name)
    let tiene = false
    for (const c of nombres) for (const v of [BITRIX, LOGIN, CEDULA]) {
      try { const { rows } = await pool.query(`SELECT 1 FROM public."${t}" WHERE "${c}"::text=$1 LIMIT 1`, [v])
        if (rows.length) tiene = true } catch (e) {}
    }
    console.log(`   ${t}: ${tiene ? 'YA la tiene' : '❌ le falta'} (${nombres.length} columnas)`)
    if (!tiene && !objetivo) objetivo = { tabla: t, cols: nombres }
  }

  if (!objetivo) { console.log('\nTodas la tienen. El problema es un filtro de la vista, no un dato faltante.\n'); await pool.end(); return }

  const fila = {}
  for (const [k2, v] of Object.entries(DATOS)) if (objetivo.cols.includes(k2)) fila[k2] = v
  console.log(`\nSe insertará en "${objetivo.tabla}":`)
  for (const [a, b] of Object.entries(fila)) console.log(`   ${a.padEnd(28)} = ${b}`)
  if (!Object.keys(fila).length) { console.log('   (ninguna columna calzó — mándame la lista)\n'); await pool.end(); return }

  if (!EJECUTAR) { console.log('\nSIMULACIÓN. Corre con --ejecutar\n'); await pool.end(); return }

  const cl = Object.keys(fila)
  await pool.query(
    `INSERT INTO public."${objetivo.tabla}" (${cl.map(c=>`"${c}"`).join(',')})
     VALUES (${cl.map((_,i)=>'$'+(i+1)).join(',')})`, Object.values(fila))
  console.log('\n✅ Insertado.')

  console.log('Refrescando vistas...')
  for (const mv of ['mv_indicadores_velsa_completo']) {
    try { await pool.query(`REFRESH MATERIALIZED VIEW public.${mv}`); console.log(`   ${mv} ok`) }
    catch (e) { console.log(`   ${mv}: ${e.message}`) }
  }

  const { rows: fin } = await pool.query(
    `SELECT b_id, j_netlife_login, j_netlife_estatus_real, j_plan_contratado_final
       FROM public.vw_bitrix_velsa WHERE b_id::text=$1`, [BITRIX])
  console.log('\nResultado final:', JSON.stringify(fin[0] || null))
  console.log(fin[0] && fin[0].j_netlife_login ? '\n✅ YA APARECE EN EL ERP\n' : '\n❌ Sigue vacío\n')
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
