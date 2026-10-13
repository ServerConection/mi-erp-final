const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fuente = fs.readFileSync(
  path.join(__dirname, '../src/controllers/reporteDetalle.controller.js'),
  'utf8',
);

test('Reporte Detalle Semillero usa únicamente leads de la empresa Semillero', () => {
  assert.match(fuente, /semillero:\s*`[\s\S]*?FROM public\.bitrix_webhook_leads w/);
  assert.match(fuente, /LOWER\(BTRIM\(w\.empresa\)\) = 'semillero'/);
  assert.match(fuente, /extraWhere:\s*`LOWER\(BTRIM\(w\.empresa\)\) = 'semillero'`/);
});

