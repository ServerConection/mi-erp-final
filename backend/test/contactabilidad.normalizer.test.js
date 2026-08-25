const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizarMensaje,
  resumirMensajes,
  calcularPendientePor,
} = require('../src/contactabilidad/contactabilidad.normalizer');

const users = [
  { id: 10, name: 'Cliente Prueba', connector: true },
  { id: 20, name: 'Asesor Prueba', connector: false, extranet: false },
];

test('clasifica cliente y asesor usando los usuarios reales de Bitrix', () => {
  const contexto = { empresa: 'NOVONET', idBitrix: '2525654', chatId: '99', etapaId: 'ATC' };
  const cliente = normalizarMensaje({ id: 1, author_id: 10, date: '2026-08-24T10:00:00Z', text: 'Hola' }, users, contexto);
  const asesor = normalizarMensaje({ id: 2, author_id: 20, date: '2026-08-24T10:05:00Z', text: 'Buenos días' }, users, contexto);

  assert.equal(cliente.emisor_tipo, 'CLIENTE');
  assert.equal(asesor.emisor_tipo, 'ASESOR');
  assert.equal(cliente.mensaje_externo_id, '1');
  assert.equal(asesor.emisor_nombre, 'Asesor Prueba');
});

test('excluye mensajes de sistema y resume contadores y fechas', () => {
  const contexto = { empresa: 'NOVONET', idBitrix: '2525654', chatId: '99', etapaId: 'ATC' };
  const mensajes = [
    { id: 0, author_id: 0, date: '2026-08-24T09:00:00Z', text: 'Sistema' },
    { id: 1, author_id: 10, date: '2026-08-24T10:00:00Z', text: 'Hola' },
    { id: 2, author_id: 20, date: '2026-08-24T10:05:00Z', text: 'Buenos días' },
    { id: 3, author_id: 10, date: '2026-08-24T10:10:00Z', text: 'Quiero contratar' },
  ].map((m) => normalizarMensaje(m, users, contexto)).filter(Boolean);

  const resumen = resumirMensajes(mensajes);
  assert.equal(resumen.mensajes_cliente, 2);
  assert.equal(resumen.mensajes_asesor, 1);
  assert.equal(resumen.ultimo_mensaje_cliente_at.toISOString(), '2026-08-24T10:10:00.000Z');
  assert.equal(calcularPendientePor(resumen), 'ASESOR');
});
