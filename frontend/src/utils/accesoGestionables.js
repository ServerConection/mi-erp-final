import { jwtDecode } from 'jwt-decode';

export function puedeAccederGestionables() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return false;
    const user = jwtDecode(token);
    return ['ADMINISTRADOR', 'GERENCIA'].includes((user.perfil || user.rol || '').toUpperCase())
      || Number(user.id) === 76;
  } catch {
    return false;
  }
}
