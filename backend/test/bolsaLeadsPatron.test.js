const test = require('node:test');
const assert = require('node:assert/strict');
const { generarPatron, siguienteEntrega, patronValido, resumenPatron, PATRON_DEFECTO } = require('../src/shared/bolsaLeadsPatron');

test('patrón por defecto: 12 casillas, 7 NOVONET / 4 VELSA / 1 SEMILLERO', () => {
  assert.equal(PATRON_DEFECTO, 'NVNNVNSNVNNV');
  const r = resumenPatron(PATRON_DEFECTO);
  assert.deepEqual([r.tamano, r.novonet, r.velsa, r.semillero], [12, 7, 4, 1]);
  assert.deepEqual([r.pct_novonet, r.pct_velsa, r.pct_semillero], [58, 33, 8]);
});

test('24 leads siguen el patrón y el ciclo vuelve a empezar', () => {
  let posicion = 0;
  const salida = [];
  for (let i = 0; i < 24; i++) {
    const r = siguienteEntrega({ patron: PATRON_DEFECTO, posicion, modo: 'proporcion' });
    salida.push({ novonet: 'N', velsa: 'V', semillero: 'S' }[r.empresa]);
    posicion = r.siguiente;
  }
  assert.equal(salida.join(''), PATRON_DEFECTO.repeat(2));
});

test('generar: respeta las cantidades y no amontona', () => {
  assert.equal(generarPatron({ novonet: 6, velsa: 4 }), 'NVNVNNVNVN');
  const p = generarPatron({ novonet: 7, velsa: 4, semillero: 1 });
  assert.deepEqual([p.length, ...['N', 'V', 'S'].map((l) => [...p].filter((c) => c === l).length)], [12, 7, 4, 1]);
  assert.ok(!/VV|SS/.test(p));
  assert.equal(generarPatron({ semillero: 3 }), 'SSS');
  assert.equal(generarPatron({}), '');
});

test('modo solo una empresa no mueve el ciclo', () => {
  assert.deepEqual(siguienteEntrega({ patron: PATRON_DEFECTO, posicion: 3, modo: 'solo_semillero' }), { empresa: 'semillero', slot: null, siguiente: 3 });
  assert.equal(siguienteEntrega({ patron: PATRON_DEFECTO, posicion: 3, modo: 'solo_velsa' }).empresa, 'velsa');
});

test('validación', () => {
  assert.ok(patronValido('NVSNV'));
  assert.ok(!patronValido('NXV'));
  assert.ok(!patronValido(''));
});
