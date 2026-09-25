import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorDeValor, normalizarValor } from './coloresBackoffice.js';

test('normaliza tildes, espacios, punto final y mayúsculas', () => {
  assert.equal(normalizarValor('  Fin de Gestión '), 'FIN DE GESTION');
  assert.equal(normalizarValor('Efectivo.'), 'EFECTIVO');
});

test('estados usan su color fijo de Jotform', () => {
  assert.deepEqual(colorDeValor('netlife_estatus_real', 'FIN DE GESTIÓN'), { fondo: '#ef5350', texto: '#ffffff' });
  assert.deepEqual(colorDeValor('calidad_venta_analista', 'aprobado'), { fondo: '#6cc070', texto: '#0b3d13' });
});

test('mismo valor = mismo color, sin importar formato', () => {
  assert.deepEqual(colorDeValor('forma_pago', 'EFECTIVO.'), colorDeValor('forma_pago', 'efectivo'));
  assert.ok(colorDeValor('supervisor', 'XAVIER'));
});

test('campos sin color o vacíos devuelven null', () => {
  assert.equal(colorDeValor('nombre_cliente_completo', 'JUAN'), null);
  assert.equal(colorDeValor('forma_pago', ''), null);
  assert.equal(colorDeValor('forma_pago', null), null);
  assert.equal(colorDeValor('forma_pago', '—'), null);
});
