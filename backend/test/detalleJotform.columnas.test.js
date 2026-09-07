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

const novonet = columnasDelSelect(
  'indicadores.controller.js', 'const queryJotform = `', 'FROM mestra_bitrix mb'
);
const velsa = columnasDelSelect(
  'indicadoresVelsaMaterialized.controller.js', 'const qNetlife = `',
  'FROM public.mv_indicadores_velsa_completo mv'
);

assert.deepStrictEqual(
  novonet, velsa,
  `Las columnas del detalle Jotform ya no coinciden.\n  Novonet: ${novonet.join(', ')}\n  Velsa:   ${velsa.join(', ')}`
);
console.log(`✓ Novonet y Velsa muestran las mismas ${novonet.length} columnas, en el mismo orden`);

// Lo que pidió operación explícitamente.
for (const obligatoria of ['COD_ASESOR_JOT', 'ASESOR', 'SUPERVISOR_ASIGNADO', 'PLAN_CASA',
                           'PLAN_PYME', 'PLAN_PROFESIONAL', 'PLAN_HOGAR_ADULTO_MAYOR',
                           'PLAN_PYME_CORP', 'PLAN_CENTRO_RED_COMERCIAL']) {
  assert.ok(novonet.includes(obligatoria), `falta la columna ${obligatoria}`);
}
console.log('✓ Están el código de asesor y las seis columnas de planes');

// Un nombre con espacio rompe cualquier cruce posterior en Excel.
for (const col of novonet) {
  assert.ok(!/\s/.test(col), `la columna "${col}" tiene espacios en el nombre`);
}
console.log('✓ Ningún nombre de columna tiene espacios');

console.log('\nTODO OK');
