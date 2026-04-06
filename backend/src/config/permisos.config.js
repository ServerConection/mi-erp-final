/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONFIGURACIÓN DE PERMISOS POR EMPRESA + PERFIL
 * Mapea: [EMPRESA][PERFIL] → [MÓDULOS_PERMITIDOS]
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const MODULOS = {
  // NOVONET
  VISTA_ASESOR: 'VistaAsesor',
  SEGUIMIENTO_VENTAS: 'SeguimientoVentas',
  INDICADORES: 'Indicadores',
  REDES: 'Redes',
  
  // VELSA
  VISTA_ASESOR_VELSA: 'VistaAsesorVelsa',
  SEGUIMIENTO_VELSA: 'SeguimientoVelsa',
  INDICADORES_VELSA: 'IndicadoresVelsa',
  REDES_VELSA: 'RedesVelsa'
};

/**
 * MATRIZ DE PERMISOS
 * Estructura: [EMPRESA_MAYUS][PERFIL_MAYUS] = [módulos permitidos]
 * 
 * IMPORTANTE: 
 * - ADMINISTRADOR tiene acceso a TODO (se valida en el middleware)
 * - GERENCIA tiene acceso a TODO de su empresa
 * - Otros perfiles: acceso limitado según definición abajo
 */
const PERMISOS_POR_EMPRESA_PERFIL = {
  NOVONET: {
    ASESOR: [
      MODULOS.VISTA_ASESOR,
      MODULOS.SEGUIMIENTO_VENTAS
    ],
    SUPERVISOR: [
      MODULOS.VISTA_ASESOR,
      MODULOS.SEGUIMIENTO_VENTAS,
      MODULOS.INDICADORES
    ],
    ANALISTA: [
      MODULOS.VISTA_ASESOR,
      MODULOS.SEGUIMIENTO_VENTAS,
      MODULOS.INDICADORES,
      MODULOS.REDES
    ],
    GERENCIA: [
      // GERENCIA tiene acceso a TODO de NOVONET
      MODULOS.VISTA_ASESOR,
      MODULOS.SEGUIMIENTO_VENTAS,
      MODULOS.INDICADORES,
      MODULOS.REDES
    ],
    ADMINISTRADOR: [
      // ADMINISTRADOR tiene acceso a TODO
      MODULOS.VISTA_ASESOR,
      MODULOS.SEGUIMIENTO_VENTAS,
      MODULOS.INDICADORES,
      MODULOS.REDES
    ]
  },
  
  VELSA: {
    ASESOR: [
      MODULOS.VISTA_ASESOR_VELSA,
      MODULOS.SEGUIMIENTO_VELSA
    ],
    SUPERVISOR: [
      MODULOS.VISTA_ASESOR_VELSA,
      MODULOS.SEGUIMIENTO_VELSA,
      MODULOS.INDICADORES_VELSA
    ],
    ANALISTA: [
      MODULOS.VISTA_ASESOR_VELSA,
      MODULOS.SEGUIMIENTO_VELSA,
      MODULOS.INDICADORES_VELSA,
      MODULOS.REDES_VELSA
    ],
    GERENCIA: [
      // GERENCIA tiene acceso a TODO de VELSA
      MODULOS.VISTA_ASESOR_VELSA,
      MODULOS.SEGUIMIENTO_VELSA,
      MODULOS.INDICADORES_VELSA,
      MODULOS.REDES_VELSA
    ],
    ADMINISTRADOR: [
      // ADMINISTRADOR tiene acceso a TODO
      MODULOS.VISTA_ASESOR_VELSA,
      MODULOS.SEGUIMIENTO_VELSA,
      MODULOS.INDICADORES_VELSA,
      MODULOS.REDES_VELSA
    ]
  }
};

/**
 * Función: Obtener módulos permitidos para un usuario
 * @param {string} empresa - Empresa del usuario (ej: 'NOVONET')
 * @param {string} perfil - Perfil del usuario (ej: 'ASESOR')
 * @returns {Array} Array de módulos permitidos
 */
function obtenerPermisosUsuario(empresa, perfil) {
  const empresaNorm = empresa?.toUpperCase();
  const perfilNorm = perfil?.toUpperCase();
  
  // ADMINISTRADOR tiene acceso TOTAL a todo
  if (perfilNorm === 'ADMINISTRADOR') {
    return Object.values(MODULOS);
  }
  
  // Buscar permisos en la matriz
  if (!PERMISOS_POR_EMPRESA_PERFIL[empresaNorm]) {
    console.warn(`⚠️ Empresa no configurada: ${empresaNorm}`);
    return [];
  }
  
  if (!PERMISOS_POR_EMPRESA_PERFIL[empresaNorm][perfilNorm]) {
    console.warn(`⚠️ Perfil no configurado para ${empresaNorm}: ${perfilNorm}`);
    return [];
  }
  
  return PERMISOS_POR_EMPRESA_PERFIL[empresaNorm][perfilNorm];
}

/**
 * Función: Verificar si usuario puede acceder a un módulo específico
 * @param {string} empresa 
 * @param {string} perfil 
 * @param {string} modulo 
 * @returns {boolean}
 */
function puedeAccederAlModulo(empresa, perfil, modulo) {
  const modulos = obtenerPermisosUsuario(empresa, perfil);
  return modulos.includes(modulo);
}

module.exports = {
  MODULOS,
  PERMISOS_POR_EMPRESA_PERFIL,
  obtenerPermisosUsuario,
  puedeAccederAlModulo
};