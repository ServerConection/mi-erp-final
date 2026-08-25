const test = require('node:test');
const assert = require('node:assert/strict');

const { crearConfiguracionAgencias } = require('../src/services/wintracker.service');

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
