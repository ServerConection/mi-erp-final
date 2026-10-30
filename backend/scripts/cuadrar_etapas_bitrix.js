/**
 * Reconciliación manual del mes actual contra la etapa real de Bitrix.
 * Solo actualiza etapa/categoría/fecha del deal; no toca ventas ni Jotform.
 */
require('dotenv').config();
const pool = require('../src/config/db');
const { reconciliarLeads } = require('../src/services/reconciliacionBitrix.service');

const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());
const desde = process.argv.find((v) => v.startsWith('--desde='))?.split('=')[1] || `${hoy.slice(0, 7)}-01`;
const hasta = process.argv.find((v) => v.startsWith('--hasta='))?.split('=')[1] || hoy;

async function main() {
  const empresas = [
    { empresa: 'novonet', categoria: process.env.RECONCILIACION_BITRIX_CATEGORIA || '19' },
    { empresa: 'velsa', categoria: process.env.RECONCILIACION_BITRIX_CATEGORIA_VELSA || '51' },
  ];
  for (const config of empresas) {
    const resultado = await reconciliarLeads({
      ...config,
      desde,
      hasta,
      aplicar: true,
      filtrarPorCategoria: true,
      campoFecha: 'DATE_CREATE',
      soloEtapas: true,
      cursorRapido: true,
      log: () => {},
    });
    console.log(config.empresa, {
      consultados: resultado.deals,
      faltantes: resultado.faltantes.length,
      desfasados: resultado.desfasados.length,
      escritos: resultado.escritos,
      errores: resultado.errores,
    });
  }
}

main()
  .then(() => pool.end())
  .catch(async (error) => { console.error(error.message); await pool.end(); process.exit(1); });
