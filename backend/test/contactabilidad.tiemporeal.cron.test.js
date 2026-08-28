const test = require('node:test');
const assert = require('node:assert/strict');

const { crearJobTiempoReal } = require('../src/jobs/contactabilidadTiempoReal.cron');

const SILENCIO = { log() {}, warn() {}, error() {} };

function poolFalso({ lock = true } = {}) {
  const llamadas = [];
  return {
    llamadas,
    query: async (sql, params) => {
      llamadas.push({ sql, params });
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ obtenido: lock }] };
      if (sql.includes('INSERT INTO contactabilidad_sync_runs')) return { rows: [{ id: 1 }] };
      return { rows: [] };
    },
  };
}

const refrescadorFalso = (impl = async () => ({ leads: 2, mensajes_nuevos: 1, errores: 0 })) => ({
  empresas: () => ['NOVONET'],
  refrescarActivos: impl,
});

test('no programa nada si el tiempo real esta apagado', () => {
  let programados = 0;
  const job = crearJobTiempoReal({
    cronImpl: { schedule: () => { programados += 1; } },
    pool: poolFalso(), refrescador: refrescadorFalso(), webhook: null,
    env: { CONTACTABILIDAD_TIEMPO_REAL_ENABLED: 'false' }, logger: SILENCIO,
  });
  assert.equal(job.iniciar(), false);
  assert.equal(programados, 0);
});

test('programa el intervalo pedido y lo acota entre 1 y 30 minutos', () => {
  const expresiones = [];
  const nuevo = (minutos) => crearJobTiempoReal({
    cronImpl: { schedule: (expr) => expresiones.push(expr) },
    pool: poolFalso(), refrescador: refrescadorFalso(), webhook: null,
    env: { CONTACTABILIDAD_TIEMPO_REAL_ENABLED: 'true', CONTACTABILIDAD_TIEMPO_REAL_MINUTOS: minutos },
    logger: SILENCIO,
  }).iniciar();

  nuevo('1'); nuevo('0'); nuevo('999');
  assert.deepEqual(expresiones, ['*/1 * * * *', '*/2 * * * *', '*/30 * * * *']);
});

test('si otra instancia tiene el lock, el ciclo se omite sin tocar Bitrix', async () => {
  let refrescos = 0;
  const job = crearJobTiempoReal({
    pool: poolFalso({ lock: false }),
    refrescador: refrescadorFalso(async () => { refrescos += 1; return { leads: 0, mensajes_nuevos: 0, errores: 0 }; }),
    webhook: null, env: {}, logger: SILENCIO,
  });

  assert.deepEqual(await job.ejecutarCiclo(), { omitido: true, motivo: 'LOCK_OCUPADO' });
  assert.equal(refrescos, 0);
});

test('drena el inbox del webhook antes de recorrer los chats', async () => {
  const orden = [];
  const job = crearJobTiempoReal({
    pool: poolFalso(),
    refrescador: refrescadorFalso(async () => { orden.push('chats'); return { leads: 1, mensajes_nuevos: 0, errores: 0 }; }),
    webhook: { drenarPendientes: async () => { orden.push('inbox'); return { procesados: 3 }; } },
    env: {}, logger: SILENCIO,
  });

  const res = await job.ejecutarCiclo();
  assert.deepEqual(orden, ['inbox', 'chats']);
  assert.deepEqual(res.eventos, { procesados: 3 });
});

test('registra el ciclo con origen CRON_CORTO y lo cierra como COMPLETO', async () => {
  const pool = poolFalso();
  const job = crearJobTiempoReal({ pool, refrescador: refrescadorFalso(), webhook: null, env: {}, logger: SILENCIO });

  await job.ejecutarCiclo();

  const insert = pool.llamadas.find((c) => c.sql.includes('INSERT INTO contactabilidad_sync_runs'));
  assert.match(insert.sql, /'CRON_CORTO'/);
  const update = pool.llamadas.find((c) => c.sql.includes('UPDATE contactabilidad_sync_runs'));
  assert.equal(update.params[1], 'COMPLETO');
});

test('tras un fallo aplica backoff y deja de golpear a Bitrix', async () => {
  let intentos = 0;
  const job = crearJobTiempoReal({
    pool: poolFalso(),
    refrescador: refrescadorFalso(async () => { intentos += 1; throw new Error('Bitrix caido'); }),
    webhook: null, env: {}, logger: SILENCIO,
  });

  await job.ejecutarCiclo();
  assert.equal(intentos, 1);
  assert.equal(job.estado().saltosPendientes, 1);

  assert.equal((await job.ejecutarCiclo()).motivo, 'BACKOFF');
  assert.equal(intentos, 1); // el ciclo saltado no llamo a Bitrix

  await job.ejecutarCiclo();
  assert.equal(intentos, 2);
  assert.equal(job.estado().saltosPendientes, 2); // el backoff crece
});

test('libera el lock aunque el ciclo falle', async () => {
  const pool = poolFalso();
  const job = crearJobTiempoReal({
    pool,
    refrescador: refrescadorFalso(async () => { throw new Error('x'); }),
    webhook: null, env: {}, logger: SILENCIO,
  });

  await job.ejecutarCiclo();
  assert.ok(pool.llamadas.some((c) => c.sql.includes('pg_advisory_unlock')));
});
