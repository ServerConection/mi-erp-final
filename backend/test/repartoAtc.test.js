const test = require('node:test');
const assert = require('node:assert/strict');
const { esEtapaAtc, bloqueadoPorAtc } = require('../src/shared/repartoConteo');
const { parseTxt } = require('../src/shared/gestionablesCarga');

test('detecta etapas ATC', () => {
  for (const e of ['ATC', 'atc', 'ATC/SOPORTE', ' Atc Soporte ']) assert.equal(esEtapaAtc(e), true, e);
  for (const e of ['CONTACTO NUEVO', 'DESCARTE', 'DUPLICADO', '', null]) assert.equal(esEtapaAtc(e), false, String(e));
});

test('bloquea con % ATC >= máximo (50% por defecto)', () => {
  assert.equal(bloqueadoPorAtc({ total: 4, atc: 2, maxPct: 50 }), true);   // 50% → bloqueado
  assert.equal(bloqueadoPorAtc({ total: 4, atc: 1, maxPct: 50 }), false);  // 25%
  assert.equal(bloqueadoPorAtc({ total: 0, atc: 0, maxPct: 50 }), false);  // sin leads aún
  assert.equal(bloqueadoPorAtc({ total: 3, atc: 2, maxPct: undefined }), true); // default 50
  assert.equal(bloqueadoPorAtc({ total: 2, atc: 2, maxPct: 100 }), false); // 100 = sin límite
  assert.equal(bloqueadoPorAtc({ total: 10, atc: 3, maxPct: 30 }), true);
});

test('TXT acepta 4 o 5 columnas (% ATC opcional)', () => {
  const a = parseTxt('id;nombre_bitrix_asesor;gestionables_permitidos;fecha_carga\n1;ANA;4;2026-10-07\n');
  assert.equal(a[0].porcentaje_atc_max, undefined);
  const b = parseTxt('id;nombre_bitrix_asesor;gestionables_permitidos;fecha_carga;porcentaje_atc_max\n1;ANA;4;2026-10-07;40\n');
  assert.equal(b[0].porcentaje_atc_max, 40);
  assert.throws(() => parseTxt('id;nombre_bitrix_asesor;gestionables_permitidos;fecha_carga;porcentaje_atc_max\n1;ANA;4;2026-10-07;140\n'));
});
