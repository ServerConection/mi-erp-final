import test from 'node:test';
import assert from 'node:assert/strict';

import { calcularStatsIndicadores } from './indicadoresStats.js';

test('las tarjetas se calculan desde asesores y no desde supervisores divergentes', () => {
  const data = {
    porcentajeTarjeta: 25,
    porcentajeTerceraEdad: 10,
    supervisores: [{ leads_totales: 999, gestionables: 998, ingresos_reales: 500 }],
    asesores: [
      { leads_totales: 10, gestionables: 8, ingresos_reales: 4, ventas_crm: 3, real_mes: 2, activa_mes: 1 },
      { leads_totales: 20, gestionables: 12, ingresos_reales: 6, ventas_crm: 5, real_mes: 4, activa_mes: 3 },
    ],
  };

  const stats = calcularStatsIndicadores(data);

  assert.equal(stats.leadsGestionables, 30);
  assert.equal(stats.gestionables, 20);
  assert.equal(stats.ingresosJotform, 10);
  assert.equal(stats.efectividad, '50.0');
  assert.equal(stats.pctGestionablesVsTotales, '66.7');
});

test('descarte total es ponderado: descartes totales sobre gestionables totales', () => {
  const stats = calcularStatsIndicadores({
    asesores: [
      { gestionables: 100, descarte_count: 20, descarte: 20 },
      { gestionables: 2167, descarte_count: 1000, descarte: 40 },
    ],
  });

  assert.equal(stats.gestionables, 2267);
  assert.equal(stats.descartePorc, '45.0');
});