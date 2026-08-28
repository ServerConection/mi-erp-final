const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizarUmbrales, clasificar, expresionSeveridad, UMBRALES_DEFECTO,
} = require('../src/contactabilidad/contactabilidad.severidad');

const hace = (minutos) => new Date(Date.UTC(2026, 7, 28, 12, 0, 0) - minutos * 60000);
const AHORA = new Date(Date.UTC(2026, 7, 28, 12, 0, 0));

test('clasifica por minutos de espera del cliente', () => {
  const lead = (min) => ({ pendiente_por: 'ASESOR', ultimo_mensaje_cliente_at: hace(min) });
  assert.equal(clasificar(lead(5), UMBRALES_DEFECTO, AHORA).severidad, 'OK');
  assert.equal(clasificar(lead(15), UMBRALES_DEFECTO, AHORA).severidad, 'ALERTA');
  assert.equal(clasificar(lead(31), UMBRALES_DEFECTO, AHORA).severidad, 'GRAVE');
  assert.equal(clasificar(lead(120), UMBRALES_DEFECTO, AHORA).severidad, 'CRITICO');
});

test('si el pendiente es el cliente no hay severidad ni espera', () => {
  const resultado = clasificar(
    { pendiente_por: 'CLIENTE', ultimo_mensaje_cliente_at: hace(500) }, UMBRALES_DEFECTO, AHORA);
  assert.deepEqual(resultado, { severidad: 'OK', minutos: null });
});

test('umbrales desordenados o invalidos no dejan severidades inalcanzables', () => {
  assert.deepEqual(normalizarUmbrales({ alerta: 90, grave: 10, critico: 5 }),
    { alerta: 90, grave: 90, critico: 90 });
  assert.deepEqual(normalizarUmbrales({ alerta: 0, grave: -3, critico: 'x' }), UMBRALES_DEFECTO);
  assert.deepEqual(normalizarUmbrales(), UMBRALES_DEFECTO);
});

test('la expresion SQL refleja los mismos cortes que la version JS', () => {
  const sql = expresionSeveridad('l', { alerta: 7, grave: 14, critico: 21 });
  assert.match(sql, />= 21 THEN 'CRITICO'/);
  assert.match(sql, />= 14 THEN 'GRAVE'/);
  assert.match(sql, />= 7 THEN 'ALERTA'/);
  assert.doesNotMatch(sql, /\$\d/); // sin parametros: no se interpola nada del usuario
});
