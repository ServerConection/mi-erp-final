import { jwtDecode } from 'jwt-decode';

const normalizar = (valor) => String(valor || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toUpperCase();

export function perfilGestionables(valor) {
  const perfil = normalizar(valor);
  if (perfil === 'ADMINISTRADOR') return 'ADMINISTRADOR';
  if (perfil === 'GERENCIA' || perfil === 'GERENTE' || perfil.startsWith('GERENCIA ') || perfil.startsWith('GERENTE ')) return 'GERENCIA';
  if (perfil === 'SUPERVISOR' || perfil === 'SUPERVISORA' || perfil.startsWith('SUPERVISOR ')) return 'SUPERVISOR';
  return null;
}

export function empresaGestionables(valor) {
  const empresa = normalizar(valor);
  if (empresa === 'NOVONET' || empresa.startsWith('NOVONET ')) return 'NOVONET';
  if (empresa === 'VELSA' || empresa.startsWith('VELSA ')) return 'VELSA';
  return null;
}

export function tieneAccesoGestionables(usuario, empresaObjetivo) {
  const perfil = perfilGestionables(usuario?.perfil || usuario?.rol);
  const empresa = empresaGestionables(usuario?.empresa);
  const objetivo = empresaGestionables(empresaObjetivo);

  return perfil !== null && empresa !== null && empresa === objetivo;
}

export function puedeAccederGestionables(empresaObjetivo) {
  try {
    const token = localStorage.getItem('token');
    if (!token) return false;
    const tokenUser = jwtDecode(token);
    let storedUser = {};
    try {
      storedUser = JSON.parse(localStorage.getItem('userProfile') || localStorage.getItem('user') || '{}');
    } catch { /* el backend seguirá validando la identidad real */ }
    return tieneAccesoGestionables({ ...storedUser, ...tokenUser }, empresaObjetivo);
  } catch {
    return false;
  }
}
