// =============================================================================
// Contactabilidad — Contexto compartido
// Arma una sola vez el cliente Bitrix, el repositorio, el refrescador y el
// manejador de webhook. El cron, el endpoint manual y el webhook comparten la
// MISMA instancia: un solo lugar donde configurar y un solo lugar donde fallar.
// =============================================================================

const pool = require('../config/db');
const { crearRequestBitrix } = require('./contactabilidad.http');
const { crearClienteBitrix } = require('./contactabilidad.bitrix');
const { crearRepositorioContactabilidad } = require('./contactabilidad.repository');
const { crearRefrescador } = require('./contactabilidad.refresco');
const { crearManejadorWebhook } = require('./contactabilidad.webhook');
const { crearVisorConversacion } = require('./contactabilidad.conversacion');
const { crearProcesadorCrm } = require('./contactabilidad.processor');
const { recalcularConsolidados } = require('./contactabilidad.recalculo');

const activo = (valor) => String(valor).toLowerCase() === 'true';

/** Empresas con webhook configurado y modulo habilitado. */
function construirCrms(env = process.env) {
  return [
    {
      empresa: 'NOVONET',
      habilitado: env.CONTACTABILIDAD_NOVONET_ENABLED,
      webhook: env.NOVONET_WEBHOOK || env.BITRIX_WEBHOOK,
      categoryId: env.NOVONET_CATEGORY_ID || '19',
      campoChat: env.NOVONET_CAMPO_CHAT || 'UF_CRM_1782402564693',
      tokenWebhook: env.CONTACTABILIDAD_WEBHOOK_TOKEN_NOVONET || env.CONTACTABILIDAD_WEBHOOK_TOKEN,
    },
    {
      empresa: 'VELSA',
      habilitado: env.CONTACTABILIDAD_VELSA_ENABLED,
      webhook: env.VELSA_WEBHOOK,
      categoryId: env.VELSA_CATEGORY_ID || '8',
      campoChat: env.VELSA_CAMPO_CHAT || null,
      tokenWebhook: env.CONTACTABILIDAD_WEBHOOK_TOKEN_VELSA || env.CONTACTABILIDAD_WEBHOOK_TOKEN,
    },
  ].filter((crm) => activo(crm.habilitado) && crm.webhook);
}

let contexto = null;

function crearContexto(env = process.env, deps = {}) {
  const crms = deps.crms || construirCrms(env);
  const bitrix = deps.bitrix || crearClienteBitrix({ request: crearRequestBitrix() });
  const repository = deps.repository || crearRepositorioContactabilidad();
  const basePool = deps.pool || pool;

  const refrescador = crearRefrescador({ pool: basePool, crms, bitrix, repository });
  const secretos = Object.fromEntries(crms.map((crm) => [crm.empresa, crm.tokenWebhook]));
  const webhook = crearManejadorWebhook({ pool: basePool, refrescador, secretos });
  const conversacion = crearVisorConversacion({ crms, bitrix });

  // Sincronizacion manual corta para pantallas que necesitan descubrir deals
  // nuevos, no solo refrescar los que ya existen en contactabilidad_leads.
  const procesarCrm = crearProcesadorCrm({ bitrix, repository, pool: basePool });
  const sincronizarRecientes = async (empresa, dias = 2) => {
    const crm = crms.find((item) => item.empresa === String(empresa).toUpperCase());
    if (!crm) throw new TypeError(`Empresa ${empresa} no habilitada para Contactabilidad`);
    const hasta = new Date();
    const desde = new Date(hasta);
    desde.setUTCDate(desde.getUTCDate() - Math.max(1, Number(dias) || 2));
    const fecha = (valor) => valor.toISOString().slice(0, 10);
    const importados = await procesarCrm(crm, {
      desde: fecha(desde), hasta: fecha(hasta), campoFecha: 'DATE_MODIFY', soloNuevos: false,
    });
    // Un mensaje de Open Lines no siempre modifica DATE_MODIFY del deal. Por
    // eso, ademas del incremental, se releen los chats activos ya conocidos.
    const activos = await refrescador.refrescarActivos(crm.empresa, {
      limite: 120, origen: 'MANUAL',
    });
    await recalcularConsolidados(basePool, 'MANUAL');
    return { importados, activos };
  };

  return { pool: basePool, crms, bitrix, repository, refrescador, webhook, conversacion, sincronizarRecientes };
}

/** Instancia unica del proceso. */
function obtenerContexto() {
  if (!contexto) contexto = crearContexto();
  return contexto;
}

/** Solo para pruebas. */
function reiniciarContexto() { contexto = null; }

module.exports = { crearContexto, obtenerContexto, reiniciarContexto, construirCrms };
