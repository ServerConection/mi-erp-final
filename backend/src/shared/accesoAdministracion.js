const PERFILES_ADMINISTRACION = new Set(['ADMINISTRADOR', 'GERENCIA']);

function puedeAccederAdministracion(perfil) {
  return PERFILES_ADMINISTRACION.has(String(perfil || '').trim().toUpperCase());
}

function soloAdministracion(req, res, next) {
  if (!puedeAccederAdministracion(req.user?.perfil)) {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado. Este modulo es exclusivo de Administracion y Gerencia.',
    });
  }
  next();
}

module.exports = { PERFILES_ADMINISTRACION, puedeAccederAdministracion, soloAdministracion };
