import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAnalyticsQuery, formatDuration, readFilters, rankOrigins,
  buildHeatmap, pendingPriority,
} from './contactabilidadAnalytics.js';

test('serializa solo filtros con valor', () => {
  assert.equal(buildAnalyticsQuery({ empresa: 'NOVONET', origen: '', desde: '2026-08-01' }), 'empresa=NOVONET&desde=2026-08-01');
});

test('formatea segundos de respuesta', () => {
  assert.equal(formatDuration(90), '1 min 30 s');
  assert.equal(formatDuration(null), 'Sin datos');
});

test('lee filtros permitidos desde la URL', () => {
  assert.deepEqual(readFilters('?empresa=NOVONET&hack=x'), { desde: '', hasta: '', empresa: 'NOVONET', origen: '', asesor_id: '', etapa: '' });
});

test('los filtros sobreviven ida y vuelta por URL', () => {
  const original = { desde: '2026-08-01', hasta: '2026-08-25', empresa: 'NOVONET', origen: 'WEB', asesor_id: '20', etapa: 'ATC' };
  assert.deepEqual(readFilters(`?${buildAnalyticsQuery(original)}`), original);
});

test('ordena origenes validos antes de muestras insuficientes', () => {
  const rows = rankOrigins([
    { origen: 'A', tasa_contactabilidad: 90, leads: 2, muestra_insuficiente: true },
    { origen: 'B', tasa_contactabilidad: 60, leads: 20, muestra_insuficiente: false },
  ]);
  assert.equal(rows[0].origen, 'B');
});

test('crea una matriz completa aunque falten horas', () => {
  const matrix = buildHeatmap([{ dia_semana_iso: 1, hora: 9, leads_unicos: 3 }]);
  assert.equal(matrix.length, 7);
  assert.equal(matrix[0].hours.length, 16);
  assert.equal(matrix[0].hours.find((h) => h.hora === 9).leads_unicos, 3);
});

test('clasifica prioridad por minutos pendientes', () => {
  assert.equal(pendingPriority({ pendiente_por: 'ASESOR', minutos_pendiente: 75 }), 'critico');
  assert.equal(pendingPriority({ pendiente_por: 'ASESOR', minutos_pendiente: 45 }), 'alerta');
  assert.equal(pendingPriority({ pendiente_por: 'CLIENTE', minutos_pendiente: 90 }), 'normal');
});
