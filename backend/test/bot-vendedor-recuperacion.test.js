const test = require('node:test');
const assert = require('node:assert/strict');

const { ejecutarConReintento } = require('../src/services/botVendedorReintento');

test('ejecutarConReintento devuelve la respuesta de un intento posterior', async () => {
  let intentos = 0;
  let agotados = 0;
  const resultado = await ejecutarConReintento({
    ejecutar: async () => { intentos += 1; if (intentos < 3) throw new Error('temporal'); return 'ok'; },
    esperasMs: [0, 0],
    esperar: async () => {},
    alAgotar: async () => { agotados += 1; },
  });
  assert.equal(resultado, 'ok');
  assert.equal(intentos, 3);
  assert.equal(agotados, 0);
});

test('ejecutarConReintento ejecuta alAgotar una sola vez', async () => {
  let intentos = 0;
  let agotados = 0;
  const resultado = await ejecutarConReintento({
    ejecutar: async () => { intentos += 1; throw new Error('caido'); },
    esperasMs: [0, 0],
    esperar: async () => {},
    alAgotar: async (error) => { agotados += 1; return `escalado:${error.message}`; },
  });
  assert.equal(resultado, 'escalado:caido');
  assert.equal(intentos, 3);
  assert.equal(agotados, 1);
});

test('ejecutarConReintento cancela antes del siguiente intento', async () => {
  let intentos = 0;
  const resultado = await ejecutarConReintento({
    ejecutar: async () => { intentos += 1; throw new Error('temporal'); },
    esperasMs: [0, 0],
    esperar: async () => {},
    cancelado: async () => intentos >= 1,
  });
  assert.equal(resultado, null);
  assert.equal(intentos, 1);
});
