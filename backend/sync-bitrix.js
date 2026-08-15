/**
 * SYNC BITRIX24 — ejecutar después del deploy para traer los deals
 * Desde la carpeta backend: node sync-bitrix.js
 *
 * Este script corre el sync DIRECTAMENTE (sin pasar por el endpoint HTTP),
 * así funciona aunque el servidor aún no esté corriendo.
 */
require('dotenv').config();

// Importa el pool y el servicio directamente
const { syncBitrix } = require('./src/services/bitrix.service');

(async () => {
  console.log('🚀 Iniciando sync Bitrix24 → PostgreSQL');
  console.log('   Pipeline: VELSA VENTAS NETLIFE (Cat:8)');
  console.log('   Esto puede tomar 1-3 minutos según la cantidad de deals...\n');

  try {
    const resultado = await syncBitrix({
      // Sin filtro de fecha = trae TODOS los deals históricos de Cat:8
      // Para solo el mes actual descomenta la línea de abajo:
      // desde: new Date().toISOString().substring(0,8) + '01',
    });

    console.log('\n✅ Sync completado:');
    console.log(`   Deals procesados:  ${resultado.procesados}`);
    console.log(`   Nuevos insertados: ${resultado.nuevos}`);
    console.log(`   Actualizados:      ${resultado.actualizados}`);
    console.log('\nListo. El tab CRM en ResumenVelsa ya tiene datos.');

  } catch (err) {
    console.error('❌ Error en sync:', err.message);
    process.exit(1);
  }

  process.exit(0);
})();
