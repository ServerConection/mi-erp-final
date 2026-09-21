const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseTxt, fechaValida } = require('../src/shared/gestionablesCarga');
const header = 'id;nombre_bitrix_asesor;gestionables_permitidos;fecha_carga';
test('acepta cero, UTF-8 BOM y TXT exportado desde Excel con tabulaciones', () => {
  const result = parseTxt(`\uFEFF${header.replaceAll(';', '\t')}\r\n3002\tBRIAN PINEDA\t0\t2026-09-17\r\n`);
  assert.equal(result[0].id, 3002);
  assert.equal(result[0].gestionables_permitidos, 0);
});
test('rechaza fechas inexistentes, cuotas negativas y IDs repetidos', () => {
  assert.equal(fechaValida('2026-02-30'), false);
  assert.throws(() => parseTxt(`${header}\n3002;BRIAN;4;2026-02-30`));
  assert.throws(() => parseTxt(`${header}\n3002;BRIAN;-1;2026-09-17`));
  assert.throws(() => parseTxt(`${header}\n3002;BRIAN;4;2026-09-17\n3002;ANA;3;2026-09-17`));
});
test('rechaza asesor duplicado para la misma fecha incluso con diferente ID', () => {
  assert.throws(() => parseTxt(`${header}\n3002;Brian;4;2026-09-17\n3003;BRIAN;3;2026-09-17`));
});
