function fechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [y, m, d] = fecha.split('-').map(Number);
  const valor = new Date(Date.UTC(y, m - 1, d));
  return valor.getUTCFullYear() === y && valor.getUTCMonth() === m - 1 && valor.getUTCDate() === d;
}

function enteroAcotado(valor, defecto, minimo, maximo) {
  const numero = Number.parseInt(valor, 10);
  return Math.min(maximo, Math.max(minimo, Number.isFinite(numero) ? numero : defecto));
}

function construirListado({ empresa, fechaCreacion = '', asesorNombre = '', pagina = 1, limite = 100 }) {
  if (fechaCreacion && !fechaValida(fechaCreacion)) throw new RangeError('Fecha invalida');
  const paginaSegura = enteroAcotado(pagina, 1, 1, 1000000);
  const limiteSeguro = enteroAcotado(limite, 100, 20, 200);
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
  const whereSql = condiciones.join(' AND ');
  const texto = `SELECT l.empresa,l.id_bitrix,l.nombre_cliente,l.asesor_nombre,l.etapa_nombre,l.etapa_id,l.fecha_creacion,l.pendiente_por,l.ultimo_mensaje_cliente_at,l.ultimo_mensaje_asesor_at,
      GREATEST(l.ultimo_mensaje_cliente_at,l.ultimo_mensaje_asesor_at,l.fecha_creacion) ultima_actividad,
      s.id sugerencia_id,s.respuesta_sugerida,s.creado_at sugerida_at,j.estado
    FROM contactabilidad_leads l
    LEFT JOIN LATERAL(SELECT * FROM nexo_ia_sugerencias s WHERE s.empresa=l.empresa AND s.id_bitrix=l.id_bitrix ORDER BY s.creado_at DESC LIMIT 1)s ON TRUE
    LEFT JOIN nexo_ia_jobs j ON j.id=s.job_id
    WHERE ${whereSql}
    ORDER BY GREATEST(l.ultimo_mensaje_cliente_at,l.ultimo_mensaje_asesor_at,l.fecha_creacion) DESC NULLS LAST,
             l.fecha_creacion DESC,l.id_bitrix DESC
    LIMIT ${limiteSeguro} OFFSET ${(paginaSegura - 1) * limiteSeguro}`;
  const textoTotal = `SELECT COUNT(*)::int total FROM contactabilidad_leads l WHERE ${whereSql}`;
  return { texto, textoTotal, parametros, pagina: paginaSegura, limite: limiteSeguro };
}

function construirListadoWabot({ empresa, fechaCreacion = '', asesorNombre = '', pagina = 1, limite = 100 }) {
  if (fechaCreacion && !fechaValida(fechaCreacion)) throw new RangeError('Fecha invalida');
  const paginaSegura = enteroAcotado(pagina, 1, 1, 1000000);
  const limiteSeguro = enteroAcotado(limite, 100, 20, 200);
  const parametros = [empresa];
  const condiciones = [
    `UPPER(BTRIM(u.empresa))=$1`,
    `c.bitrix_deal_id IS NOT NULL`,
    `COALESCE(w.fecha_creacion,c.started_at)>=DATE '2026-08-15'`,
  ];
  if (fechaCreacion) {
    parametros.push(fechaCreacion);
    condiciones.push(`(COALESCE(w.fecha_creacion,c.started_at) AT TIME ZONE 'America/Guayaquil')::date=$${parametros.length}::date`);
  }
  if (asesorNombre) {
    parametros.push(`%${asesorNombre}%`);
    condiciones.push(`CONCAT_WS(' ',u.nombres,u.apellidos) ILIKE $${parametros.length}`);
  }
  const universo = `
    FROM conversations c
    JOIN lines ln ON ln.id=c.line_id
    JOIN usuarios u ON u.id=ln.created_by
    LEFT JOIN contacts ct ON ct.id=c.contact_id
    LEFT JOIN LATERAL (
      SELECT bw.created_at AS fecha_creacion,bw.etapa,bw.responsible
      FROM bitrix_webhook_leads bw
      WHERE UPPER(BTRIM(bw.empresa))=$1 AND bw.bitrix_id=c.bitrix_deal_id
      ORDER BY bw.updated_at DESC NULLS LAST,bw.id DESC LIMIT 1
    ) w ON TRUE
    LEFT JOIN LATERAL (
      SELECT m.direction FROM messages m WHERE m.conversation_id=c.id
      ORDER BY m.timestamp DESC,m.id DESC LIMIT 1
    ) lm ON TRUE
    WHERE ${condiciones.join(' AND ')}`;
  const texto = `WITH base AS (
      SELECT DISTINCT ON (c.bitrix_deal_id)
        $1::text empresa,c.bitrix_deal_id id_bitrix,
        CASE WHEN NULLIF(BTRIM(ct.name),'') IS NULL OR BTRIM(ct.name)=c.wa_number THEN NULL
             ELSE BTRIM(ct.name) END nombre_cliente,
        CASE WHEN BTRIM(COALESCE(u.nombres,''))=BTRIM(COALESCE(u.apellidos,'')) THEN NULLIF(BTRIM(u.nombres),'')
             ELSE NULLIF(BTRIM(CONCAT_WS(' ',u.nombres,u.apellidos)),'') END asesor_nombre,
        COALESCE(w.etapa,'Conversacion WABOT') etapa_nombre,NULL::text etapa_id,
        COALESCE(w.fecha_creacion,c.started_at) fecha_creacion,
        CASE WHEN lm.direction='in' THEN 'ASESOR' ELSE 'CLIENTE' END pendiente_por,
        c.last_msg_at ultima_actividad,c.last_msg_at ultimo_mensaje_cliente_at,NULL::timestamptz ultimo_mensaje_asesor_at
      ${universo}
      ORDER BY c.bitrix_deal_id,c.last_msg_at DESC NULLS LAST,c.id DESC
    )
    SELECT b.*,s.id sugerencia_id,s.respuesta_sugerida,s.creado_at sugerida_at,j.estado
    FROM base b
    LEFT JOIN LATERAL(SELECT * FROM nexo_ia_sugerencias s WHERE s.empresa=b.empresa AND s.id_bitrix=b.id_bitrix ORDER BY s.creado_at DESC LIMIT 1)s ON TRUE
    LEFT JOIN nexo_ia_jobs j ON j.id=s.job_id
    ORDER BY b.ultima_actividad DESC NULLS LAST,b.fecha_creacion DESC,b.id_bitrix DESC
    LIMIT ${limiteSeguro} OFFSET ${(paginaSegura - 1) * limiteSeguro}`;
  const textoTotal = `SELECT COUNT(DISTINCT c.bitrix_deal_id)::int total ${universo}`;
  return { texto, textoTotal, parametros, pagina: paginaSegura, limite: limiteSeguro };
}

module.exports = { construirListado, construirListadoWabot, fechaValida };
