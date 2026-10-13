const assert = require('node:assert/strict');

// Evita abrir una conexión real: este test solo valida funciones puras.
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = { exports: {} };

const {
  obtenerNombreSaludo,
  crearMensajeBienvenida,
} = require('../src/services/welcomeWhatsapp.service');

assert.equal(
  obtenerNombreSaludo({ nombre_cliente_completo: 'PLAZA REALPE JEREMY JOSUE' }),
  'JEREMY PLAZA'
);
assert.equal(
  obtenerNombreSaludo({ nombre_cliente_completo: 'PEREZ ANA' }),
  'ANA PEREZ'
);
assert.equal(
  obtenerNombreSaludo({ nombre_cliente_completo: 'ACME CIA LTDA', tipo_documento: 'RUC EMPRESA' }),
  'ACME CIA LTDA'
);
assert.match(
  crearMensajeBienvenida({ nombre_cliente_completo: 'PLAZA REALPE JEREMY JOSUE' }),
  /Hola, \*JEREMY PLAZA\*/
);

console.log('OK Welcome: saludo con primer nombre y primer apellido');
