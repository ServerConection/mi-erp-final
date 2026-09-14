const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const etapas = require('../src/shared/etapas');

function cargar(rows) {
  const queries = [];
  const context = {
    module: { exports: {} }, console, process,
    require: (name) => {
      if (name === '../config/db') return { query: async (sql, values) => {
        queries.push({ sql, values });
        return { rows };
      } };
      if (name === '../shared/etapas') return etapas;
      if (name === './indicadores.controller') return { CANAL_ORIGENES_MAP: { ARTS: ['BASE 593-979083368'] } };
      if (name === './indicadoresVelsaMaterialized.controller') return {
        getSupervisorExpr: () => 'mv.supervisor', normalizarAsesorSQL: col => col,
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/controllers/kpiComercial.controller.js'), 'utf8'), context);
  return { handler: context.module.exports.getKpiComercial, queries };
}

for (const empresa of ['NOVONET', 'VELSA']) {
  test(`${empresa}: filtros parametrizados y porcentajes JOT ponderados`, async () => {
    const { handler, queries } = cargar([
      { asesor_display: 'Ana Perez', supervisor: 'Equipo', leads_total: 100, leads_gestion: 50, ingresos_crm: 30, ingresos_jot: 10 },
      { asesor_display: 'Luis Gomez', supervisor: 'Equipo', leads_total: 20, leads_gestion: 10, ingresos_crm: 15, ingresos_jot: 8 },
    ]);
    let payload;
    const res = { json: data => { payload = data; }, status: code => { assert.fail(`HTTP ${code}`); } };
    await handler({ query: {
      empresa, fechaDesde: '2026-09-01', fechaHasta: '2026-09-14', asesor: 'Ana Perez,Luis Gomez',
      supervisor: "Equipo O'Neil", etapaCRM: 'VENTA SUBIDA', estadoNetlife: 'ACTIVO',
      etapaJotform: 'ACTIVO', estadoRegularizacion: 'PENDIENTE', gestionables: 'si',
      idBitrix: '123', fechaActivacionDesde: '2026-09-02', fechaActivacionHasta: '2026-09-13',
      ...(empresa === 'NOVONET' ? { canal: 'ARTS' } : { origen: 'Whatsapp 1' }),
    } }, res);
    assert.equal(payload.success, true);
    assert.equal(payload.data.asesores[0].pct_efect_vs_leads, 10);
    assert.equal(payload.data.asesores[0].pct_efect_vs_gestion, 20);
    assert.equal(payload.data.total.pct_efect_vs_leads, 15);
    assert.equal(payload.data.total.pct_efect_vs_gestion, 30);
    assert.equal(payload.data.supervisores[0].pct_efect_vs_gestion, 30);
    const { sql, values } = queries[0];
    // Regresión: el filtro gestionables contiene regex terminados en $'.
    // Sustituirlo como string duplicaba el sufijo del SQL y rompía PostgreSQL.
    assert.equal((sql.match(/metas AS \(/g) || []).length, 1);
    assert.ok(sql.includes(etapas.esGestionableExpr('mb.b_etapa_de_la_negociacion')));
    assert.doesNotMatch(sql, /__[A-Z]+__/);
    assert.doesNotMatch(sql, /O'Neil/);
    assert.ok(values.includes("%Equipo O'Neil%"));
    assert.equal(Math.max(...[...sql.matchAll(/\$(\d+)/g)].map(m => Number(m[1]))), values.length);
    // El estado JOT solo restringe ingresos_jot, nunca el WHERE de datos:
    // un lead gestionable con JOT excluido sigue formando parte del divisor.
    const whereDatos = sql.slice(sql.indexOf('WHERE (mb.b_creado_el_fecha'), sql.indexOf('\nmetas AS'));
    assert.doesNotMatch(whereDatos, /NOT IN \('PRESERVICIO'/);
    for (const etapa of ['PRESERVICIO', 'FIN DE GESTIÓN', 'DESISTE DE SERVICIO', 'DESISTE DEL SERVICIO', 'DUPLICADO', 'SIN ASUNTO']) assert.ok(sql.includes(`'${etapa}'`));
    assert.ok(!etapas.ESTADOS_EXCLUIDOS_INGRESO_JOTFORM.includes('ELIMINADO'));
    if (empresa === 'VELSA') {
      assert.match(sql, /FROM public.mv_indicadores_velsa_completo mv/);
      assert.match(sql, /INTERVAL '5 hours'/);
      assert.match(sql, /mb.supervisor ILIKE/);
    } else {
      assert.match(sql, /FROM public.vw_bitrix_novonet mb/);
      assert.match(sql, /e.supervisor ILIKE/);
    }
  });
}

test('rango invertido se rechaza antes de consultar', async () => {
  const { handler, queries } = cargar([]);
  let status;
  await handler({ query: { fechaDesde: '2026-09-14', fechaHasta: '2026-09-01' } }, {
    status(code) { status = code; return this; }, json() {},
  });
  assert.equal(status, 400);
  assert.equal(queries.length, 0);
});

test('sin resultados devuelve ambas tablas vacías y efectividades cero', async () => {
  const { handler } = cargar([]);
  let payload;
  await handler({ query: { fechaDesde: '2026-09-01', fechaHasta: '2026-09-14' } }, {
    json(data) { payload = data; }, status(code) { assert.fail(`HTTP ${code}`); },
  });
  assert.equal(payload.data.asesores.length, 0);
  assert.equal(payload.data.supervisores.length, 0);
  assert.equal(payload.data.total.pct_efect_vs_leads, 0);
  assert.equal(payload.data.total.pct_efect_vs_gestion, 0);
});
