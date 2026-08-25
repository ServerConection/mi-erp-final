async function recalcularConsolidados(pool) {
  await pool.query(`
    UPDATE contactabilidad_leads l
    SET mensajes_cliente_total = x.mensajes_cliente,
        mensajes_asesor_total = x.mensajes_asesor,
        mensajes_cliente_etapa = x.mensajes_cliente_etapa,
        mensajes_asesor_etapa = x.mensajes_asesor_etapa,
        primer_mensaje_cliente_at = x.primer_cliente,
        ultimo_mensaje_cliente_at = x.ultimo_cliente,
        ultimo_mensaje_asesor_at = x.ultimo_asesor,
        pendiente_por = CASE
          WHEN x.ultimo_cliente IS NULL AND x.ultimo_asesor IS NULL THEN NULL
          WHEN x.ultimo_asesor IS NULL OR x.ultimo_cliente > x.ultimo_asesor THEN 'ASESOR'
          ELSE 'CLIENTE'
        END,
        actualizado_at = NOW()
    FROM (
      SELECT l2.empresa, l2.id_bitrix,
             COUNT(m.id) FILTER (WHERE m.emisor_tipo = 'CLIENTE')::int AS mensajes_cliente,
             COUNT(m.id) FILTER (WHERE m.emisor_tipo = 'ASESOR')::int AS mensajes_asesor,
             COUNT(m.id) FILTER (WHERE m.emisor_tipo = 'CLIENTE' AND m.etapa_id IS NOT DISTINCT FROM l2.etapa_id)::int AS mensajes_cliente_etapa,
             COUNT(m.id) FILTER (WHERE m.emisor_tipo = 'ASESOR' AND m.etapa_id IS NOT DISTINCT FROM l2.etapa_id)::int AS mensajes_asesor_etapa,
             MIN(m.mensaje_at) FILTER (WHERE m.emisor_tipo = 'CLIENTE') AS primer_cliente,
             MAX(m.mensaje_at) FILTER (WHERE m.emisor_tipo = 'CLIENTE') AS ultimo_cliente,
             MAX(m.mensaje_at) FILTER (WHERE m.emisor_tipo = 'ASESOR') AS ultimo_asesor
      FROM contactabilidad_leads l2
      LEFT JOIN contactabilidad_mensajes m
        ON m.empresa = l2.empresa AND m.id_bitrix = l2.id_bitrix
      GROUP BY l2.empresa, l2.id_bitrix
    ) x
    WHERE l.empresa = x.empresa AND l.id_bitrix = x.id_bitrix
  `);
}

module.exports = { recalcularConsolidados };

