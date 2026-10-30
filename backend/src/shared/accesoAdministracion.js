// Administración y Horarios: administradores y perfiles gerenciales.
const PERFILES_ADMINISTRACION = new Set(['ADMINISTRADOR', 'GERENCIA', 'GERENTE']);

function perfilAdministracion(valor) {
  const perfil = String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ').toUpperCase();
  if (perfil === 'ADMINISTRADOR') return 'ADMINISTRADOR';
  if (perfil === 'GERENCIA' || perfil === 'GERENTE' || /^GEREN(?:CIA|TE)[ _-]/.test(perfil)) return 'GERENCIA';
  return null;
}

function puedeAccederAdministracion(perfil) { return perfilAdministracion(perfil) !== null; }

function puedeAccederComisiones(perfil) {
  const normalizado = String(perfil || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ').toUpperCase();
  return puedeAccederAdministracion(normalizado) || normalizado === 'ANALISTA';
}

function soloAdministracion(req, res, next) {
  if (!puedeAccederAdministracion(req.user?.perfil)) {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado. Este módulo es exclusivo de Administración y Gerencia.',
    });
  }
  next();
}

function soloComisiones(req, res, next) {
  if (!puedeAccederComisiones(req.user?.perfil)) {
    return res.status(403).json({ success: false, error: 'No tienes acceso al módulo de Comisiones.' });
  }
  next();
}

module.exports = { PERFILES_ADMINISTRACION, perfilAdministracion, puedeAccederAdministracion, puedeAccederComisiones, soloAdministracion, soloComisiones };
