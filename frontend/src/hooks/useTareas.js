/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * HOOK / CLIENTE API: Módulo de Tareas y Acuerdos
 * ═══════════════════════════════════════════════════════════════════════════════
 * Toda llamada a /api/tareas pasa por aquí. Un solo lugar donde tocar la URL,
 * el token y el manejo de errores.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const API = `${import.meta.env.VITE_API_URL}/api/tareas`;

function headers(json = true) {
  const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

/** Lanza un Error con el mensaje que devolvió el backend, no un genérico. */
async function pedir(path, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: headers(!raw),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (raw) {
    if (!res.ok) throw new Error('No se pudo generar el archivo');
    return res.blob();
  }

  let data = {};
  try { data = await res.json(); } catch { /* respuesta sin cuerpo */ }

  if (!res.ok || data.success === false) {
    const err = new Error(data.error || `Error ${res.status}`);
    err.status = res.status;
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

// ══════════════════════════════════════════════════════════════════════════════
// API
// ══════════════════════════════════════════════════════════════════════════════

export const tareasApi = {
  catalogos:  ()               => pedir('/catalogos'),
  misTareas:  (rol)            => pedir(`/mis-tareas${rol ? `?rol=${rol}` : ''}`),
  listar:     (filtros = {})   => pedir(`/?${new URLSearchParams(limpiar(filtros))}`),
  detalle:    (id)             => pedir(`/${id}`),

  crear:      (datos)          => pedir('/', { method: 'POST',  body: datos }),
  editar:     (id, cambios)    => pedir(`/${id}`, { method: 'PATCH', body: cambios }),
  cambiarEstado: (id, estado, comentario) =>
                                  pedir(`/${id}/estado`, { method: 'PATCH', body: { estado, comentario } }),
  reasignar:  (id, responsable_id) =>
                                  pedir(`/${id}/reasignar`, { method: 'PATCH', body: { responsable_id } }),
  cancelar:   (id, motivo)     => pedir(`/${id}`, { method: 'DELETE', body: { motivo } }),

  comentar:   (id, comentario) => pedir(`/${id}/comentarios`, { method: 'POST', body: { comentario } }),
  editarComentario:   (cid, comentario) => pedir(`/comentarios/${cid}`, { method: 'PATCH', body: { comentario } }),
  eliminarComentario: (cid)    => pedir(`/comentarios/${cid}`, { method: 'DELETE' }),

  proyectos:      ()           => pedir('/proyectos'),
  crearProyecto:  (datos)      => pedir('/proyectos', { method: 'POST', body: datos }),

  dashboard:  (meses = 6)      => pedir(`/dashboard?meses=${meses}`),
  exportar:   (filtros = {})   => pedir(`/exportar?${new URLSearchParams(limpiar(filtros))}`, { raw: true }),

  notificaciones:  ()          => pedir('/notificaciones'),
  marcarLeida:     (id)        => pedir(`/notificaciones/${id}/leida`, { method: 'PATCH' }),
  marcarTodasLeidas: ()        => pedir('/notificaciones/leer-todas', { method: 'PATCH' }),
};

/** Quita claves vacías para no ensuciar la query string. */
function limpiar(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== '' && v !== null && v !== undefined && v !== false) out[k] = v;
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════
// HOOKS
// ══════════════════════════════════════════════════════════════════════════════

/** Catálogos (áreas, cargos, usuarios, proyectos). Se cargan una vez. */
export function useCatalogos() {
  const [catalogos, setCatalogos] = useState(null);
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState(null);

  useEffect(() => {
    let vivo = true;
    tareasApi.catalogos()
      .then(r => { if (vivo) setCatalogos(r.data); })
      .catch(e => { if (vivo) setError(e); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, []);

  return { catalogos, cargando, error };
}

/** Bandeja personal. `rol` = 'responsable' | 'solicitante'. */
export function useMisTareas(rol = 'responsable') {
  const [datos, setDatos]       = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState(null);

  const recargar = useCallback(() => {
    setCargando(true);
    return tareasApi.misTareas(rol)
      .then(r => { setDatos(r); setError(null); })
      .catch(setError)
      .finally(() => setCargando(false));
  }, [rol]);

  useEffect(() => { recargar(); }, [recargar]);

  return { datos, cargando, error, recargar };
}

/** Lista con filtros. Reconsulta sola cuando cambian los filtros (con debounce). */
export function useListaTareas(filtros) {
  const [datos, setDatos]       = useState({ tareas: [], paginacion: {} });
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState(null);
  const timer = useRef(null);

  const recargar = useCallback(() => {
    setCargando(true);
    return tareasApi.listar(filtros)
      .then(r => { setDatos(r); setError(null); })
      .catch(setError)
      .finally(() => setCargando(false));
  }, [JSON.stringify(filtros)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(recargar, 300);
    return () => clearTimeout(timer.current);
  }, [recargar]);

  return { ...datos, cargando, error, recargar };
}

/** Notificaciones con contador. Escucha socket.io si está disponible. */
export function useNotificacionesTareas() {
  const [items, setItems]       = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);

  const recargar = useCallback(() => {
    return tareasApi.notificaciones()
      .then(r => { setItems(r.data || []); setNoLeidas(r.no_leidas || 0); })
      .catch(() => { /* silencioso: la campanita no debe romper la app */ });
  }, []);

  useEffect(() => {
    recargar();
    const t = setInterval(recargar, 60000); // respaldo por si el socket cae
    return () => clearInterval(t);
  }, [recargar]);

  const marcarLeida = useCallback(async (id) => {
    await tareasApi.marcarLeida(id);
    recargar();
  }, [recargar]);

  const marcarTodas = useCallback(async () => {
    await tareasApi.marcarTodasLeidas();
    recargar();
  }, [recargar]);

  return { items, noLeidas, recargar, marcarLeida, marcarTodas };
}

/** Dispara la descarga del Excel en el navegador. */
export async function descargarExcel(filtros) {
  const blob = await tareasApi.exportar(filtros);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `tareas_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default tareasApi;
