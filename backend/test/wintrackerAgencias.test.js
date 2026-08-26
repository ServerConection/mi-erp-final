const test = require('node:test');
const assert = require('node:assert/strict');

const {
  crearConfiguracionAgencias,
  fechaEcuador,
  syncTodasLasAgencias,
} = require('../src/services/wintracker.service');

test('incluye VIDIKA cuando su API key esta configurada', () => {
  const agencias = crearConfiguracionAgencias({
    WINTRACKER_APIKEY_ARTS: 'arts-key',
    WINTRACKER_APIKEY_VIDIKA: 'vidika-key',
    WINTRACKER_APIKEY_VELSA: 'velsa-key',
  });

  assert.deepEqual(
    agencias.map(({ agency, apikey }) => ({ agency, apikey })),
    [
      { agency: 'arts', apikey: 'arts-key' },
      { agency: 'vidika', apikey: 'vidika-key' },
      { agency: 'velsa', apikey: 'velsa-key' },
    ],
  );
});

test('omite solamente las agencias que no tienen API key', () => {
  const agencias = crearConfiguracionAgencias({
    WINTRACKER_APIKEY_VIDIKA: 'vidika-key',
  });

  assert.deepEqual(
    agencias.map(({ agency }) => agency),
    ['vidika'],
  );
});

test('reporta explicitamente VIDIKA cuando falta su API key y no intenta consultarla', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        ok: true,
        consolidado_diario: [{ fecha: '2026-08-26', inversion: 65.47 }],
      }),
    };
  };
  const db = { query: async () => ({ rows: [] }) };

  const resultado = await syncTodasLasAgencias({
    from: '2026-08-26',
    to: '2026-08-26',
    env: { WINTRACKER_APIKEY_ARTS: 'arts-key' },
    fetchImpl,
    db,
  });

  assert.equal(resultado.agencias, 3);
  assert.equal(resultado.configuradas, 1);
  assert.equal(urls.length, 1);
  assert.deepEqual(resultado.resultados.map(({ agency, ok }) => ({ agency, ok })), [
    { agency: 'arts', ok: true },
    { agency: 'vidika', ok: false },
    { agency: 'velsa', ok: false },
  ]);
  assert.equal(resultado.resultados[1].configuracionFaltante, true);
  assert.match(resultado.resultados[1].error, /WINTRACKER_APIKEY_VIDIKA/);
});

test('calcula el dia actual en Ecuador aunque UTC ya sea el dia siguiente', () => {
  assert.equal(fechaEcuador(new Date('2026-08-26T02:30:00.000Z')), '2026-08-25');
});

test('devuelve el resultado independiente de cada agencia configurada', async () => {
  const inserts = [];
  const fetchImpl = async (url) => {
    const agency = String(url).includes('agency=arts') ? 'arts' : 'vidika';
    if (agency === 'vidika') throw new Error('API temporalmente no disponible');
    return {
      ok: true,
      json: async () => ({
        ok: true,
        consolidado_diario: [{ fecha: '2026-08-25', inversion: 75.03 }],
      }),
    };
  };
  const db = { query: async (_sql, params) => { inserts.push(params); } };

  const resultado = await syncTodasLasAgencias({
    from: '2026-08-25',
    to: '2026-08-25',
    env: {
      WINTRACKER_APIKEY_ARTS: 'arts-key',
      WINTRACKER_APIKEY_VIDIKA: 'vidika-key',
    },
    fetchImpl,
    db,
  });

  assert.equal(resultado.agencias, 3);
  assert.equal(resultado.configuradas, 2);
  assert.deepEqual(resultado.resultados, [
    { agency: 'arts', ok: true, guardados: 1, ultimaFecha: '2026-08-25', ultimoMonto: 75.03 },
    { agency: 'vidika', ok: false, guardados: 0, error: 'API temporalmente no disponible' },
    {
      agency: 'velsa', ok: false, guardados: 0, configuracionFaltante: true,
      error: 'Falta configurar WINTRACKER_APIKEY_VELSA en este servicio.',
    },
  ]);
  assert.equal(inserts.length, 1);
});

test('rescata la inversion de hoy desde kpis cuando VIDIKA omite consolidado_diario', async () => {
  const inserts = [];
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    const esSoloHoy = String(url).includes('from=2026-08-26') && String(url).includes('to=2026-08-26');
    return { ok: true, json: async () => esSoloHoy
      ? { ok: true, kpis: { inversion: 245.67 }, consolidado_diario: [] }
      : { ok: true, kpis: { inversion: 559.67 }, consolidado_diario: [{ fecha: '2026-08-25', inversion: 314 }] } };
  };
  const db = { query: async (_sql, params) => { inserts.push(params); } };

  const resultado = await syncTodasLasAgencias({
    from: '2026-08-25', to: '2026-08-26',
    env: { WINTRACKER_APIKEY_VIDIKA: 'vidika-key' }, fetchImpl, db,
  });

  assert.equal(urls.length, 2);
  assert.deepEqual(inserts.map((x) => [x[0], x[2]]), [['2026-08-25', 314], ['2026-08-26', 245.67]]);
  const vidika = resultado.resultados.find((item) => item.agency === 'vidika');
  assert.equal(vidika.ultimaFecha, '2026-08-26');
  assert.equal(vidika.ultimoMonto, 245.67);
});

test('consulta las agencias en paralelo para que una API lenta no bloquee las demas', async () => {
  let iniciadas = 0;
  let liberar;
  const espera = new Promise((resolve) => { liberar = resolve; });
  const fetchImpl = async () => { iniciadas++; await espera; return { ok: true, json: async () => ({ ok: true, consolidado_diario: [{ fecha: '2026-08-26', inversion: 1 }] }) }; };
  const db = { query: async () => ({ rows: [] }) };

  const promesa = syncTodasLasAgencias({
    from: '2026-08-26', to: '2026-08-26',
    env: { WINTRACKER_APIKEY_ARTS: 'a', WINTRACKER_APIKEY_VIDIKA: 'v', WINTRACKER_APIKEY_VELSA: 'x' },
    fetchImpl, db,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(iniciadas, 3);
  liberar();
  await promesa;
});
