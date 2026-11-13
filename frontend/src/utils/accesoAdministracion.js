const normalizar = (valor) => String(valor || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toUpperCase();

export function perfilAdministracion(valor) {
  const perfil = normalizar(valor);
  if (perfil === 'ADMINISTRADOR') return 'ADMINISTRADOR';
  if (perfil === 'GERENCIA' || perfil === 'GERENTE' || /^GEREN(?:CIA|TE)[ _-]/.test(perfil)) return 'GERENCIA';
  return null;
}

// Administración y Horarios: administradores y perfiles gerenciales.
export const puedeAccederAdministracion = (perfil) => perfilAdministracion(perfil) !== null;

// Analista entra únicamente a Comisiones, no al resto de Administración.
export const puedeAccederComisiones = (perfil) => {
  const normalizado = normalizar(perfil);
  return puedeAccederAdministracion(normalizado) || ['ANALISTA', 'CONTABILIDAD'].includes(normalizado);
};

// Billetera no abre el resto de Administracion para CONTABILIDAD.
export const puedeAccederBilletera = (perfil) => {
  const normalizado = normalizar(perfil);
  return puedeAccederAdministracion(normalizado) || normalizado === 'CONTABILIDAD';
};

export const puedeVerMenuAdministracion = (perfil) => puedeAccederComisiones(perfil);
