const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('monitoreo agrupa por la agencia asignada usando origen normalizado', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/redes.controller.js'), 'utf8');

  assert.match(controller, /canalAsignadoSql\('m\.agencia', 'w\.source'\)/);
  assert.match(controller, /LEFT JOIN LATERAL/);
  assert.match(controller, /normalizarOrigenSql\('lc\.origen'\)/);
});
