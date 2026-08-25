const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizarOrigen,
  resolverCanalOrigen,
  construirFiltroOrigenes,
  normalizarOrigenSql,
  canalOrigenSql,
  normalizarAgencia,
  canalAsignadoSql,
} = require('../src/shared/origenesRedes');

test('conserva un origen nuevo terminado en 9000 sin depender del catalogo', () => {
  const origen = '  WAZZUP: WhatsApp - API  963999000  ';

  assert.equal(normalizarOrigen(origen), 'WAZZUP: WHATSAPP - API 963999000');
  assert.equal(resolverCanalOrigen(origen), 'WAZZUP: WHATSAPP - API 963999000');
});

test('sin canales seleccionados no genera un filtro de origenes conocidos', () => {
  assert.deepEqual(construirFiltroOrigenes([], 2, 'origen'), { where: '', params: [] });
});

test('un origen historico conserva su agrupacion comercial', () => {
  assert.equal(resolverCanalOrigen('Formulario Landing 4'), 'VIDIKA GOOGLE');
});


test('genera SQL que colapsa espacios sin perder la barra del regex', () => {
  assert.equal(
    normalizarOrigenSql('w.source'),
    `UPPER(REGEXP_REPLACE(TRIM(w.source), '\\s+', ' ', 'g'))`
  );
});

test('el SQL conserva como canal cualquier origen nuevo no catalogado', () => {
  const sql = canalOrigenSql('w.source');
  assert.match(sql, /WHEN 'FORMULARIO LANDING 4' THEN 'VIDIKA GOOGLE'/);
  assert.match(sql, /ELSE UPPER\(REGEXP_REPLACE/);
});
test('normaliza el alias ARST usado en el catalogo como ARTS', () => {
  assert.equal(normalizarAgencia(' arst '), 'ARTS');
  assert.equal(normalizarAgencia('VIDIKA'), 'VIDIKA');
});

test('la asignacion guardada tiene prioridad sobre el catalogo historico', () => {
  const sql = canalAsignadoSql('m.agencia', 'w.source');
  assert.match(sql, /COALESCE/);
  assert.match(sql, /m\.agencia/);
  assert.match(sql, /THEN 'ARTS'/);
  assert.match(sql, /FORMULARIO LANDING 4/);
});