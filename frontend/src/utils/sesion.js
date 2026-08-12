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

// 'userProfile' es la clave real que usan Login.jsx / DashboardLayout.jsx.
// 'user' y 'permisos' quedan por el hook viejo (useAuth.js) que también
// las usa en algunos puntos sueltos — no cuesta nada limpiarlas también.
const CLAVES = ['token', 'userProfile', 'user', 'permisos'];

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
 * INTERCEPTOR GLOBAL DE SESIÓN
 *
 * El ERP tiene ~190 llamadas fetch() repartidas en decenas de páginas, y
 * solo un par de ellas pasan por fetchConSesion(). Migrar todas es
 * demasiado riesgo para "ya mismo" — en vez de eso, se parchea window.fetch
 * una sola vez al arrancar la app: cualquier 401 que devuelva NUESTRO
 * backend (no APIs externas) fuerza el cierre de sesión, sin importar
 * desde qué archivo salió el fetch.
 *
 * Se excluyen los endpoints de login/OTP: un 401 ahí es "clave incorrecta",
 * no "sesión vencida", y no debe disparar el cierre.
 */
const RUTAS_LOGIN_EXCLUIDAS = ['/api/otp/login', '/api/otp/verify-otp', '/api/auth/login'];

/**
 * ¿La URL apunta a NUESTRO backend?
 *
 * El comentario de arriba siempre dijo "no APIs externas", pero el código no
 * lo comprobaba: cualquier 401 de cualquier host (Ollama, Bitrix, un CDN con
 * auth, etc.) cerraba la sesión del usuario. Aquí sí se comprueba.
 *
 * Se aceptan tanto URLs absolutas contra VITE_API_URL como rutas relativas
 * que empiecen por /api (el gateway del mismo origen).
 */
function esNuestroBackend(url) {
  if (!url) return false;
  try {
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
    const absoluta = /^https?:\/\//i.test(url);

    if (!absoluta) return url.startsWith('/api');
    if (base && url.startsWith(base)) return true;

    // Mismo origen que la app: también es nuestro backend.
    return new URL(url).origin === window.location.origin;
  } catch (_) {
    return false;
  }
}

let interceptorInstalado = false;

export function instalarInterceptorSesion() {
  if (interceptorInstalado) return;
  interceptorInstalado = true;

  const fetchOriginal = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const respuesta = await fetchOriginal(...args);

    try {
      const entrada = args[0];
      const url = typeof entrada === 'string' ? entrada : (entrada?.url || '');
      const esRutaExcluida = RUTAS_LOGIN_EXCLUIDAS.some(r => url.includes(r));
      const habiaSesion = !!localStorage.getItem('token');

      if (
        respuesta.status === 401 &&
        !esRutaExcluida &&
        habiaSesion &&
        esNuestroBackend(url)
      ) {
        cerrarSesionPorTokenExpirado('Tu sesión expiró. Inicia sesión de nuevo.');
      }
    } catch (_) { /* nunca romper el fetch original por esto */ }

    return respuesta;
  };
}

/**
 * Cabeceras de autenticación para los fetch() sueltos que no pueden pasar
 * por fetchConSesion (por ejemplo, los que van dentro de un Promise.all
 * encadenado con .then). Devuelve {} si no hay token.
 */
export function cabecerasSesion() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
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
