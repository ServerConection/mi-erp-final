const test = require('node:test');
const assert = require('node:assert/strict');
const { crearClienteBitrix } = require('../src/contactabilidad/contactabilidad.bitrix');

test('resuelve el ultimo chat del deal y devuelve mensajes y usuarios', async () => {
  const bitrix = crearClienteBitrix({ request: async (_crm, method) => {
    if (method === 'imopenlines.crm.chat.getLastId') return { result: 99 };
    return { result: { messages: [{ id: 1 }], users: [{ id: 2 }] } };
  } });
  const chat = await bitrix.resolverChatLead({ empresa: 'NOVONET' }, { ID: '77' });
  assert.deepEqual(chat, { chatId: '99', messages: [{ id: 1 }], users: [{ id: 2 }] });
});
