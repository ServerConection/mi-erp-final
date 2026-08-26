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

module.exports = { construirFiltros, obtenerAnalytics };

const { esGestionableExpr } = require('../shared/etapas');

const numero = (value) => Number(value || 0);
const numeroONull = (value) => value == null ? null : Number(value);

function cteUniverso(whereSql) {
  return `WITH universo AS (
    SELECT l.* FROM contactabilidad_leads l ${whereSql}
  )`;
}

function cteRespuestas(whereSql) {
  return `${cteUniverso(whereSql)}, ordenados AS (
    SELECT m.id, m.empresa, m.id_bitrix, m.emisor_tipo, m.mensaje_at,
           LAG(m.emisor_tipo) OVER (
             PARTITION BY m.empresa, m.id_bitrix ORDER BY m.mensaje_at, m.id
           ) AS emisor_anterior
    FROM contactabilidad_mensajes m
    JOIN universo u ON u.empresa = m.empresa AND u.id_bitrix = m.id_bitrix
  ), grupos AS (
    SELECT *, SUM(CASE WHEN emisor_tipo = 'CLIENTE'
                            AND emisor_anterior IS DISTINCT FROM 'CLIENTE'
                       THEN 1 ELSE 0 END)
         OVER (PARTITION BY empresa, id_bitrix ORDER BY mensaje_at, id) AS episodio
    FROM ordenados
  ), episodios AS (
    SELECT empresa, id_bitrix, episodio,
           MIN(mensaje_at) FILTER (WHERE emisor_tipo = 'CLIENTE') AS cliente_at,
           MIN(mensaje_at) FILTER (WHERE emisor_tipo = 'ASESOR') AS asesor_at
    FROM grupos
    WHERE episodio > 0
    GROUP BY empresa, id_bitrix, episodio
  ), respuestas AS (
    SELECT *, EXTRACT(EPOCH FROM (asesor_at - cliente_at))::bigint AS respuesta_seg,
           ROW_NUMBER() OVER (PARTITION BY empresa, id_bitrix ORDER BY cliente_at) AS orden_respuesta
    FROM episodios
    WHERE asesor_at > cliente_at
  ), respuesta_lead AS (
    SELECT empresa, id_bitrix,
           MAX(respuesta_seg) FILTER (WHERE orden_respuesta = 1) AS primera_respuesta_seg,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY respuesta_seg) AS mediana_episodio_seg
    FROM respuestas
    GROUP BY empresa, id_bitrix
  )`;
}

async function obtenerAnalytics(pool, query = {}) {
  const { whereSql, params } = construirFiltros(query);
  const universo = cteUniverso(whereSql);
  const respuestas = cteRespuestas(whereSql);
  const gestionable = esGestionableExpr('u.etapa_nombre');

  const consultas = [
    pool.query(`${respuestas}
      SELECT COUNT(*)::int AS leads,
             COUNT(*) FILTER (WHERE u.mensajes_cliente_total > 0)::int AS contactados,
             COALESCE(SUM(u.mensajes_cliente_total),0)::int AS mensajes_cliente,
             COALESCE(SUM(u.mensajes_asesor_total),0)::int AS mensajes_asesor,
             COUNT(*) FILTER (WHERE u.pendiente_por = 'ASESOR')::int AS pendientes_asesor,
             COUNT(*) FILTER (WHERE u.pendiente_por = 'ASESOR'
                 AND u.ultimo_mensaje_cliente_at <= NOW() - INTERVAL '30 minutes')::int AS pendientes_30m,
             (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY primera_respuesta_seg)
                FROM respuesta_lead WHERE primera_respuesta_seg IS NOT NULL) AS mediana_primera_respuesta_seg,
             (SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY respuesta_seg)
                FROM respuestas) AS p90_respuesta_seg,
             MAX(u.ultima_sincronizacion_at) AS ultima_sincronizacion
      FROM universo u`, params),

    pool.query(`${respuestas}
      SELECT COALESCE(NULLIF(TRIM(u.origen_nombre),''),'SIN ORIGEN') AS origen,
             COUNT(*)::int AS leads,
             COUNT(*) FILTER (WHERE u.mensajes_cliente_total > 0)::int AS contactados,
             ROUND(COUNT(*) FILTER (WHERE u.mensajes_cliente_total > 0)::numeric * 100 / NULLIF(COUNT(*),0),1) AS tasa_contactabilidad,
             ROUND(COALESCE(SUM(u.mensajes_cliente_total),0)::numeric / NULLIF(COUNT(*),0),2) AS mensajes_cliente_por_lead,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rl.primera_respuesta_seg)
               FILTER (WHERE rl.primera_respuesta_seg IS NOT NULL) AS mediana_primera_respuesta_seg,
             COUNT(*) FILTER (WHERE u.pendiente_por = 'ASESOR')::int AS pendientes_asesor,
             COUNT(*) FILTER (WHERE UPPER(TRIM(COALESCE(u.etapa_nombre,''))) = 'VENTA SUBIDA')::int AS ventas_subidas,
             (COUNT(*) < 10) AS muestra_insuficiente
      FROM universo u
      LEFT JOIN respuesta_lead rl ON rl.empresa = u.empresa AND rl.id_bitrix = u.id_bitrix
      GROUP BY 1 ORDER BY muestra_insuficiente, tasa_contactabilidad DESC NULLS LAST, leads DESC`, params),

    pool.query(`${respuestas}
      SELECT u.asesor_id, COALESCE(NULLIF(TRIM(u.asesor_nombre),''),'SIN ASESOR') AS asesor_nombre,
             COUNT(*)::int AS leads,
             COUNT(*) FILTER (WHERE u.mensajes_cliente_total > 0)::int AS contactados,
             COALESCE(SUM(u.mensajes_cliente_total),0)::int AS mensajes_cliente,
             COALESCE(SUM(u.mensajes_asesor_total),0)::int AS mensajes_asesor,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rl.primera_respuesta_seg)
               FILTER (WHERE rl.primera_respuesta_seg IS NOT NULL) AS mediana_primera_respuesta_seg,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rl.mediana_episodio_seg)
               FILTER (WHERE rl.mediana_episodio_seg IS NOT NULL) AS mediana_respuesta_episodio_seg,
             COUNT(*) FILTER (WHERE u.pendiente_por = 'ASESOR')::int AS pendientes_asesor,
             COUNT(*) FILTER (WHERE u.pendiente_por = 'ASESOR'
                 AND u.ultimo_mensaje_cliente_at <= NOW() - INTERVAL '30 minutes')::int AS pendientes_30m
      FROM universo u
      LEFT JOIN respuesta_lead rl ON rl.empresa = u.empresa AND rl.id_bitrix = u.id_bitrix
      GROUP BY u.asesor_id, COALESCE(NULLIF(TRIM(u.asesor_nombre),''),'SIN ASESOR')
      ORDER BY pendientes_30m DESC, leads DESC`, params),

    pool.query(`${universo}
      SELECT u.etapa_id, COALESCE(NULLIF(TRIM(u.etapa_nombre),''),u.etapa_id,'SIN ETAPA') AS etapa_nombre,
             COUNT(*)::int AS leads,
             COUNT(*) FILTER (WHERE u.mensajes_cliente_total > 0)::int AS contactados,
             ROUND(COUNT(*) FILTER (WHERE u.mensajes_cliente_total > 0)::numeric * 100 / NULLIF(COUNT(*),0),1) AS tasa_contactabilidad,
             COALESCE(SUM(u.mensajes_cliente_total),0)::int AS mensajes_cliente,
             COALESCE(SUM(u.mensajes_asesor_total),0)::int AS mensajes_asesor,
             COUNT(*) FILTER (WHERE u.pendiente_por = 'ASESOR')::int AS pendientes_asesor,
             PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (NOW() - u.ultimo_mensaje_cliente_at))
             ) FILTER (WHERE u.pendiente_por = 'ASESOR') AS mediana_espera_cliente_seg
      FROM universo u
      GROUP BY u.etapa_id, COALESCE(NULLIF(TRIM(u.etapa_nombre),''),u.etapa_id,'SIN ETAPA')
      ORDER BY leads DESC`, params),

    pool.query(`${universo}
      SELECT EXTRACT(ISODOW FROM m.mensaje_at AT TIME ZONE 'America/Guayaquil')::int AS dia_semana_iso,
             CASE EXTRACT(ISODOW FROM m.mensaje_at AT TIME ZONE 'America/Guayaquil')::int
               WHEN 1 THEN 'Lunes' WHEN 2 THEN 'Martes' WHEN 3 THEN 'Miércoles'
               WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes' WHEN 6 THEN 'Sábado' ELSE 'Domingo' END AS dia_nombre,
             EXTRACT(HOUR FROM m.mensaje_at AT TIME ZONE 'America/Guayaquil')::int AS hora,
             COUNT(DISTINCT (m.empresa, m.id_bitrix,
               (m.mensaje_at AT TIME ZONE 'America/Guayaquil')::date,
               EXTRACT(HOUR FROM m.mensaje_at AT TIME ZONE 'America/Guayaquil')))::int AS leads_unicos,
             COUNT(*)::int AS mensajes_cliente
      FROM contactabilidad_mensajes m
      JOIN universo u ON u.empresa = m.empresa AND u.id_bitrix = m.id_bitrix
      WHERE m.emisor_tipo = 'CLIENTE'
        AND EXTRACT(HOUR FROM m.mensaje_at AT TIME ZONE 'America/Guayaquil') BETWEEN 7 AND 22
      GROUP BY 1,2,3 ORDER BY 1,3`, params),

    pool.query(`${universo}
      SELECT COUNT(*)::int AS creados,
             COUNT(*) FILTER (WHERE u.mensajes_cliente_total > 0)::int AS cliente_escribio,
             COUNT(*) FILTER (WHERE u.ultimo_mensaje_cliente_at IS NOT NULL
               AND u.ultimo_mensaje_asesor_at > u.primer_mensaje_cliente_at)::int AS asesor_respondio,
             COUNT(*) FILTER (WHERE ${gestionable})::int AS negociables,
             COUNT(*) FILTER (WHERE UPPER(TRIM(COALESCE(u.etapa_nombre,''))) = 'VENTA SUBIDA')::int AS ventas_subidas
      FROM universo u`, params),

    pool.query(`${universo}
      SELECT u.empresa, u.id_bitrix, u.nombre_cliente, u.asesor_id, u.asesor_nombre,
             u.origen_nombre, u.etapa_id, u.etapa_nombre, u.fecha_creacion,
             u.mensajes_cliente_total, u.mensajes_asesor_total,
             u.ultimo_mensaje_cliente_at, u.ultimo_mensaje_asesor_at, u.pendiente_por,
             CASE WHEN u.pendiente_por = 'ASESOR'
               THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - u.ultimo_mensaje_cliente_at)) / 60)::int
               ELSE NULL END AS minutos_pendiente
      FROM universo u
      ORDER BY (u.pendiente_por = 'ASESOR') DESC,
               minutos_pendiente DESC NULLS LAST,
               GREATEST(u.ultimo_mensaje_cliente_at,u.ultimo_mensaje_asesor_at) DESC NULLS LAST
      LIMIT 100`, params),

    pool.query(`${universo}
      SELECT COUNT(*)::int AS leads,
             COUNT(*) FILTER (WHERE NULLIF(TRIM(u.origen_nombre),'') IS NOT NULL)::int AS con_origen,
             COUNT(*) FILTER (WHERE NULLIF(TRIM(u.asesor_nombre),'') IS NOT NULL)::int AS con_asesor,
             COUNT(*) FILTER (WHERE NULLIF(TRIM(u.etapa_nombre),'') IS NOT NULL)::int AS con_etapa,
             COUNT(*) FILTER (WHERE u.mensajes_cliente_total + u.mensajes_asesor_total > 0)::int AS con_mensajes,
             MAX(u.ultima_sincronizacion_at) AS ultima_sincronizacion
      FROM universo u`, params),
  ];

  const [resumenR, origenR, asesorR, etapaR, horaR, embudoR, operativoR, calidadR] = await Promise.all(consultas);
  const resumenRow = resumenR.rows[0] || {};
  const embudoRow = embudoR.rows[0] || {};
  const calidadRow = calidadR.rows[0] || {};

  return {
    resumen: {
      leads: numero(resumenRow.leads), contactados: numero(resumenRow.contactados),
      tasa_contactabilidad: numero(resumenRow.leads) ? Number((numero(resumenRow.contactados) * 100 / numero(resumenRow.leads)).toFixed(1)) : 0,
      mensajes_cliente: numero(resumenRow.mensajes_cliente), mensajes_asesor: numero(resumenRow.mensajes_asesor),
      mediana_primera_respuesta_seg: numeroONull(resumenRow.mediana_primera_respuesta_seg),
      p90_respuesta_seg: numeroONull(resumenRow.p90_respuesta_seg),
      pendientes_asesor: numero(resumenRow.pendientes_asesor), pendientes_30m: numero(resumenRow.pendientes_30m),
      ultima_sincronizacion: resumenRow.ultima_sincronizacion || null,
    },
    por_origen: origenR.rows.map((r) => ({ ...r, leads: numero(r.leads), contactados: numero(r.contactados), tasa_contactabilidad: numero(r.tasa_contactabilidad), mensajes_cliente_por_lead: numero(r.mensajes_cliente_por_lead), mediana_primera_respuesta_seg: numeroONull(r.mediana_primera_respuesta_seg), pendientes_asesor: numero(r.pendientes_asesor), ventas_subidas: numero(r.ventas_subidas) })),
    por_asesor: asesorR.rows.map((r) => ({ ...r, leads: numero(r.leads), contactados: numero(r.contactados), mensajes_cliente: numero(r.mensajes_cliente), mensajes_asesor: numero(r.mensajes_asesor), mediana_primera_respuesta_seg: numeroONull(r.mediana_primera_respuesta_seg), mediana_respuesta_episodio_seg: numeroONull(r.mediana_respuesta_episodio_seg), pendientes_asesor: numero(r.pendientes_asesor), pendientes_30m: numero(r.pendientes_30m) })),
    por_etapa: etapaR.rows.map((r) => ({ ...r, leads: numero(r.leads), contactados: numero(r.contactados), tasa_contactabilidad: numero(r.tasa_contactabilidad), mensajes_cliente: numero(r.mensajes_cliente), mensajes_asesor: numero(r.mensajes_asesor), pendientes_asesor: numero(r.pendientes_asesor), mediana_espera_cliente_seg: numeroONull(r.mediana_espera_cliente_seg) })),
    por_hora: horaR.rows.map((r) => ({ ...r, dia_semana_iso: numero(r.dia_semana_iso), hora: numero(r.hora), leads_unicos: numero(r.leads_unicos), mensajes_cliente: numero(r.mensajes_cliente) })),
    embudo: [
      { clave: 'creados', etiqueta: 'Leads creados', leads: numero(embudoRow.creados) },
      { clave: 'cliente_escribio', etiqueta: 'Cliente escribió', leads: numero(embudoRow.cliente_escribio) },
      { clave: 'asesor_respondio', etiqueta: 'Asesor respondió', leads: numero(embudoRow.asesor_respondio) },
      { clave: 'negociables', etiqueta: 'Negociables', leads: numero(embudoRow.negociables) },
      { clave: 'ventas_subidas', etiqueta: 'Venta subida', leads: numero(embudoRow.ventas_subidas) },
    ],
    operativo: operativoR.rows.map((r) => ({ ...r, mensajes_cliente_total: numero(r.mensajes_cliente_total), mensajes_asesor_total: numero(r.mensajes_asesor_total), minutos_pendiente: numeroONull(r.minutos_pendiente) })),
    calidad_datos: {
      leads: numero(calidadRow.leads), con_origen: numero(calidadRow.con_origen),
      con_asesor: numero(calidadRow.con_asesor), con_etapa: numero(calidadRow.con_etapa),
      con_mensajes: numero(calidadRow.con_mensajes), ultima_sincronizacion: calidadRow.ultima_sincronizacion || null,
    },
  };
}
