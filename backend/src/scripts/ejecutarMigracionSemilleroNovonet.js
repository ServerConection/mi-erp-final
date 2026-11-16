/** Ejecuta la migracion puntual del 16-11-2026 y verifica el resultado. */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function main() {
  const archivo = path.join(
    __dirname,
    '../migrations/20261116_migrar_semillero_novonet_noviembre.sql'
  );
  const resultado = await pool.query(fs.readFileSync(archivo, 'utf8'));
  const actualizadas = resultado.find((r) => r.command === 'UPDATE');

  const { rows: verificacion } = await pool.query(`
    SELECT
      UPPER(BTRIM(distribuidor_autorizado)) AS empresa,
      COUNT(*)::int AS total
    FROM public.envios_ventas
    WHERE public.parse_fecha_flex(fecha_registro_sistema::text) >= DATE '2026-11-01'
      AND public.parse_fecha_flex(fecha_registro_sistema::text) <  DATE '2026-12-01'
      AND UPPER(BTRIM(distribuidor_autorizado)) IN ('SEMILLERO', 'NOVONET')
    GROUP BY 1
    ORDER BY 1
  `);

  const { rows: auditoria } = await pool.query(`
    SELECT COUNT(*)::int AS respaldadas
    FROM public.auditoria_migracion_empresa_ventas
    WHERE migracion = '20261116_semillero_novonet_noviembre'
  `);

  console.log(JSON.stringify({
    actualizadas: actualizadas?.rowCount || 0,
    ids_actualizados: actualizadas?.rows?.map((r) => r.id) || [],
    respaldadas: auditoria[0].respaldadas,
    verificacion,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
