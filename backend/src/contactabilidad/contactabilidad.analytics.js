const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function construirFiltros(query = {}) {
  const params = [];
  const where = [];
  const add = (value, clause) => {
    params.push(value);
    where.push(clause(params.length));
  };

  if (query.empresa) add(String(query.empresa).toUpperCase(), (n) => `l.empresa = $${n}`);
  if (query.origen) add(String(query.origen), (n) => `COALESCE(l.origen_nombre,'') = $${n}`);
  if (query.asesor_id) add(String(query.asesor_id), (n) => `l.asesor_id = $${n}`);
  if (query.etapa) add(String(query.etapa), (n) => `COALESCE(l.etapa_nombre,l.etapa_id,'') = $${n}`);
  for (const key of ['desde', 'hasta']) {
    if (query[key] && !FECHA.test(query[key])) throw new TypeError(`${key} debe usar YYYY-MM-DD`);
  }
  if (query.desde) add(query.desde, (n) => `(l.fecha_creacion AT TIME ZONE 'America/Guayaquil')::date >= $${n}::date`);
  if (query.hasta) add(query.hasta, (n) => `(l.fecha_creacion AT TIME ZONE 'America/Guayaquil')::date <= $${n}::date`);

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

module.exports = { construirFiltros };
