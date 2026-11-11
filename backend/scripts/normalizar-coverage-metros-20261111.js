const pool = require('../src/config/db');

async function main() {
  const result = await pool.query(
    `UPDATE public.coverage_consultas
        SET cobertura_metros = NULL
      WHERE cobertura_via IS DISTINCT FROM 'trazado'
        AND cobertura_metros IS NOT NULL`
  );
  console.log(JSON.stringify({ actualizados: result.rowCount }));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
