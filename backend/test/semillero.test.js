const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
let handler;
const queries = [];
const loadOriginal = Module._load;
Module._load = function (name, parent, main) {
  if (parent?.filename.endsWith('semillero.routes.js')) {
    if (name === 'express') return { Router: () => ({ use() {}, get(path, fn) { handler = fn; } }) };
    if (name === '../middleware/auth') return { verificarToken() {} };
    if (name === '../config/db') return { query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: sql.includes('AS gestionables') && sql.includes('AS atc') ? [{ total: 0, gestionables: 0, ventas: 0, atc: 0, descarte: 0 }] : [] };
    } };
  }
  return loadOriginal.call(this, name, parent, main);
};
try { require('../src/routes/semillero.routes'); } finally { Module._load = loadOriginal; }
function response() { return { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
test('rechaza fechas inválidas antes de consultar', async () => {
  const res = response();
  await handler({ query: { desde: '2026-02-30', hasta: '2026-09-18' }, user: {} }, res);
  assert.equal(res.code, 400); assert.equal(queries.length, 0);
});
test('aísla Semillero, fuerza el asesor autenticado y pagina solo el detalle', async () => {
  const res = response();
  await handler({ query: { desde: '2026-09-01', hasta: '2026-09-18', responsable: 'OTRO', pagina: '2' }, user: { perfil: 'ASESOR', nombreCompleto: 'ASESOR AUTENTICADO' } }, res);
  assert.equal(res.body.success, true);
  assert.equal(queries.length, 5);
  for (const q of queries) {
    assert.match(q.sql, /LOWER\(BTRIM\(w.empresa\)\) = 'semillero'/);
    assert.ok(q.params.includes('ASESOR AUTENTICADO'));
    assert.ok(!q.params.includes('OTRO'));
  }
  const detalle = queries.find(q => q.sql.includes('LIMIT 50'));
  assert.equal(detalle.params.at(-1), 50);
  assert.equal(queries.filter(q => q.sql.includes('LIMIT')).length, 1);
});
