export function construirUrlListado(api, empresa, fechaCreacion = '') {
  const query = new URLSearchParams({ empresa });
  if (fechaCreacion) query.set('fecha_creacion', fechaCreacion);
  return `${api}?${query.toString()}`;
}

export function fechaHoraEcuador(iso) {
  if (!iso) return 'Hora no disponible';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return 'Hora no disponible';
  return fecha.toLocaleString('es-EC', {
    timeZone: 'America/Guayaquil', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function obtenerBorradorNuevo(actuales = [], anteriores = []) {
  const idsAnteriores = new Set(anteriores.map((x) => String(x.id)));
  return actuales.find((x) => !idsAnteriores.has(String(x.id))) || null;
}
