/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MIDDLEWARE DE AUTORIZACIÓN: VALIDAR PERMISOS POR MÓDULO
 * Uso: router.get('/ruta', auth, requierePermiso('NombreDelModulo'), controlador)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const { puedeAccederAlModulo } = require('../config/permisos.config');

/**
 * Middleware factory: Validar acceso a un módulo específico
 * 
 * @param {string} modulo - Nombre del módulo a validar (ej: 'VistaAsesor', 'SeguimientoVentas')
 * @returns {Function} Middleware que valida el acceso
 * 
 * EJEMPLO DE USO:
 * router.get('/novonet/vista-asesor', 
 *   auth, 
 *   requierePermiso('VistaAsesor'), 
 *   miControlador
 * );
 */
function requierePermiso(modulo) {
  return (req, res, next) => {
    // Validar que el usuario esté autenticado
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'No autenticado' 
      });
    }

    const { empresa, perfil } = req.user;

    // Verificar permisos
    const tieneAcceso = puedeAccederAlModulo(empresa, perfil, modulo);

    if (!tieneAcceso) {
      return res.status(403).json({
        success: false,
        error: `No tienes permisos para acceder a este módulo`,
        detalles: {
          modulo: modulo,
          empresa: empresa,
          perfil: perfil
        }
      });
    }

    next();
  };
}

module.exports = requierePermiso;