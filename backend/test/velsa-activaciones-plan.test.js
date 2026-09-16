const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('activaciones Velsa requieren ACTIVO y al menos uno de los seis planes de la MV', async () => {
  const db = path.resolve(__dirname, '../src/config/db.js');
  const controller = path.resolve(__dirname, '../src/controllers/indicadoresVelsaMaterialized.controller.js');
  const old = require.cache[db];
  let query;
  require.cache[db] = { id: db, filename: db, loaded: true, exports: { query: async (sql, values) => {
    if (sql.includes('to_regprocedure')) return { rows: [{ existe: true }] };
    query = { sql, values }; return { rows: [{ fecha: '2026-09-16', activaciones: 1 }] };
  } } };
  delete require.cache[controller];
  try {
    let body;
    await require(controller).getActivacionesPorDiaVelsa({ query: { fechaDesde: '2026-09-01', fechaHasta: '2026-09-16' } }, {
      json(value) { body = value; }, status() { return this; },
    });
    assert.equal(body.success, true);
    assert.match(query.sql, /UPPER\(TRIM\(mv.estado_venta\)\) = 'ACTIVO'/);
    for (const field of ['plan_casa', 'plan_pyme', 'plan_profesional', 'plan_hogar_adulto_mayor', 'plan_pyme_corp', 'plan_centro_red_comercial']) {
      assert.ok(query.sql.includes(`TRIM(mv.${field}::text) <> ''`));
    }
    assert.match(query.sql, /\sOR\s/);
    assert.deepEqual(query.values.slice(0, 2), ['2026-09-01', '2026-09-16']);
  } finally {
    delete require.cache[controller];
    if (old) require.cache[db] = old; else delete require.cache[db];
  }
});
