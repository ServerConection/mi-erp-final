const test = require('node:test');
const assert = require('node:assert/strict');
const { accesoHojas, resolverAcceso, PERFILES_CREADORES } = require('../src/middleware/hojasAcceso');

const respuesta = () => {
  const state = { status: 200, body: null };
  return {
    state,
    res: {
      status(code) { state.status = code; return this; },
      json(body) { state.body = body; return this; },
    },
  };
};

test('Archivos Compartidos admite únicamente ADMINISTRADOR', () => {
  assert.deepEqual(PERFILES_CREADORES, ['ADMINISTRADOR']);
  for (const perfil of ['ANALISTA', 'GERENCIA', 'SUPERVISOR', 'ASESOR']) {
    const { state, res } = respuesta();
    let next = false;
    accesoHojas({ user: { perfil } }, res, () => { next = true; });
    assert.equal(state.status, 403, perfil);
    assert.equal(next, false, perfil);
  }
  const { state, res } = respuesta();
  let next = false;
  const req = { user: { perfil: 'ADMINISTRADOR' } };
  accesoHojas(req, res, () => { next = true; });
  assert.equal(next, true);
  assert.equal(req.puedeCrearHojas, true);
  assert.equal(state.status, 200);
});

test('acceso por socket tampoco resuelve hojas para perfiles no administradores', async () => {
  assert.deepEqual(await resolverAcceso(1, { id: 2, perfil: 'ANALISTA' }), { hoja: null, nivel: null });
});
