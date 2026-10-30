const test = require('node:test');
const assert = require('node:assert/strict');
const { generarPatron, siguienteEntrega, patronValido, resumenPatron, PATRON_DEFECTO } = require('../src/shared/bolsaLeadsPatron');

test('60/40 en ciclos de 10 da el patrón de Bryan', () => {
  assert.equal(generarPatron(60, 10), 'NVNVNNVNVN');
  assert.equal(PATRON_DEFECTO, 'NVNVNNVNVN');
});

test('20 leads siguen el patrón y el ciclo vuelve a empezar', () => {
  let posicion = 0;
  const salida = [];
  for (let i = 0; i < 20; i++) {
    const r = siguienteEntrega({ patron: PATRON_DEFECTO, posicion, modo: 'proporcion' });
    salida.push(r.empresa === 'novonet' ? 'N' : 'V');
    posicion = r.siguiente;
  }
  assert.equal(salida.join(''), 'NVNVNNVNVN'.repeat(2));
  assert.equal(salida.filter((c) => c === 'N').length, 12);
});

test('modo solo una empresa no mueve el ciclo', () => {
  const r = siguienteEntrega({ patron: PATRON_DEFECTO, posicion: 3, modo: 'solo_velsa' });
  assert.deepEqual(r, { empresa: 'velsa', slot: null, siguiente: 3 });
});

test('extremos y validación', () => {
  assert.equal(generarPatron(100, 10), 'NNNNNNNNNN');
  assert.equal(generarPatron(0, 5), 'VVVVV');
  assert.equal(resumenPatron('NVNVNNVNVN').pct_novonet, 60);
  assert.ok(patronValido('NVNVN'));
  assert.ok(!patronValido('NXV'));
  assert.ok(!patronValido(''));
});
