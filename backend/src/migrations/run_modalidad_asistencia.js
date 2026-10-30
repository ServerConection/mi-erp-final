const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function main() {
  const archivo = path.join(__dirname, '20261028_usuarios_modalidad_asistencia.sql');
  const sql = fs.readFileSync(archivo, 'utf8');
  await pool.query(sql);
  const resumen = await pool.query(`
    SELECT modalidad_asistencia, COUNT(*)::int AS usuarios
    FROM public.usuarios
    GROUP BY modalidad_asistencia
    ORDER BY modalidad_asistencia
  `);
  console.table(resumen.rows);
  const detalle = await pool.query(`
    SELECT UPPER(BTRIM(COALESCE(empresa, 'SIN EMPRESA'))) AS empresa,
           UPPER(BTRIM(COALESCE(perfil, 'SIN PERFIL'))) AS perfil,
           modalidad_asistencia,
           COUNT(*)::int AS usuarios
    FROM public.usuarios
    WHERE activo = 'SI'
    GROUP BY 1, 2, 3
    ORDER BY 1, 2, 3
  `);
  console.table(detalle.rows);
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('[modalidad-asistencia] Migración fallida:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
