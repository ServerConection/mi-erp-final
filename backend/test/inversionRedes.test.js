const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizarFechaInversion, resolverCanalInversion, agregarFilasSoloInversion } = require('../src/shared/inversionRedes');

test('asigna la inversion diaria de WinTracker Arts una sola vez al canal Arts', () => {
  assert.equal(resolverCanalInversion('__WINTRACKER_ARTS__'), 'ARTS');
});

test('conserva un origen manual que no sea sintetico', () => {
  assert.equal(resolverCanalInversion('  ARTS GOOGLE  '), 'ARTS GOOGLE');
});
test('conserva inversion aunque ese dia no exista una fila CRM del canal', () => {
  const filas = agregarFilasSoloInversion([], { '2026-08-24__ARTS': 248.19 });
  assert.deepEqual(filas, [{
    fecha: '2026-08-24', dia_semana: '', canal_inversion: 'ARTS', canal_publicidad: 'ARTS',
    n_leads: 0, negociables: 0, atc_soporte: 0, fuera_cobertura: 0, innegociable: 0,
    venta_subida_bitrix: 0, seguimiento_negociacion: 0, ingreso_jot: 0,
    activo_backlog: 0, activos_mes: 0, inversion_usd: 248.19,
  }]);
});
test('normaliza fechas de PostgreSQL sin cambiar el dia de Ecuador', () => {
  assert.equal(normalizarFechaInversion(new Date(2026, 7, 24)), '2026-08-24');
});