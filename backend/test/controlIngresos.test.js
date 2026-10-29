const test = require('node:test');
const assert = require('node:assert/strict');

const { vincularUsuarioBitrix } = require('../src/routes/controlAsistencia.routes')._test;

test('vincula un nombre exacto ignorando mayúsculas y tildes', () => {
  const r = vincularUsuarioBitrix('Ángela María Pérez', [
    { id: '10', nombre: 'ANGELA MARIA PEREZ' },
  ]);
  assert.equal(r.estado, 'EXACTO');
  assert.equal(r.usuario.id, '10');
});

test('acepta un nombre compatible solo cuando hay un candidato único', () => {
  const r = vincularUsuarioBitrix('Alexis Nagua', [
    { id: '20', nombre: 'Alexis Geovanny Nagua Torres' },
    { id: '30', nombre: 'Otra Persona' },
  ]);
  assert.equal(r.estado, 'NOMBRE_UNICO');
  assert.equal(r.usuario.id, '20');
});

test('tolera nombres duplicados del ERP sin perder el cruce único', () => {
  const r = vincularUsuarioBitrix('ALISSON CEPEDA ALISSON CEPEDA', [
    { id: '21', nombre: 'ALISSON ABIGAIL CEPEDA BARROSO' },
    { id: '22', nombre: 'OTRA PERSONA' },
  ]);
  assert.equal(r.estado, 'NOMBRE_UNICO');
  assert.equal(r.usuario.id, '21');
});

test('no atribuye conexión cuando el nombre es ambiguo', () => {
  const r = vincularUsuarioBitrix('Alexandra Pacheco', [
    { id: '40', nombre: 'Alexandra Patricia Pacheco Collaguazo' },
    { id: '50', nombre: 'Alexandra Maria Pacheco Vera' },
  ]);
  assert.equal(r.estado, 'AMBIGUO');
  assert.equal(r.usuario, null);
});

test('no inventa una coincidencia inexistente', () => {
  const r = vincularUsuarioBitrix('Persona Sin Bitrix', [
    { id: '60', nombre: 'Nombre Diferente' },
  ]);
  assert.equal(r.estado, 'NO_ENCONTRADO');
  assert.equal(r.usuario, null);
});
