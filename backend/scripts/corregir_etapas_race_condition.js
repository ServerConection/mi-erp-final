/**
 * Correccion de UNA SOLA VEZ (backfill) de los leads que quedaron con una
 * etapa vieja en bitrix_webhook_leads por el bug de race condition al crear
 * el lead (ver fix en bitrixWebhook.controller.js, 2026-08-27): Bitrix manda
 * "contacto_nuevo" y la etapa real (ej. "atc") casi al mismo tiempo, y si
 * "contacto_nuevo" llegaba DESPUES al servidor, pisaba la etapa correcta.
 *
 * Que hace: para cada lead (empresa+bitrix_id), repasa TODO su historial en
 * bitrix_webhook_leads_historial en orden cronologico y recalcula cual
 * deberia ser la etapa actual aplicando la MISMA regla del fix (un evento
 * "contacto_nuevo" no pisa una etapa ya distinta que el lead ya tenia).
 * Compara ese resultado contra lo que hay guardado ahora mismo y corrige
 * SOLO si es distinto. NO toca el historial (queda intacto, tal cual llego).
 * NO toca ninguna otra columna (telefono, responsable, etc.), solo
 * etapa/etapa_bitrix.
 *
 * Uso (desde backend/):
 *   node scripts/corregir_etapas_race_condition.js            -> solo reporta (no escribe nada)
 *   node scripts/corregir_etapas_race_condition.js --apply     -> aplica la correccion
 */
require('dotenv').config();
const pool = require('../src/config/db');

const APLICAR = process.argv.includes('--apply');

function recalcularEtapaFinal(eventos) {
  // eventos: [{etapa, etapa_bitrix, created_at}, ...] en orden cronologico ASC
  let etapaActual = null;
  let etapaBitrixActual = null;
  for (const ev of eventos) {
    const esContactoNuevoTardio =
      ev.etapa === 'contacto_nuevo' && etapaActual !== null && etapaActual !== 'contacto_nuevo';
    if (esContactoNuevoTardio) continue; // se ignora, igual que el fix en vivo
    etapaActual = ev.etapa;
    etapaBitrixActual = ev.etapa_bitrix;
  }
  return { etapa: etapaActual, etapa_bitrix: etapaBitrixActual };
}

(async () => {
  try {
    console.log(`Modo: ${APLICAR ? 'APLICAR (va a escribir en bitrix_webhook_leads)' : 'SOLO REPORTE (no escribe nada)'}\n`);

    const { rows: historial } = await pool.query(`
      SELECT empresa, bitrix_id, etapa, etapa_bitrix, created_at
      FROM public.bitrix_webhook_leads_historial
      WHERE bitrix_id IS NOT NULL
      ORDER BY empresa, bitrix_id, created_at ASC
    `);
    console.log(`Eventos de historial leidos: ${historial.length}`);

    const { rows: actuales } = await pool.query(`
      SELECT empresa, bitrix_id, etapa, etapa_bitrix
      FROM public.bitrix_webhook_leads
    `);
    const mapaActual = new Map(actuales.map(r => [`${r.empresa}|${r.bitrix_id}`, r]));

    // Agrupar historial por lead
    const grupos = new Map();
    for (const ev of historial) {
      const key = `${ev.empresa}|${ev.bitrix_id}`;
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(ev);
    }
    console.log(`Leads con historial: ${grupos.size}\n`);

    const correcciones = [];
    for (const [key, eventos] of grupos) {
      const [empresa, bitrix_id] = key.split('|');
      const actual = mapaActual.get(key);
      if (!actual) continue; // el lead ya no existe en el estado actual (raro, se ignora)

      // ALCANCE ACOTADO A PROPOSITO (2026-08-27): solo se corrigen leads cuyo
      // ESTADO ACTUAL es "contacto_nuevo" -- ese es el sintoma exacto y
      // confirmado del race condition (ver diagnosticar_historial.js). Se
      // encontro que "recalcular toda la historia" tambien marcaba como
      // "corregibles" leads que en realidad fueron actualizados a proposito
      // por una carga masiva ajena a los webhooks (ej. varios leads con
      // updated_at identico al segundo, sin evento nuevo en el historial) --
      // aplicar el recalculo ahi los hubiera revertido a un estado viejo
      // incorrecto. Por eso NO se toca ningun lead cuya etapa actual ya sea
      // distinta de "contacto_nuevo".
      if (actual.etapa !== 'contacto_nuevo') continue;

      const recalculado = recalcularEtapaFinal(eventos);
      if (recalculado.etapa && recalculado.etapa !== actual.etapa) {
        correcciones.push({
          empresa, bitrix_id,
          antes: actual.etapa_bitrix,
          despues: recalculado.etapa_bitrix,
          etapaSlugAntes: actual.etapa,
          etapaSlugDespues: recalculado.etapa,
        });
      }
    }

    const porEmpresa = correcciones.reduce((acc, c) => {
      acc[c.empresa] = (acc[c.empresa] || 0) + 1;
      return acc;
    }, {});

    console.log(`=== RESUMEN ===`);
    console.log(`Leads a corregir: ${correcciones.length}`);
    console.log(porEmpresa);
    console.log(`\nPrimeros 30 ejemplos:`);
    correcciones.slice(0, 30).forEach(c => {
      console.log(`  [${c.empresa}] ID ${c.bitrix_id}: "${c.antes}" -> "${c.despues}"`);
    });

    if (!APLICAR) {
      console.log(`\n(Modo solo reporte -- no se cambio nada. Corre con --apply para aplicar.)`);
      process.exit(0);
    }

    console.log(`\nAplicando ${correcciones.length} correcciones...`);
    let ok = 0;
    for (const c of correcciones) {
      await pool.query(
        `UPDATE public.bitrix_webhook_leads
         SET etapa = $1, etapa_bitrix = $2, updated_at = NOW()
         WHERE empresa = $3 AND bitrix_id = $4`,
        [c.etapaSlugDespues, c.despues, c.empresa, c.bitrix_id]
      );
      ok++;
    }
    console.log(`Listo. ${ok} leads corregidos.`);
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
