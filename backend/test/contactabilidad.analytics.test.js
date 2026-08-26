const test = require('node:test');
const assert = require('node:assert/strict');

const { construirFiltros } = require('../src/contactabilidad/contactabilidad.analytics');

test('construye filtros parametrizados y fechas Ecuador', () => {
  const result = construirFiltros({
    desde: '2026-08-01', hasta: '2026-08-25', empresa: 'novonet',
    origen: 'WEB', asesor_id: '20', etapa: 'ATC',
  });
  assert.deepEqual(result.params, ['NOVONET', 'WEB', '20', 'ATC', '2026-08-01', '2026-08-25']);
  assert.match(result.whereSql, /l\.empresa = \$1/);
  assert.match(result.whereSql, /America\/Guayaquil/);
  assert.doesNotMatch(result.whereSql, /novonet|WEB|ATC/);
});

test('rechaza fechas invalidas', () => {
  assert.throws(() => construirFiltros({ desde: '25/08/2026' }), /YYYY-MM-DD/);
});
