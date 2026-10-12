const assert = require('node:assert/strict');
const { _test } = require('../src/controllers/comisiones.controller');
const { puedeAccederAdministracion } = require('../src/shared/accesoAdministracion');
const fs = require('node:fs');
assert.equal(_test.validarRangoOpcional('', ''), true);
assert.equal(_test.validarRangoOpcional('2026-10-01', '2026-10-12'), true);
assert.equal(_test.validarRangoOpcional('2026-10-31', '2026-10-01'), false);
assert.equal(_test.validarRangoOpcional('2026-10-01', ''), false);
const values = ['NOVONET', 'JOTFORM_NOVONET'];
assert.equal(_test.construirFiltrosFechas({ telcosDesde: '2026-10-01', telcosHasta: '2026-10-12' }, values).length, 1);
assert.deepEqual(values, ['NOVONET', 'JOTFORM_NOVONET', '2026-10-01', '2026-10-12']);
const fuente = fs.readFileSync(require.resolve('../src/controllers/comisiones.controller'), 'utf8');
assert.match(fuente, /FROM public\.envios_ventas e/);
assert.match(fuente, /e\.estatus_envio IS DISTINCT FROM 'BORRADOR'/);
assert.match(fuente, /to_jsonb\(e\)::text/);
assert.match(fuente, /ORDER BY ultima_fecha_ingreso_telcos DESC NULLS LAST/);
assert.equal(puedeAccederAdministracion('ADMINISTRADOR'), true);
assert.equal(puedeAccederAdministracion('gerencia'), true);
for (const p of ['GERENTE', 'GERENCIA COMERCIAL', 'GERENTE GENERAL', 'GERENCIA_FINANCIERA']) {
  assert.equal(puedeAccederAdministracion(p), true, p);
}
for (const p of ['SUPERVISOR','ATC','ANALISTA','USUARIO','ASESOR','']) assert.equal(puedeAccederAdministracion(p), false, p);
console.log('OK comisiones: envios_ventas, fechas independientes y acceso');
