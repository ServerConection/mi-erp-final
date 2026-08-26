import test from 'node:test';
import assert from 'node:assert/strict';
import { construirResumenHora, construirMatrizHoraDia, calcularEfectividadGestionables } from './reporteDataStats.js';

test('construye el resumen horario con porcentaje ATC seguro', () => {
  assert.deepEqual(construirResumenHora([{ hora: 9, n_leads: 10, atc: 3 }]), [
    { hora: 9, n_leads: 10, atc: 3, pct_atc: 30 },
  ]);
});

test('organiza leads por dia y hora para el reporte visible', () => {
  const matriz = construirMatrizHoraDia([
    { dia: 25, hora: 9, n_leads: 4 },
    { dia: 25, hora: 10, n_leads: 2 },
  ]);
  assert.deepEqual(matriz.horas, [9, 10]);
  assert.equal(matriz.porDia[25][9], 4);
  assert.equal(matriz.porDia[25][10], 2);
});

test('calcula efectividad como venta subida sobre gestionables', () => {
  assert.equal(calcularEfectividadGestionables(45, 100), 45);
  assert.equal(calcularEfectividadGestionables(10, 0), 0);
});
