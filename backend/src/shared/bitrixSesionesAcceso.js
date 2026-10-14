const PERFILES_BITRIX_LIVE = new Set(['SUPERVISOR', 'GERENCIA', 'ADMINISTRADOR']);
const EMPRESAS_BITRIX_LIVE = new Set(['NOVONET', 'VELSA']);

function empresaVisible(usuario) {
  const perfil = String(usuario?.perfil || '').trim().toUpperCase();
  const empresa = String(usuario?.empresa || '').trim().toUpperCase();
  if (!PERFILES_BITRIX_LIVE.has(perfil) || !EMPRESAS_BITRIX_LIVE.has(empresa)) return null;
  return empresa;
}

function puedeCerrarJornada(usuario) {
  return empresaVisible(usuario) !== null;
}

module.exports = { PERFILES_BITRIX_LIVE, EMPRESAS_BITRIX_LIVE, empresaVisible, puedeCerrarJornada };
