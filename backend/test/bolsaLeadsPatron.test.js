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

const { elegirEntrega } = require('../src/shared/bolsaLeadsPatron');
const todos = { novonet: 5, velsa: 3, semillero: 1 };

test('conectados: con todos conectados sigue el ciclo normal', () => {
  const r = elegirEntrega({ patron: PATRON_DEFECTO, posicion: 6, modo: 'proporcion', conectados: todos });
  assert.equal(r.empresa, 'semillero');
  assert.equal(r.siguiente, 7);
  assert.deepEqual(r.saltadas, []);
});

test('conectados: SEMILLERO sin nadie → el lead pasa a la siguiente casilla con gente (NOVONET #8)', () => {
  const r = elegirEntrega({ patron: PATRON_DEFECTO, posicion: 6, modo: 'proporcion', conectados: { ...todos, semillero: 0 } });
  assert.deepEqual([r.empresa, r.slot, r.siguiente], ['novonet', 8, 8]);
  assert.deepEqual(r.saltadas, [{ slot: 7, empresa: 'semillero' }]);
});

test('conectados: VELSA sin nadie en todo el día → 24 leads van solo a NOVONET y SEMILLERO', () => {
  let posicion = 0;
  const cuenta = { novonet: 0, velsa: 0, semillero: 0 };
  for (let i = 0; i < 24; i++) {
    const r = elegirEntrega({ patron: PATRON_DEFECTO, posicion, modo: 'proporcion', conectados: { ...todos, velsa: 0 } });
    cuenta[r.empresa]++;
    posicion = r.siguiente;
  }
  assert.equal(cuenta.velsa, 0);
  assert.equal(cuenta.novonet + cuenta.semillero, 24);
  assert.ok(cuenta.semillero >= 1);
});

test('conectados: nadie conectado en ninguna / sin datos / modo solo / opción apagada → ciclo normal', () => {
  const nadie = elegirEntrega({ patron: PATRON_DEFECTO, posicion: 1, modo: 'proporcion', conectados: { novonet: 0, velsa: 0, semillero: 0 } });
  assert.deepEqual([nadie.empresa, nadie.sinConectados], ['velsa', true]);
  assert.equal(elegirEntrega({ patron: PATRON_DEFECTO, posicion: 1, modo: 'proporcion', conectados: null }).empresa, 'velsa');
  assert.equal(elegirEntrega({ patron: PATRON_DEFECTO, posicion: 1, modo: 'solo_velsa', conectados: { ...todos, velsa: 0 } }).empresa, 'velsa');
  assert.equal(elegirEntrega({ patron: PATRON_DEFECTO, posicion: 1, modo: 'proporcion', conectados: { ...todos, velsa: 0 }, redirigir: false }).empresa, 'velsa');
});

const { contarConectados } = require('../src/shared/bolsaLeadsConectados');
test('contar conectados: jornada abierta cuenta, en pausa no; solo asesores de cada empresa', () => {
  const data = {
    fuentes: { NOVONET: { timeman: true, usuarios: 4 } },
    usuarios: [
      { nombre: 'Ana Pérez', portalCuenta: 'NOVONET', jornada: 'OPENED' },
      { nombre: 'Luis Mora', portalCuenta: 'NOVONET', jornada: 'PAUSED' },
      { nombre: 'Rosa Vela', portalCuenta: 'NOVONET', jornada: 'OPENED' },
      { nombre: 'Jefe Supervisor', portalCuenta: 'NOVONET', jornada: 'OPENED' },
    ],
  };
  const asesores = new Map([['ANA PEREZ', 'novonet'], ['LUIS MORA', 'novonet'], ['ROSA VELA', 'velsa']]);
  const r = contarConectados(data, asesores);
  assert.deepEqual([r.novonet.conectados, r.velsa.conectados, r.semillero.conectados], [1, 1, 0]);
});
