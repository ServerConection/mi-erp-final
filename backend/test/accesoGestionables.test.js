const test = require('node:test');
const assert = require('node:assert/strict');
const { puedeAccederGestionables } = require('../src/shared/accesoGestionables');

test('permite supervisor o superior solo en su propia empresa', () => {
  for (const perfil of ['SUPERVISOR', 'GERENCIA', 'ADMINISTRADOR']) {
    assert.equal(puedeAccederGestionables({ perfil, empresa: 'NOVONET' }, 'NOVONET'), true);
    assert.equal(puedeAccederGestionables({ perfil, empresa: 'VELSA' }, 'VELSA'), true);
    assert.equal(puedeAccederGestionables({ perfil, empresa: 'NOVONET' }, 'VELSA'), false);
    assert.equal(puedeAccederGestionables({ perfil, empresa: 'VELSA' }, 'NOVONET'), false);
  }
});

test('rechaza perfiles inferiores y empresas no admitidas', () => {
  for (const perfil of ['ASESOR', 'USUARIO', 'CONSULTOR', 'ATC', 'ANALISTA', 'COORDINADOR', 'TV', '']) {
    assert.equal(puedeAccederGestionables({ perfil, empresa: 'NOVONET' }, 'NOVONET'), false);
  }
  assert.equal(puedeAccederGestionables({ perfil: 'ADMINISTRADOR', empresa: 'SEMILLERO' }, 'NOVONET'), false);
});
