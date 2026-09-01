/**
 * CLI de reconciliación Bitrix ⇄ bitrix_webhook_leads.
 * La lógica vive en src/services/reconciliacionBitrix.service.js (la comparte
 * con el cron src/jobs/reconciliacionBitrix.cron.js).
 *
 * USO (desde la carpeta backend/):
 *   node scripts/reconciliar_bitrix_leads.js                          → reporta, no escribe
 *   node scripts/reconciliar_bitrix_leads.js --aplicar                → rellena lo que falte
 *   node scripts/reconciliar_bitrix_leads.js --desde=2026-06-01 --aplicar
 *   node scripts/reconciliar_bitrix_leads.js --id=570189 --aplicar    → un solo deal
 *   node scripts/reconciliar_bitrix_leads.js --empresa=velsa --aplicar
 */
require('dotenv').config();
const { reconciliarLeads } = require('../src/services/reconciliacionBitrix.service');

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt  = (n, def = null) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split('=').slice(1).join('=') : def;
};

(async () => {
  const aplicar = flag('aplicar');
  const empresa = opt('empresa', 'novonet');
  const soloId  = opt('id');
  const desde   = opt('desde');
  const hasta   = opt('hasta');

  console.log('🔎 Reconciliación Bitrix ⇄ bitrix_webhook_leads');
  console.log(`   empresa=${empresa}${soloId ? ` | SOLO deal ${soloId}` : ` | desde=${desde || '(últimos 7 días)'} hasta=${hasta || '(hoy)'}`}`);
  console.log(`   modo=${aplicar ? '⚠️  APLICAR (escribe en la base)' : 'DRY-RUN (no escribe)'}\n`);

  const r = await reconciliarLeads({ empresa, desde, hasta, soloId, aplicar });

  console.log(`\n   Deals revisados en Bitrix: ${r.deals}`);
  console.log(`   ❌ FALTAN en la tabla:     ${r.faltantes.length}`);
  console.log(`   ⚠️  Etapa desfasada:        ${r.desfasados.length}`);

  if (r.faltantes.length) {
    console.log('\n   Primeros 25 faltantes:');
    console.table(r.faltantes.slice(0, 25).map(({ d, etapa }) => ({
      ID: d.ID, etapa, titulo: String(d.TITLE || '').slice(0, 42),
      repetida: d.IS_REPEATED_APPROACH, creado: d.DATE_CREATE, modificado: d.DATE_MODIFY,
    })));
  }
  if (r.desfasados.length) {
    console.log('\n   Primeros 25 con etapa desfasada:');
    console.table(r.desfasados.slice(0, 25).map(({ d, etapa, etapaTabla }) => ({
      ID: d.ID, en_bitrix: etapa, en_tabla: etapaTabla, modificado: d.DATE_MODIFY,
    })));
  }

  if (!aplicar) {
    console.log('\n💡 DRY-RUN. Para escribir de verdad agregá  --aplicar');
  } else {
    console.log(`\n✅ Escritos: ${r.escritos} | Errores: ${r.errores}`);
  }
  process.exit(0);
})().catch((e) => { console.error('❌ Error fatal:', e.message); process.exit(1); });
