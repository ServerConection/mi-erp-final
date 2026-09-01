const test = require('node:test');
const assert = require('node:assert/strict');
const { construirAlcanceSalud } = require('../src/nexoIa/nexoIa.salud');

test('sin lead seleccionado conserva el resumen global sin mostrar un error ajeno', () => {
  const alcance = construirAlcanceSalud('NOVONET', '');
  assert.deepEqual(alcance.parametros, ['NOVONET']);
  assert.equal(alcance.filtroLead, '');
  assert.equal(alcance.mostrarError, false);
});

test('con lead seleccionado limita fallas y ultimo error a ese lead', () => {
  const alcance = construirAlcanceSalud('NOVONET', '573389');
  assert.deepEqual(alcance.parametros, ['NOVONET', '573389']);
  assert.equal(alcance.filtroLead, ' AND id_bitrix=$2');
  assert.equal(alcance.mostrarError, true);
});
