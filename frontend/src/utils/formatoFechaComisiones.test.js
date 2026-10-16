import assert from 'node:assert/strict';
import { formatearFechaTelcos } from './formatoFechaComisiones.js';

assert.equal(formatearFechaTelcos('2026-10-12'), '12/10/2026');
assert.equal(formatearFechaTelcos('2026-10-12T00:00:00.000Z'), '12/10/2026');
assert.equal(formatearFechaTelcos(new Date('2026-10-12T00:00:00.000Z')), '12/10/2026');
assert.equal(formatearFechaTelcos(null), 'Sin fecha');
assert.equal(formatearFechaTelcos('valor inesperado'), 'Sin fecha');
console.log('OK formato fecha Comisiones');
