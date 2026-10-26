import test from 'node:test';
import assert from 'node:assert/strict';
import { ordenarFilasKpi } from './ordenKpi.js';

test('el orden de asesores no depende de las métricas del período', () => {
  const periodoLargo = [
    { supervisor: 'SUP B', codigo_asesor: '2', nombre: 'Dos', leads_total: 500 },
    { supervisor: 'SUP A', codigo_asesor: '10', nombre: 'Diez', leads_total: 900 },
    { supervisor: 'SUP A', codigo_asesor: '2', nombre: 'Dos', leads_total: 100 },
  ];
  const periodoCorto = periodoLargo.map((fila, i) => ({
    ...fila,
    leads_total: [1, 800, 999][i],
  })).reverse();

  const nombres = filas => ordenarFilasKpi(filas).map(f => `${f.supervisor}-${f.codigo_asesor}`);
  assert.deepEqual(nombres(periodoLargo), ['SUP A-2', 'SUP A-10', 'SUP B-2']);
  assert.deepEqual(nombres(periodoCorto), nombres(periodoLargo));
});
