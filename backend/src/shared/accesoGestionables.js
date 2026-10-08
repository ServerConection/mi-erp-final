const PERFILES_GESTIONABLES = new Set(['SUPERVISOR', 'GERENCIA', 'ADMINISTRADOR']);

function puedeAccederGestionables(usuario, empresaObjetivo) {
  const perfil = String(usuario?.perfil || '').trim().toUpperCase();
  const empresa = String(usuario?.empresa || '').trim().toUpperCase();
  const objetivo = String(empresaObjetivo || '').trim().toUpperCase();

  return PERFILES_GESTIONABLES.has(perfil)
    && ['NOVONET', 'VELSA'].includes(objetivo)
    && empresa === objetivo;
}

module.exports = { PERFILES_GESTIONABLES, puedeAccederGestionables };
