require('dotenv').config();
const pool = require('../config/db');
const { crearRequestBitrix } = require('../contactabilidad/contactabilidad.http');
const { crearClienteBitrix } = require('../contactabilidad/contactabilidad.bitrix');
const { crearRepositorioContactabilidad } = require('../contactabilidad/contactabilidad.repository');
const { crearProcesadorCrm } = require('../contactabilidad/contactabilidad.processor');
const { crearRecolector } = require('../contactabilidad/contactabilidad.collector');
const { recalcularConsolidados } = require('../contactabilidad/contactabilidad.recalculo');

function argumentos(argv) {
  return Object.fromEntries(argv.slice(2).filter((v) => v.startsWith('--')).map((v) => {
    const [key, ...rest] = v.slice(2).split('=');
    return [key, rest.join('=')];
  }));
}

async function main() {
  const args = argumentos(process.argv);
  const empresa = String(args.empresa || '').toUpperCase();
  if (!['NOVONET', 'VELSA'].includes(empresa)) throw new Error('Usa --empresa=NOVONET o --empresa=VELSA');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(args.hasta || '')) {
    throw new Error('Usa --desde=YYYY-MM-DD y --hasta=YYYY-MM-DD');
  }
  if (args.desde > args.hasta) throw new Error('--desde no puede ser posterior a --hasta');

  const crms = {
    NOVONET: { empresa: 'NOVONET', webhook: process.env.NOVONET_WEBHOOK || process.env.BITRIX_WEBHOOK, categoryId: process.env.NOVONET_CATEGORY_ID || '19', campoChat: process.env.NOVONET_CAMPO_CHAT || 'UF_CRM_1782402564693' },
    VELSA: { empresa: 'VELSA', webhook: process.env.VELSA_WEBHOOK, categoryId: process.env.VELSA_CATEGORY_ID || '8', campoChat: process.env.VELSA_CAMPO_CHAT || null },
  };
  const crm = crms[empresa];
  if (!crm.webhook) throw new Error(`Falta webhook para ${empresa}`);

  const bitrix = crearClienteBitrix({ request: crearRequestBitrix() });
  const repository = crearRepositorioContactabilidad();
  const procesarCrm = crearProcesadorCrm({ bitrix, repository, pool });
  const recolector = crearRecolector({ crms: [crm], procesarCrm });
  const resultado = await recolector.ejecutarCiclo({ desde: args.desde, hasta: args.hasta });
  await recalcularConsolidados(pool);
  console.log(JSON.stringify(resultado, null, 2));
}

main()
  .catch((error) => { console.error(`[contactabilidad:once] ${error.message}`); process.exitCode = 1; })
  .finally(() => pool.end());
