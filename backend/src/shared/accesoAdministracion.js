const PERFILES_ADMINISTRACION = new Set(['ADMINISTRADOR', 'GERENCIA']);

function perfilAdministracion(valor) {
  const perfil = String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ').toUpperCase();
  if (perfil === 'ADMINISTRADOR') return 'ADMINISTRADOR';
  if (perfil === 'GERENCIA' || perfil === 'GERENTE' || /^GEREN(?:CIA|TE)[ _-]/.test(perfil)) return 'GERENCIA';
  return null;
}

function puedeAccederAdministracion(perfil) { return perfilAdministracion(perfil) !== null; }

function soloAdministracion(req, res, next) {
  if (!puedeAccederAdministracion(req.user?.perfil)) {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado. Este modulo es exclusivo de Administracion y Gerencia.',
    });
  }
  next();
}

module.exports = { PERFILES_ADMINISTRACION, perfilAdministracion, puedeAccederAdministracion, soloAdministracion };
