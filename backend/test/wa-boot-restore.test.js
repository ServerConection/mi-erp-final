const test = require('node:test');
const assert = require('node:assert/strict');
const { restoreLines } = require('../src/services/waBootRestore');

test('restores all lines with bounded concurrency and continues after failure', async () => {
  let active = 0, peak = 0;
  const errors = [], seen = [], pauses = [];
  const result = await restoreLines([1, 2, 3, 4, 5], {
    shouldStop: () => false,
    connect: async line => {
      active++; peak = Math.max(peak, active); seen.push(line);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      if (line === 2) throw Error('proxy failed');
    },
    onError: line => errors.push(line),
    sleep: async ms => pauses.push(ms),
  });
  assert.equal(peak, 2);
  assert.deepEqual(seen, [1, 2, 3, 4, 5]);
  assert.deepEqual(errors, [2]);
  assert.deepEqual(result, { started: 4, failed: 1 });
  assert.ok(pauses.every(ms => ms === 1000));
});

test('shutdown prevents queued lines from starting', async () => {
  let stopped = false;
  const seen = [];
  await restoreLines([1, 2, 3], {
    concurrency: 1, shouldStop: () => stopped,
    connect: async line => { seen.push(line); stopped = true; },
    onError: () => assert.fail(), sleep: async () => assert.fail(),
  });
  assert.deepEqual(seen, [1]);
});

test('version lookup shares concurrent requests and retries after failure', async () => {
  const path = require('node:path');
  const dbPath = path.resolve(__dirname, '../src/config/db.js');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
  const baileysPath = require.resolve('@whiskeysockets/baileys');
  const baileys = require(baileysPath);
  let calls = 0;
  require.cache[baileysPath].exports = { ...baileys,
    fetchLatestBaileysVersion: async () => {
      calls++;
      if (calls === 1) throw Error('network unavailable');
      return { version: [2, 3000, 1] };
    } };
  try {
    const Manager = require('../src/services/BaileysManager');
    const bm = new Manager({ emit() {} });
    const first = bm._getBaileysVersion();
    assert.equal(bm._getBaileysVersion(), first);
    await assert.rejects(first, /network unavailable/);
    const values = await Promise.all([bm._getBaileysVersion(), bm._getBaileysVersion()]);
    assert.deepEqual(values[0].version, [2, 3000, 1]);
    await bm._getBaileysVersion();
    assert.equal(calls, 2);
  } finally {
    require.cache[baileysPath].exports = baileys;
    delete require.cache[dbPath];
  }
});
