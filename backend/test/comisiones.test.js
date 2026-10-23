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
assert.doesNotMatch(fuente, /GROUP BY \$\{codigo\}, \$\{usuario\}/);
assert.match(fuente, /b\.activas_regularizadas - a\.activas_regularizadas/);
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
assert.match(fuente, /MAX\(com_t1\) AS t1, MAX\(com_t2\) AS t2/);
assert.match(fuente, /GROUP BY tipo, velocidad\b/);
console.log('OK comisiones: catalogo por tipo + velocidad');

// ── Modelo de pago del Excel (oct-2026) ──
assert.equal(_test.categoriaDesdeTexto('Suma a Tabla'), 'TABLA');
assert.equal(_test.categoriaDesdeTexto('Comision '), 'COMISION');
assert.equal(_test.categoriaDesdeTexto('No vender'), 'NO_VENDER');
assert.equal(_test.categoriaDesdeTexto('Suma a Tabla pero  si llega a mas de 35 activas salen a comision'), 'PYME');
assert.equal(_test.categoriaDesdeTexto(''), null);
assert.equal(_test.normalizarFilaCatalogo({ tipo: 'HOME', velocidad: 850, com_t1: 14.899, com_t2: 16.461, categoria: 'Suma a Tabla' }).categoria, 'TABLA');
const venta = (n, t1, t2, categoria = 'TABLA', reg = 'REGULARIZADO') => Array.from({ length: n }, () => ({ usuario: 'a', reg, t1, t2, categoria }));
const uno = (vs) => _test.calcularAsesores(vs)[0];
// menos de 35: tabla "hasta 40" por venta
assert.equal(uno(venta(10, 14.899, 16.461)).valor_disponible, 148.99);
// 36 ventas a tabla nunca cobran menos que el asegurado de $550
assert.equal(uno(venta(36, 14.899, 16.461)).valor_disponible, 550);
assert.equal(uno(venta(36, 14.899, 16.461)).asegurado_aplicado, true);
// 41 o más: tabla "desde 41"
assert.equal(uno(venta(41, 14.899, 16.461)).valor_disponible, 674.9);
assert.equal(uno(venta(41, 14.899, 16.461)).tramo, 'DESDE 41');
// los planes de comisión no cuentan para llegar a 35
const r34 = uno([...venta(34, 14.899, 16.461), ...venta(1, 10.091, 10.291, 'COMISION')]);
assert.equal(r34.ventas_tabla, 34);
assert.equal(r34.asegurado_aplicado, false);
assert.equal(r34.valor_disponible, 516.66);
// solo REGULARIZADO se paga; NO REQUIERE y POR REGULARIZAR quedan fuera del disponible
const mix = uno([...venta(2, 10, 11), ...venta(1, 10, 11, 'TABLA', 'NOREQUIEREREGULARIZAR'), ...venta(1, 10, 11, 'TABLA', 'PORREGULARIZAR')]);
assert.deepEqual([mix.activas_regularizadas, mix.activas_por_regularizar, mix.valor_disponible, mix.valor_total], [2, 2, 20, 40]);
// sin tarifa suma 0 y se cuenta en sin_valor
assert.equal(uno(venta(1, null, null, null)).sin_valor, 1);
console.log('OK comisiones: tramos, asegurado, comision directa y solo regularizado');
