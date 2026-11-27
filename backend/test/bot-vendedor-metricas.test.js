const test = require('node:test');
const assert = require('node:assert/strict');

const { aplicarMetricas } = require('../src/services/botVendedorEstado.service');

test('aplicarMetricas agrega valores seguros sin quitar datos de la conversacion', () => {
  const [fila] = aplicarMetricas([{ id: 'conv-1', wa_number: '593999999999', paso_actual: null, avance: null, reintentos: null, mensajes_agrupados: null }]);
  assert.deepEqual(fila, {
    id: 'conv-1', wa_number: '593999999999', paso_actual: 'motivo', avance: 0,
    reintentos: 0, mensajes_agrupados: 0, estado_actualizado_en: null,
  });
});

test('aplicarMetricas limita avance y contadores a valores validos', () => {
  const [fila] = aplicarMetricas([{ id: 'conv-2', paso_actual: 'confirmacion', avance: 140, reintentos: -2, mensajes_agrupados: 3, estado_actualizado_en: '2026-11-27' }]);
  assert.equal(fila.avance, 100);
  assert.equal(fila.reintentos, 0);
  assert.equal(fila.mensajes_agrupados, 3);
  assert.equal(fila.estado_actualizado_en, '2026-11-27');
});
