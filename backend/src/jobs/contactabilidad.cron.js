const cron = require('node-cron');

function crearContactabilidadJob({ cronImpl = cron, ejecutarSync, env = process.env, logger = console }) {
  const ejecutarSeguro = () => ejecutarSync().catch((error) =>
    logger.error(`[CONTACTABILIDAD] Error de sincronización: ${error.message}`));

  function iniciar() {
    if (String(env.CONTACTABILIDAD_ENABLED).toLowerCase() !== 'true') {
      logger.warn('[CONTACTABILIDAD] Cron desactivado (CONTACTABILIDAD_ENABLED != true)');
      return false;
    }
    const minutos = Math.min(59, Math.max(1, Number(env.CONTACTABILIDAD_INTERVALO_MINUTOS) || 30));
    cronImpl.schedule(`*/${minutos} * * * *`, ejecutarSeguro, { timezone: 'America/Guayaquil' });
    ejecutarSeguro();
    logger.log(`[CONTACTABILIDAD] Cron activo cada ${minutos} minutos`);
    return true;
  }

  return { iniciar };
}

function initContactabilidadSync() {
  const pool = require('../config/db');
  const { crearRequestBitrix } = require('../contactabilidad/contactabilidad.http');
  const { crearClienteBitrix } = require('../contactabilidad/contactabilidad.bitrix');
  const { crearRepositorioContactabilidad } = require('../contactabilidad/contactabilidad.repository');
  const { crearProcesadorCrm } = require('../contactabilidad/contactabilidad.processor');
  const { crearSincronizadorContactabilidad } = require('../contactabilidad/contactabilidad.sync');
  const { recalcularConsolidados } = require('../contactabilidad/contactabilidad.recalculo');

  const candidatos = [
    { empresa: 'NOVONET', habilitado: process.env.CONTACTABILIDAD_NOVONET_ENABLED, webhook: process.env.NOVONET_WEBHOOK || process.env.BITRIX_WEBHOOK, categoryId: process.env.NOVONET_CATEGORY_ID || '19', campoChat: process.env.NOVONET_CAMPO_CHAT || 'UF_CRM_1782402564693' },
    { empresa: 'VELSA', habilitado: process.env.CONTACTABILIDAD_VELSA_ENABLED, webhook: process.env.VELSA_WEBHOOK, categoryId: process.env.VELSA_CATEGORY_ID || '8', campoChat: process.env.VELSA_CAMPO_CHAT || null },
  ];
  const crms = candidatos.filter((crm) => String(crm.habilitado).toLowerCase() === 'true' && crm.webhook);
  if (!crms.length && String(process.env.CONTACTABILIDAD_ENABLED).toLowerCase() === 'true') {
    console.warn('[CONTACTABILIDAD] No hay empresas habilitadas con webhook');
  }
  const bitrix = crearClienteBitrix({ request: crearRequestBitrix() });
  const procesarCrm = crearProcesadorCrm({ bitrix, repository: crearRepositorioContactabilidad(), pool });
  const sincronizador = crearSincronizadorContactabilidad({
    pool, crms, procesarCrm, recalcular: recalcularConsolidados,
    fechaDesde: process.env.CONTACTABILIDAD_FECHA_DESDE || '2026-07-01',
  });
  return crearContactabilidadJob({ ejecutarSync: sincronizador.ejecutar }).iniciar();
}

module.exports = { crearContactabilidadJob, initContactabilidadSync };
