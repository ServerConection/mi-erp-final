const test = require('node:test');
const assert = require('node:assert/strict');
const {
  esAdminGerencia,
  esSupervisor,
  puedeAccederHorarios,
  empresaHorarios,
} = require('../src/shared/horariosAcceso');

test('supervisores acceden a horarios pero no tienen permisos de edición', () => {
  assert.equal(puedeAccederHorarios('SUPERVISOR'), true);
  assert.equal(puedeAccederHorarios('SUPERVISOR COMERCIAL'), true);
  assert.equal(esSupervisor('SUPERVISOR VELSA'), true);
  assert.equal(esAdminGerencia('SUPERVISOR'), false);
});

test('el supervisor queda limitado a la empresa de su sesión', () => {
  const base = { body: {}, user: { perfil: 'SUPERVISOR', empresa: 'NOVONET' } };
  assert.equal(empresaHorarios({ ...base, query: { empresa: 'NOVONET' } }), 'NOVONET');
  assert.equal(empresaHorarios({ ...base, query: { empresa: 'VELSA' } }), null);
  assert.equal(empresaHorarios({ ...base, query: {} }), 'NOVONET');
});

test('administración puede consultar las dos empresas habilitadas', () => {
  const base = { body: {}, user: { perfil: 'ADMINISTRADOR', empresa: 'NOVONET' } };
  assert.equal(empresaHorarios({ ...base, query: { empresa: 'NOVONET' } }), 'NOVONET');
  assert.equal(empresaHorarios({ ...base, query: { empresa: 'VELSA' } }), 'VELSA');
});
