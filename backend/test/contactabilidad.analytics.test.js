const test = require('node:test');
const assert = require('node:assert/strict');

const { construirFiltros, obtenerAnalytics } = require('../src/contactabilidad/contactabilidad.analytics');

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

test('devuelve todos los bloques del contrato analitico', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [] };
  } };

  const data = await obtenerAnalytics(pool, { empresa: 'NOVONET' });

  assert.deepEqual(Object.keys(data), [
    'resumen', 'por_origen', 'por_asesor', 'por_etapa',
    'por_hora', 'embudo', 'operativo', 'calidad_datos',
  ]);
  assert.ok(calls.every((call) => call.params[0] === 'NOVONET'));
  assert.ok(calls.some((call) => call.sql.includes('PERCENTILE_CONT(0.5)')));
  assert.ok(calls.some((call) => call.sql.includes("AT TIME ZONE 'America/Guayaquil'")));
});
