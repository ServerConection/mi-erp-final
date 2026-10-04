const test = require('node:test');
const assert = require('node:assert/strict');
const { dentroDeHorario, cupoDeEntregaCola, horaEcuador } = require('../src/shared/repartoGestionables');

// Ecuador = UTC-5 todo el año
const ec = (hhmmss) => new Date(`2026-10-02T${hhmmss}-05:00`);

test('horario laboral 08:00:00 a 22:15:59 (hora Ecuador)', () => {
  assert.equal(horaEcuador(ec('22:15:59')), '22:15:59');
  assert.equal(dentroDeHorario(ec('07:59:59')), false);
  assert.equal(dentroDeHorario(ec('08:00:00')), true);
  assert.equal(dentroDeHorario(ec('22:15:59')), true);
  assert.equal(dentroDeHorario(ec('22:16:00')), false);
  assert.equal(dentroDeHorario(ec('00:30:00')), false);
});

test('cola: nadie disponible no entrega', () => {
  assert.equal(cupoDeEntregaCola({ disponibles: 0 }), 0);
});

test('cola: 1 o 2 disponibles entrega 1 y espera 5 minutos', () => {
  const ahora = ec('08:10:00');
  assert.equal(cupoDeEntregaCola({ disponibles: 1, ultimaEntregaCola: null, ahora }), 1);
  assert.equal(cupoDeEntregaCola({ disponibles: 2, ultimaEntregaCola: ec('08:07:00'), ahora }), 0);
  assert.equal(cupoDeEntregaCola({ disponibles: 2, ultimaEntregaCola: ec('08:05:00'), ahora }), 1);
});

test('cola: 3 o más disponibles entrega normal', () => {
  assert.ok(cupoDeEntregaCola({ disponibles: 3, ultimaEntregaCola: ec('08:09:59'), ahora: ec('08:10:00') }) > 1);
});
