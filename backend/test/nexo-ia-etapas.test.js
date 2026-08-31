const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarEtapa, etapaExcluida } = require('../src/nexoIa/nexoIa.etapas');

test('normaliza tildes espacios y mayusculas', () => {
  assert.equal(normalizarEtapa('  Regularización  '), 'REGULARIZACION');
});

test('excluye las cuatro familias cerradas y sus variantes razonables', () => {
  for (const etapa of ['VENTA SUBIDA', 'ventas subidas', 'Duplicado', 'REMARKETING', 'regularización']) {
    assert.equal(etapaExcluida(etapa), true, etapa);
  }
});

test('incluye descarte y etapas comerciales', () => {
  for (const etapa of ['DESCARTE', 'NEGOCIACION', 'ATC', 'CONTACTADO']) {
    assert.equal(etapaExcluida(etapa), false, etapa);
  }
});
