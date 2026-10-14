import { filasDesdeMatriz } from './catalogoComisiones.js';
import assert from 'node:assert/strict';
const m = [[null], ['TIPO', 'PLAN', 'VELOCIDAD MBPS', 'SERVICIOS ADICIONALES', 'N° SERVICIOS', 'NOMBRE ERP', 'SUBTOTAL', 'PLAN JULIO (ref)', 'COM MENOR A 35', 'COM DE 36 A 41', 'COM DE 42 EN ADELANTE', 'IMPULSO ARPU', 'BONO TC'],
  ['HOME', 'Plan 750 Mbps', 750, 'Netlife Play', 1, 'HOME — PLAN 750 MBPS NETLIFE PLAY', 25.75, 'x', 14.6, 15.8, 17.1, 0, 5], [null], ['Leyenda:']];
const f = filasDesdeMatriz(m);
assert.equal(f.length, 2);
assert.deepEqual([f[0].tipo, f[0].velocidad, f[0].servicios, f[0].com_t1, f[0].bono_tc], ['HOME', 750, 'Netlife Play', 14.6, 5]);
assert.equal(filasDesdeMatriz([['PLANES', 'Velocidad']]), null);
console.log('OK catalogoComisiones');
