const test = require('node:test');
const assert = require('node:assert/strict');

const etapas = require('../src/shared/etapas');

test('descarte de tarjetas usa IDs únicos y la misma base CRM de gestionables', () => {
  const sql = etapas.descarteIndicadoresExpr?.({
    idCol: 'b_id',
    etapaCol: 'etapa',
    fechaCol: '_bc_date',
    origenCol: 'origen',
  });

  assert.equal(typeof sql, 'string');
  assert.match(sql, /COUNT\(DISTINCT b_id\)/);
  assert.match(sql, /UPPER\(TRIM\(etapa\)\) = 'DESCARTE'/);
  assert.doesNotMatch(sql, /_jf_parsed_date/);
  assert.match(sql, /_bc_date BETWEEN \$1::date AND \$2::date/);
  assert.match(sql, /NULLIF\(COUNT\(DISTINCT b_id\)/);
});
