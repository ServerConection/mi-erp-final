const test = require('node:test');
const assert = require('node:assert/strict');
const { ORIGENES_NOVONET, filtroOrigenBitrix, dealNovonet } = require('../src/shared/origenIndicadores');

test('los cinco orígenes fijos son los de la selección confirmada', () => {
  assert.deepEqual(ORIGENES_NOVONET, [
    'BASE API 593963463480', 'API 484', 'WAZZUP: WhatsApp - API 963999000',
    'Formulario Landing 4', 'Fomulario Landing 3',
  ]);
});

test('origen por deal y empresa, sin depender del origen almacenado en JOT', () => {
  for (const empresa of ['novonet']) {
    const values = ['2026-09-01', '2026-09-14'];
    const sql = filtroOrigenBitrix({ empresa, deal: dealNovonet(),
      origenes: [' API 484 ', 'api 484', "O'NEIL", 'WAZZUP: WhatsApp - API  963999000'], values });
    assert.deepEqual(values.slice(2), ['API 484', "O'NEIL", 'WAZZUP: WHATSAPP - API 963999000']);
    assert.match(sql, /EXISTS/);
    assert.match(sql, /IN \(\$3, \$4, \$5\)/);
    assert.ok(sql.includes(`origen_bwl.empresa = '${empresa}'`));
    assert.doesNotMatch(sql, /O'NEIL|mb.b_origen|mv.origen/);
  }
});

