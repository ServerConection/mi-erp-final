/**
 * Verifica, ANTES de comitear/pushear, que el fix de "leads por origen"
 * (2026-08-27) no está inventando ni perdiendo data — solo lectura, no
 * modifica nada.
 *
 * v2 (2026-08-27): la v1 comparaba bitrix_webhook_leads SIN el filtro de
 * negocio "esLeadTotalExpr" (excluye DUPLICADO/REGULARIZACION/REMARKETING
 * del conteo de leads — regla de gerencia, ver shared/etapas.js) contra
 * vw_bitrix_novonet, que SOLO excluye 'duplicado' (parcial, no toda la
 * regla). Eso hacía que el total "nuevo" saliera MÁS ALTO que el viejo en
 * Novonet (+2756), lo cual es al revés de lo esperado y NO es correcto.
 * Ahora la query "nueva" aplica la MISMA regla de negocio que ya usa el
 * resto del ERP (esLeadTotalExpr), igual que quedó en el código real.
 *
 * Compara, para Novonet y Velsa:
 *   1) el total por origen que daba la query VIEJA (con el JOIN a Jotform,
 *      exclusión parcial) vs la NUEVA (bitrix_webhook_leads directo + regla
 *      de negocio completa).
 *   2) cuántas filas "fantasma" (duplicadas por el JOIN) había en los
 *      exports "Detalle CRM" antes de agregarles DISTINCT, para un rango
 *      de fechas reciente.
 *
 * Uso (desde backend/):
 *   node scripts/verificar_fix_leads_origen.js
 *   node scripts/verificar_fix_leads_origen.js 2026-07-01 2026-08-27   -> rango custom
 */

require('dotenv').config();
const pool = require('../src/config/db');
const { esLeadTotalExpr } = require('../src/shared/etapas');

const desde = process.argv[2] || '2026-07-01';
const hasta = process.argv[3] || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

const linea = () => console.log('─'.repeat(78));

async function compararOrigenes(empresa, tablaVieja, colOrigenVieja, filtroVieja) {
  const vieja = await pool.query(`
    SELECT ${colOrigenVieja} AS origen, COUNT(*)::int AS total
    FROM ${tablaVieja}
    WHERE ${filtroVieja} AND NULLIF(TRIM(${colOrigenVieja}), '') IS NOT NULL
    GROUP BY 1
  `);
  const nueva = await pool.query(`
    SELECT source AS origen, COUNT(*)::int AS total
    FROM public.bitrix_webhook_leads
    WHERE empresa = $1
      AND NULLIF(TRIM(source), '') IS NOT NULL
      AND ${esLeadTotalExpr('etapa_bitrix')}
    GROUP BY 1
  `, [empresa]);
  // Para referencia: cuánto habría dado la nueva query SIN la regla de negocio
  // (para ver el tamaño del efecto DUPLICADO/REGULARIZACION/REMARKETING).
  const nuevaSinRegla = await pool.query(`
    SELECT COUNT(*)::int AS total
    FROM public.bitrix_webhook_leads
    WHERE empresa = $1 AND NULLIF(TRIM(source), '') IS NOT NULL
  `, [empresa]);

  const mapaVieja = new Map(vieja.rows.map(r => [r.origen, r.total]));
  const mapaNueva = new Map(nueva.rows.map(r => [r.origen, r.total]));
  const todosOrigenes = new Set([...mapaVieja.keys(), ...mapaNueva.keys()]);

  console.log(`\n${empresa.toUpperCase()} — comparación TOTAL histórico por origen (vieja vs nueva CON regla de negocio)`);
  linea();
  console.log('ORIGEN'.padEnd(30), 'VIEJA (con JOIN)'.padStart(18), 'NUEVA (webhook)'.padStart(18), 'DIFERENCIA'.padStart(12));
  linea();
  let totalViejaSum = 0, totalNuevaSum = 0;
  [...todosOrigenes].sort().forEach(origen => {
    const v = mapaVieja.get(origen) || 0;
    const n = mapaNueva.get(origen) || 0;
    totalViejaSum += v;
    totalNuevaSum += n;
    const diff = n - v;
    const marca = diff !== 0 ? (diff > 0 ? '  <- revisar (+)' : '  <- revisar (-)') : '';
    console.log(
      origen.slice(0, 30).padEnd(30),
      String(v).padStart(18),
      String(n).padStart(18),
      (String(diff).padStart(12)) + marca
    );
  });
  linea();
  console.log('TOTAL'.padEnd(30), String(totalViejaSum).padStart(18), String(totalNuevaSum).padStart(18), String(totalNuevaSum - totalViejaSum).padStart(12));
  console.log(`(referencia) total SIN aplicar esLeadTotalExpr: ${nuevaSinRegla.rows[0].total}  -- la diferencia contra el total NUEVO de arriba es cuánto pesa DUPLICADO/REGULARIZACION/REMARKETING`);
}

async function compararFilasFantasma(nombre, vistaOFrom, colId, filtroFecha, params) {
  const r = await pool.query(`
    SELECT COUNT(*) AS filas, COUNT(DISTINCT ${colId}) AS leads_distintos
    FROM ${vistaOFrom}
    WHERE ${filtroFecha}
  `, params);
  const { filas, leads_distintos } = r.rows[0];
  const fantasma = Number(filas) - Number(leads_distintos);
  console.log(`\n${nombre} — filas del ${desde} al ${hasta}`);
  linea();
  console.log(`  filas totales (antes del fix, sin DISTINCT): ${filas}`);
  console.log(`  leads distintos (con DISTINCT, lo correcto):  ${leads_distintos}`);
  console.log(`  filas "fantasma" que el DISTINCT elimina:      ${fantasma}${fantasma > 0 ? '  <- esto es lo que estaba inflando el reporte' : '  (sin duplicados en este rango)'}`);
}

(async () => {
  try {
    console.log(`Rango de verificación para las filas "fantasma": ${desde} a ${hasta}`);

    await compararOrigenes('novonet', 'public.vw_bitrix_novonet', 'b_origen', '1=1');
    await compararOrigenes('velsa', 'public.mv_indicadores_velsa_completo', 'origen', '1=1');

    await compararFilasFantasma(
      'Novonet — queryCRM (Detalle CRM)',
      'public.vw_bitrix_novonet',
      'b_id',
      'b_creado_el_fecha BETWEEN $1::date AND $2::date',
      [desde, hasta]
    );

    await compararFilasFantasma(
      'Velsa — Detalle CRM',
      'public.mv_indicadores_velsa_completo',
      'id_crm',
      'fecha_creacion_crm::date BETWEEN $1::date AND $2::date',
      [desde, hasta]
    );

    linea();
    console.log('\nListo. Ahora la NUEVA ya aplica esLeadTotalExpr (excluye DUPLICADO/REGULARIZACION/REMARKETING) igual que el resto del ERP.');
    console.log('Revisa que la diferencia por origen ya tenga sentido (chica, y explicada por el numero de referencia de arriba) antes de comitear.');
    process.exit(0);
  } catch (err) {
    console.error('\nError:', err.message);
    process.exit(1);
  }
})();
