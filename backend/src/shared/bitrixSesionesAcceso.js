const PERFILES_BITRIX_LIVE = new Set(['SUPERVISOR', 'GERENCIA', 'GERENTE', 'ADMINISTRADOR']);
const EMPRESAS_BITRIX_LIVE = new Set(['NOVONET', 'VELSA']);

function esJasimbana(usuario) {
  const login = String(usuario?.usuario || usuario?.username || '').trim().toLowerCase();
  return login === 'jasimbana';
}

function empresaVisible(usuario) {
  const perfil = String(usuario?.perfil || '').trim().toUpperCase();
  const empresa = String(usuario?.empresa || '').trim().toUpperCase();
  const perfilPermitido = esJasimbana(usuario) || PERFILES_BITRIX_LIVE.has(perfil) || perfil.startsWith('SUPERVISOR');
  if (!perfilPermitido || !EMPRESAS_BITRIX_LIVE.has(empresa)) return null;
  return empresa;
}

function empresasVisibles(usuario) {
  if (esJasimbana(usuario)) return ['NOVONET', 'VELSA'];
  const empresa = empresaVisible(usuario);
  return empresa ? [empresa] : [];
}

function puedeCerrarJornada(usuario) {
  return empresaVisible(usuario) !== null;
}

module.exports = { PERFILES_BITRIX_LIVE, EMPRESAS_BITRIX_LIVE, esJasimbana, empresaVisible, empresasVisibles, puedeCerrarJornada };
