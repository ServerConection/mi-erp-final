const test = require('node:test');
const assert = require('node:assert/strict');
const { puedeAccederGestionables } = require('../src/shared/accesoGestionables');

test('permite supervisión y gerencia solo en su propia empresa', () => {
  for (const perfil of ['SUPERVISOR', 'GERENCIA']) {
    assert.equal(puedeAccederGestionables({ perfil, empresa: 'NOVONET' }, 'NOVONET'), true);
    assert.equal(puedeAccederGestionables({ perfil, empresa: 'VELSA' }, 'VELSA'), true);
    assert.equal(puedeAccederGestionables({ perfil, empresa: 'NOVONET' }, 'VELSA'), false);
    assert.equal(puedeAccederGestionables({ perfil, empresa: 'VELSA' }, 'NOVONET'), false);
  }
});

test('administrador puede acceder a los repartos de NOVONET y VELSA', () => {
  for (const empresa of ['NOVONET', 'VELSA', 'SEMILLERO', '', null]) {
    assert.equal(puedeAccederGestionables({ perfil: 'ADMINISTRADOR', empresa }, 'NOVONET'), true);
    assert.equal(puedeAccederGestionables({ perfil: 'ADMINISTRADOR', empresa }, 'VELSA'), true);
  }
  assert.equal(puedeAccederGestionables({ perfil: 'ADMINISTRADOR', empresa: 'NOVONET' }, 'OTRA'), false);
});

test('normaliza perfiles gerenciales y supervisores históricos', () => {
  for (const perfil of ['GERENTE', 'GERENCIA COMERCIAL', 'GERENTE GENERAL', 'SUPERVISORA', 'SUPERVISOR COMERCIAL']) {
    assert.equal(puedeAccederGestionables({ perfil, empresa: 'NOVONET' }, 'NOVONET'), true, perfil);
    assert.equal(puedeAccederGestionables({ perfil, empresa: 'VELSA' }, 'VELSA'), true, perfil);
  }
  assert.equal(puedeAccederGestionables({ perfil: 'GERENTE', empresa: 'VELSA' }, 'NOVONET'), false);
});

test('normaliza variantes controladas del nombre de empresa', () => {
  assert.equal(puedeAccederGestionables({ perfil: 'GERENCIA', empresa: 'NOVONET S.A.' }, 'NOVONET'), true);
  assert.equal(puedeAccederGestionables({ perfil: 'SUPERVISOR', empresa: 'VELSA COMERCIAL' }, 'VELSA'), true);
});

test('rechaza perfiles inferiores y empresas no admitidas', () => {
  for (const perfil of ['ASESOR', 'USUARIO', 'CONSULTOR', 'ATC', 'ANALISTA', 'COORDINADOR', 'TV', '']) {
    assert.equal(puedeAccederGestionables({ perfil, empresa: 'NOVONET' }, 'NOVONET'), false);
  }
});
