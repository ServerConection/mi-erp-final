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
assert.match(fuente, /SELECT MAX\(.+\) AS codigo_asesor, .+ AS usuario/s);
assert.doesNotMatch(fuente, /GROUP BY \$\{codigo\}, \$\{usuario\}/);
assert.match(fuente, /ORDER BY activas_regularizadas DESC, activas_totales DESC/);
assert.doesNotMatch(fuente, /ORDER BY ultima_fecha_ingreso_telcos DESC/);
assert.equal(puedeAccederAdministracion('ADMINISTRADOR'), true);
assert.equal(puedeAccederAdministracion('gerencia'), true);
for (const p of ['GERENTE', 'GERENCIA COMERCIAL', 'GERENTE GENERAL', 'GERENCIA_FINANCIERA']) {
  assert.equal(puedeAccederAdministracion(p), true, p);
}
for (const p of ['SUPERVISOR','ATC','ANALISTA','USUARIO','ASESOR','']) assert.equal(puedeAccederAdministracion(p), false, p);
console.log('OK comisiones: envios_ventas, fechas independientes y acceso');

// ── Catálogo y cálculo de valores ──
assert.equal(_test.contarServicios(''), 0);
assert.equal(_test.contarServicios(null), 0);
assert.equal(_test.contarServicios('Netlife Play'), 1);
assert.equal(_test.contarServicios('Netlife Play + Paramount'), 2);
assert.equal(_test.contarServicios('A + B + C'), 3);
assert.equal(_test.mesValido('2026-10'), true);
assert.equal(_test.mesValido('2026-13'), false);
const fila = _test.normalizarFilaCatalogo({ tipo: 'Tercera Edad', velocidad: '750', servicios: 'Netlife Play + Paramount', com_t1: '14,60', com_t2: 15.8 });
assert.deepEqual([fila.tipo, fila.velocidad, fila.n_servicios, fila.com_t1, fila.com_t2], ['TERCERA EDAD', 750, 2, 14.6, 15.8]);
assert.equal(_test.normalizarFilaCatalogo({ tipo: 'HOME', velocidad: 150, com_t1: '' }), null);
assert.equal(_test.normalizarFilaCatalogo({ tipo: 'OTRO', velocidad: 150, com_t1: 3 }), null);
assert.match(fuente, /AS valor_total/);
assert.match(fuente, /FILTER \(WHERE v\.reg = 'REGULARIZADO'\), 0\), 2\)::float AS valor_disponible/);
assert.match(fuente, /MAX\(com_t1\) AS com/);
console.log('OK comisiones: catalogo, total y disponible');
