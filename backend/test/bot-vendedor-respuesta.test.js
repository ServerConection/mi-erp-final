const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../src/config/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: async () => ({ rows: [] }) } };
const bot = require('../src/services/botVendedor.service');

test('interpretarRespuestaModelo separa el estado interno del texto para el cliente', () => {
  const entrada = 'Perfecto, te recomiendo el plan de 400 Mbps.\n<estado_comercial>{"ciudad":"Quito","personas":4,"usos":["teletrabajo"]}</estado_comercial>';
  const r = bot.interpretarRespuestaModelo(entrada);

  assert.equal(r.texto, 'Perfecto, te recomiendo el plan de 400 Mbps.');
  assert.deepEqual(r.estado, { ciudad: 'Quito', personas: 4, usos: ['teletrabajo'] });
});

test('interpretarRespuestaModelo conserva el texto si el JSON interno es invalido', () => {
  const r = bot.interpretarRespuestaModelo('¿En qué sector estás?\n<estado_comercial>{mal json}</estado_comercial>');
  assert.equal(r.texto, '¿En qué sector estás?');
  assert.deepEqual(r.estado, {});
});

test('interpretarRespuestaModelo reconoce cierre e imagenes sin mostrarlos', () => {
  const r = bot.interpretarRespuestaModelo('Todo confirmado. [IMG:12] [VENTA_CERRADA]');
  assert.equal(r.texto, 'Todo confirmado.');
  assert.deepEqual(r.imagenesRaw, [12]);
  assert.equal(r.ventaCerrada, true);
});
