import test from 'node:test';
import assert from 'node:assert/strict';
import { forzarSyncInversion } from './redesSync.js';

test('envia POST autenticado y devuelve resultados por agencia', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ success: true, resultados: [{ agency: 'vidika', ok: true, ultimoMonto: 40.13 }] }) };
  };
  const result = await forzarSyncInversion({ apiBase: 'https://erp.test', token: 'abc', fetchImpl, from: '2026-08-01', to: '2026-08-25' });
  assert.equal(request.url, 'https://erp.test/api/redes/sync-inversion');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer abc');
  assert.deepEqual(JSON.parse(request.options.body), { from: '2026-08-01', to: '2026-08-25' });
  assert.equal(result.resultados[0].ultimoMonto, 40.13);
});

test('propaga el mensaje seguro cuando la sincronizacion falla', async () => {
  const fetchImpl = async () => ({ ok: false, json: async () => ({ success: false, message: 'No fue posible actualizar ninguna agencia.' }) });
  await assert.rejects(
    () => forzarSyncInversion({ apiBase: '', token: 'abc', fetchImpl }),
    /No fue posible actualizar ninguna agencia/
  );
});