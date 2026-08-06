/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLIENTE API + SOCKET: Archivos Compartidos
 * ═══════════════════════════════════════════════════════════════════════════════
 * Todo lo que habla con /api/hojas pasa por aquí. Un solo lugar donde tocar la
 * URL, el token y el manejo de errores.
 */

import { useCallback, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const BASE = `${import.meta.env.VITE_API_URL}/api/hojas`;

const cabeceras = (json = true) => {
  const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

/** Lanza un Error con el mensaje que devolvió el backend, no un genérico. */
async function pedir(ruta, { method = 'GET', body, blob = false, form } = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    method,
    headers: form ? cabeceras(false) : cabeceras(),
    body: form || (body ? JSON.stringify(body) : undefined),
  });

  if (blob) {
    if (!res.ok) throw new Error('No se pudo generar el archivo');
    return res.blob();
  }

  let data = {};
  try { data = await res.json(); } catch { /* respuesta sin cuerpo */ }

  if (!res.ok || data.success === false) {
    const err = new Error(data.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const hojasApi = {
  listar:    (archivadas) => pedir(archivadas ? '/?archivadas=true' : '/'),
  crear:     (body)       => pedir('/', { method: 'POST', body }),
  detalle:   (id)         => pedir(`/${id}`),
  editar:    (id, body)   => pedir(`/${id}`, { method: 'PATCH', body }),
  archivar:  (id, archivar = true) => pedir(`/${id}/archivar`, { method: 'PATCH', body: { archivar } }),

  usuarios:  (q = '')     => pedir(`/usuarios${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  permisos:  (id)               => pedir(`/${id}/permisos`),
  compartir: (id, usuarioId, nivel) =>
    pedir(`/${id}/permisos`, { method: 'PUT', body: { usuarioId, nivel } }),
  quitarAcceso: (id, usuarioId) =>
    pedir(`/${id}/permisos/${usuarioId}`, { method: 'DELETE' }),

  crearColumna:    (id, body)       => pedir(`/${id}/columnas`, { method: 'POST', body }),
  editarColumna:   (id, colId, body) => pedir(`/${id}/columnas/${colId}`, { method: 'PATCH', body }),
  eliminarColumna: (id, colId)      => pedir(`/${id}/columnas/${colId}`, { method: 'DELETE' }),

  crearFila:    (id)          => pedir(`/${id}/filas`, { method: 'POST' }),
  eliminarFila: (id, filaId)  => pedir(`/${id}/filas/${filaId}`, { method: 'DELETE' }),

  guardarCelda: (id, filaId, columnaId, valor) =>
    pedir(`/${id}/celdas`, { method: 'PUT', body: { filaId, columnaId, valor } }),

  historial: (id) => pedir(`/${id}/historial`),
  exportar:  (id) => pedir(`/${id}/exportar`, { blob: true }),
  importar:  (id, archivo) => {
    const form = new FormData();
    form.append('archivo', archivo);
    return pedir(`/${id}/importar`, { method: 'POST', form });
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// SOCKET
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Una sola conexión para toda la app, compartida entre pestañas del módulo.
 * Abrir un socket por componente satura el navegador y el servidor.
 */
let socketCompartido = null;

function obtenerSocket() {
  if (socketCompartido?.connected || socketCompartido?.connecting) return socketCompartido;

  socketCompartido = io(import.meta.env.VITE_API_URL, {
    auth: { token: localStorage.getItem('token') },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1500,
  });
  return socketCompartido;
}

/**
 * Conecta a la sala de una hoja y devuelve el socket ya suscrito.
 * `manejadores` es un objeto { 'hoja:celda': fn, 'hoja:presencia': fn, ... }.
 *
 * Se vuelve a emitir `hoja:entrar` en cada reconexión: si el servidor se
 * reinició, la sala se rearma sola sin que el usuario note nada.
 */
export function useSocketHoja(hojaId, manejadores) {
  // Ref para que cambiar los manejadores no re-suscriba el socket entero.
  // Se actualiza en un efecto (no durante el render) para no leer/escribir
  // refs mientras React está renderizando.
  const refManejadores = useRef(manejadores);
  useEffect(() => { refManejadores.current = manejadores; });

  useEffect(() => {
    if (!hojaId) return undefined;

    const socket = obtenerSocket();
    const entrar = () => socket.emit('hoja:entrar', { hojaId });

    const eventos = [
      'hoja:celda', 'hoja:fila-creada', 'hoja:fila-eliminada',
      'hoja:columna-creada', 'hoja:columna-editada', 'hoja:columna-eliminada',
      'hoja:presencia', 'hoja:foco', 'hoja:permisos',
      'hoja:actualizada', 'hoja:archivada', 'hoja:recargar', 'hoja:denegado',
    ];

    const despachar = {};
    for (const evento of eventos) {
      despachar[evento] = (payload) => refManejadores.current?.[evento]?.(payload);
      socket.on(evento, despachar[evento]);
    }

    socket.on('connect', entrar);
    if (socket.connected) entrar();

    return () => {
      socket.emit('hoja:salir', { hojaId });
      socket.off('connect', entrar);
      for (const evento of eventos) socket.off(evento, despachar[evento]);
    };
  }, [hojaId]);

  const avisarFoco = useCallback((filaId, columnaId) => {
    if (!hojaId) return;
    obtenerSocket().emit('hoja:foco', { hojaId, filaId, columnaId });
  }, [hojaId]);

  return { avisarFoco };
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILIDADES COMPARTIDAS
// ══════════════════════════════════════════════════════════════════════════════

/** ¿Este nivel permite escribir? */
export const puedeEditar = (nivel) => ['ADMIN', 'DUENO', 'EDITOR'].includes(nivel);
/** ¿Este nivel permite tocar columnas y permisos? */
export const esDueno     = (nivel) => ['ADMIN', 'DUENO'].includes(nivel);

export const ETIQUETA_NIVEL = {
  ADMIN:  'Administrador',
  DUENO:  'Creador',
  EDITOR: 'Puede editar',
  LECTOR: 'Solo lectura',
};

/** Descarga un blob con el nombre indicado. */
export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
