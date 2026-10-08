import { jwtDecode } from 'jwt-decode';

const PERFILES_GESTIONABLES = new Set(['SUPERVISOR', 'GERENCIA', 'ADMINISTRADOR']);

export function tieneAccesoGestionables(usuario, empresaObjetivo) {
  const perfil = String(usuario?.perfil || usuario?.rol || '').trim().toUpperCase();
  const empresa = String(usuario?.empresa || '').trim().toUpperCase();
  const objetivo = String(empresaObjetivo || '').trim().toUpperCase();

  return PERFILES_GESTIONABLES.has(perfil)
    && ['NOVONET', 'VELSA'].includes(objetivo)
    && empresa === objetivo;
}

export function puedeAccederGestionables(empresaObjetivo) {
  try {
    const token = localStorage.getItem('token');
    if (!token) return false;
    return tieneAccesoGestionables(jwtDecode(token), empresaObjetivo);
  } catch {
    return false;
  }
}
