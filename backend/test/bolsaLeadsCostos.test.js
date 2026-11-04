const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularCostos, nombreFuente } = require('../src/shared/bolsaLeadsCostos');

const entregas = [
  // Día 1: 4 leads (3 N, 1 V), inversión 100 → CPL 25
  { deal: '1', empresa: 'novonet', fecha: '2026-11-01' }, { deal: '2', empresa: 'velsa', fecha: '2026-11-01' },
  { deal: '3', empresa: 'novonet', fecha: '2026-11-01' }, { deal: '4', empresa: 'novonet', fecha: '2026-11-01' },
  // Día 2: 2 leads (1 V, 1 S), inversión 60 → CPL 30
  { deal: '5', empresa: 'velsa', fecha: '2026-11-02' }, { deal: '6', empresa: 'semillero', fecha: '2026-11-02' },
];
const inversion = [
  { fecha: '2026-11-01', tabla: 'novonet', origen: '__WINTRACKER_ARTS__', monto: 70 },
  { fecha: '2026-11-01', tabla: 'velsa', origen: '__WINTRACKER_VELSA__', monto: 30 },
  { fecha: '2026-11-02', tabla: 'novonet', origen: '__WINTRACKER_VIDIKA__', monto: 60 },
  { fecha: '2026-11-03', tabla: 'novonet', origen: '__WINTRACKER_ARTS__', monto: 15 },   // día sin leads
];
const ventas = new Map([['1', { ventas: 1, activas: 1 }], ['2', { ventas: 2, activas: 1 }], ['5', { ventas: 1, activas: 0 }]]);

test('el costo se reparte por día según los leads que recibió cada empresa', () => {
  const r = calcularCostos({ entregas, inversion, ventas });
  const e = Object.fromEntries(r.porEmpresa.map((x) => [x.empresa, x]));
  assert.equal(e.novonet.costo, 75);    // 3 × 25
  assert.equal(e.velsa.costo, 55);      // 25 + 30
  assert.equal(e.semillero.costo, 30);  // 1 × 30
  assert.equal(r.totales.inversion, 175);
  assert.equal(r.totales.inversion_asignada, 160);
  assert.equal(r.totales.inversion_sin_asignar, 15);
});

test('eficiencia: CPA, conversión y ranking', () => {
  const r = calcularCostos({ entregas, inversion, ventas });
  const e = Object.fromEntries(r.porEmpresa.map((x) => [x.empresa, x]));
  assert.equal(e.novonet.cpa, 75);          // 75 / 1 venta
  assert.equal(e.velsa.cpa, 18.33);         // 55 / 3 ventas
  assert.equal(e.semillero.cpa, null);      // sin ventas: no calculable
  assert.equal(e.novonet.conversion, 33.3); // 1 de 3 leads con venta
  assert.equal(e.velsa.conversion, 100);
  assert.deepEqual(r.ranking.map((x) => x.empresa), ['velsa', 'novonet', 'semillero']);
  assert.equal(r.totales.cpa, 40);          // 160 / 4
});

test('detalle por lead y fuentes', () => {
  const r = calcularCostos({ entregas, inversion, ventas });
  assert.deepEqual(r.detalle.find((d) => d.deal === '6'), { deal: '6', empresa: 'semillero', fecha: '2026-11-02', costo: 30, ventas: 0, activas: 0 });
  assert.equal(r.porFuente[0].fuente, 'ARTS');
  assert.equal(nombreFuente('velsa', 'FACEBOOK'), 'VELSA · FACEBOOK');
});

test('sin datos no rompe', () => {
  const r = calcularCostos({});
  assert.equal(r.totales.leads, 0);
  assert.equal(r.totales.cpl, null);
});

const { resolverAgencia, agruparPorOrigen } = require('../src/shared/bolsaLeadsCostos');
test('agencia del origen: catálogo primero, luego histórico; ARST → ARTS', () => {
  const catalogo = new Map([['BASE 593-111', 'ARST'], ['FORMULARIO VELSA 1', 'VELSA'], ['LANDING NUEVA', 'Vidica']]);
  const historico = { 'LLAMADA LANDING 4': 'VIDIKA GOOGLE', 'BASE 593-995211968': 'ARTS FACEBOOK', 'BASE 593-958993371': 'REMARKETING' };
  assert.equal(resolverAgencia('  base 593-111 ', catalogo, historico), 'ARTS');
  assert.equal(resolverAgencia('Formulario Velsa 1', catalogo, historico), 'VELSA');
  assert.equal(resolverAgencia('LANDING NUEVA', catalogo, historico), 'VIDIKA');
  assert.equal(resolverAgencia('Llamada Landing 4', catalogo, historico), 'VIDIKA');
  assert.equal(resolverAgencia('BASE 593-995211968', catalogo, historico), 'ARTS');
  assert.equal(resolverAgencia('BASE 593-958993371', catalogo, historico), 'REMARKETING');
  assert.equal(resolverAgencia('ORIGEN RARO', catalogo, historico), 'SIN AGENCIA');
  assert.equal(resolverAgencia('', catalogo, historico), 'SIN ORIGEN');
});

test('leads por empresa según agencia y origen', () => {
  const detalle = [
    { deal: '1', empresa: 'novonet', ventas: 1 }, { deal: '2', empresa: 'velsa', ventas: 0 },
    { deal: '3', empresa: 'novonet', ventas: 0 }, { deal: '4', empresa: 'semillero', ventas: 2 }, { deal: '5', empresa: 'velsa', ventas: 0 },
  ];
  const origenes = new Map([['1', 'Base 593-111'], ['2', 'Base 593-111'], ['3', 'Llamada Landing 4'], ['4', 'Formulario Velsa 1']]);
  const catalogo = new Map([['BASE 593-111', 'ARTS'], ['FORMULARIO VELSA 1', 'VELSA']]);
  const r = agruparPorOrigen({ detalle, origenes, catalogo, historico: { 'LLAMADA LANDING 4': 'VIDIKA GOOGLE' } });
  const a = Object.fromEntries(r.porAgencia.map((x) => [x.agencia, x]));
  assert.deepEqual([a.ARTS.total, a.ARTS.novonet, a.ARTS.velsa, a.ARTS.ventas_novonet], [2, 1, 1, 1]);
  assert.deepEqual([a.VIDIKA.novonet, a.VELSA.semillero, a.VELSA.ventas_semillero], [1, 1, 2]);
  assert.equal(a['SIN ORIGEN'].velsa, 1);
  assert.equal(r.porOrigen.find((x) => x.origen === 'BASE 593-111').total, 2);
  assert.equal(detalle[0].agencia, 'ARTS');   // el detalle por lead también lleva origen y agencia
});
