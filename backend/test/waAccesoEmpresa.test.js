const test = require('node:test');
const assert = require('node:assert/strict');
const { esMandoWabot, empresaVisibleWabot } = require('../src/shared/waAccesoEmpresa');

test('ATC tiene alcance de mando limitado a NOVONET', () => {
  assert.equal(esMandoWabot({ perfil: 'ATC' }), true);
  assert.equal(empresaVisibleWabot({ perfil: 'ATC', empresa: 'VELSA' }), 'NOVONET');
  assert.equal(empresaVisibleWabot({ perfil: 'atc', empresa: '' }), 'NOVONET');
});

test('los demás perfiles de mando conservan su empresa', () => {
  for (const perfil of ['SUPERVISOR', 'GERENCIA', 'ANALISTA']) {
    assert.equal(esMandoWabot({ perfil }), true);
    assert.equal(empresaVisibleWabot({ perfil, empresa: 'VELSA' }), 'VELSA');
  }
  assert.equal(esMandoWabot({ perfil: 'ASESOR' }), false);
});
