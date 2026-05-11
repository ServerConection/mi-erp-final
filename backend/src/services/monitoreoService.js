import localPool  from '../config/dbLocal.js';
import renderPool from '../config/dbRender.js';

// ─── Vistas y sus tipos de columnas ──────────────────────────────────────────
const VISTAS = [
  {
    nombre: 'public.mv_monitoreo_publicidad',
    tipos: `
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN fecha                    TYPE date    USING fecha::date;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN dia_mes                  TYPE integer USING dia_mes::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN mes                      TYPE integer USING mes::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN anio                     TYPE integer USING anio::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN n_leads                  TYPE integer USING n_leads::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN atc_soporte              TYPE integer USING atc_soporte::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN fuera_cobertura          TYPE integer USING fuera_cobertura::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN zonas_peligrosas         TYPE integer USING zonas_peligrosas::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN innegociable             TYPE integer USING innegociable::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN negociables              TYPE integer USING negociables::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN venta_subida_bitrix      TYPE integer USING venta_subida_bitrix::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN seguimiento_negociacion  TYPE integer USING seguimiento_negociacion::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN otro_proveedor           TYPE integer USING otro_proveedor::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN no_interesa_costo        TYPE integer USING no_interesa_costo::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN desiste_compra           TYPE integer USING desiste_compra::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN duplicado                TYPE integer USING duplicado::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN cliente_discapacidad     TYPE integer USING cliente_discapacidad::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN ingreso_jot              TYPE integer USING ingreso_jot::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN ingreso_bitrix_mismo_dia TYPE integer USING ingreso_bitrix_mismo_dia::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN activo_backlog           TYPE integer USING activo_backlog::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN activos_mes              TYPE integer USING activos_mes::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN estado_activo_netlife    TYPE integer USING estado_activo_netlife::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN desiste_servicio_jot     TYPE integer USING desiste_servicio_jot::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pago_cuenta              TYPE integer USING pago_cuenta::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pago_efectivo            TYPE integer USING pago_efectivo::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pago_tarjeta             TYPE integer USING pago_tarjeta::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pago_cuenta_activa       TYPE integer USING pago_cuenta_activa::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pago_efectivo_activa     TYPE integer USING pago_efectivo_activa::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pago_tarjeta_activa      TYPE integer USING pago_tarjeta_activa::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN ciclo_0_dias             TYPE integer USING ciclo_0_dias::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN ciclo_1_dia              TYPE integer USING ciclo_1_dia::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN ciclo_2_dias             TYPE integer USING ciclo_2_dias::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN ciclo_3_dias             TYPE integer USING ciclo_3_dias::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN ciclo_4_dias             TYPE integer USING ciclo_4_dias::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN ciclo_mas5_dias          TYPE integer USING ciclo_mas5_dias::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN ciclo_0_pichincha        TYPE integer USING ciclo_0_pichincha::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN ciclo_mas5_pichincha     TYPE integer USING ciclo_mas5_pichincha::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN ciclo_0_guayas           TYPE integer USING ciclo_0_guayas::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN ciclo_mas5_guayas        TYPE integer USING ciclo_mas5_guayas::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN regularizados            TYPE integer USING regularizados::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN por_regularizar          TYPE integer USING por_regularizar::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN total_gestionables       TYPE integer USING total_gestionables::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN total_ventas_jot         TYPE integer USING total_ventas_jot::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN total_ventas_crm         TYPE integer USING total_ventas_crm::integer;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN eficiencia_promedio      TYPE numeric USING eficiencia_promedio::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN inversion_usd            TYPE numeric USING inversion_usd::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN cpl                      TYPE numeric USING cpl::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN costo_ingreso_bitrix     TYPE numeric USING costo_ingreso_bitrix::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN costo_ingreso_jot        TYPE numeric USING costo_ingreso_jot::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN costo_activa             TYPE numeric USING costo_activa::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN costo_activa_backlog     TYPE numeric USING costo_activa_backlog::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN costo_por_negociable     TYPE numeric USING costo_por_negociable::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pct_atc                  TYPE numeric USING pct_atc::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pct_fuera_cobertura      TYPE numeric USING pct_fuera_cobertura::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pct_innegociable         TYPE numeric USING pct_innegociable::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pct_negociable           TYPE numeric USING pct_negociable::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN efectividad_total        TYPE numeric USING efectividad_total::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN efectividad_negociables  TYPE numeric USING efectividad_negociables::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pct_pago_cuenta          TYPE numeric USING pct_pago_cuenta::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pct_pago_efectivo        TYPE numeric USING pct_pago_efectivo::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pct_pago_tarjeta         TYPE numeric USING pct_pago_tarjeta::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pct_ciclo_0_dias         TYPE numeric USING pct_ciclo_0_dias::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pct_ciclo_1_dia          TYPE numeric USING pct_ciclo_1_dia::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pct_ciclo_2_dias         TYPE numeric USING pct_ciclo_2_dias::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pct_ciclo_3_dias         TYPE numeric USING pct_ciclo_3_dias::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pct_ciclo_4_dias         TYPE numeric USING pct_ciclo_4_dias::numeric;
      ALTER TABLE public.mv_monitoreo_publicidad ALTER COLUMN pct_ciclo_mas5           TYPE numeric USING pct_ciclo_mas5::numeric;
    `
  },
  {
    nombre: 'public.mv_monitoreo_ciudad',
    tipos: `
      ALTER TABLE public.mv_monitoreo_ciudad ALTER COLUMN fecha        TYPE date    USING fecha::date;
      ALTER TABLE public.mv_monitoreo_ciudad ALTER COLUMN total_leads  TYPE integer USING total_leads::integer;
      ALTER TABLE public.mv_monitoreo_ciudad ALTER COLUMN activos      TYPE integer USING activos::integer;
      ALTER TABLE public.mv_monitoreo_ciudad ALTER COLUMN ingresos_jot TYPE integer USING ingresos_jot::integer;
      ALTER TABLE public.mv_monitoreo_ciudad ALTER COLUMN pct_activos  TYPE numeric USING pct_activos::numeric;
    `
  },
  {
    nombre: 'public.mv_monitoreo_hora',
    tipos: `
      ALTER TABLE public.mv_monitoreo_hora ALTER COLUMN fecha        TYPE date    USING fecha::date;
      ALTER TABLE public.mv_monitoreo_hora ALTER COLUMN hora         TYPE integer USING hora::integer;
      ALTER TABLE public.mv_monitoreo_hora ALTER COLUMN n_leads      TYPE integer USING n_leads::integer;
      ALTER TABLE public.mv_monitoreo_hora ALTER COLUMN atc          TYPE integer USING atc::integer;
      ALTER TABLE public.mv_monitoreo_hora ALTER COLUMN pct_atc_hora TYPE numeric USING pct_atc_hora::numeric;
    `
  },
  {
    nombre: 'public.mv_monitoreo_atc',
    tipos: `
      ALTER TABLE public.mv_monitoreo_atc ALTER COLUMN fecha    TYPE date    USING fecha::date;
      ALTER TABLE public.mv_monitoreo_atc ALTER COLUMN cantidad TYPE integer USING cantidad::integer;
    `
  },
];

// ─── Sincroniza UNA vista → tabla en Render ───────────────────────────────────
async function syncVista({ nombre, tipos }) {
  console.log(`  📋 Sincronizando ${nombre}...`);

  const { rows } = await localPool.query(`SELECT * FROM ${nombre}`);

  if (rows.length === 0) {
    console.log(`  ⚠️  ${nombre} está vacía, se omite.`);
    return;
  }

  const columns           = Object.keys(rows[0]);
  const columnsQuoted     = columns.map(c => `"${c}"`).join(', ');
  const columnDefinitions = columns.map(c => `"${c}" TEXT`).join(', ');

  await renderPool.query(`DROP TABLE IF EXISTS ${nombre}`);
  await renderPool.query(`CREATE TABLE ${nombre} (${columnDefinitions})`);

  const client = await renderPool.connect();
  try {
    await client.query('BEGIN');
    const BATCH_SIZE = 500;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk           = rows.slice(i, i + BATCH_SIZE);
      const values          = [];
      const rowPlaceholders = [];
      let   paramIndex      = 1;

      for (const row of chunk) {
        const rowValues = Object.values(row);
        values.push(...rowValues);
        const placeholders = rowValues.map(() => `$${paramIndex++}`).join(', ');
        rowPlaceholders.push(`(${placeholders})`);
      }

      await client.query(
        `INSERT INTO ${nombre} (${columnsQuoted}) VALUES ${rowPlaceholders.join(', ')}`,
        values
      );

      console.log(`     ... filas ${i + 1} a ${Math.min(i + BATCH_SIZE, rows.length)}`);
    }

    await client.query('COMMIT');
    console.log(`  🔧 Aplicando tipos de datos...`);
    await renderPool.query(tipos);
    console.log(`  ✅ ${nombre} → ${rows.length} filas sincronizadas.`);

  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`  💥 Error sincronizando ${nombre}:`, e.message);
    throw e;
  } finally {
    client.release();
  }
}

// ─── Proceso principal ────────────────────────────────────────────────────────
export async function processAndSyncMonitoreo() {
  try {
    console.log('🔄 [LOCAL] Refrescando vistas materializadas...');
    await localPool.query(`SELECT public.refresh_monitoreo()`);
    console.log('✅ [LOCAL] Vistas refrescadas.');

    console.log('🚀 [RENDER] Iniciando sincronización...');
    for (const vista of VISTAS) {
      await syncVista(vista);
    }

    console.log('✅ [RENDER] Todas las vistas sincronizadas correctamente.');
  } catch (error) {
    console.error('❌ ERROR en monitoreoService:', error.message);
    throw error;
  }
}