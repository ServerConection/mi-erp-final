const normalizarPerfil = (perfil = '') => String(perfil)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toUpperCase();

export const puedeAccederAutomarcador = (perfil) => {
  const p = normalizarPerfil(perfil);
  return p === 'ADMINISTRADOR'
    || p === 'SUPERVISOR'
    || p === 'COORDINADOR'
    || p === 'ANALISTA'
    || /^GEREN(CIA|TE|TA|CIAL)(?:[ _-].*)?$/.test(p);
};

