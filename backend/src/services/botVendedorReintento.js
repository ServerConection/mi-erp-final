'use strict';

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ejecutarConReintento({ ejecutar, esperasMs = [5000, 10000], esperar = dormir, alError, alAgotar, cancelado }) {
  let ultimoError = null;
  for (let intento = 0; intento <= esperasMs.length; intento += 1) {
    if (intento > 0 && cancelado && await cancelado()) return null;
    try {
      return await ejecutar(intento + 1);
    } catch (error) {
      ultimoError = error;
      if (alError) await alError(error, intento + 1, esperasMs.length + 1);
      if (intento < esperasMs.length) await esperar(esperasMs[intento]);
    }
  }
  return alAgotar ? alAgotar(ultimoError) : null;
}

module.exports = { ejecutarConReintento };
