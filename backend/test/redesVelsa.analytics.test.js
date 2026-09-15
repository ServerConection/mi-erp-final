const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../src/config/db.js');
const freshPath = path.resolve(__dirname, '../src/services/inversionFreshness.service.js');
const controllerPath = path.resolve(__dirname, '../src/controllers/redesVelsaWebhook.controller.js');

function setup(answer) {
  const calls = [];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
    exports: { query: async (sql, params) => { calls.push({ sql, params }); return answer(sql, params); } } };
  require.cache[freshPath] = { id: freshPath, filename: freshPath, loaded: true,
    exports: { asegurarInversionReciente: async () => {} } };
  delete require.cache[controllerPath];
  return { controller: require(controllerPath), calls };
}
function clean() { for (const p of [dbPath, freshPath, controllerPath]) delete require.cache[p]; }
function response() { return { code: 200, body: null, status(v) { this.code = v; return this; }, json(v) { this.body = v; return this; } }; }

test('asesores de Velsa quedan separados por empresa y agencia', async () => {
  const { controller, calls } = setup(() => ({ rows: [{ asesor: 'ANA', agencia: 'ARTS', n_leads: 4, gestionables: 3, venta_subida: 1 }] }));
  try {
    const res = response();
    await controller.getAsesoresVsPauta({ query: { fechaDesde: '2026-09-01', fechaHasta: '2026-09-15', canales: 'ARTS' } }, res);
    assert.equal(res.body.success, true);
    assert.equal(res.body.asesores[0].asesor, 'ANA');
    assert.match(calls[0].sql, /w\.empresa='velsa'/);
    assert.deepEqual(calls[0].params, ['2026-09-01', '2026-09-15', 'ARTS']);
  } finally { clean(); }
});

test('metas y gasto sintético se atribuyen a la misma agencia', async () => {
  const { controller } = setup((sql) => {
    if (sql.includes('FROM velsa_redes_metas')) return { rows: [{ agencia: 'VELSA', meta_leads: 100, meta_ventas: 10, meta_inversion: 500 }] };
    if (sql.includes('FROM velsa_inversion_redes')) return { rows: [{ canal_publicidad: '__WINTRACKER_VELSA__', inversion: 200 }] };
    if (sql.includes('FROM bitrix_webhook_leads')) return { rows: [{ canal_publicidad: 'VELSA', n_leads: 40, venta_subida: 4 }] };
    return { rows: [] };
  });
  try {
    const res = response();
    await controller.getMetasVelsa({ query: { fechaDesde: '2026-09-01', fechaHasta: '2026-09-15' } }, res);
    assert.equal(res.body.success, true);
    assert.equal(res.body.agencias[0].inversion, 200);
    assert.equal(res.body.agencias[0].meta_ventas, 10);
    assert.equal(res.body.agencias[0].n_leads, 40);
  } finally { clean(); }
});

test('gráficos usan JotForm de Velsa y calor del webhook filtrado', async () => {
  const { controller, calls } = setup((sql) => {
    if (sql.includes('jotPorAgenciaDia')) return { rows: [] };
    if (sql.includes('ingreso_jot FROM jot')) return { rows: [{ fecha: '2026-09-15', agencia: 'ARTS', ingreso_jot: 2 }] };
    if (sql.includes('EXTRACT(ISODOW')) return { rows: [{ dia_semana: 1, hora: 10, n_leads: 3 }] };
    if (sql.includes('GROUP BY agencia')) return { rows: [{ agencia: 'ARTS', ingreso_jot: 2, activos: 1 }] };
    if (sql.includes('jotTotales')) return { rows: [] };
    return { rows: [{ ingreso_jot: 2, activos: 1 }] };
  });
  try {
    const res = response();
    await controller.getGraficosRedesVelsa({ query: { fechaDesde: '2026-09-15', fechaHasta: '2026-09-15', canales: 'ARTS' } }, res);
    assert.equal(res.body.success, true);
    assert.equal(res.body.jotPorAgenciaDia[0].agencia, 'ARTS');
    assert.equal(res.body.heatmap[0].n_leads, 3);
    assert.equal(res.body.jotPorAgencia[0].activos, 1);
    assert.ok(calls.some(c => c.sql.includes("w.empresa='velsa'") && c.sql.includes('EXTRACT(ISODOW')));
    assert.ok(calls.some(c => c.sql.includes('mv_indicadores_velsa_completo') && c.params.includes('ARTS')));
  } finally { clean(); }
});
