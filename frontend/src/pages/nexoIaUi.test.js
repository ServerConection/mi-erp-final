import test from 'node:test';
import assert from 'node:assert/strict';
import { construirUrlListado, fechaHoraEcuador, obtenerBorradorNuevo } from './nexoIaUi.js';

test('construye el listado sin fecha cuando se quieren todos los leads desde el 15 de agosto', () => {
  assert.equal(
    construirUrlListado('/api/nexo-ia', 'NOVONET', ''),
    '/api/nexo-ia?empresa=NOVONET',
  );
});

test('envia el filtro como fecha de creacion del lead', () => {
  assert.equal(
    construirUrlListado('/api/nexo-ia', 'NOVONET', '2026-08-31'),
    '/api/nexo-ia?empresa=NOVONET&fecha_creacion=2026-08-31',
  );
});

test('muestra fecha y hora de Ecuador en cada mensaje', () => {
  assert.equal(fechaHoraEcuador('2026-08-31T18:07:00.000Z'), '31/08/2026, 13:07');
});

test('detecta un borrador creado despues de solicitar la generacion', () => {
  const previo = [{ id: 4, creado_at: '2026-08-31T17:00:00Z' }];
  const actual = [{ id: 5, creado_at: '2026-08-31T18:00:00Z' }, ...previo];
  assert.equal(obtenerBorradorNuevo(actual, previo)?.id, 5);
  assert.equal(obtenerBorradorNuevo(previo, previo), null);
});
