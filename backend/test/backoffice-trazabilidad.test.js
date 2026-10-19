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
  assert.match(fuente, /SELECT \* FROM public\.envios_ventas[\s\S]*?WHERE id = \$1[\s\S]*?FOR UPDATE/);
  assert.match(fuente.match(/const CAMPOS_EDITABLES[\s\S]*?\]\);/)?.[0] || '', /'auditado_por'/);
});

test('la migración crea franja, estampa exacta e historial', () => {
  assert.match(migracion, /franja_horaria_agendamiento/);
  assert.match(migracion, /fecha_hora_regularizacion TIMESTAMPTZ/);
  assert.match(migracion, /hist_cambio_estatus JSONB/);
  assert.match(migracion, /fecha_auditoria DATE/);
  assert.match(migracion, /hora_auditoria TIME/);
});

test('el buscador global incluye teléfonos, login e identificadores presentes en la fila', () => {
  assert.match(fuente, /telf_celular_pin\s+ILIKE/);
  assert.match(fuente, /netlife_login\s+ILIKE/);
  assert.match(fuente, /numero_identificacion\s+ILIKE/);
});

test('las actualizaciones invalidan los tableros abiertos en tiempo real', () => {
  assert.match(fuente, /backoffice:registro-actualizado/);
});

test('solo una selección explícita de Estatus Netlife permite reafirmar el mismo estado', () => {
  assert.match(
    fuente,
    /campo === 'netlife_estatus_real'[\s\S]*?valorComparableHistorial\(campo, actual\[0\]\[campo\]\) !== valorComparableHistorial\(campo, valor\)/
  );
  assert.match(
    fuente,
    /reafirmacion: campo === 'netlife_estatus_real'[\s\S]*?valorComparableHistorial\(campo, actual\[0\]\[campo\]\) === valorComparableHistorial\(campo, valor\)/
  );
});

test('la galería registra altas, eliminaciones y reemplazos sin guardar rutas sensibles', () => {
  assert.match(fuente, /const CAMPOS_GALERIA = new Set/);
  assert.match(fuente, /\? 'AGREGADO'/);
  assert.match(fuente, /\? 'ELIMINADO' : 'REEMPLAZADO'/);
  assert.match(fuente, /anterior: teniaDocumento \? 'Documento cargado' : 'Sin documento'/);
});

test('el historial registra todos los campos editables solicitados por ATC', () => {
  assert.match(fuente, /const camposSolicitados = new Set\(Object\.keys\(payload\)\)/);
  assert.match(fuente, /camposSolicitados\.has\(campo\)/);
  assert.match(fuente, /const cambiosHistorial = Object\.entries\(payload\)/);
  assert.match(fuente, /campo === 'netlife_estatus_real'/);
});
