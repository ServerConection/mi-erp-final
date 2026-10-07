const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePhone,
  sanitizeError,
  isAtcEntry,
} = require('../src/shared/atcNotificationUtils');
const templates = require('../src/shared/atcNotificationTemplates');

test('solo una entrada real a ATC dispara la automatización', () => {
  assert.equal(isAtcEntry('atc', 'contacto_nuevo'), true);
  assert.equal(isAtcEntry('atc', null), true);
  assert.equal(isAtcEntry('atc', 'atc'), false);
  assert.equal(isAtcEntry('venta_subida', 'atc'), false);
});

test('normaliza exclusivamente teléfonos móviles ecuatorianos válidos', () => {
  assert.equal(normalizePhone('098 765 4321'), '593987654321');
  assert.equal(normalizePhone('+593 98 765 4321'), '593987654321');
  assert.equal(normalizePhone('987654321'), '593987654321');
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizePhone(''), null);
});

test('las cinco plantillas ATC tienen claves únicas y contenido', () => {
  assert.equal(templates.length, 5);
  assert.equal(new Set(templates.map((item) => item.key)).size, 5);
  assert.equal(templates.every((item) => item.body.trim().length > 100), true);
});

test('los errores se limitan y no conservan saltos de línea', () => {
  const value = sanitizeError(new Error(`fallo\n${'x'.repeat(700)}`));
  assert.equal(value.includes('\n'), false);
  assert.equal(value.length, 500);
});
