const normalizar = (valor) => String(valor || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toUpperCase();

export function perfilAdministracion(valor) {
  const perfil = normalizar(valor);
  if (perfil === 'ADMINISTRADOR') return 'ADMINISTRADOR';
  if (perfil === 'GERENCIA' || perfil === 'GERENTE' || /^GEREN(?:CIA|TE)[ _-]/.test(perfil)) return 'GERENCIA';
  return null;
}

// Administración y Horarios: SOLO perfil ADMINISTRADOR.
export const puedeAccederAdministracion = (perfil) => perfilAdministracion(perfil) === 'ADMINISTRADOR';
