const pool = require('../src/config/db');

async function main() {
  const fechas = ['2026-08-11T11:23:51-05:00', '2026-08-06T11:33:05-05:00'];
  const result = await pool.query(
    `UPDATE public.coverage_consultas
        SET usuario_id = NULL,
            usuario = 'historial_local_desconocido',
            asesor = 'Asesor desconocido',
            empresa = NULL
      WHERE usuario = 'kchala'
        AND consultado_en = ANY($1::timestamptz[])
        AND (latitud, longitud) IN ((-0.177, -78.4869), (-0.094049, -78.451010))
      RETURNING usuario, asesor, empresa, latitud, longitud, tiene_cobertura,
                zona_nombre,
                consultado_en AT TIME ZONE 'America/Guayaquil' AS fecha_local`,
    [fechas]
  );
  console.log(JSON.stringify({ corregidos: result.rowCount, registros: result.rows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
