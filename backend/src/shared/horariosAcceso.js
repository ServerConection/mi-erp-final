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
const puedeAccederHorarios = (perfil) => esAdminGerencia(perfil) || esSupervisor(perfil);

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
  puedeAccederHorarios,
  empresaHorarios,
};
