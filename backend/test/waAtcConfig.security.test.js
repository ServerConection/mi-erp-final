const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const dbPath = require.resolve('../src/config/db');
const queuePath = require.resolve('../src/services/atcNotificationQueue.service');
const controllerPath = require.resolve('../src/controllers/wa_atc_config.controller');

function responseMock() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test.before(() => {
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      query: async () => { throw new Error('La consulta no debió ejecutarse'); },
      transaction: async () => { throw new Error('La transacción no debió ejecutarse'); },
    },
  };
  require.cache[queuePath] = {
    id: queuePath,
    filename: queuePath,
    loaded: true,
    exports: { ensureAtcNotificationSchema: async () => {} },
  };
});

test.after(() => {
  delete require.cache[controllerPath];
  delete require.cache[queuePath];
  delete require.cache[dbPath];
});

test('rechaza perfiles no administradores antes de consultar la base', async () => {
  const controller = require(controllerPath);
  const res = responseMock();
  await controller.getOverview({ user: { perfil: 'SUPERVISOR' }, query: {} }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.success, false);
});

test('un administrador no puede guardar un identificador de línea inválido', async () => {
  const controller = require(controllerPath);
  const res = responseMock();
  await controller.updateConfig({
    user: { perfil: 'ADMINISTRADOR', id: 1 },
    body: { enabled: true, line_id: "' OR 1=1 --" },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, 'Línea inválida');
});
