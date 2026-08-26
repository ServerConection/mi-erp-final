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

  assert.equal(resultado.agencias, 2);
  assert.deepEqual(resultado.resultados, [
    { agency: 'arts', ok: true, guardados: 1, ultimaFecha: '2026-08-25', ultimoMonto: 75.03 },
    { agency: 'vidika', ok: false, guardados: 0, error: 'API temporalmente no disponible' },
  ]);
  assert.equal(inserts.length, 1);
});