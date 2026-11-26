const test = require('node:test');
const assert = require('node:assert/strict');
const {
  obtenerConversacionWabot,
  combinarMensajes,
} = require('../src/contactabilidad/contactabilidad.wabot');

test('combina mensajes de Bitrix y WaBot en orden cronologico y marca la fuente', () => {
  const mensajes = combinarMensajes(
    [{ id: 'b1', fecha: '2026-11-25T15:00:00.000Z', texto: 'Bitrix' }],
    [{ id: 'wabot:w1', fecha: '2026-11-25T14:00:00.000Z', texto: 'WaBot', fuente: 'WABOT' }],
  );

  assert.deepEqual(mensajes.map((m) => [m.texto, m.fuente]), [
    ['WaBot', 'WABOT'],
    ['Bitrix', 'BITRIX'],
  ]);
});

test('consulta WaBot por empresa y negocio, limita y devuelve orden ascendente', async () => {
  let llamada;
  const pool = {
    query: async (sql, params) => {
      llamada = { sql, params };
      return { rows: [
        { id: 2, fecha: new Date('2026-11-25T15:00:00.000Z'), texto: 'Segundo' },
        { id: 1, fecha: new Date('2026-11-25T14:00:00.000Z'), texto: 'Primero' },
      ] };
    },
  };

  const mensajes = await obtenerConversacionWabot(pool, 'VELSA', '719045', 900);
  assert.deepEqual(llamada.params, ['VELSA', '719045', 500]);
  assert.match(llamada.sql, /c\.bitrix_deal_id = \$2/);
  assert.deepEqual(mensajes.map((m) => m.id), ['wabot:1', 'wabot:2']);
  assert.ok(mensajes.every((m) => m.fuente === 'WABOT'));
});
