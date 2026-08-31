const test = require('node:test');
const assert = require('node:assert/strict');

const {
  obtenerCapacidades, reiniciarCache, columnaOpcional, SIN_MIGRACION,
} = require('../src/contactabilidad/contactabilidad.esquema');
const { construirSql } = require('../src/contactabilidad/contactabilidad.recalculo');

const poolCon = (columnas = [], tablas = []) => ({
  query: async (sql) => {
    if (sql.includes('information_schema.columns')) return { rows: columnas };
    if (sql.includes('information_schema.tables')) return { rows: tablas };
    return { rows: [] };
  },
});

test.beforeEach(() => reiniciarCache());

test('detecta el esquema completo cuando la migracion ya corrio', async () => {
  const capacidades = await obtenerCapacidades(poolCon(
    [
      { table_name: 'contactabilidad_leads', column_name: 'chat_id' },
      { table_name: 'contactabilidad_leads', column_name: 'origen_ultimo_dato' },
      { table_name: 'contactabilidad_config', column_name: 'sla_critico_minutos' },
    ],
    [{ table_name: 'contactabilidad_eventos_inbox' }, { table_name: 'contactabilidad_vistas' }],
  ));

  assert.deepEqual(capacidades, {
    chat_id: true, origen_ultimo_dato: true, sla: true, eventos_inbox: true, vistas: true,
  });
});

test('sin migracion reporta todo ausente en vez de fallar', async () => {
  const capacidades = await obtenerCapacidades(poolCon());
  assert.equal(capacidades.chat_id, false);
  assert.equal(capacidades.eventos_inbox, false);
});

test('si la propia deteccion falla asume el esquema minimo', async () => {
  const roto = { query: async () => { throw new Error('sin conexion'); } };
  assert.deepEqual(await obtenerCapacidades(roto), SIN_MIGRACION);
});

test('columnaOpcional mantiene el alias aunque la columna no exista', () => {
  assert.equal(columnaOpcional(true, 'l.chat_id', 'chat_id'), 'l.chat_id AS chat_id');
  assert.equal(columnaOpcional(false, 'l.chat_id', 'chat_id'), 'NULL::text AS chat_id');
});

test('el recalculo no toca columnas que aun no existen', () => {
  const sinMigracion = construirSql('SELECT 1', 'CRON', { chat_id: false, origen_ultimo_dato: false });
  assert.doesNotMatch(sinMigracion, /SET[\s\S]*chat_id =/);
  assert.doesNotMatch(sinMigracion, /origen_ultimo_dato =/);
  // lo que ya existia se sigue actualizando
  assert.match(sinMigracion, /ultimo_mensaje_cliente_at   = a\.ultimo_cliente/);
  assert.match(sinMigracion, /pendiente_por = CASE/);

  const conMigracion = construirSql('SELECT 1', 'WEBHOOK', { chat_id: true, origen_ultimo_dato: true });
  assert.match(conMigracion, /chat_id = COALESCE\(a\.chat_id, l\.chat_id\)/);
  assert.match(conMigracion, /origen_ultimo_dato = 'WEBHOOK'/);
});

test('el bloque operativo de analytics no rompe sin la columna chat_id', async () => {
  const { obtenerAnalytics } = require('../src/contactabilidad/contactabilidad.analytics');
  const consultas = [];
  const pool = { query: async (sql) => { consultas.push(sql); return { rows: [] }; } };

  await obtenerAnalytics(pool, {}, { columnas: { chat_id: false } });

  const operativo = consultas.find((sql) => sql.includes('LIMIT 100'));
  assert.match(operativo, /NULL::text AS chat_id/);
  assert.doesNotMatch(operativo, /u\.chat_id/);
});
