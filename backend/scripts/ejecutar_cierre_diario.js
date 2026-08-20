/**
 * Corre el cierre diario UNA VEZ, manualmente (para probarlo o para
 * rellenar un día que se te pasó — backfill).
 *
 * Uso (desde backend/):
 *   node scripts/ejecutar_cierre_diario.js                -> cierra "hoy" (hora Ecuador)
 *   node scripts/ejecutar_cierre_diario.js 2026-08-19      -> cierra esa fecha puntual
 *
 * Requisito: ya debiste correr la migración
 * backend/src/db/migrations/reportegeneral_d1.sql conectado a "erp_database"
 * en pgAdmin (para que exista la tabla ahí).
 *
 * Es seguro correrlo más de una vez el mismo día: el job hace upsert
 * (ON CONFLICT ... DO UPDATE), así que solo refresca el snapshot de esa
 * fecha, nunca duplica filas.
 */

require('dotenv').config();
const { ejecutarCierre } = require('../src/jobs/cierreDiario.cron');

const fechaManual = process.argv[2]; // opcional: YYYY-MM-DD

ejecutarCierre(fechaManual)
  .then((resultado) => {
    console.log('\nListo:', resultado);
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nError general - code:', err.code);
    console.error('Error general - message:', err.message);
    process.exit(1);
  });
