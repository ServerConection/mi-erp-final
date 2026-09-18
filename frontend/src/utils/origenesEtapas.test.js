import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparOrigenesEtapas, diasPeriodo } from './origenesEtapas.js';
test('agrupa todos los orígenes y concilia totales de etapas y días', () => {
  const filas = [
    { origen: 'API 484', etapa: 'OTRA ETAPA', fecha: '2026-09-01', total: 25 },
    { origen: 'API 484', etapa: 'DESCARTE', fecha: '2026-09-01', total: 15 },
    { origen: 'API 484', etapa: 'VENTA SUBIDA', fecha: '2026-09-02', total: 10 },
    { origen: 'API 484', etapa: 'ATC', fecha: '2026-09-01', total: 20 },
    { origen: 'API 484', etapa: 'ATC', fecha: '2026-09-02', total: 30 },
    { origen: 'ORIGEN NUEVO', etapa: 'SIN ETAPA', fecha: '2026-09-02', total: 7 },
  ];
  const grupos = agruparOrigenesEtapas(filas);
  assert.equal(grupos.length, 2);
  assert.equal(grupos[0].total, 100);
  assert.equal(grupos[0].dias['2026-09-01'], 60);
  assert.equal(grupos[0].dias['2026-09-02'], 40);
  assert.deepEqual(grupos[0].etapas.map(e => e.nombre), ['ATC', 'VENTA SUBIDA', 'DESCARTE', 'OTRA ETAPA']);
  assert.equal(grupos[0].etapas[0].total / grupos[0].total, 0.5);
  for (const g of grupos) {
    assert.equal(g.etapas.reduce((s, e) => s + e.total, 0), g.total);
    assert.equal(Object.values(g.dias).reduce((s, t) => s + t, 0), g.total);
  }
});
test('incluye todos los días del rango y cruza meses sin confundir el día', () => {
  assert.deepEqual(diasPeriodo('2026-09-30', '2026-10-02'), ['2026-09-30', '2026-10-01', '2026-10-02']);
  assert.deepEqual(diasPeriodo('2026-09-17', '2026-09-17'), ['2026-09-17']);
  assert.deepEqual(diasPeriodo(undefined, undefined), []);
  assert.deepEqual(agruparOrigenesEtapas([]), []);
});
