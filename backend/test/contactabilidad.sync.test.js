const test = require('node:test');
const assert = require('node:assert/strict');

const { crearSincronizadorContactabilidad } = require('../src/contactabilidad/contactabilidad.sync');

function poolFalso({ historicoCompleto }) {
  let runId = 0;
  return {
    query: async (sql) => {
      if (sql.includes('SELECT EXISTS')) return { rows: [{ completo: historicoCompleto }] };
      if (sql.includes('INSERT INTO contactabilidad_sync_runs')) return { rows: [{ id: ++runId }] };
      return { rows: [], rowCount: 1 };
    },
  };
}

test('primera sincronizacion recorre el historico configurado', async () => {
  const rangos = [];
  const sync = crearSincronizadorContactabilidad({
    pool: poolFalso({ historicoCompleto: false }),
    crms: [{ empresa: 'NOVONET' }],
    procesarCrm: async (_crm, rango) => { rangos.push(rango); return { leads: 10, mensajes: 20, errores: 0 }; },
    recalcular: async () => {},
    fechaDesde: '2026-07-01',
    ahora: () => new Date('2026-08-25T12:00:00Z'),
    logger: { log() {}, warn() {}, error() {} },
  });

  await sync.ejecutar();
  assert.deepEqual(rangos[0], { desde: '2026-07-01', hasta: '2026-08-25', campoFecha: 'DATE_CREATE', soloNuevos: true });
});

test('despues del historico usa ventana incremental de modificaciones', async () => {
  const rangos = [];
  const sync = crearSincronizadorContactabilidad({
    pool: poolFalso({ historicoCompleto: true }),
    crms: [{ empresa: 'NOVONET' }],
    procesarCrm: async (_crm, rango) => { rangos.push(rango); return { leads: 2, mensajes: 3, errores: 0 }; },
    recalcular: async () => {},
    fechaDesde: '2026-07-01',
    ahora: () => new Date('2026-08-25T12:00:00Z'),
    logger: { log() {}, warn() {}, error() {} },
  });

  await sync.ejecutar();
  assert.deepEqual(rangos[0], { desde: '2026-08-23', hasta: '2026-08-25', campoFecha: 'DATE_MODIFY', soloNuevos: false });
});
