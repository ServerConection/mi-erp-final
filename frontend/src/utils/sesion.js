/**
 * MANEJO DE SESIÓN EXPIRADA
 *
 * Cuando el backend responde 401, el token ya no sirve. En vez de dejar
 * pantallas a medias (tablas vacías, cuadros en cero), se cierra la sesión
 * y se manda al login.
 *
 * Antes esto no existía: el usuario veía el dashboard cargado pero los
 * módulos que sí exigen JWT salían vacíos, sin explicación. Pasaba solo en
 * los dispositivos con la sesión vieja, que es lo que lo hacía confuso.
 */

const CLAVES = ['token', 'user', 'permisos'];

let yaRedirigiendo = false;   // evita bucles si varias llamadas fallan a la vez

/** Borra la sesión y manda al login con un aviso. */
export function cerrarSesionPorTokenExpirado(motivo = 'Tu sesión expiró') {
  if (yaRedirigiendo) return;
  yaRedirigiendo = true;

  CLAVES.forEach(k => localStorage.removeItem(k));

  try {
    sessionStorage.setItem('__motivo_logout__', motivo);
  } catch (_) { /* modo privado: no es crítico */ }

  // replace y no href: así el botón "atrás" no devuelve a una pantalla muerta
  window.location.replace('/login');
}

/**
 * fetch con sesión: agrega el Bearer y cierra sesión si el backend
 * responde 401. Devuelve la Response tal cual para el resto de casos.
 */
export async function fetchConSesion(url, opciones = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    ...opciones,
    headers: {
      ...(opciones.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401) {
    cerrarSesionPorTokenExpirado();
    throw new Error('Sesión expirada');
  }
  return res;
}
