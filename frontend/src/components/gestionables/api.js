const API = import.meta.env.VITE_API_URL || 'http://localhost:3050';

// empresa: 'novonet' (por defecto) | 'velsa' → el backend usa las tablas de esa empresa
export const conEmpresa = (path, empresa) =>
  (!empresa || empresa === 'novonet') ? path : `${path}${path.includes('?') ? '&' : '?'}empresa=${encodeURIComponent(empresa)}`;

export async function repartoRequest(path, options = {}, empresa) {
  const response = await fetch(`${API}/api/gestionables-asesores${conEmpresa(path, empresa)}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'No se pudo completar la operación');
  return result;
}

export const hoyEc = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export const horaEc = (iso) => iso
  ? new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  : '—';
