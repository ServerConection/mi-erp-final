import test from 'node:test';
import assert from 'node:assert/strict';
import { crearBaseApiNexo, leerJsonNexo } from './nexoIaApi.js';

test('NEXO IA dirige sus solicitudes al backend configurado', () => {
  assert.equal(
    crearBaseApiNexo('https://erp-gateway-zabu.onrender.com/'),
    'https://erp-gateway-zabu.onrender.com/api/nexo-ia',
  );
});

test('NEXO IA mantiene compatibilidad local cuando no hay backend configurado', () => {
  assert.equal(crearBaseApiNexo(''), '/api/nexo-ia');
});

test('NEXO IA devuelve los datos de una respuesta exitosa', async () => {
  const response = new Response(JSON.stringify({ success: true, data: [{ id: 7 }] }), {
    headers: { 'content-type': 'application/json' },
  });
  assert.deepEqual(await leerJsonNexo(response), [{ id: 7 }]);
});

test('NEXO IA informa cuando recibe HTML en lugar de datos', async () => {
  const response = new Response('<!doctype html>', {
    headers: { 'content-type': 'text/html' },
  });
  await assert.rejects(() => leerJsonNexo(response), /no devolvió datos válidos/);
});

test('NEXO IA muestra el error enviado por el backend', async () => {
  const response = new Response(JSON.stringify({ success: false, error: 'Acceso denegado' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(() => leerJsonNexo(response), /Acceso denegado/);
});
