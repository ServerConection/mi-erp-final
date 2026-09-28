const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ruta = path.join(__dirname, '../src/routes/backoffice.routes.js');
const fuente = fs.readFileSync(ruta, 'utf8');
const migracion = fs.readFileSync(
  path.join(__dirname, '../src/migrations/20260928_backoffice_agendamiento_auditoria.sql'),
  'utf8'
);

test('Backoffice filtra por fecha de agendamiento', () => {
  assert.match(fuente, /agendaDesde/);
  assert.match(fuente, /agendaHasta/);
  assert.match(fuente, /fechaCol\('fecha_agenda'\)/);
});

test('la auditoría se estampa en servidor y el historial se agrega automáticamente', () => {
  assert.match(fuente, /payload\.auditado_por = auditor/);
  assert.match(fuente, /payload\.fecha_regularizacion_atc = new Intl\.DateTimeFormat/);
  assert.match(fuente, /payload\.fecha_hora_regularizacion = new Date\(\)/);
  assert.match(fuente, /historial\.push\(\{/);
  assert.match(fuente, /SELECT \* FROM public\.envios_ventas WHERE id = \$1 FOR UPDATE/);
  assert.match(fuente.match(/const CAMPOS_EDITABLES[\s\S]*?\]\);/)?.[0] || '', /'auditado_por'/);
});

test('la migración crea franja, estampa exacta e historial', () => {
  assert.match(migracion, /franja_horaria_agendamiento/);
  assert.match(migracion, /fecha_hora_regularizacion TIMESTAMPTZ/);
  assert.match(migracion, /hist_cambio_estatus JSONB/);
});
