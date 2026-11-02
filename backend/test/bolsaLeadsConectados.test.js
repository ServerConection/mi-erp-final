// La Bolsa reconoce a los asesores con la MISMA lista que el repartidor (cupos, nombre de Bitrix).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const src = (p) => require.resolve(path.join(__dirname, '../src', p));
const mock = (p, exports) => { require.cache[src(p)] = { id: src(p), filename: src(p), loaded: true, exports }; };

// usuarios del ERP: nombre distinto al de Bitrix (caso real del problema)
mock('config/db.js', { query: async () => ({ rows: [
  { empresa: 'NOVONET', usuario: 'kchala', nombres: 'Kevin Andres', apellidos: 'Chala' },
  { empresa: 'SEMILLERO', usuario: 'ana', nombres: 'Ana', apellidos: 'Ruiz' },
] }) });
// cupos del repartidor: nombre exacto de Bitrix
mock('config/dbErp.js', { query: async (sql) => ({ rows: /velsa_gestionables_asesores/.test(sql)
  ? [{ nombre: 'Rosa Vela' }, { nombre: 'GERENCIAL COMERCIAL VELSA' }]
  : [{ nombre: 'KEVIN CHALA' }, { nombre: 'María Pérez' }, { nombre: 'BRYAN PINEDA' }] }) });

const { asesoresPorNombre, contarDesdeMapa } = require('../src/shared/bolsaLeadsConectados');

test('cuenta conectados con el nombre de Bitrix de la lista de cupos (como el repartidor)', async () => {
  const asesores = await asesoresPorNombre();
  // Bitrix Live (nombres de Bitrix): Kevin y María en línea en NOVONET
  const mapa = new Map([
    ['KEVIN CHALA', { enLinea: true }], ['MARIA PEREZ', { enLinea: true }],
    ['ROSA VELA', { enLinea: true }], ['ANA RUIZ', { enLinea: true }],
    ['BRYAN PINEDA', { enLinea: true }], ['GERENCIAL COMERCIAL VELSA', { enLinea: true }],
  ]);
  const r = contarDesdeMapa(mapa, asesores);
  assert.equal(r.novonet.conectados, 2);   // antes daba 0: "Kevin Andres Chala" ≠ "KEVIN CHALA"
  assert.equal(r.velsa.conectados, 1);     // la estación de Velsa no cuenta
  assert.equal(r.semillero.conectados, 1); // Semillero sigue saliendo de usuarios del ERP
  assert.ok(!r.novonet.nombres.includes('BRYAN PINEDA'));
});
