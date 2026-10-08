const test = require('node:test');
const assert = require('node:assert/strict');
const { empresaVisible, puedeCerrarJornada } = require('../src/shared/bitrixSesionesAcceso');

test('segmenta jefaturas por su empresa', () => {
  for (const perfil of ['SUPERVISOR', 'GERENCIA', 'ADMINISTRADOR']) {
    assert.equal(empresaVisible({ perfil, empresa: 'NOVONET' }), 'NOVONET');
    assert.equal(empresaVisible({ perfil, empresa: 'VELSA' }), 'VELSA');
    assert.equal(puedeCerrarJornada({ perfil, empresa: 'NOVONET' }), true);
  }
});

test('no abre sesiones a perfiles inferiores ni a Semillero sin segmentación propia', () => {
  assert.equal(empresaVisible({ perfil: 'ASESOR', empresa: 'NOVONET' }), null);
  assert.equal(empresaVisible({ perfil: 'ADMINISTRADOR', empresa: 'SEMILLERO' }), null);
  assert.equal(puedeCerrarJornada({ perfil: 'SUPERVISOR', empresa: 'SEMILLERO' }), false);
});
