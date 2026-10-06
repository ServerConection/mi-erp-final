const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { esEtapaVentaSubida } = require('../src/shared/bitrixEtapas');

test('validar venta acepta el slug venta_subida almacenado por el webhook', () => {
  assert.equal(esEtapaVentaSubida({ etapa: 'venta_subida' }), true);
});

test('validar venta acepta el nombre visible de Bitrix', () => {
  assert.equal(esEtapaVentaSubida({ etapa_bitrix: ' VENTA SUBIDA ' }), true);
});

test('validar venta no acepta otra etapa', () => {
  assert.equal(esEtapaVentaSubida({ etapa: 'gestion_diaria' }), false);
});

test('la consulta de validacion usa la empresa autenticada y no fija Novonet', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'bitrix.routes.js'),
    'utf8'
  );

  assert.match(source, /empresaUsuario \|\| 'NOVONET'/);
  assert.match(source, /\[idBitrix, empresaUsuario \|\| 'NOVONET'\]/);
  assert.doesNotMatch(source, /= 'novonet'\s*\n\s*ORDER BY/i);
});
