/**
 * La tabla "DETALLE BASE JOTFORM (NETLIFE)" — y su Excel — debe tener LAS
 * MISMAS COLUMNAS, en el MISMO ORDEN, en Novonet y en Velsa. Si no, las dos
 * descargas no se pueden comparar ni pegar una debajo de la otra.
 *
 * El frontend arma las columnas con las claves que devuelve el SELECT, asi que
 * la prueba lee los alias directamente del SQL de cada controlador. No necesita
 * base de datos.
 *
 * Se ejecuta con:  node backend/test/detalleJotform.columnas.test.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function columnasDelSelect(archivo, inicio, fin) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'src', 'controllers', archivo), 'utf8');
  const desde = sql.indexOf(inicio);
  assert.ok(desde !== -1, `no se encontró "${inicio}" en ${archivo}`);
  const hasta = sql.indexOf(fin, desde);
  assert.ok(hasta !== -1, `no se encontró "${fin}" en ${archivo}`);
  return [...sql.slice(desde, hasta).matchAll(/AS "([^"]+)"/g)].map((m) => m[1]);
}

// 2026-10-06: las dos tablas leen de envios_ventas y arman sus columnas con
// el MISMO helper (shared/detalleJotformEnviosVentas.js), así que por
// construcción salen iguales. Se valida que ambos controladores lo usen.
const { columnasDetalleJotform, fuenteDetalleJotform } =
  require('../src/shared/detalleJotformEnviosVentas');

for (const [archivo, empresa, alias] of [
  ['indicadores.controller.js', 'novonet', 'mb'],
  ['indicadoresVelsaMaterialized.controller.js', 'velsa', 'mv'],
]) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'controllers', archivo), 'utf8');
  assert.ok(src.includes(`fuenteDetalleJotform('${empresa}', '${alias}')`),
    `${archivo} no lee el detalle desde envios_ventas`);
  assert.ok(src.includes(`columnasDetalleJotform('${alias}'`),
    `${archivo} no usa las columnas compartidas`);
}
console.log('✓ Novonet y Velsa leen el detalle directo de envios_ventas');

const sqlCols = columnasDetalleJotform('mb', { asesorExpr: 'x', supervisorExpr: 'y' });
const novonet = [...sqlCols.matchAll(/AS "([^"]+)"/g)].map((m) => m[1]);

const ESPERADAS = [
  'ID_CRM', 'ID_JOT', 'ETAPA_BITRIX', 'FECHA_CREACION_BITRIX', 'ASESOR_RESPONSABLE_BITRIX',
  'SUPERVISOR_ASIGNADO', 'ORIGEN', 'FECHA_CREACION_JOTFORM', 'CODIGO_ASESOR_JOTFORM',
  'ASESOR_USUARIO', 'LOGIN', 'ESTADO_NETLIFE', 'INGRESO_TELCOS', 'FECHA_ACTIVACION',
  'ESTADO_REGULARIZACION', 'OBSERV_REGULARIZACION', 'NOVEDADES_ATC', 'TIPO_PLAN', 'VELOCIDAD',
  'EMPAQUETADO', 'SERVICIO_ADICIONAL_FACTURADO', 'FORMA_PAGO', 'APLICA_DESCUENTO',
  'FECHA_AGENDA', 'OBSERVACION_VENTA',
];
assert.deepStrictEqual(novonet, ESPERADAS, `Columnas distintas a las pedidas:\n  ${novonet.join(', ')}`);
console.log(`✓ Las ${novonet.length} columnas pedidas, en el orden pedido`);

for (const emp of ['novonet', 'velsa']) {
  const f = fuenteDetalleJotform(emp, 'mb');
  assert.ok(f.includes('FROM public.envios_ventas e'), 'la fuente debe ser envios_ventas');
  assert.ok(!/mestra_bitrix|mv_indicadores|vista_analisis|vw_/i.test(f), 'la fuente no debe usar vistas');
}
console.log('✓ La fuente no usa vistas');

// Un nombre con espacio rompe cualquier cruce posterior en Excel.
for (const col of novonet) {
  assert.ok(!/\s/.test(col), `la columna "${col}" tiene espacios en el nombre`);
}
console.log('✓ Ningún nombre de columna tiene espacios');

console.log('\nTODO OK');
