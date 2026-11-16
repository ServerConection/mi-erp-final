/**
 * Diagnostico de solo lectura para migrar ventas Jotform/ERP de Semillero a Novonet.
 * No modifica datos ni toca bitrix_webhook_leads.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const pool = require('../config/db');

async function main() {
  const { rows: resumen } = await pool.query(`
    SELECT
      UPPER(BTRIM(distribuidor_autorizado)) AS empresa,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE estatus_envio IS DISTINCT FROM 'BORRADOR')::int AS enviados,
      MIN(public.parse_fecha_flex(fecha_registro_sistema::text))::text AS primera_fecha,
      MAX(public.parse_fecha_flex(fecha_registro_sistema::text))::text AS ultima_fecha
    FROM public.envios_ventas
    WHERE public.parse_fecha_flex(fecha_registro_sistema::text)
          >= DATE '2026-11-01'
      AND public.parse_fecha_flex(fecha_registro_sistema::text)
          < DATE '2026-12-01'
      AND UPPER(BTRIM(distribuidor_autorizado)) IN ('SEMILLERO', 'NOVONET')
    GROUP BY 1
    ORDER BY 1
  `);

  const { rows: columnas } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'envios_ventas'
      AND column_name IN (
        'id', 'id_bitrix', 'distribuidor_autorizado',
        'fecha_registro_sistema', 'estatus_envio', 'fecha_ultima_actualizacion'
      )
    ORDER BY ordinal_position
  `);

  const { rows: integridad } = await pool.query(`
    SELECT
      COUNT(*)::int AS auditadas,
      COUNT(*) FILTER (
        WHERE e.id_bitrix::text IS DISTINCT FROM a.fila_anterior->>'id_bitrix'
      )::int AS ids_bitrix_modificados,
      COUNT(*) FILTER (
        WHERE (to_jsonb(e) - 'distribuidor_autorizado' - 'fecha_ultima_actualizacion')
              IS DISTINCT FROM
              (a.fila_anterior - 'distribuidor_autorizado' - 'fecha_ultima_actualizacion')
      )::int AS filas_con_otros_cambios,
      COUNT(*) FILTER (
        WHERE UPPER(BTRIM(e.distribuidor_autorizado)) <> 'NOVONET'
      )::int AS empresas_no_actualizadas
    FROM public.auditoria_migracion_empresa_ventas a
    JOIN public.envios_ventas e ON e.id = a.envio_venta_id
    WHERE a.migracion = '20261116_semillero_novonet_noviembre'
  `);

  console.log(JSON.stringify({
    resumen,
    columnas: columnas.map((r) => r.column_name),
    integridad: integridad[0],
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
