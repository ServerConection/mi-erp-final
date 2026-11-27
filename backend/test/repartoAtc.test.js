const test = require('node:test');
const assert = require('node:assert/strict');
const { esEtapaAtc, bloqueadoPorAtc } = require('../src/shared/repartoConteo');
const { parseTxt } = require('../src/shared/gestionablesCarga');

test('detecta etapas ATC', () => {
  for (const e of ['ATC', 'atc', 'ATC/SOPORTE', ' Atc Soporte ']) assert.equal(esEtapaAtc(e), true, e);
  for (const e of ['CONTACTO NUEVO', 'DESCARTE', 'DUPLICADO', '', null]) assert.equal(esEtapaAtc(e), false, String(e));
});

test('bloquea con % ATC >= máximo (50% por defecto)', () => {
  // Tope de ATC = % de sus permitidos (10 permitidos, 50% → 5 ATC)
  assert.equal(bloqueadoPorAtc({ permitidos: 10, atc: 5, maxPct: 50 }), true);
  assert.equal(bloqueadoPorAtc({ permitidos: 10, atc: 4, maxPct: 50 }), false);
  assert.equal(bloqueadoPorAtc({ permitidos: 7, atc: 3, maxPct: 50 }), false);  // tope 3.5
  assert.equal(bloqueadoPorAtc({ permitidos: 7, atc: 4, maxPct: 50 }), true);
  assert.equal(bloqueadoPorAtc({ permitidos: 10, atc: 5, maxPct: undefined }), true); // default 50
  assert.equal(bloqueadoPorAtc({ permitidos: 10, atc: 10, maxPct: 100 }), false); // 100 = sin límite
  assert.equal(bloqueadoPorAtc({ permitidos: 0, atc: 0, maxPct: 50 }), false);
  assert.equal(bloqueadoPorAtc({ permitidos: 10, atc: 3, maxPct: 30 }), true);
});

test('TXT acepta 4 o 5 columnas (% ATC opcional)', () => {
  const a = parseTxt('id;nombre_bitrix_asesor;gestionables_permitidos;fecha_carga\n1;ANA;4;2026-10-07\n');
  assert.equal(a[0].porcentaje_atc_max, undefined);
  const b = parseTxt('id;nombre_bitrix_asesor;gestionables_permitidos;fecha_carga;porcentaje_atc_max\n1;ANA;4;2026-10-07;40\n');
  assert.equal(b[0].porcentaje_atc_max, 40);
  assert.throws(() => parseTxt('id;nombre_bitrix_asesor;gestionables_permitidos;fecha_carga;porcentaje_atc_max\n1;ANA;4;2026-10-07;140\n'));
});

test('efectividad: meta Jotform 50% y tope gestionable 45%', () => {
  const { bloqueadoPorEfectividad, esVentaSubida, metaVentaSubida, topeGestionables } = require('../src/shared/repartoConteo');
  assert.equal(metaVentaSubida(10), 5);
  assert.equal(metaVentaSubida(7), 4);
  assert.equal(metaVentaSubida(5), 3);
  assert.equal(metaVentaSubida(0), 0);
  assert.equal(bloqueadoPorEfectividad({ gestionables: 10, vencidos: 5, venta: 4 }), true);
  assert.equal(bloqueadoPorEfectividad({ gestionables: 10, vencidos: 4, venta: 0 }), false);
  assert.equal(bloqueadoPorEfectividad({ gestionables: 10, vencidos: 5, venta: 5 }), false);
  assert.equal(bloqueadoPorEfectividad({ gestionables: 7, vencidos: 4, venta: 3 }), true);
  assert.equal(bloqueadoPorEfectividad({ gestionables: 5, vencidos: 3, venta: 2 }), true);
  assert.equal(bloqueadoPorEfectividad({ gestionables: 5, vencidos: 3, venta: 3 }), false);
  assert.equal(bloqueadoPorEfectividad({ gestionables: 0, vencidos: 0 }), false);
  assert.equal(topeGestionables(10), 4);
  assert.equal(topeGestionables(20), 9);
  assert.equal(esVentaSubida('Venta Subida'), true);
  assert.equal(esVentaSubida('VENTA_SUBIDA'), true);
  assert.equal(esVentaSubida('Venta por otra pauta de la empresa'), false);
});
