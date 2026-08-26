const test = require('node:test');
const assert = require('node:assert/strict');
const { crearAseguradorInversion } = require('../src/services/inversionFreshness.service');

test('sincroniza cuando la inversión está vencida', async () => {
  let syncs = 0;
  const db = { query: async () => ({ rows: [{ ultima: new Date('2026-08-25T10:00:00Z') }] }) };
  const asegurar = crearAseguradorInversion({ db, sync: async () => { syncs++; }, now: () => new Date('2026-08-25T11:00:00Z'), maxAgeMs: 20 * 60_000 });
  await asegurar();
  assert.equal(syncs, 1);
});

test('no sincroniza cuando la inversión está reciente', async () => {
  let syncs = 0;
  const db = { query: async () => ({ rows: [{ ultima: new Date('2026-08-25T10:50:00Z') }] }) };
  const asegurar = crearAseguradorInversion({ db, sync: async () => { syncs++; }, now: () => new Date('2026-08-25T11:00:00Z'), maxAgeMs: 20 * 60_000 });
  await asegurar();
  assert.equal(syncs, 0);
});

test('comparte una sola sincronización entre solicitudes concurrentes', async () => {
  let syncs = 0;
  let liberar;
  const db = { query: async () => ({ rows: [{ ultima: null }] }) };
  const sync = () => { syncs++; return new Promise(resolve => { liberar = resolve; }); };
  const asegurar = crearAseguradorInversion({ db, sync });
  const a = asegurar(); const b = asegurar();
  await new Promise(resolve => setImmediate(resolve));
  liberar(); await Promise.all([a, b]);
  assert.equal(syncs, 1);
});
