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

test('orden de conexión: el que se conecta tarde recibe 1 y entra a la fila (no iguala)', () => {
  const t = (min) => new Date(Date.UTC(2026, 9, 22, 13, min));
  // 5 asesores con 8 leads cada uno; F se conecta ahora y no tiene leads
  const c = [
    { nombre: 'A', permitidos: 20, asignados: 8, ultimaAsignacion: t(10) },
    { nombre: 'B', permitidos: 20, asignados: 8, ultimaAsignacion: t(11) },
    { nombre: 'C', permitidos: 20, asignados: 8, ultimaAsignacion: t(12) },
    { nombre: 'D', permitidos: 20, asignados: 8, ultimaAsignacion: t(13) },
    { nombre: 'E', permitidos: 20, asignados: 8, ultimaAsignacion: t(14) },
    { nombre: 'F', permitidos: 20, asignados: 0, ultimaAsignacion: null, conexion: t(30) },
  ];
  const orden = [];
  for (let i = 0; i < 7; i++) {
    const g = elegirAsesor(c, () => 0);
    orden.push(g.nombre); g.asignados += 1; g.ultimaAsignacion = t(40 + i);
  }
  // F recibe primero, luego la fila sigue A..E y F vuelve a su turno (no recibe 8 seguidos)
  assert.deepEqual(orden, ['F', 'A', 'B', 'C', 'D', 'E', 'F']);
});

test('entre los que no recibieron, va primero el que se conectó antes', () => {
  const t = (min) => new Date(Date.UTC(2026, 9, 22, 13, min));
  const g = elegirAsesor([
    { nombre: 'TARDE', permitidos: 5, asignados: 0, conexion: t(20) },
    { nombre: 'TEMPRANO', permitidos: 5, asignados: 0, conexion: t(5) },
  ], () => 0);
  assert.equal(g.nombre, 'TEMPRANO');
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
