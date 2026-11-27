import test from 'node:test';
import assert from 'node:assert/strict';
import {
  construirUrlNegociacionBitrix,
  decidirDestinoLlamadaBitrix,
  esAplicacionWabot,
} from './bitrixCallRouting.js';

test('desde el APK abre la negociación seleccionada en Bitrix Mobile', () => {
  assert.deepEqual(
    decidirDestinoLlamadaBitrix({ esApk: true, empresa: 'NOVONET', dealId: '718509' }),
    {
      tipo: 'abrir_negociacion',
      url: 'https://novonet.bitrix24.es/crm/deal/details/718509/',
    },
  );
});

test('desde la web conserva el Automarcador', () => {
  assert.deepEqual(
    decidirDestinoLlamadaBitrix({ esApk: false, empresa: 'NOVONET', dealId: '718509' }),
    { tipo: 'automarcador' },
  );
});

test('rechaza una negociación ausente o inválida en el APK', () => {
  assert.equal(construirUrlNegociacionBitrix('NOVONET', ''), null);
  assert.equal(construirUrlNegociacionBitrix('NOVONET', '../718509'), null);
  assert.deepEqual(
    decidirDestinoLlamadaBitrix({ esApk: true, empresa: 'NOVONET', dealId: null }),
    { tipo: 'error', mensaje: 'Esta conversación no tiene una negociación de Bitrix asociada.' },
  );
});

test('construye el portal correspondiente a cada empresa soportada', () => {
  assert.equal(
    construirUrlNegociacionBitrix('VELSA', 123),
    'https://aclopecuador.bitrix24.es/crm/deal/details/123/',
  );
  assert.equal(construirUrlNegociacionBitrix('SEMILLERO', 123), null);
});

test('detecta exclusivamente la ejecución nativa de Capacitor', () => {
  assert.equal(esAplicacionWabot({ isNativePlatform: () => true }), true);
  assert.equal(esAplicacionWabot({ isNativePlatform: () => false }), false);
  assert.equal(esAplicacionWabot(undefined), false);
});
