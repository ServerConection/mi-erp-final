/**
 * REGISTRAR / VER / QUITAR los eventos en tiempo real de Bitrix24.
 *
 * Esto se corre UNA SOLA VEZ (después del deploy). Le dice a Bitrix:
 * "cada vez que se cree o se modifique un deal, avisá a esta URL".
 * Desde ahí el ERP se entera de TODOS los movimientos, sin depender de las
 * automatizaciones de etapa (que solo disparan la primera vez).
 *
 * USO (desde la carpeta backend/):
 *   node scripts/registrar_evento_bitrix.js --ver         → qué hay registrado hoy
 *   node scripts/registrar_evento_bitrix.js --registrar   → registra los eventos
 *   node scripts/registrar_evento_bitrix.js --quitar      → los desregistra (deshacer)
 *
 * Requiere en .env:
 *   BITRIX_NOVONET_URL     (ya lo tenés)
 *   BITRIX_WEBHOOK_TOKEN   (ya lo tenés — viaja en la URL del handler)
 *   ERP_PUBLIC_URL         (opcional; por defecto https://erp-backend-v1-qhk2.onrender.com)
 */
require('dotenv').config();
const { bitrixCallNovonet } = require('../src/services/bitrix.service');

const args    = process.argv.slice(2);
const flag    = (n) => args.includes(`--${n}`);
const BASE    = (process.env.ERP_PUBLIC_URL || 'https://erp-backend-v1-qhk2.onrender.com').replace(/\/+$/, '');
const TOKEN   = process.env.BITRIX_WEBHOOK_TOKEN || '';
const HANDLER = `${BASE}/bitrix_evento.php?token=${encodeURIComponent(TOKEN)}`;
const EVENTOS = ['ONCRMDEALADD', 'ONCRMDEALUPDATE'];

const ver = async () => {
  const r = await bitrixCallNovonet('event.get');
  const lista = r.result || [];
  if (!lista.length) { console.log('   (no hay eventos registrados)'); return lista; }
  console.table(lista.map(e => ({ evento: e.event, handler: e.handler })));
  return lista;
};

(async () => {
  if (!TOKEN) { console.error('❌ Falta BITRIX_WEBHOOK_TOKEN en el .env'); process.exit(1); }

  console.log('🔗 Eventos en tiempo real de Bitrix24');
  console.log(`   Handler: ${BASE}/bitrix_evento.php?token=***\n`);

  if (flag('ver') || args.length === 0) {
    console.log('Registrados actualmente:');
    await ver();
    if (args.length === 0) console.log('\n💡 Para registrarlos:  node scripts/registrar_evento_bitrix.js --registrar');
    process.exit(0);
  }

  if (flag('quitar')) {
    for (const ev of EVENTOS) {
      try {
        await bitrixCallNovonet('event.unbind', { event: ev, handler: HANDLER });
        console.log(`   ✓ ${ev} desregistrado`);
      } catch (e) { console.log(`   ✗ ${ev}: ${e.message}`); }
    }
    console.log('\nEstado final:'); await ver();
    process.exit(0);
  }

  if (flag('registrar')) {
    for (const ev of EVENTOS) {
      try {
        // event.bind es idempotente en la práctica: si ya existe ese par
        // (evento + handler), Bitrix devuelve error y lo damos por hecho.
        await bitrixCallNovonet('event.bind', { event: ev, handler: HANDLER });
        console.log(`   ✓ ${ev} registrado`);
      } catch (e) {
        const msg = String(e.message || '');
        if (/exist/i.test(msg)) console.log(`   = ${ev} ya estaba registrado`);
        else console.log(`   ✗ ${ev}: ${msg}`);
      }
    }
    console.log('\nEstado final:'); await ver();
    console.log('\n✅ Listo. Mové un deal en Bitrix y revisá los logs de Render: debería aparecer "[bitrixEvento]".');
    process.exit(0);
  }

  console.log('Opciones: --ver | --registrar | --quitar');
  process.exit(0);
})().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
