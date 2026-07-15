/**
 * Corre la sincronización de Jotform UNA VEZ, a mano (para probar antes
 * de confiar en el cron automático de cada 20 min).
 *
 * Uso (desde backend/):
 *   node scripts/sincronizar_jotform_manual.js
 */

require('dotenv').config();
const { sincronizarTodos } = require('../src/services/jotformSync.service');

(async () => {
  console.log('Sincronizando Novonet + Velsa...\n');
  const resultados = await sincronizarTodos();
  console.log(JSON.stringify(resultados, null, 2));
  process.exit(0);
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
