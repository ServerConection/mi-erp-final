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
    'por_hora', 'embudo', 'operativo', 'alertas', 'umbrales', 'calidad_datos',
  ]);
  assert.ok(calls.every((call) => call.params[0] === 'NOVONET'));
  assert.ok(calls.some((call) => call.sql.includes('PERCENTILE_CONT(0.5)')));
  assert.ok(calls.some((call) => call.sql.includes("AT TIME ZONE 'America/Guayaquil'")));
  const operativoQuery = calls.find((call) => call.sql.includes('LIMIT 100')).sql;
  assert.match(operativoQuery, /ORDER BY u\.fecha_creacion DESC NULLS LAST/);
});

test('los filtros operativos se parametrizan y validan', () => {
  const { params, whereSql } = construirFiltros({
    pendiente_por: 'asesor', severidad: 'CRITICO,GRAVE', min_espera: '45',
    q: 'juan', temperatura: 'caliente', solo_con_mensajes: 'true',
  });

  assert.deepEqual(params, ['ASESOR', 'CALIENTE', ['CRITICO', 'GRAVE'], '45', '%juan%']);
  assert.match(whereSql, /\(l\.mensajes_cliente_total \+ l\.mensajes_asesor_total\) > 0/);
  assert.doesNotMatch(whereSql, /juan/);
});

test('rechaza severidad y pendiente_por invalidos', () => {
  assert.throws(() => construirFiltros({ severidad: 'URGENTE' }), /severidad invalida/);
  assert.throws(() => construirFiltros({ pendiente_por: 'JEFE' }), /CLIENTE o ASESOR/);
  assert.throws(() => construirFiltros({ min_espera: 'ayer' }), /min_espera/);
});

test('el semaforo usa los umbrales recibidos, no los de defecto', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };

  await obtenerAnalytics(pool, {}, { umbrales: { alerta: 5, grave: 10, critico: 20 } });

  const conSeveridad = calls.filter((c) => c.sql.includes("THEN 'CRITICO'"));
  assert.ok(conSeveridad.length > 0);
  assert.ok(conSeveridad.every((c) => c.sql.includes(">= 20 THEN 'CRITICO'")));
});
