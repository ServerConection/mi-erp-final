/**
 * REPARTO DE GESTIONABLES — UNA CONFIGURACIÓN POR EMPRESA
 *
 * NOVONET usa las tablas originales (gestionables_*), sin ningún cambio.
 * VELSA usa sus propias tablas (velsa_gestionables_*): los datos de una empresa
 * nunca se mezclan con los de la otra y Novonet no se ve afectado.
 *
 * Variables opcionales de Velsa en Render (si no están, se usan los valores de
 * abajo y la búsqueda por nombre en Bitrix):
 *   VELSA_GESTIONABLES_CATEGORY_ID, VELSA_GESTIONABLES_STAGE_ID,
 *   VELSA_GESTIONABLES_PIPELINE, VELSA_GESTIONABLES_STAGE_NAME,
 *   VELSA_GESTIONABLES_FIELD_NAME (campo de cupo en el deal; vacío = no se escribe)
 */
const env = process.env;

const EMPRESAS = {
  novonet: {
    clave: 'novonet',
    etiqueta: 'NOVONET',
    portal: 'novonet',                           // portal Bitrix donde viven los deals
    cuentasLive: ['NOVONET'],                    // cuenta(s) en Bitrix Live
    estacion: 'BRYAN PINEDA',
    url: () => (env.BITRIX_NOVONET_URL || '').replace(/\/+$/, ''),
    tablas: {
      asesores: 'gestionables_asesores',
      asignaciones: 'gestionables_asignaciones',
      cola: 'gestionables_cola',
      config: 'gestionables_reparto_config',
      eventos: 'gestionables_reparto_eventos',
      log: 'gestionables_webhook_log',
    },
    fieldName: env.GESTIONABLES_FIELD_NAME || 'UF_CRM_GESTIONABLES',
    stageId: env.GESTIONABLES_STAGE_ID || null,
    categoryId: env.GESTIONABLES_CATEGORY_ID || null,
    pipeline: env.GESTIONABLES_PIPELINE || 'NETLIFE NUEVO',
    etapa: env.GESTIONABLES_STAGE_NAME || 'CONTACTO NUEVO',
    lock: 874201,                                 // +1 = candado de la cola
  },
  velsa: {
    clave: 'velsa',
    etiqueta: 'VELSA',
    // El pipeline VELSA vive en el mismo portal de Novonet (novonet.bitrix24.es, categoría 51)
    portal: 'novonet',
    cuentasLive: ['NOVONET', 'VELSA'],           // jornada abierta en cualquiera de las dos
    estacion: 'GERENCIAL COMERCIAL VELSA',
    url: () => (env.BITRIX_NOVONET_URL || '').replace(/\/+$/, ''),
    tablas: {
      asesores: 'velsa_gestionables_asesores',
      asignaciones: 'velsa_gestionables_asignaciones',
      cola: 'velsa_gestionables_cola',
      config: 'velsa_gestionables_reparto_config',
      eventos: 'velsa_gestionables_reparto_eventos',
      log: 'velsa_gestionables_webhook_log',
    },
    fieldName: env.VELSA_GESTIONABLES_FIELD_NAME || null,
    stageId: env.VELSA_GESTIONABLES_STAGE_ID || null,
    categoryId: env.VELSA_GESTIONABLES_CATEGORY_ID || '51',
    pipeline: env.VELSA_GESTIONABLES_PIPELINE || 'VELSA',
    etapa: env.VELSA_GESTIONABLES_STAGE_NAME || 'CONTACTO NUEVO',
    lock: 874301,
  },
};

const empresaValida = (e) => (EMPRESAS[String(e || '').toLowerCase()] ? String(e).toLowerCase() : null);
// Sin empresa → novonet (así todo lo que ya existe sigue funcionando igual)
const getEmpresa = (e) => EMPRESAS[empresaValida(e) || 'novonet'];

module.exports = { EMPRESAS, empresaValida, getEmpresa };
