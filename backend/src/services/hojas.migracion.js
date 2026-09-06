/**
 * Migración de trazabilidad de Archivos Compartidos.
 *
 * Se ejecuta al arrancar y es idempotente. Va en su propio try/catch: si la
 * base no la acepta, el módulo sigue funcionando exactamente como antes — lo
 * único que se pierde son las acciones nuevas del historial. Nadie se queda
 * sin poder abrir sus archivos por esto.
 */
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function asegurarTrazabilidadHojas() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/hojas_trazabilidad.sql'), 'utf8');
    await pool.query(sql);
    console.log('[Hojas] Trazabilidad verificada (acciones de historial e índices OK)');
    return true;
  } catch (err) {
    console.error('[Hojas] ⚠️ No se pudo aplicar la migración de trazabilidad:', err.message);
    console.error('[Hojas] ⚠️ El módulo sigue funcionando; no se registrarán exportaciones ni archivados.');
    return false;
  }
}

module.exports = { asegurarTrazabilidadHojas };
