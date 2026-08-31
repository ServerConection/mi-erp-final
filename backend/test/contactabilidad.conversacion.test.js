const test = require('node:test');
const assert = require('node:assert/strict');

const {
  crearVisorConversacion, armarConversacion, limpiarTexto,
} = require('../src/contactabilidad/contactabilidad.conversacion');

const CRM = { empresa: 'NOVONET', webhook: 'https://x/rest/1/abc', categoryId: '19' };
const USERS = [{ id: '5', name: 'Maria Perez', connector: true }, { id: '9', name: 'Diego Asesor' }];
const CHAT = {
  chatId: '900',
  users: USERS,
  messages: [
    { id: '3', author_id: '9', text: 'Claro, [B]con gusto[/B]', date: '2026-08-28T11:45:00Z' },
    { id: '1', author_id: '5', text: 'Hola, quiero informacion', date: '2026-08-28T10:00:00Z' },
    { id: '2', author_id: '5', text: 'Sigo ahi?', date: '2026-08-28T10:30:00Z' },
  ],
};

test('limpia el BB-code de Bitrix', () => {
  assert.equal(limpiarTexto('[B]Hola[/B] mundo'), 'Hola mundo');
  assert.equal(limpiarTexto('mira [URL=http://a.com]aqui[/URL]'), 'mira aqui (http://a.com)');
  assert.equal(limpiarTexto('[DISK=123]'), '📎 archivo adjunto');
  assert.equal(limpiarTexto(null), '');
});

test('ordena cronologicamente y distingue cliente de asesor', () => {
  const conv = armarConversacion(CHAT, { empresa: 'NOVONET', idBitrix: '77' });
  assert.deepEqual(conv.mensajes.map((m) => m.id), ['1', '2', '3']);
  assert.deepEqual(conv.mensajes.map((m) => m.emisor_tipo), ['CLIENTE', 'CLIENTE', 'ASESOR']);
  assert.equal(conv.mensajes[2].texto, 'Claro, con gusto');
  assert.equal(conv.mensajes_cliente, 2);
  assert.equal(conv.mensajes_asesor, 1);
});

test('mide la respuesta desde el PRIMER mensaje del cliente, no el ultimo', () => {
  const conv = armarConversacion(CHAT, { empresa: 'NOVONET', idBitrix: '77' });
  // cliente 10:00 -> asesor 11:45 = 105 min, aunque el cliente insistio 10:30
  assert.equal(conv.mensajes[2].respuesta_seg, 105 * 60);
  assert.equal(conv.esperando_desde, null);
});

test('si el ultimo en hablar fue el cliente, queda marcado que espera', () => {
  const conv = armarConversacion(
    { chatId: '9', users: USERS, messages: [{ id: '1', author_id: '5', text: 'hola', date: '2026-08-28T10:00:00Z' }] },
    { empresa: 'NOVONET', idBitrix: '77' });
  assert.equal(conv.esperando_desde, '2026-08-28T10:00:00.000Z');
});

test('descarta mensajes de sistema vacios y conserva los que tienen texto', () => {
  const conv = armarConversacion(
    {
      chatId: '9', users: USERS,
      messages: [
        { id: '1', author_id: '0', text: '', date: '2026-08-28T10:00:00Z' },
        { id: '2', author_id: '0', text: 'Sesion cerrada', date: '2026-08-28T10:01:00Z' },
      ],
    }, { empresa: 'NOVONET', idBitrix: '77' });
  assert.equal(conv.total, 1);
  assert.equal(conv.mensajes[0].emisor_tipo, 'SISTEMA');
});

test('la cache evita golpear Bitrix al reabrir el modal', async () => {
  let llamadas = 0;
  let reloj = 1000;
  const visor = crearVisorConversacion({
    crms: [CRM],
    bitrix: { resolverChatLead: async () => { llamadas += 1; return CHAT; }, obtenerChat: async () => ({}) },
    ttlMs: 15000,
    ahora: () => reloj,
  });

  assert.equal((await visor.obtener('NOVONET', '77')).desde_cache, false);
  assert.equal((await visor.obtener('novonet', '77')).desde_cache, true);
  assert.equal(llamadas, 1);

  reloj += 20000; // vencio la cache
  assert.equal((await visor.obtener('NOVONET', '77')).desde_cache, false);
  assert.equal(llamadas, 2);

  await visor.obtener('NOVONET', '77', { forzar: true }); // el usuario pide recargar
  assert.equal(llamadas, 3);
});

test('un lead sin chat responde vacio en vez de fallar', async () => {
  const visor = crearVisorConversacion({
    crms: [CRM],
    bitrix: { resolverChatLead: async () => null, obtenerChat: async () => ({}) },
  });
  const conv = await visor.obtener('NOVONET', '77');
  assert.equal(conv.sin_chat, true);
  assert.deepEqual(conv.mensajes, []);
});

test('rechaza empresas fuera del modulo', async () => {
  const visor = crearVisorConversacion({ crms: [CRM], bitrix: { resolverChatLead: async () => CHAT } });
  await assert.rejects(() => visor.obtener('OTRA', '77'), /no habilitada/);
});
