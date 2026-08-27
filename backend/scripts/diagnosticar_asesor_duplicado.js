/**
 * Diagnostico: muestra las variantes EXACTAS (mayusculas/espacios) con las
 * que aparece un nombre de asesor en bitrix_webhook_leads.responsible y en
 * mestra_bitrix.b_persona_responsable. Si el mismo asesor tiene mas de una
 * variante de escritura, las tablas de KPI (que agrupan por texto exacto)
 * lo cuentan como 2 personas distintas -- eso explica el nombre repetido.
 *
 * Uso (desde backend/):
 *   node scripts/diagnosticar_asesor_duplicado.js ponce
 */
require('dotenv').config();
const pool = require('../src/config/db');

const buscar = process.argv[2];

(async () => {
  try {
    if (!buscar) {
      console.error('Uso: node scripts/diagnosticar_asesor_duplicado.js <parte_del_nombre>');
      process.exit(1);
    }

    console.log(`\n=== bitrix_webhook_leads.responsible (empresa='novonet') ===`);
    const { rows: r1 } = await pool.query(`
      SELECT responsible, COUNT(*)::int AS total
      FROM public.bitrix_webhook_leads
      WHERE empresa = 'novonet' AND responsible ILIKE $1
      GROUP BY responsible
      ORDER BY total DESC
    `, [`%${buscar}%`]);
    r1.forEach(r => console.log(`  "${r.responsible}"  (${r.total} leads)`));
    if (!r1.length) console.log('  (sin resultados)');

    console.log(`\n=== mestra_bitrix.b_persona_responsable ===`);
    const { rows: r2 } = await pool.query(`
      SELECT b_persona_responsable, COUNT(*)::int AS total
      FROM public.mestra_bitrix
      WHERE b_persona_responsable ILIKE $1
      GROUP BY b_persona_responsable
      ORDER BY total DESC
    `, [`%${buscar}%`]);
    r2.forEach(r => console.log(`  "${r.b_persona_responsable}"  (${r.total} filas)`));
    if (!r2.length) console.log('  (sin resultados)');

    console.log(`\n=== empleados.nombre_completo (catalogo de asesores/supervisor) ===`);
    const { rows: r3 } = await pool.query(`
      SELECT nombre_completo, supervisor, codigo
      FROM public.empleados
      WHERE nombre_completo ILIKE $1
    `, [`%${buscar}%`]);
    r3.forEach(r => console.log(`  "${r.nombre_completo}"  supervisor="${r.supervisor}" codigo=${r.codigo}`));
    if (!r3.length) console.log('  (sin resultados)');

    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
