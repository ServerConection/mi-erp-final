const test = require('node:test');
const assert = require('node:assert/strict');
const { construirListado, construirListadoWabot } = require('../src/nexoIa/nexoIa.listado');

test('lista todos desde el 15 de agosto y ordena por actividad descendente', () => {
  const { texto, parametros } = construirListado({ empresa: 'NOVONET' });
  assert.match(texto, /l\.fecha_creacion>=DATE '2026-08-15'/);
  assert.match(texto, /GREATEST\(l\.ultimo_mensaje_cliente_at,l\.ultimo_mensaje_asesor_at,l\.fecha_creacion\) ultima_actividad/);
  assert.match(texto, /ORDER BY GREATEST\(l\.ultimo_mensaje_cliente_at,l\.ultimo_mensaje_asesor_at,l\.fecha_creacion\) DESC/);
  assert.match(texto, /LIMIT 100 OFFSET 0/);
  assert.deepEqual(parametros, ['NOVONET']);
});

test('pagina el listado con limites seguros', () => {
  const consulta = construirListado({ empresa: 'NOVONET', pagina: 3, limite: 100 });
  assert.match(consulta.texto, /LIMIT 100 OFFSET 200/);
  assert.match(consulta.textoTotal, /COUNT\(\*\)::int total/);
  assert.equal(consulta.pagina, 3);
  assert.equal(consulta.limite, 100);
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

test('VELSA lista conversaciones reales de WABOT vinculadas a Bitrix', () => {
  const consulta = construirListadoWabot({ empresa: 'VELSA', pagina: 1, limite: 100 });
  assert.match(consulta.texto, /FROM conversations c/);
  assert.match(consulta.texto, /JOIN usuarios u ON u\.id=ln\.created_by/);
  assert.match(consulta.texto, /c\.bitrix_deal_id IS NOT NULL/);
  assert.match(consulta.textoTotal, /COUNT\(DISTINCT c\.bitrix_deal_id\)/);
  assert.deepEqual(consulta.parametros, ['VELSA']);
});
