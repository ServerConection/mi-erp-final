/**
 * REGISTRA (UNA SOLA VEZ) el bot interno usado para transferir chats de
 * Canal Abierto al Responsable del Trato/Lead (ver bitrixChatTransfer.controller.js).
 * Este bot no conversa con nadie: su unico proposito es servir de CLIENT_ID
 * para imopenlines.bot.session.transfer.
 *
 * Usa la app local aislada "Chat Transfer Bot" (bitrixChatTransferApp.service.js
 * / tabla bitrix_chat_transfer_oauth_tokens) -- separada por completo de
 * WABOT-BITRIX. Necesita en el .env:
 *   BITRIX_CT_PORTAL_URL, BITRIX_CT_CLIENT_ID, BITRIX_CT_CLIENT_SECRET
 * (los que te dio Bitrix al crear la app local "Chat Transfer Bot"), y que
 * esa app ya este instalada (visitaste su install URL / diste "Instalar" y
 * la tabla bitrix_chat_transfer_oauth_tokens tiene una fila).
 *
 * USO (desde backend/):
 *   node scripts/registrar_bot_chat_transfer.js --registrar   -> lo registra
 *   node scripts/registrar_bot_chat_transfer.js --quitar      -> lo desregistra (deshacer)
 *
 * Requiere ademas en .env: BITRIX_WEBHOOK_TOKEN (viaja en el EVENT_HANDLER).
 * Despues de --registrar, agregar el BOT_ID que imprime como
 * BITRIX_BOT_CLIENT_ID en el .env.
 */
require('dotenv').config();
const bitrixChatTransferApp = require('../src/services/bitrixChatTransferApp.service');

const args    = process.argv.slice(2);
const flag    = (n) => args.includes(`--${n}`);
const BASE    = (process.env.ERP_PUBLIC_URL || 'https://erp-backend-v1-qhk2.onrender.com').replace(/\/+$/, '');
const TOKEN   = process.env.BITRIX_WEBHOOK_TOKEN || '';
const CODE    = 'novo_chat_transfer_bot';
const HANDLER = `${BASE}/bitrix_chat_transfer_events.php?token=${encodeURIComponent(TOKEN)}`;

(async () => {
  if (!TOKEN) { console.error('Falta BITRIX_WEBHOOK_TOKEN en el .env'); process.exit(1); }
  if (!bitrixChatTransferApp.configurado()) {
    console.error('Falta BITRIX_CT_PORTAL_URL / BITRIX_CT_CLIENT_ID / BITRIX_CT_CLIENT_SECRET en el .env');
    process.exit(1);
  }

  if (flag('quitar')) {
    const botId = process.env.BITRIX_BOT_CLIENT_ID;
    if (!botId) { console.error('Falta BITRIX_BOT_CLIENT_ID en el .env'); process.exit(1); }
    const r = await bitrixChatTransferApp.llamar('imbot.unregister', { BOT_ID: botId });
    console.log('Respuesta:', JSON.stringify(r, null, 2));
    process.exit(0);
  }

  if (flag('registrar')) {
    console.log(`Registrando bot con EVENT_HANDLER = ${BASE}/bitrix_chat_transfer_events.php?token=***`);
    const r = await bitrixChatTransferApp.llamar('imbot.register', {
      CODE,
      TYPE: 'H',
      OPENLINE: 'Y',
      EVENT_HANDLER: HANDLER,
      PROPERTIES: {
        NAME: 'Chat Transfer Bot',
        LAST_NAME: '(interno)',
        COLOR: 'AZURE',
      },
    });
    console.log('Respuesta:', JSON.stringify(r, null, 2));
    if (r) {
      console.log(`\nOK. BOT_ID = ${r}`);
      console.log('BITRIX_BOT_CLIENT_ID=' + r);
    }
    process.exit(0);
  }

  console.log('Opciones: --registrar | --quitar');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
