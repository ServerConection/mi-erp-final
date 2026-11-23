const test = require('node:test');
const assert = require('node:assert/strict');
const { empresaVisible, empresasVisibles, puedeCerrarJornada } = require('../src/shared/bitrixSesionesAcceso');

test('segmenta jefaturas por su empresa', () => {
  for (const perfil of ['SUPERVISOR', 'SUPERVISOR COMERCIAL', 'GERENCIA', 'GERENTE', 'ADMINISTRADOR']) {
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

test('jasimbana puede consultar sesiones y cerrar jornadas solo en su empresa valida', () => {
  assert.equal(empresaVisible({ usuario: ' JASIMBANA ', perfil: 'ANALISTA', empresa: 'NOVONET' }), 'NOVONET');
  assert.equal(puedeCerrarJornada({ username: 'jasimbana', perfil: 'ANALISTA', empresa: 'VELSA' }), true);
  assert.equal(empresaVisible({ usuario: 'jasimbana', perfil: 'ANALISTA', empresa: 'SEMILLERO' }), null);
  assert.equal(puedeCerrarJornada({ usuario: 'otro', perfil: 'ANALISTA', empresa: 'NOVONET' }), false);
});

test('jasimbana tiene alcance de sesiones en NOVONET y VELSA', () => {
  assert.deepEqual(empresasVisibles({ usuario: 'jasimbana', perfil: 'ANALISTA', empresa: 'NOVONET' }), ['NOVONET', 'VELSA']);
  assert.deepEqual(empresasVisibles({ usuario: 'otro', perfil: 'SUPERVISOR', empresa: 'NOVONET' }), ['NOVONET']);
});
