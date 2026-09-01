const test = require('node:test');
const assert = require('node:assert/strict');
const { crearRunnerNexo } = require('../src/jobs/nexoIa.runner');

test('el worker revisa la cola cada cinco segundos', () => {
  let intervalo = null;
  const runner = crearRunnerNexo({
    service: { procesarUno: async () => null, encolarAutomaticas: async () => 0, encolarBackfill: async () => null },
    setIntervalFn: (_fn, ms) => { intervalo = ms; return 7; },
    clearIntervalFn: () => {},
    schedule: () => ({ stop() {} }),
    env: { NEXO_IA_ENABLED: 'true' },
  });
  runner.iniciar();
  assert.equal(intervalo, 5000);
});

test('una solicitud manual despierta el worker inmediatamente', async () => {
  let procesados = 0;
  const runner = crearRunnerNexo({
    service: { procesarUno: async () => { procesados++; }, encolarAutomaticas: async () => 0, encolarBackfill: async () => null },
    setIntervalFn: () => 7,
    clearIntervalFn: () => {},
    schedule: () => ({ stop() {} }),
    env: { NEXO_IA_ENABLED: 'true' },
  });
  await runner.despertar();
  assert.equal(procesados, 1);
});

test('el worker no procesa dos trabajos simultaneamente', async () => {
  let liberar;
  let procesados = 0;
  const bloqueo = new Promise((resolve) => { liberar = resolve; });
  const runner = crearRunnerNexo({
    service: { procesarUno: async () => { procesados++; await bloqueo; }, encolarAutomaticas: async () => 0, encolarBackfill: async () => null },
    env: { NEXO_IA_ENABLED: 'true' },
  });
  const primero = runner.despertar();
  const segundo = runner.despertar();
  await Promise.resolve();
  assert.equal(procesados, 1);
  liberar();
  await Promise.all([primero, segundo]);
});
