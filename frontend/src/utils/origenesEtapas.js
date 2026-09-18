export function agruparOrigenesEtapas(filas) {
  const origenes = new Map();
  for (const fila of filas) {
    const origen = fila.origen || 'SIN ORIGEN', etapa = fila.etapa || 'SIN ETAPA';
    const total = Number(fila.total) || 0;
    if (!origenes.has(origen)) origenes.set(origen, { nombre: origen, total: 0, dias: {}, etapas: new Map() });
    const grupo = origenes.get(origen);
    if (!grupo.etapas.has(etapa)) grupo.etapas.set(etapa, { nombre: etapa, total: 0, dias: {} });
    const detalle = grupo.etapas.get(etapa);
    grupo.total += total; detalle.total += total;
    grupo.dias[fila.fecha] = (grupo.dias[fila.fecha] || 0) + total;
    detalle.dias[fila.fecha] = (detalle.dias[fila.fecha] || 0) + total;
  }
  const orden = nombre => ({ ATC: 0, 'VENTA SUBIDA': 1, DESCARTE: 2 })[nombre] ?? 3;
  return [...origenes.values()].map(g => ({ ...g, etapas: [...g.etapas.values()].sort((a, b) => orden(a.nombre) - orden(b.nombre) || b.total - a.total || a.nombre.localeCompare(b.nombre, 'es')) }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
}
export function diasPeriodo(desde, hasta) {
  const inicio = Date.parse(`${desde}T00:00:00Z`), fin = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin < inicio) return [];
  const dias = [];
  for (let fecha = inicio; fecha <= fin; fecha += 86400000) dias.push(new Date(fecha).toISOString().slice(0, 10));
  return dias;
}
