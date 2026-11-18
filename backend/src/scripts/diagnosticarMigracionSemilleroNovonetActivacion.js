/** Diagnostico de solo lectura para el backlog activado en noviembre de 2026. */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const pool = require('../config/db');

async function main() {
  const { rows: candidatas } = await pool.query(`
    SELECT id, id_bitrix, distribuidor_autorizado, fecha_registro_sistema,
           fecha_activacion_netlife, estatus_envio
    FROM public.envios_ventas
    WHERE public.parse_fecha_flex(fecha_activacion_netlife::text) >= DATE '2026-11-01'
      AND public.parse_fecha_flex(fecha_activacion_netlife::text) <  DATE '2026-12-01'
      AND UPPER(BTRIM(distribuidor_autorizado)) = 'SEMILLERO'
    ORDER BY public.parse_fecha_flex(fecha_activacion_netlife::text), id
  `);

  console.log(JSON.stringify({
    total_candidatas: candidatas.length,
    ids: candidatas.map((fila) => fila.id),
    filas: candidatas,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
