const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fuente = fs.readFileSync(
  path.join(__dirname, '../src/routes/backoffice.routes.js'),
  'utf8',
);

test('Backoffice permite ADMINISTRADOR y ATC, pero bloquea ANALISTA', () => {
  const bloque = fuente.match(/const PERFILES_BACKOFFICE = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
  assert.match(bloque, /'ADMINISTRADOR'/);
  assert.match(bloque, /'ATC'/);
  assert.doesNotMatch(bloque, /'ANALISTA'/);
});

