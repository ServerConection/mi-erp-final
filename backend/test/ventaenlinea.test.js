const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const leer = (archivo) => fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8');

test('Ventaenlinea usa exclusivamente la categoría 61 de Bitrix', () => {
  const fuente = leer('src/routes/ventaenlinea.routes.js');
  assert.match(fuente, /CATEGORIA_VENTAENLINEA = '61'/);
  assert.match(fuente, /empresa: 'ventaenlinea'/);
  assert.match(fuente, /filtrarPorCategoria: true/);
  assert.match(fuente, /depurarCategoria: true/);
  assert.match(fuente, /'VENTAENLINEA'::text AS "DISTRIBUIDOR"/);
});

test('Ventaenlinea está montado y disponible en reporte detalle', () => {
  assert.match(leer('src/app.js'), /\/api\/ventaenlinea/);
  assert.match(leer('src/entries/core.js'), /\/api\/ventaenlinea/);
  const reporte = leer('src/controllers/reporteDetalle.controller.js');
  assert.match(reporte, /CUBO_SQL\.ventaenlinea/);
  assert.match(reporte, /categoria_id, ''\)\) = '61'/);
});
