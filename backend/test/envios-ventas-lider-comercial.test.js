const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ruta = path.join(__dirname, '../src/routes/envios-ventas.routes.js');
const fuente = fs.readFileSync(ruta, 'utf8');

test('las ventas asignan el líder comercial desde el distribuidor en el servidor', () => {
  assert.match(fuente, /NOVONET: 'DANIELA'/);
  assert.match(fuente, /VELSA: 'ANGÉLICA'/);
  assert.equal((fuente.match(/asignarLiderComercial\(b\);/g) || []).length, 2);
});

test('lider_comercial forma parte del INSERT y UPDATE de envios_ventas', () => {
  assert.match(fuente.match(/const COLUMNAS_VENTA[\s\S]*?\];/)?.[0] || '', /'lider_comercial'/);
});
