const test = require('node:test');
const assert = require('node:assert/strict');

const { crearContactabilidadJob } = require('../src/jobs/contactabilidad.cron');

test('no programa ni ejecuta cuando Contactabilidad esta desactivada', () => {
  let programados = 0;
  let ejecuciones = 0;
  const job = crearContactabilidadJob({
    cronImpl: { schedule: () => { programados += 1; } },
    ejecutarSync: async () => { ejecuciones += 1; },
    env: { CONTACTABILIDAD_ENABLED: 'false' },
    logger: { log() {}, warn() {}, error() {} },
  });

  assert.equal(job.iniciar(), false);
  assert.equal(programados, 0);
  assert.equal(ejecuciones, 0);
});

test('ejecuta al iniciar y programa el intervalo configurado', async () => {
  let callback;
  let expresion;
  let ejecuciones = 0;
  const job = crearContactabilidadJob({
    cronImpl: { schedule: (expr, fn) => { expresion = expr; callback = fn; } },
    ejecutarSync: async () => { ejecuciones += 1; },
    env: { CONTACTABILIDAD_ENABLED: 'true', CONTACTABILIDAD_INTERVALO_MINUTOS: '30' },
    logger: { log() {}, warn() {}, error() {} },
  });

  assert.equal(job.iniciar(), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(expresion, '*/30 * * * *');
  assert.equal(ejecuciones, 1);

  callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ejecuciones, 2);
});
