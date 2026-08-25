const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizarFechaInversion, resolverCanalInversion, resolverCanalRespaldo, agregarFilasSoloInversion, agregarInversionDiaria } = require('../src/shared/inversionRedes');

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
test('no duplica inversion cuando la fila CRM usa una fecha PostgreSQL', () => {
  const fechaPg = new Date(2026, 7, 24);
  const filas = agregarFilasSoloInversion([
    { fecha: fechaPg, canal_inversion: 'ARTS', inversion_usd: 264.92 },
  ], { '2026-08-24__ARTS': 264.92 });

  assert.equal(filas.length, 1);
});
test('unifica canales historicos con la agencia asignada para no separar la inversion', () => {
  assert.equal(resolverCanalRespaldo('VIDIKA GOOGLE'), 'VIDIKA');
  assert.equal(resolverCanalRespaldo('ARTS GOOGLE'), 'ARTS');
  assert.equal(resolverCanalRespaldo('ARTS FACEBOOK'), 'ARTS');
});
test('Reporte Data prioriza ARTS y VIDIKA vivos y usa la vista solo como respaldo', () => {
  const filas = agregarInversionDiaria(
    [
      { fecha: '2026-08-25', origen: '__WINTRACKER_ARTS__', monto_usd: 75.03 },
      { fecha: '2026-08-25', origen: '__WINTRACKER_VIDIKA__', monto_usd: 40.13 },
    ],
    [
      { fecha: '2026-08-25', canal: 'ARTS GOOGLE', inversion_usd: 70 },
      { fecha: '2026-08-24', canal: 'VIDIKA GOOGLE', inversion_usd: 120 },
    ]
  );
  assert.deepEqual(filas, [
    { dia: 24, inversion_usd: 120 },
    { dia: 25, inversion_usd: 115.16 },
  ]);
});

test('Reporte Data reconoce filtros historicos como agencias ARTS y VIDIKA', () => {
  const filas = agregarInversionDiaria(
    [
      { fecha: '2026-08-25', origen: '__WINTRACKER_ARTS__', monto_usd: 75.03 },
      { fecha: '2026-08-25', origen: '__WINTRACKER_VIDIKA__', monto_usd: 40.13 },
    ],
    [],
    ['VIDIKA GOOGLE']
  );
  assert.deepEqual(filas, [{ dia: 25, inversion_usd: 40.13 }]);
});
