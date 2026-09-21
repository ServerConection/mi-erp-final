const test = require('node:test');
const assert = require('node:assert/strict');
const { construirListado } = require('../src/nexoIa/nexoIa.listado');

test('lista todos desde el 15 de agosto y ordena por actividad descendente', () => {
  const { texto, parametros } = construirListado({ empresa: 'NOVONET' });
  assert.match(texto, /l\.fecha_creacion>=DATE '2026-08-15'/);
  assert.match(texto, /GREATEST\(l\.ultimo_mensaje_cliente_at,l\.ultimo_mensaje_asesor_at,l\.fecha_creacion\) ultima_actividad/);
  assert.match(texto, /ORDER BY GREATEST\(l\.ultimo_mensaje_cliente_at,l\.ultimo_mensaje_asesor_at,l\.fecha_creacion\) DESC/);
  assert.doesNotMatch(texto, /LIMIT 200/);
  assert.deepEqual(parametros, ['NOVONET']);
});

test('filtra un dia exacto por fecha de creacion en Ecuador', () => {
  const { texto, parametros } = construirListado({ empresa: 'NOVONET', fechaCreacion: '2026-08-31' });
  assert.match(texto, /l\.fecha_creacion AT TIME ZONE 'America\/Guayaquil'/);
  assert.match(texto, /::date=\$2::date/);
  assert.deepEqual(parametros, ['NOVONET', '2026-08-31']);
});

test('rechaza fechas de filtro invalidas', () => {
  assert.throws(
    () => construirListado({ empresa: 'NOVONET', fechaCreacion: '31-08-2026' }),
    /Fecha invalida/,
  );
});
