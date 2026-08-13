/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLIENTE API: Evaluaciones
 * ═══════════════════════════════════════════════════════════════════════════════
 * Mismo patrón que useHojas.js / useChat.js.
 */

const BASE = `${import.meta.env.VITE_API_URL}/api/evaluaciones`;

const cabeceras = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

async function pedir(ruta, { method = 'GET', body, blob = false } = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    method,
    headers: cabeceras(),
    body: body ? JSON.stringify(body) : undefined,
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
    err.resultado = data.resultado; // usado por 409 "ya respondiste"
    throw err;
  }
  return data;
}

export const evaluacionesApi = {
  listar:     () => pedir('/'),
  mias:       () => pedir('/mias'),
  crear:      (body) => pedir('/', { method: 'POST', body }),
  archivar:   (id, activa) => pedir(`/${id}/archivar`, { method: 'PATCH', body: { activa } }),

  detalleParaTomar: (id) => pedir(`/${id}`),
  responder:        (id, respuestas) => pedir(`/${id}/responder`, { method: 'POST', body: { respuestas } }),

  resultados: (id) => pedir(`/${id}/resultados`),
  exportar:   (id) => pedir(`/${id}/resultados/exportar`, { blob: true }),
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
