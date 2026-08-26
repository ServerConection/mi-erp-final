const test = require('node:test');
const assert = require('node:assert/strict');

const { analytics } = require('../src/controllers/contactabilidad.controller');

test.after(async () => require('../src/config/db').end());


function respuesta() {
  const sent = {};
  return {
    sent,
    res: {
      status(code) { sent.status = code; return this; },
      json(body) { sent.body = body; return this; },
    },
  };
}

test('analytics responde el contrato del servicio', async () => {
  const { sent, res } = respuesta();
  await analytics({ query: { empresa: 'NOVONET' } }, res, {
    obtener: async () => ({ resumen: { leads: 7 } }),
  });
  assert.equal(sent.body.success, true);
  assert.equal(sent.body.data.resumen.leads, 7);
});

test('analytics devuelve 400 para fecha invalida', async () => {
  const { sent, res } = respuesta();
  await analytics({ query: { desde: '25/08/2026' } }, res, {
    obtener: async () => { throw new TypeError('desde debe usar YYYY-MM-DD'); },
  });
  assert.equal(sent.status, 400);
  assert.match(sent.body.error, /YYYY-MM-DD/);
});

test('analytics no expone detalles internos en error de base', async () => {
  const { sent, res } = respuesta();
  await analytics({ query: {} }, res, {
    obtener: async () => { throw new Error('password secreto en SQL'); },
  });
  assert.equal(sent.status, 500);
  assert.equal(sent.body.error, 'Error calculando inteligencia de Contactabilidad');
});
