/**
 * Diagnostico: muestra el historial COMPLETO de webhooks recibidos para una
 * lista de bitrix_id, en orden cronologico de llegada al servidor.
 *
 * Por que hace falta: bitrix_webhook_leads guarda solo el ESTADO ACTUAL (la
 * ultima etapa que llego le gana a la anterior, sin verificar el orden real
 * en Bitrix). Si dos webhooks llegan desordenados (por reintentos, delays de
 * red, etc.), el estado actual puede quedar con una etapa vieja aunque en
 * Bitrix el lead ya avanzo. bitrix_webhook_leads_historial SI guarda cada
 * evento recibido sin sobreescribir nada, asi que ahi se ve la verdad.
 *
 * Uso (desde backend/):
 *   node scripts/diagnosticar_historial.js 570961 570619 570509 568409
 */
require('dotenv').config();
const pool = require('../src/config/db');

const ids = process.argv.slice(2);

(async () => {
  try {
    if (!ids.length) {
      console.error('Uso: node scripts/diagnosticar_historial.js <id1> <id2> ...');
      process.exit(1);
    }

    const { rows: actual } = await pool.query(
      `SELECT bitrix_id, etapa_bitrix, updated_at_ecuador
       FROM public.bitrix_webhook_leads
       WHERE empresa = 'novonet' AND bitrix_id = ANY($1::text[])`,
      [ids]
    );
    const { rows: hist } = await pool.query(
      `SELECT bitrix_id, etapa_bitrix, event, created_at_ecuador
       FROM public.bitrix_webhook_leads_historial
       WHERE empresa = 'novonet' AND bitrix_id = ANY($1::text[])
       ORDER BY bitrix_id, created_at ASC`,
      [ids]
    );

    const mapaActual = new Map(actual.map(r => [r.bitrix_id, r]));

    for (const id of ids) {
      console.log(`\n=== ID ${id} ===`);
      const est = mapaActual.get(id);
      console.log(`Estado ACTUAL en bitrix_webhook_leads: ${est ? est.etapa_bitrix + ' (actualizado ' + est.updated_at_ecuador + ')' : 'NO ENCONTRADO'}`);
      const eventos = hist.filter(h => h.bitrix_id === id);
      if (!eventos.length) {
        console.log('  Sin eventos en el historial.');
        continue;
      }
      console.log(`Historial completo (${eventos.length} eventos, en orden de llegada):`);
      eventos.forEach((e, i) => {
        console.log(`  ${i + 1}. ${e.created_at_ecuador}  etapa="${e.etapa_bitrix}"  event="${e.event}"`);
      });
    }

    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
