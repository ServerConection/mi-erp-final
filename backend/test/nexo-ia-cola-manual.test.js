const test = require('node:test');
const assert = require('node:assert/strict');
const { crearRepositorio } = require('../src/nexoIa/nexoIa.repository');

test('cancela solo trabajos automaticos pendientes y conserva los manuales', async () => {
  let consulta = '';
  const repo = crearRepositorio({
    query: async (sql) => {
      consulta = sql;
      return { rowCount: 3, rows: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    },
  });

  const cancelados = await repo.cancelarPendientesAutomaticos();

  assert.equal(cancelados, 3);
  assert.match(consulta, /estado='PENDIENTE'/);
  assert.match(consulta, /mensaje_disparador_id NOT LIKE 'manual:%'/);
  assert.match(consulta, /estado='CANCELADA'/);
});

test('libera trabajos generando que superaron el tiempo limite', async () => {
  let parametros;
  let consulta = '';
  const repo = crearRepositorio({
    query: async (sql, params) => {
      consulta = sql;
      parametros = params;
      return { rowCount: 2, rows: [{ id: 8 }, { id: 9 }] };
    },
  });

  const cancelados = await repo.cancelarAtascados(10);

  assert.equal(cancelados, 2);
  assert.deepEqual(parametros, [10]);
  assert.match(consulta, /estado='GENERANDO'/);
  assert.match(consulta, /WORKER_INTERRUPTED/);
});
