const test = require('node:test');
const assert = require('node:assert/strict');

const { esEtapaGestionable, esGestionableExpr } = require('../src/shared/etapas');

test('clasifica variantes conceptuales de etapas no gestionables', () => {
  const noGestionables = [
    'duplicado',
    'DUPLLICADO',
    ' atc/soporte ',
    'Zonas Peligrosas',
    'fuera de cobertura',
    'INNEGOCIABLE',
    'Remarketing',
    'Regularización',
    'REGULARIZADO',
  ];

  for (const etapa of noGestionables) {
    assert.equal(esEtapaGestionable(etapa), false, etapa);
  }
});

test('mantiene como gestionables las etapas amplias de operación', () => {
  const gestionables = [
    'CONTACTO NUEVO',
    'GESTION DIARIA/PENDIENTE CIERRE',
    'OPORTUNIDADES',
    'VENTA SUBIDA',
    'DESCARTE',
    'POSTVENTA NOVONET',
  ];

  for (const etapa of gestionables) {
    assert.equal(esEtapaGestionable(etapa), true, etapa);
  }
});

test('genera SQL normalizado con las mismas familias no gestionables', () => {
  const sql = esGestionableExpr('etapa');
  assert.match(sql, /REGEXP_REPLACE/);
  assert.match(sql, /\\s\+/);
  assert.match(sql, /REGULARIZA/);
  assert.match(sql, /ZONAS\? PELIGROSAS\?/);
});