const test = require('node:test');
const assert = require('node:assert/strict');
const { elegirAsesor, normalizarNombre } = require('../src/shared/repartoGestionables');

// Simula N leads entrando uno tras otro y devuelve el orden de asignación.
const simular = (asesores, n) => {
  const estado = asesores.map((a) => ({ ...a, asignados: a.asignados || 0, ultimaAsignacion: null }));
  const orden = [];
  for (let i = 0; i < n; i++) {
    const g = elegirAsesor(estado);
    if (!g) { orden.push(null); continue; }
    g.asignados += 1;
    g.ultimaAsignacion = new Date(2026, 0, 1, 8, 0, i);
    orden.push(g.nombre);
  }
  return { orden, estado };
};

test('ejemplo de Bryan: ronda por ronda, Kevin sale al llenar su cupo', () => {
  const { orden } = simular([
    { nombre: 'BRYAN PINEDA', permitidos: 4 },
    { nombre: 'CARLOS ALBERTO', permitidos: 3 },
    { nombre: 'KEVIN CHALA', permitidos: 1 },
  ], 9);
  // Ronda 1: los 3 (cualquier orden)
  assert.deepEqual([...orden.slice(0, 3)].sort(), ['BRYAN PINEDA', 'CARLOS ALBERTO', 'KEVIN CHALA']);
  // Ronda 2: Bryan y Carlos (Kevin ya no)
  assert.deepEqual([...orden.slice(3, 5)].sort(), ['BRYAN PINEDA', 'CARLOS ALBERTO']);
  // Ronda 3: Bryan y Carlos
  assert.deepEqual([...orden.slice(5, 7)].sort(), ['BRYAN PINEDA', 'CARLOS ALBERTO']);
  // Ronda 4: solo Bryan; luego nadie tiene cupo
  assert.equal(orden[7], 'BRYAN PINEDA');
  assert.equal(orden[8], null);
});

test('nadie recibe 2 seguidos mientras otro con cupo tenga menos', () => {
  const { orden } = simular([
    { nombre: 'A', permitidos: 5, asignados: 2 },
    { nombre: 'B', permitidos: 3 },
    { nombre: 'C', permitidos: 4, asignados: 1 },
  ], 3);
  // B (0) primero, luego B/C empatados en 1, luego el otro -> A no recibe aún
  assert.equal(orden[0], 'B');
  assert.ok(!orden.includes('A'));
});

test('nunca pasa el cupo permitido', () => {
  const { estado } = simular([
    { nombre: 'A', permitidos: 2 }, { nombre: 'B', permitidos: 0 }, { nombre: 'C', permitidos: 3 },
  ], 20);
  for (const a of estado) assert.ok(a.asignados <= a.permitidos, a.nombre);
});

test('normalizarNombre ignora tildes, espacios y mayúsculas', () => {
  assert.equal(normalizarNombre('  Kevin   Chalá '), 'KEVIN CHALA');
});
