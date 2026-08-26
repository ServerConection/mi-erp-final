const test = require('node:test');
const assert = require('node:assert/strict');

const { crearRequestBitrix } = require('../src/contactabilidad/contactabilidad.http');

test('reintenta respuestas temporales 503 y luego entrega el resultado', async () => {
  let intentos = 0;
  const request = crearRequestBitrix({
    fetchImpl: async () => {
      intentos += 1;
      if (intentos < 3) return { ok: false, status: 503 };
      return { ok: true, json: async () => ({ result: [{ ID: '1' }] }) };
    },
    reintentos: 2,
    espera: async () => {},
  });

  const resultado = await request({ empresa: 'NOVONET', webhook: 'https://bitrix.test/rest' }, 'crm.deal.list');

  assert.equal(intentos, 3);
  assert.equal(resultado.result[0].ID, '1');
});

test('no reintenta un error permanente 401', async () => {
  let intentos = 0;
  const request = crearRequestBitrix({ fetchImpl: async () => { intentos += 1; return { ok: false, status: 401 }; }, reintentos: 3, espera: async () => {} });
  await assert.rejects(() => request({ empresa: 'NOVONET', webhook: 'https://bitrix.test/rest' }, 'user.get'), /401/);
  assert.equal(intentos, 1);
});

test('reintenta limites temporales devueltos por Bitrix en HTTP 200', async () => {
  let intentos = 0;
  const request = crearRequestBitrix({
    fetchImpl: async () => {
      intentos += 1;
      return {
        ok: true,
        json: async () => intentos === 1
          ? { error: 'QUERY_LIMIT_EXCEEDED', error_description: 'Too many requests' }
          : { result: [{ ID: '77' }] },
      };
    },
    reintentos: 2,
    espera: async () => {},
  });

  const resultado = await request(
    { empresa: 'NOVONET', webhook: 'https://bitrix.test/rest' },
    'crm.deal.list'
  );

  assert.equal(intentos, 2);
  assert.equal(resultado.result[0].ID, '77');
});
