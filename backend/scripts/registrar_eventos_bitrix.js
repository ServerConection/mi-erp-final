/**
 * Registra los eventos globales de negocios que mantienen las etapas del ERP
 * alineadas con Bitrix. Ejecutar después de desplegar el backend.
 */
require('dotenv').config();
const { bitrixCallNovonet } = require('../src/services/bitrix.service');

const base = (process.env.ERP_PUBLIC_URL || 'https://erp-backend-v1-qhk2.onrender.com').replace(/\/+$/, '');
const token = process.env.BITRIX_WEBHOOK_TOKEN;
if (!token) throw new Error('Falta BITRIX_WEBHOOK_TOKEN');

const handler = `${base}/bitrix_evento.php?token=${encodeURIComponent(token)}`;
const eventos = ['ONCRMDEALADD', 'ONCRMDEALUPDATE'];

async function main() {
  for (const event of eventos) {
    // Evita handlers duplicados si el script se vuelve a ejecutar.
    try { await bitrixCallNovonet('event.unbind', { event, handler }); } catch (_) {}
    const respuesta = await bitrixCallNovonet('event.bind', { event, handler });
    if (respuesta?.result !== true && respuesta?.result !== 1) {
      throw new Error(`Bitrix no confirmó event.bind para ${event}`);
    }
    console.log(`${event}: registrado`);
  }
}

main().catch((error) => {
  console.error('No se pudieron registrar los eventos:', error.message);
  process.exit(1);
});
