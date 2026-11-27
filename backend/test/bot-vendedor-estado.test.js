const test = require('node:test');
const assert = require('node:assert/strict');

const estado = require('../src/services/botVendedorEstado.service');

test('fusionarEstado conserva datos anteriores cuando llegan valores vacios', () => {
  const actual = { ciudad: 'Quito', personas: 4, usos: ['teletrabajo'], forma_pago: null };
  const cambios = { ciudad: '', personas: null, usos: [], forma_pago: 'tarjeta' };

  assert.deepEqual(estado.fusionarEstado(actual, cambios), {
    version: 1,
    motivo: null,
    segmento: null,
    ciudad: 'Quito',
    sector: null,
    personas: 4,
    usos: ['teletrabajo'],
    plan: null,
    forma_pago: 'tarjeta',
    documentos: [],
    direccion: null,
    cierre_confirmado: false,
    escalado: false,
  });
});

test('calcularPaso elige el primer dato comercial que falta', () => {
  assert.equal(estado.calcularPaso({}), 'motivo');
  assert.equal(estado.calcularPaso({ motivo: 'plan_nuevo' }), 'segmento');
  assert.equal(estado.calcularPaso({ motivo: 'plan_nuevo', segmento: 'hogar' }), 'ubicacion');
  assert.equal(estado.calcularPaso({ motivo: 'plan_nuevo', segmento: 'hogar', ciudad: 'Quito', sector: 'La Carolina' }), 'uso');
  assert.equal(estado.calcularPaso({ motivo: 'plan_nuevo', segmento: 'hogar', ciudad: 'Quito', sector: 'La Carolina', personas: 4, usos: ['teletrabajo'] }), 'recomendacion');
});

test('calcularAvance llega a cien solo con cierre confirmado', () => {
  const completo = {
    motivo: 'plan_nuevo', segmento: 'hogar', ciudad: 'Quito', sector: 'Centro',
    personas: 2, usos: ['estudio'], plan: 'GI Net-Defense', forma_pago: 'tarjeta',
    documentos: ['cedula_frente', 'cedula_reverso'], direccion: 'Calle A y B', cierre_confirmado: true,
  };
  assert.equal(estado.calcularAvance({}), 0);
  assert.equal(estado.calcularAvance(completo), 100);
});

test('normalizarEstado descarta campos desconocidos y limita listas', () => {
  const r = estado.normalizarEstado({ ciudad: '  Quito ', secreto: '1234', usos: ['Trabajo', '', 'Trabajo'], documentos: new Array(30).fill('cedula') });
  assert.equal(r.ciudad, 'Quito');
  assert.equal(Object.hasOwn(r, 'secreto'), false);
  assert.deepEqual(r.usos, ['Trabajo']);
  assert.equal(r.documentos.length, 1);
});
