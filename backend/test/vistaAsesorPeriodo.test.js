const test = require('node:test');
const assert = require('node:assert/strict');

const {
  enPeriodoSeleccionadoExpr,
  backlogEnPeriodoSeleccionadoExpr,
  esPorRegularizarVelsa,
  esPorRegularizarVelsaExpr,
  asesorResueltoNormalizadoExpr,
} = require('../src/shared/vistaAsesorPeriodo');

test('ventas activas y regularizaciones usan el rango elegido por el usuario', () => {
  assert.equal(
    enPeriodoSeleccionadoExpr('fecha_actividad'),
    '(fecha_actividad BETWEEN $1::date AND $2::date)'
  );
});

test('Vista Asesor normaliza las variantes de Jomaira igual que Indicadores D-1', () => {
  const sql = asesorResueltoNormalizadoExpr('asesor_resuelto');
  assert.match(sql, /JOMAIRA CRISTINA LEITON RIZZO/);
  assert.match(sql, /JOMAIRA CRISTIANA LEITON RIZZO/);
  assert.match(sql, /UPPER\(TRIM\(asesor_resuelto\)\)/);
});

test('VELSA reconoce POR REGULARIZAR guardado como arreglo serializado de Backoffice', () => {
  assert.equal(esPorRegularizarVelsa('["POR REGULARIZAR"]'), true);
  assert.equal(esPorRegularizarVelsa('["POR REGULARIZAR", "{ox2b11nexb}"]'), true);
  assert.equal(esPorRegularizarVelsa('["INGRESO REGULARIZADO"]'), false);
  assert.match(esPorRegularizarVelsaExpr('estado_regularizacion'), /POR.*REGULARIZAR/);
});

test('backlog usa activacion dentro del rango y registro anterior al inicio', () => {
  assert.equal(
    backlogEnPeriodoSeleccionadoExpr('fecha_activacion', 'fecha_registro'),
    '((fecha_activacion BETWEEN $1::date AND $2::date) AND fecha_registro < $1::date)'
  );
});
