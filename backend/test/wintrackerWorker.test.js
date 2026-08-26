const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('workers inicializa WinTracker y el cron corre cada 15 minutos', () => {
  const workers = fs.readFileSync(path.join(__dirname, '../src/entries/workers.js'), 'utf8');
  const cron = fs.readFileSync(path.join(__dirname, '../src/jobs/syncWinTracker.cron.js'), 'utf8');

  assert.match(workers, /initWinTrackerSync/);
  assert.match(workers, /initWinTrackerSync\(\)/);
  assert.match(cron, /cron\.schedule\('\*\/15 \* \* \* \*'/);
});
