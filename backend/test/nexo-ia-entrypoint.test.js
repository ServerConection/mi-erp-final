const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('el proceso de workers inicia NEXO IA en la arquitectura desplegada', () => {
  const entrypoint = fs.readFileSync(path.join(__dirname, '../src/entries/workers.js'), 'utf8');
  assert.match(entrypoint, /require\('\.\.\/jobs\/nexoIa\.cron'\)/);
  assert.match(entrypoint, /initNexoIa\(\)/);
});
