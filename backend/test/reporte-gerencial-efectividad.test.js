const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('reporte gerencial calcula JOT / gestionables para las dos empresas', async () => {
  const context = {
    module: { exports: {} }, console, process,
    require(name) {
      if (name === '../shared/etapas') return require('../src/shared/etapas');
      if (name === '../shared/inversionRedes') return {};
      if (name === '../config/db') return { query: async sql => ({ rows: sql.includes('WITH diarios')
        ? [{ fecha: '2026-09-01', ingresos: 20, gestionables: 100, activas: 5 }]
        : [] }) };
      throw new Error(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/reporteGerencial.controller.js'), 'utf8'), context);
  for (const empresa of ['novonet', 'velsa']) {
    const { kpis } = await context.module.exports.serieEmpresa(empresa, { desde: '2026-09-01', hasta: '2026-09-14' });
    assert.equal(kpis.pct_efectividad, 20);
    const sql = context.module.exports.SERIES[empresa].sql;
    assert.match(sql, /COUNT\(DISTINCT/);
    assert.match(sql, /UNION ALL/);
    assert.match(sql, /SIN ASUNTO/);
    assert.doesNotMatch(sql, /'ELIMINADO'/);
  }
});
