const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('activaciones por fecha exigen ACTIVO y cualquiera de los seis planes sin duplicar JOT', async () => {
  const db = path.resolve(__dirname, '../src/config/db.js');
  const controller = path.resolve(__dirname, '../src/controllers/indicadores.controller.js');
  const old = require.cache[db];
  let query;
  require.cache[db] = { id: db, filename: db, loaded: true, exports: { query: async (sql, values) => {
    query = { sql, values }; return { rows: [{ fecha: '2026-09-16', activaciones: 2 }] };
  } } };
  delete require.cache[controller];
  try {
    let body;
    await require(controller).getActivacionesPorDia({ query: { fechaDesde: '2026-09-01', fechaHasta: '2026-09-16' } }, {
      json(value) { body = value; }, status() { return this; },
    });
    assert.equal(body.success, true);
    assert.match(query.sql, /UPPER\(TRIM\(mb\.j_netlife_estatus_real\)\) = 'ACTIVO'/);
    assert.match(query.sql, /EXISTS \([\s\S]*vista_analisis_novonet plan_validacion/);
    for (const field of ['plan_casa', 'plan_pyme', 'plan_profesional', 'plan_hogar_adulto_mayor', 'plan_pyme_corp', 'plan_centro_comercial']) {
      assert.ok(query.sql.includes(`TRIM(plan_validacion.${field}::text) <> ''`));
    }
    assert.match(query.sql, /plan_validacion\.id_bitrix::text = mb\.j_id_bitrix::text/);
    assert.deepEqual(query.values.slice(0, 2), ['2026-09-01', '2026-09-16']);
  } finally {
    delete require.cache[controller];
    if (old) require.cache[db] = old; else delete require.cache[db];
  }
});
