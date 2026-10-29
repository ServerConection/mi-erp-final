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
assert.equal(puedeAccederAdministracion('administrador'), true);
for (const p of ['gerencia', 'GERENTE', 'GERENCIA COMERCIAL', 'GERENTE GENERAL', 'GERENCIA_FINANCIERA', 'SUPERVISOR','ATC','ANALISTA','USUARIO','ASESOR','']) assert.equal(puedeAccederAdministracion(p), false, p);
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
// 36 ventas: $550 del asegurado + la venta 36 a tabla "hasta 41"
assert.equal(uno(venta(36, 14.899, 16.461)).valor_disponible, 564.9);
assert.equal(uno(venta(36, 14.899, 16.461)).asegurado_aplicado, true);
// $550 + ventas 36-41 a "hasta 41" + desde la 42 a "42 en adelante"
assert.equal(uno(venta(41, 14.899, 16.461)).valor_disponible, 639.39);
assert.equal(uno(venta(45, 14.899, 16.461)).valor_disponible, 705.24);
assert.equal(uno(venta(42, 14.899, 16.461)).tramo, 'DESDE 42');
assert.equal(uno(venta(41, 14.899, 16.461)).tramo, 'HASTA 41');
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

// ── Rol de pagos ──
const filaRol = { usuario: 'lcarlosama', nombre_asesor: 'L', codigo_asesor: '4481', activas_regularizadas: 26, activas_totales: 36, tramo: 'HASTA 40', asegurado_aplicado: false, valor_disponible: 365.47 };
const rol1 = _test.armarRol(filaRol, {});
const c1 = (k) => rol1.conceptos.find((c) => c.clave === k).valor;
assert.deepEqual([c1('asegurado'), c1('comision_total'), c1('asegurado_pagado'), c1('anticipo_40'), c1('plan_celular')], [0, 365.47, 0, 146.19, 8.4]);
assert.equal(rol1.total_ingresos, 365.47);
assert.equal(rol1.total_descuentos, 154.59);
assert.equal(rol1.valor_a_pagar, 210.88);
const rol2 = _test.armarRol({ ...filaRol, asegurado_aplicado: true, valor_disponible: 550 }, { bono_tc: 56.58, plan_celular: 0, atrasos: 1 });
const c2 = (k) => rol2.conceptos.find((c) => c.clave === k);
assert.equal(c2('asegurado').valor, 550);
assert.equal(c2('asegurado_pagado').valor, 550);
assert.equal(c2('plan_celular').ajustado, true);
assert.equal(rol2.valor_a_pagar, 385.58);
console.log('OK comisiones: rol de pagos');

// ── Fase 2: No vender, tope 3ra edad, PYME como bono, bono volumen ──
const vt = (n, t1, categoria = 'TABLA', tipo = 'HOME', fecha = '2026-10-01') => Array.from({ length: n }, (_, i) => ({ usuario: 'b', reg: 'REGULARIZADO', t1, t2: t1, categoria, tipo, fecha_activacion: `${fecha.slice(0, 8)}${String(i + 1).padStart(2, '0')}` }));
const f2 = (vs) => _test.calcularAsesores(vs)[0];
// No vender: se paga por comisión pero no cuenta como venta
const nv = f2([...vt(10, 10), ...vt(2, 6.45, 'NO_VENDER', 'TERCERA EDAD')]);
assert.deepEqual([nv.ventas_tabla, nv.ventas_volumen, nv.valor_disponible], [10, 10, 112.9]);
// Tope 15% tercera edad: 20 ventas → solo 3 de 3ra edad se pagan; las 2 más recientes no
const te = f2([...vt(15, 10), ...vt(5, 10, 'TABLA', 'TERCERA EDAD')]);
assert.deepEqual([te.te_ventas, te.te_excedentes, te.ventas_tabla, te.valor_disponible], [5, 2, 18, 180]);
// PYME: 35 sin PYME → las PYME se pagan aparte como bono
const py = f2([...vt(35, 14.899), ...vt(2, 18.35, 'PYME', 'PYME')]);
assert.deepEqual([py.ventas_tabla, py.asegurado_aplicado, py.pyme_como_bono, py.valor_pyme_bono, py.valor_disponible], [35, true, true, 36.7, 586.7]);
// PYME: 34 sin PYME → las PYME suman a tabla (36) y aplica asegurado
const py2 = f2([...vt(34, 14.899), ...vt(2, 18.35, 'PYME', 'PYME')]);
assert.deepEqual([py2.ventas_tabla, py2.pyme_como_bono, py2.valor_disponible], [36, false, 564.9]);
// Bono al volumen
assert.equal(f2(vt(39, 10)).bono_volumen, 0);
assert.equal(f2(vt(40, 10)).bono_volumen, 40);
assert.equal(f2(vt(55, 10)).bono_volumen, 60);
assert.equal(f2(vt(60, 10)).bono_volumen, 80);
// El rol toma el bono como Incentivos automático
const rolB = _test.armarRol({ ...filaRol, bono_volumen: 60 }, {});
assert.equal(rolB.conceptos.find((c) => c.clave === 'incentivos').valor, 60);
console.log('OK comisiones: fase 2 (no vender, tope 3ra edad, PYME bono, bono volumen)');
