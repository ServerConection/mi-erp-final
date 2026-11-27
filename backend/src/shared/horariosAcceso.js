const EMPRESAS_HORARIOS = new Set(['NOVONET', 'VELSA']);

const normPerfil = (perfil) => String(perfil || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toUpperCase();

const esAdminGerencia = (perfil) => {
  const valor = normPerfil(perfil);
  return valor === 'ADMINISTRADOR' || valor === 'GERENCIA' || valor === 'GERENTE' || /^GEREN(CIA|TE)[ _-]/.test(valor);
};

const esSupervisor = (perfil) => normPerfil(perfil).startsWith('SUPERVISOR');
const esLectorEspecial = (usuario) => normPerfil(usuario) === 'JASIMBANA';
// Cualquier usuario con sesión entra: el asesor solo ve su propio horario;
// supervisor, gerencia y administración ven a todos (ver veTodo en horarios.routes.js).
const puedeAccederHorarios = (perfil) => normPerfil(perfil) !== '';

function empresaHorarios(req) {
  const empresaUsuario = String(req.user?.empresa || '').trim().toUpperCase();
  const solicitada = String(req.query?.empresa || req.body?.empresa || empresaUsuario || 'NOVONET').trim().toUpperCase();
  // Solo Admin/Gerencia y el lector especial cambian de empresa; el resto queda en la suya.
  const libre = esAdminGerencia(req.user?.perfil) || esLectorEspecial(req.user?.usuario);
  if (!libre && solicitada !== (empresaUsuario || 'NOVONET')) return null;
  return EMPRESAS_HORARIOS.has(solicitada) ? solicitada : null;
}

module.exports = {
  EMPRESAS_HORARIOS,
  normPerfil,
  esAdminGerencia,
  esSupervisor,
  esLectorEspecial,
  puedeAccederHorarios,
  empresaHorarios,
};
