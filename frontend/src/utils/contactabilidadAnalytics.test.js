import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAnalyticsQuery, formatDuration, readFilters, rankOrigins,
  buildHeatmap, pendingPriority, rowSeverity, formatRelative,
  waitingMinutes, severityMeta, hasActiveFilters,
} from './contactabilidadAnalytics.js';

const VACIOS = {
  desde: '', hasta: '', empresa: '', origen: '', asesor_id: '', etapa: '',
  pendiente_por: '', severidad: '', min_espera: '', temperatura: '', q: '',
  solo_con_mensajes: '',
};

test('serializa solo filtros con valor', () => {
  assert.equal(buildAnalyticsQuery({ empresa: 'NOVONET', origen: '', desde: '2026-08-01' }), 'empresa=NOVONET&desde=2026-08-01');
});

test('formatea segundos de respuesta', () => {
  assert.equal(formatDuration(90), '1 min 30 s');
  assert.equal(formatDuration(null), 'Sin datos');
});

test('lee filtros permitidos desde la URL', () => {
  assert.deepEqual(readFilters('?empresa=NOVONET&hack=x'), { ...VACIOS, empresa: 'NOVONET' });
});

test('los filtros sobreviven ida y vuelta por URL', () => {
  const original = {
    ...VACIOS, desde: '2026-08-01', hasta: '2026-08-25', empresa: 'NOVONET',
    origen: 'WEB', asesor_id: '20', etapa: 'ATC', severidad: 'CRITICO', min_espera: '45',
  };
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

test('la severidad del servidor manda; sin ella se calcula en el navegador', () => {
  const ahora = Date.parse('2026-08-28T12:00:00Z');
  assert.equal(rowSeverity({ severidad: 'GRAVE', pendiente_por: 'CLIENTE' }), 'GRAVE');
  assert.equal(rowSeverity(
    { pendiente_por: 'ASESOR', ultimo_mensaje_cliente_at: '2026-08-28T10:00:00Z' },
    { alerta: 15, grave: 30, critico: 60 }, ahora), 'CRITICO');
  assert.equal(rowSeverity(
    { pendiente_por: 'CLIENTE', ultimo_mensaje_cliente_at: '2026-08-20T10:00:00Z' },
    { alerta: 15, grave: 30, critico: 60 }, ahora), 'OK');
});

test('el cronometro de espera avanza sin recargar del backend', () => {
  const row = { pendiente_por: 'ASESOR', ultimo_mensaje_cliente_at: '2026-08-28T11:30:00Z' };
  assert.equal(waitingMinutes(row, Date.parse('2026-08-28T12:00:00Z')), 30);
  assert.equal(waitingMinutes(row, Date.parse('2026-08-28T12:45:00Z')), 75);
  assert.equal(waitingMinutes({ pendiente_por: 'CLIENTE' }), null);
});

test('formatea tiempos relativos legibles', () => {
  const ahora = Date.parse('2026-08-28T12:00:00Z');
  assert.equal(formatRelative('2026-08-28T11:58:00Z', ahora), 'hace 2 min');
  assert.equal(formatRelative('2026-08-28T09:00:00Z', ahora), 'hace 3 h');
  assert.equal(formatRelative(null), '—');
});

test('cada severidad tiene etiqueta y color propios', () => {
  assert.equal(severityMeta('critico').label, 'Crítico');
  assert.equal(severityMeta('desconocida').label, 'Al día');
  assert.notEqual(severityMeta('GRAVE').color, severityMeta('OK').color);
});

test('detecta si hay filtros activos', () => {
  assert.equal(hasActiveFilters(VACIOS), false);
  assert.equal(hasActiveFilters({ ...VACIOS, severidad: 'CRITICO' }), true);
});
