const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const dbPath = path.resolve(__dirname, '../src/config/db.js');
const controllerPath = path.resolve(__dirname, '../src/controllers/botAuditor.controller.js');

function cargarControlador(respuestas) {
  const consultas = [];
  const pool = {
    query: async (sql, params) => {
      consultas.push({ sql, params });
      return respuestas.shift();
    },
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
  delete require.cache[controllerPath];
  return { controlador: require(controllerPath), consultas };
}

function respuesta() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('listado resuelve desconocidos con dueño WABOT sin actualizar auditorias', async () => {
  const { controlador, consultas } = cargarControlador([
    { rows: [{ total: 1 }] },
    { rows: [{ id: 7, asesor: 'Erick Enríquez', stage_id: 'C19:LOSE', calificacion: 'VENTA', puntuacion_venta: 20 }] },
  ]);
  const req = { query: {}, user: { perfil: 'ADMINISTRADOR', empresa: 'VELSA' } };
  const res = respuesta();

  await controlador.listarAuditorias(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].asesor, 'Erick Enríquez');
  assert.match(consultas[0].sql, /FROM conversations c/);
  assert.match(consultas[0].sql, /JOIN usuarios u ON u\.id = l\.created_by/);
  assert.match(consultas[0].sql, /SEMILLERO'[\s\S]*NOVONET/);
  assert.doesNotMatch(consultas[0].sql, /UPDATE\s+auditorias/i);
});

test('filtro de asesor y búsqueda usan el nombre enriquecido', async () => {
  const { controlador, consultas } = cargarControlador([
    { rows: [{ total: 0 }] },
    { rows: [] },
  ]);
  const req = {
    query: { asesor: 'Erick', q: 'Enríquez' },
    user: { perfil: 'ADMINISTRADOR' },
  };
  const res = respuesta();

  await controlador.listarAuditorias(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(consultas[0].sql, /asesor_resuelto ILIKE \$2/);
  assert.match(consultas[0].sql, /asesor_resuelto ILIKE \$3/);
  assert.deepEqual(consultas[0].params, [
    ['C19:UC_U0JYD8', 'C19:LOSE', 'C8:UC_Q9LSSI', 'C8:LOSE'],
    '%Erick%',
    '%Enríquez%',
  ]);
});

test('detalle aplica el mismo enriquecimiento conservador', async () => {
  const { controlador, consultas } = cargarControlador([
    { rows: [{ id: 7, asesor: 'Desconocido', asesor_resuelto: 'Erick Enríquez', stage_id: 'C19:LOSE' }] },
  ]);
  const req = { params: { id: '7' }, user: { perfil: 'ADMINISTRADOR' } };
  const res = respuesta();

  await controlador.obtenerDetalle(req, res);

  assert.equal(res.body.data.asesor, 'Erick Enríquez');
  assert.match(consultas[0].sql, /LEFT JOIN LATERAL/);
  assert.match(consultas[0].sql, /a\.id = \$1/);
});

test.after(() => {
  delete require.cache[controllerPath];
  delete require.cache[dbPath];
});
