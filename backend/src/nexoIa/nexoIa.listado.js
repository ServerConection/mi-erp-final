function fechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [y, m, d] = fecha.split('-').map(Number);
  const valor = new Date(Date.UTC(y, m - 1, d));
  return valor.getUTCFullYear() === y && valor.getUTCMonth() === m - 1 && valor.getUTCDate() === d;
}

function construirListado({ empresa, fechaCreacion = '', asesorNombre = '' }) {
  if (fechaCreacion && !fechaValida(fechaCreacion)) throw new RangeError('Fecha invalida');
  const parametros = [empresa];
  const condiciones = ["l.empresa=$1", "l.fecha_creacion>=DATE '2026-08-15'"];
  if (fechaCreacion) {
    parametros.push(fechaCreacion);
    condiciones.push(`(l.fecha_creacion AT TIME ZONE 'America/Guayaquil')::date=$${parametros.length}::date`);
  }
  if (asesorNombre) {
    parametros.push(`%${asesorNombre}%`);
    condiciones.push(`l.asesor_nombre ILIKE $${parametros.length}`);
  }
  const texto = `SELECT l.empresa,l.id_bitrix,l.nombre_cliente,l.asesor_nombre,l.etapa_nombre,l.etapa_id,l.fecha_creacion,l.pendiente_por,l.ultimo_mensaje_cliente_at,l.ultimo_mensaje_asesor_at,s.id sugerencia_id,s.respuesta_sugerida,s.creado_at sugerida_at,j.estado
    FROM contactabilidad_leads l
    LEFT JOIN LATERAL(SELECT * FROM nexo_ia_sugerencias s WHERE s.empresa=l.empresa AND s.id_bitrix=l.id_bitrix ORDER BY s.creado_at DESC LIMIT 1)s ON TRUE
    LEFT JOIN nexo_ia_jobs j ON j.id=s.job_id
    WHERE ${condiciones.join(' AND ')}
    ORDER BY l.fecha_creacion DESC,l.id_bitrix DESC
    LIMIT 200`;
  return { texto, parametros };
}

module.exports = { construirListado, fechaValida };
