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
const puedeAccederHorarios = (perfil, usuario) => esAdminGerencia(perfil) || esSupervisor(perfil) || esLectorEspecial(usuario);

function empresaHorarios(req) {
  const empresaUsuario = String(req.user?.empresa || '').trim().toUpperCase();
  const solicitada = String(req.query?.empresa || req.body?.empresa || empresaUsuario || 'NOVONET').trim().toUpperCase();
  if (esSupervisor(req.user?.perfil) && solicitada !== empresaUsuario) return null;
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
