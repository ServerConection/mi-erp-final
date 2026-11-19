/**
 * Hace que vw_bitrix_velsa muestre los datos de Jotform aunque la vista
 * intermedia (vw_jotform_velsa_netlife_completo) no deje pasar la fila.
 *
 * Cómo: añade un LEFT JOIN a velsa_netlife_maestra_cons — que SÍ tiene el dato —
 * y envuelve cada campo j_* en COALESCE(mv.x, maestra.y). Si la MV trae el dato,
 * manda la MV (nada cambia). Si viene NULL, entra el de la maestra.
 *
 *   node scripts/parchar_vista_velsa.js              -> muestra el SQL
 *   node scripts/parchar_vista_velsa.js --ejecutar   -> lo aplica
 *
 * Guarda la definición anterior en BACKUP_vw_bitrix_velsa.sql para revertir.
 */
require('dotenv').config()
const { Pool } = require('pg')
const fs = require('fs'), path = require('path')
const EJECUTAR = process.argv.includes('--ejecutar')
const BITRIX = '48832'
const BACKUP = path.join(__dirname, '../../BACKUP_vw_bitrix_velsa.sql')

// campo de la vista  →  columna equivalente en velsa_netlife_maestra_cons
const PUENTE = {
  j_fecha_registro_sistema:    'j_fecha_registro_sistema',
  j_id_bitrix:                 'j_id_bitrix_ghl',
  j_netlife_estatus_real:      'j_estado_venta_netlife',
  j_fecha_activacion_netlife:  'j_fecha_activacion_telcos',
  j_detalle_regularizacion:    'j_observacion_auditoria',
  j_forma_pago:                'j_forma_pago',
  j_aplica_descuento_3ra_edad: 'j_aplica_descuento',
  j_netlife_login:             'j_inicio_sesion_netlife',
  j_ciudad:                    'j_ciudad',
  codigo_asesor:               'j_codigo_asesor',
}

// expresión original de cada campo en la vista (tal cual está hoy)
const ORIGINAL = {
  j_fecha_registro_sistema:    'mv.fecha_registro_jotform::text',
  j_id_bitrix:                 'mv.id_crm::text',
  j_netlife_estatus_real:      'mv.estado_venta',
  j_fecha_activacion_netlife:  'mv.fecha_activacion::text',
  j_estatus_regularizacion:    'mv.estado_regularizacion',
  j_detalle_regularizacion:    'mv.detalle_regularizacion',
  j_forma_pago:                'mv.forma_pago',
  j_aplica_descuento_3ra_edad: 'mv.aplica_descuento',
  j_netlife_login:             'mv.inicio_sesion_netlife',
  j_fecha_agenda:              'mv.fecha_agenda::text',
  j_ciudad:                    'mv.ciudad',
  codigo_asesor:               'mv.codigo_asesor',
}

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })

  // Respaldo de la definición actual
  try {
    const { rows } = await pool.query(`SELECT pg_get_viewdef('public.vw_bitrix_velsa'::regclass, true) AS d`)
    if (rows[0] && rows[0].d) {
      fs.writeFileSync(BACKUP, 'CREATE OR REPLACE VIEW public.vw_bitrix_velsa AS\n' + rows[0].d, 'utf8')
      console.log(`\nRespaldo guardado en ${BACKUP}`)
    } else console.log('\n(no se pudo respaldar la definición — sigue igual)')
  } catch (e) { console.log('\n(respaldo no disponible: ' + e.message.slice(0,60) + ')') }

  // Solo se puentean los campos cuya columna exista de verdad en la maestra
  const { rows: mc } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='velsa_netlife_maestra_cons'`)
  const hay = new Set(mc.map(x => x.column_name))

  const expr = (campo) => {
    const o = ORIGINAL[campo]
    const p = PUENTE[campo]
    if (p && hay.has(p)) return `COALESCE(${o}, mc.${p}::text)`
    return o
  }
  const puenteados = Object.keys(PUENTE).filter(c => hay.has(PUENTE[c]))
  console.log(`\nCampos que tomarán respaldo de la maestra (${puenteados.length}):`)
  puenteados.forEach(c => console.log(`   ${c.padEnd(30)} ← mc.${PUENTE[c]}`))

  const SQL = `
CREATE OR REPLACE VIEW public.vw_bitrix_velsa AS
 WITH wh AS (
         SELECT w_1.bitrix_id AS b_id,
            upper(TRIM(BOTH FROM w_1.etapa_bitrix)) AS b_etapa_bitrix,
            w_1.etapa AS b_etapa_slug,
            (w_1.created_at AT TIME ZONE 'America/Guayaquil'::text)::date AS b_creado_el_fecha,
            (w_1.updated_at AT TIME ZONE 'America/Guayaquil'::text)::date AS b_modificado_el_fecha,
            NULLIF(TRIM(BOTH FROM w_1.responsible), ''::text) AS b_responsable_wh,
            NULLIF(TRIM(BOTH FROM w_1.source), ''::text) AS b_origen_wh,
            NULLIF(TRIM(BOTH FROM w_1.pipeline), ''::text) AS b_pipeline,
            NULLIF(TRIM(BOTH FROM w_1.phone), ''::text) AS b_telefono,
            NULLIF(TRIM(BOTH FROM w_1.razon_descarte), ''::text) AS b_razon_descarte,
            w_1.created_at,
            w_1.updated_at
           FROM bitrix_webhook_leads w_1
          WHERE w_1.empresa::text = 'velsa'::text AND w_1.etapa::text <> 'duplicado'::text
        )
 SELECT COALESCE(w.b_id, mv.id_crm::text::character varying) AS b_id,
    COALESCE(w.b_etapa_bitrix, upper(TRIM(BOTH FROM mv.etapa_crm))) AS b_etapa_de_la_negociacion,
    w.b_etapa_slug,
    COALESCE(w.b_creado_el_fecha, mv.fecha_creacion_crm::date) AS b_creado_el_fecha,
    w.b_modificado_el_fecha,
    COALESCE(w.b_responsable_wh, mv.asesor) AS b_persona_responsable,
    COALESCE(w.b_origen_wh, mv.origen) AS b_origen,
    w.b_pipeline,
    w.b_telefono,
    w.b_razon_descarte,
    w.created_at,
    w.updated_at,
    mv.supervisor AS sup_mv,
    ${expr('codigo_asesor')} AS codigo_asesor,
    ${expr('j_fecha_registro_sistema')} AS j_fecha_registro_sistema,
    ${expr('j_id_bitrix')} AS j_id_bitrix,
    ${expr('j_netlife_estatus_real')} AS j_netlife_estatus_real,
    ${expr('j_fecha_activacion_netlife')} AS j_fecha_activacion_netlife,
    ${expr('j_estatus_regularizacion')} AS j_estatus_regularizacion,
    ${expr('j_detalle_regularizacion')} AS j_detalle_regularizacion,
    ${expr('j_forma_pago')} AS j_forma_pago,
    ${expr('j_aplica_descuento_3ra_edad')} AS j_aplica_descuento_3ra_edad,
    ${expr('j_netlife_login')} AS j_netlife_login,
    ${expr('j_fecha_agenda')} AS j_fecha_agenda,
    ${expr('j_ciudad')} AS j_ciudad,
    COALESCE(mv.plan_casa, mv.plan_profesional, mv.plan_pyme, mv.plan_pyme_corp, mv.plan_hogar_adulto_mayor, mv.plan_centro_red_comercial) AS j_plan_contratado_final
   FROM wh w
     FULL JOIN mv_indicadores_velsa_completo mv ON mv.id_crm::text = w.b_id::text
     LEFT JOIN velsa_netlife_maestra_cons mc
            ON mc.j_id_bitrix_ghl::text = COALESCE(w.b_id::text, mv.id_crm::text);`

  if (!EJECUTAR) {
    console.log('\n──── SQL que se aplicaría ────\n' + SQL)
    console.log('\nSIMULACIÓN. Corre con --ejecutar para aplicarlo.\n')
    await pool.end(); return
  }

  console.log('\nAplicando...')
  try {
    await pool.query(SQL)
    console.log('   ✅ Vista actualizada')
  } catch (e) {
    console.log('   ❌ ' + e.message)
    console.log('   La vista quedó como estaba. Nada se rompió.')
    await pool.end(); return
  }

  const { rows: fin } = await pool.query(
    `SELECT b_id, j_netlife_login, j_netlife_estatus_real, j_ciudad, j_forma_pago
       FROM public.vw_bitrix_velsa WHERE b_id::text = $1`, [BITRIX])
  console.log('\nLa venta ahora:', JSON.stringify(fin[0] || null))
  console.log(fin[0] && fin[0].j_netlife_login ? '\n✅ LA FILA YA PASA\n' : '\n❌ Sigue vacía\n')
  await pool.end()
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
