/** Ejecuta y verifica la migracion de backlog activado en noviembre de 2026. */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const MIGRACION = '20261118_semillero_novonet_activadas_noviembre';

async function main() {
  const archivo = path.join(
    __dirname,
    '../migrations/20261118_migrar_semillero_novonet_activadas_noviembre.sql'
  );
  const resultado = await pool.query(fs.readFileSync(archivo, 'utf8'));
  const actualizadas = resultado.find((r) => r.command === 'UPDATE');

  const { rows: auditoria } = await pool.query(`
    SELECT COUNT(*)::int AS respaldadas
    FROM public.auditoria_migracion_empresa_ventas
    WHERE migracion = $1
  `, [MIGRACION]);

  const { rows: pendientes } = await pool.query(`
    SELECT COUNT(*)::int AS total
    FROM public.envios_ventas
    WHERE public.parse_fecha_flex(fecha_activacion_netlife::text) >= DATE '2026-11-01'
      AND public.parse_fecha_flex(fecha_activacion_netlife::text) <  DATE '2026-12-01'
      AND UPPER(BTRIM(distribuidor_autorizado)) = 'SEMILLERO'
  `);

  const { rows: integridad } = await pool.query(`
    SELECT
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
    WHERE a.migracion = $1
  `, [MIGRACION]);

  console.log(JSON.stringify({
    actualizadas: actualizadas?.rowCount || 0,
    ids_actualizados: actualizadas?.rows?.map((fila) => fila.id) || [],
    respaldadas: auditoria[0].respaldadas,
    pendientes_semillero: pendientes[0].total,
    integridad: integridad[0],
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
