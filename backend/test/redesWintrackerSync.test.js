const test = require('node:test');
const assert = require('node:assert/strict');

const { crearForceSyncHandler } = require('../src/controllers/redesWintracker.controller');

function respuesta() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('responde éxito parcial conservando el resultado de cada agencia', async () => {
  const handler = crearForceSyncHandler({ sync: async () => ({
    from: '2026-08-01', to: '2026-08-25', agencias: 2,
    resultados: [
      { agency: 'arts', ok: true, guardados: 25, ultimaFecha: '2026-08-25', ultimoMonto: 75.03 },
      { agency: 'vidika', ok: false, guardados: 0, error: 'API no disponible' },
    ],
  }) });
  const res = respuesta();
  await handler({ body: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.partial, true);
  assert.equal(res.body.resultados.length, 2);
});

test('responde 502 cuando ninguna agencia pudo sincronizarse', async () => {
  const handler = crearForceSyncHandler({ sync: async () => ({
    from: '2026-08-25', to: '2026-08-25', agencias: 1,
    resultados: [{ agency: 'vidika', ok: false, guardados: 0, error: 'Sin API key válida' }],
  }) });
  const res = respuesta();
  await handler({ body: {} }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.success, false);
});

test('responde 409 mientras otra sincronización está en curso', async () => {
  let liberar;
  const espera = new Promise((resolve) => { liberar = resolve; });
  const handler = crearForceSyncHandler({ sync: async () => { await espera; return { from:'2026-08-25', to:'2026-08-25', agencias:1, resultados:[{agency:'arts',ok:true,guardados:1}] }; } });
  const primera = respuesta();
  const pendiente = handler({ body: {} }, primera);
  await Promise.resolve();
  const segunda = respuesta();
  await handler({ body: {} }, segunda);
  assert.equal(segunda.statusCode, 409);
  liberar();
  await pendiente;
});
test('sin fechas fuerza desde el primer dia del mes hasta hoy en Ecuador', async () => {
  let opciones;
  const handler = crearForceSyncHandler({
    now: () => new Date('2026-08-26T02:30:00.000Z'),
    sync: async (args) => {
      opciones = args;
      return { from: args.from, to: args.to, agencias: 1, resultados: [{ agency: 'arts', ok: true, guardados: 1 }] };
    },
  });
  const res = respuesta();
  await handler({ body: {} }, res);
  assert.deepEqual(opciones, { from: '2026-08-01', to: '2026-08-25' });
});