const test = require('node:test');
const assert = require('node:assert/strict');
const { resolverCanalInversion } = require('../src/shared/inversionRedes');

test('normaliza las tres claves técnicas WinTracker a sus agencias', () => {
  assert.equal(resolverCanalInversion('__WINTRACKER_ARTS__'), 'ARTS');
  assert.equal(resolverCanalInversion('__WINTRACKER_VIDIKA__'), 'VIDIKA');
  assert.equal(resolverCanalInversion('__WINTRACKER_VELSA__'), 'VELSA');
});
