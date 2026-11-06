const test = require('node:test');
const assert = require('node:assert/strict');
const { analizarPiloto, compararPeriodos } = require('../src/shared/bolsaLeadsAnalisis');

const detalle = [
  { deal: '1', empresa: 'novonet', fecha: '2026-11-01', costo: 10, ventas: 1, activas: 1, agencia: 'ARTS' },
  { deal: '2', empresa: 'novonet', fecha: '2026-11-01', costo: 10, ventas: 0, activas: 0, agencia: 'ARTS' },
  { deal: '3', empresa: 'novonet', fecha: '2026-11-01', costo: 10, ventas: 0, activas: 0, agencia: 'VIDIKA' },
  { deal: '4', empresa: 'velsa', fecha: '2026-11-02', costo: 12, ventas: 2, activas: 0, agencia: 'VELSA' },
  { deal: '5', empresa: 'velsa', fecha: '2026-11-02', costo: 12, ventas: 0, activas: 0, agencia: 'VELSA' },
];
const bitrix = new Map([
  ['1', { etapa: 'VENTA SUBIDA', asesor: 'ANA' }], ['2', { etapa: 'ATC', asesor: 'ANA' }],
  ['3', { etapa: 'Seguimiento', asesor: 'LUIS' }], ['4', { etapa: 'Contacto nuevo', asesor: 'ROSA' }],
  ['5', { etapa: 'Venta Subida', asesor: 'ROSA' }],
]);
const extra = new Map([
  ['1', { hora: 9, dow: 1, viaCola: true }], ['2', { hora: 9, dow: 1 }], ['3', { hora: 14, dow: 1, salto: true, saltoDe: 'semillero' }],
  ['4', { hora: 14, dow: 2 }], ['5', { hora: 20, dow: 2 }],
]);

test('embudo por empresa: gestionable, venta subida, ingreso, activa', () => {
  const { embudo } = analizarPiloto({ detalle, extra, bitrix });
  const n = embudo.porEmpresa.find((x) => x.empresa === 'novonet');
  assert.deepEqual([n.leads, n.gestionables, n.venta_subida, n.ingresos, n.activas], [3, 2, 1, 1, 1]);   // ATC no es gestionable
  const v = embudo.porEmpresa.find((x) => x.empresa === 'velsa');
  assert.deepEqual([v.leads, v.venta_subida, v.ingresos, v.ventas], [2, 2, 1, 2]);   // el 4 tiene venta aunque siga en Contacto nuevo
  assert.equal(embudo.total.leads, 5);
  assert.equal(embudo.porEmpresaAgencia.find((x) => x.empresa === 'novonet' && x.agencia === 'ARTS').leads, 2);
  assert.equal(embudo.etapas.find((x) => x.empresa === 'novonet').etapas.find((e) => e.etapa === 'ATC').gestionable, false);
});

test('por asesor: leads, ventas, costo y CPA', () => {
  const { asesores } = analizarPiloto({ detalle, extra, bitrix });
  const ana = asesores.find((x) => x.empresa === 'novonet').asesores.find((a) => a.asesor === 'ANA');
  assert.deepEqual([ana.leads, ana.ventas, ana.costo, ana.cpa, ana.conversion], [2, 1, 20, 20, 50]);
  const rosa = asesores.find((x) => x.empresa === 'velsa').asesores[0];
  assert.deepEqual([rosa.asesor, rosa.cpa], ['ROSA', 12]);
});

test('por hora/día, cola y saltos por falta de conectados', () => {
  const { tiempo } = analizarPiloto({ detalle, extra, bitrix, enEspera: 7 });
  assert.deepEqual(tiempo.porHora.map((h) => [h.etiqueta, h.leads, h.ventas]), [['09:00', 2, 1], ['14:00', 2, 2], ['20:00', 1, 0]]);
  assert.deepEqual(tiempo.porDia.map((d) => [d.etiqueta, d.leads]), [['Lunes', 3], ['Martes', 2]]);
  assert.equal(tiempo.enEspera, 7);
  assert.deepEqual([tiempo.viaCola.leads, tiempo.viaCola.conversion], [1, 100]);
  const s = Object.fromEntries(tiempo.saltos.map((x) => [x.empresa, x]));
  assert.deepEqual([s.novonet.recibidos, s.semillero.cedidos], [1, 1]);
});

test('lead sin datos en Bitrix no rompe', () => {
  const { embudo } = analizarPiloto({ detalle: [{ deal: '9', empresa: 'semillero', costo: 5, ventas: 0, activas: 0 }] });
  assert.equal(embudo.porEmpresa.find((x) => x.empresa === 'semillero').gestionables, 0);
});

test('antes vs piloto: CPL, CPA y % de cambio', () => {
  const r = compararPeriodos(
    { dias: 5, inversion: 1000, leads: { novonet: 60, velsa: 40, semillero: 0 }, ventas: { novonet: 10, velsa: 5, semillero: 0 } },
    { dias: 5, inversion: 1000, leads: { novonet: 70, velsa: 40, semillero: 15 }, ventas: { novonet: 12, velsa: 6, semillero: 2 } },
  );
  assert.deepEqual([r.antes.cpl, r.antes.cpa, r.piloto.cpl, r.piloto.cpa], [10, 66.67, 8, 50]);
  assert.equal(r.cambios.cpl, -20);
  assert.equal(r.cambios.cpa, -25);
  assert.equal(r.piloto.porEmpresa.find((x) => x.empresa === 'semillero').ventas_por_100_leads, 13.3);
});

const { analizarTiempos } = require('../src/shared/bolsaLeadsAnalisis');
test('tiempos: primera gestión, venta subida (plazo), ingreso y tiempo por etapa', () => {
  const leads = [
    { deal: '1', empresa: 'novonet', entregado_en: '2026-11-02T14:00:00Z' },
    { deal: '2', empresa: 'novonet', entregado_en: '2026-11-02T14:00:00Z' },
    { deal: '3', empresa: 'velsa', entregado_en: '2026-11-02T15:00:00Z' },
  ];
  const historial = new Map([
    ['1', [
      { etapa: 'LECTOR LEAD', categoria: '43', t: '2026-11-02T13:59:00Z' },          // en la Bolsa: no cuenta
      { etapa: 'CONTACTO NUEVO', categoria: '7', t: '2026-11-02T14:00:05Z' },
      { etapa: 'SEGUIMIENTO', categoria: '7', t: '2026-11-02T14:30:00Z' },            // gestión a los 30 min
      { etapa: 'VENTA SUBIDA', categoria: '7', t: '2026-11-02T16:00:00Z' },           // subida a las 2 h
    ]],
    ['2', [{ etapa: 'CONTACTO NUEVO', categoria: '7', t: '2026-11-02T14:00:05Z' }]],  // nunca gestionado
    ['3', [
      { etapa: 'CONTACTO NUEVO', categoria: '51', t: '2026-11-02T15:00:05Z' },
      { etapa: 'VENTA SUBIDA', categoria: '51', t: '2026-11-02T23:00:00Z' },          // subida a las 8 h: fuera de plazo
    ]],
  ]);
  const primeraVenta = new Map([['1', '2026-11-03T14:00:00Z']]);                      // ingreso a las 24 h
  const r = analizarTiempos({ leads, historial, primeraVenta, plazos: { novonet: 5, velsa: 5 }, ahora: new Date('2026-11-04T14:00:00Z') });
  const n = r.porEmpresa.find((x) => x.empresa === 'novonet');
  assert.deepEqual([n.leads, n.sin_gestion, n.primera_gestion.mediana, n.primera_gestion.en_1h], [2, 1, 0.5, 100]);
  assert.deepEqual([n.venta_subida.mediana, n.venta_subida.en_plazo], [2, 100]);
  assert.deepEqual([n.venta_ingresada.mediana, n.venta_ingresada.en_24h], [24, 100]);
  const v = r.porEmpresa.find((x) => x.empresa === 'velsa');
  assert.deepEqual([v.venta_subida.mediana, v.venta_subida.en_plazo], [8, 0]);
  const en = Object.fromEntries(r.etapas.find((x) => x.empresa === 'novonet').etapas.map((e) => [e.etapa, e]));
  assert.equal(en['LECTOR LEAD'], undefined);
  assert.deepEqual([en['CONTACTO NUEVO'].pasaron, en['CONTACTO NUEVO'].siguen_ahi], [2, 1]);
  assert.equal(en.SEGUIMIENTO.mediana, 1.5);                                          // 14:30 → 16:00
  assert.equal(en['CONTACTO NUEVO'].espera_actual_mediana, 48);                       // el lead 2 lleva 48 h ahí
});
