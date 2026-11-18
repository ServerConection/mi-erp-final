const PERFILES_BITRIX_LIVE = new Set(['SUPERVISOR', 'GERENCIA', 'GERENTE', 'ADMINISTRADOR']);
const EMPRESAS_BITRIX_LIVE = new Set(['NOVONET', 'VELSA']);

function empresaVisible(usuario) {
  const perfil = String(usuario?.perfil || '').trim().toUpperCase();
  const empresa = String(usuario?.empresa || '').trim().toUpperCase();
  const perfilPermitido = PERFILES_BITRIX_LIVE.has(perfil) || perfil.startsWith('SUPERVISOR');
  if (!perfilPermitido || !EMPRESAS_BITRIX_LIVE.has(empresa)) return null;
  return empresa;
}

function puedeCerrarJornada(usuario) {
  return empresaVisible(usuario) !== null;
}

module.exports = { PERFILES_BITRIX_LIVE, EMPRESAS_BITRIX_LIVE, empresaVisible, puedeCerrarJornada };
