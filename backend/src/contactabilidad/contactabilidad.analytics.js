const {
  UMBRALES_DEFECTO, SEVERIDADES, normalizarUmbrales,
  expresionSeveridad, expresionMinutosEspera,
} = require('./contactabilidad.severidad');
const { CAPACIDADES_COMPLETAS, columnaOpcional } = require('./contactabilidad.esquema');

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const TEXTO = (valor) => String(valor).trim();

/**
 * Traduce los filtros del tablero a SQL parametrizado.
 * Todo filtro nuevo entra DESPUES de las fechas para no alterar el orden de
 * parametros que ya consumen las consultas y las pruebas existentes.
 */
function construirFiltros(query = {}, umbrales = UMBRALES_DEFECTO) {
  const params = [];
  const where = [];
  const add = (value, clause) => {
    params.push(value);
    where.push(clause(params.length));
  };

  if (query.empresa) add(String(query.empresa).toUpperCase(), (n) => `l.empresa = $${n}`);
  if (query.origen) add(TEXTO(query.origen), (n) => `COALESCE(l.origen_nombre,'') = $${n}`);
  if (query.asesor_id) add(TEXTO(query.asesor_id), (n) => `l.asesor_id = $${n}`);
  if (query.etapa) add(TEXTO(query.etapa), (n) => `COALESCE(l.etapa_nombre,l.etapa_id,'') = $${n}`);
  for (const key of ['desde', 'hasta']) {
    if (query[key] && !FECHA.test(query[key])) throw new TypeError(`${key} debe usar YYYY-MM-DD`);
  }
  if (query.desde) add(query.desde, (n) => `(l.fecha_creacion AT TIME ZONE 'America/Guayaquil')::date >= $${n}::date`);
  if (query.hasta) add(query.hasta, (n) => `(l.fecha_creacion AT TIME ZONE 'America/Guayaquil')::date <= $${n}::date`);

  // ---- Filtros operativos (quien esta esperando y hace cuanto) ----------------
  if (query.pendiente_por) {
    const valor = String(query.pendiente_por).toUpperCase();
    if (!['CLIENTE', 'ASESOR'].includes(valor)) throw new TypeError('pendiente_por debe ser CLIENTE o ASESOR');
    add(valor, (n) => `l.pendiente_por = $${n}`);
  }

  if (query.temperatura) {
    const valor = String(query.temperatura).toUpperCase();
    if (!['FRIO', 'TIBIO', 'CALIENTE'].includes(valor)) throw new TypeError('temperatura invalida');
    add(valor, (n) => `l.temperatura = $${n}`);
  }

  if (query.severidad) {
    const lista = [...new Set(String(query.severidad).split(',').map((v) => v.trim().toUpperCase()).filter(Boolean))];
    const invalida = lista.find((v) => !SEVERIDADES.includes(v));
    if (invalida) throw new TypeError(`severidad invalida: ${invalida}`);
    if (lista.length) add(lista, (n) => `(${expresionSeveridad('l', umbrales)}) = ANY($${n}::text[])`);
  }

  if (query.min_espera) {
    const minutos = Number(query.min_espera);
    if (!Number.isFinite(minutos) || minutos < 0) throw new TypeError('min_espera debe ser un numero de minutos');
    add(String(Math.floor(minutos)), (n) => `(l.pendiente_por = 'ASESOR'
      AND l.ultimo_mensaje_cliente_at <= NOW() - ($${n} || ' minutes')::interval)`);
  }

  if (query.q && TEXTO(query.q)) {
    add(`%${TEXTO(query.q)}%`, (n) => `(COALESCE(l.nombre_cliente,'') ILIKE $${n}
      OR COALESCE(l.asesor_nombre,'') ILIKE $${n}
      OR l.id_bitrix ILIKE $${n})`);
  }

  if (String(query.solo_con_mensajes).toLowerCase() === 'true') {
    where.push('(l.mensajes_cliente_total + l.mensajes_asesor_total) > 0');
  }

  if (String(query.solo_sin_contacto).toLowerCase() === 'true') {
    where.push('l.mensajes_cliente_total = 0');
  }

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

async function obtenerAnalytics(pool, query = {}, opciones = {}) {
  const umbrales = normalizarUmbrales(opciones.umbrales || UMBRALES_DEFECTO);
  const { whereSql, params } = construirFiltros(query, umbrales);
  const universo = cteUniverso(whereSql);
  const respuestas = cteRespuestas(whereSql);
  const gestionable = esGestionableExpr('u.etapa_nombre');
  const severidad = expresionSeveridad('u', umbrales);
  const minutosEspera = expresionMinutosEspera('u');
  // Columnas que solo existen tras la migracion de tiempo real. Si no estan,
  // se devuelven como NULL para que el contrato de la respuesta no cambie.
  const cols = { ...CAPACIDADES_COMPLETAS, ...(opciones.columnas || {}) };
  const chatId = columnaOpcional(cols.chat_id, 'u.chat_id', 'chat_id');

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
             u.temperatura, ${chatId}, u.ultima_sincronizacion_at,
             u.tiempo_primera_respuesta_seg,
             (${severidad}) AS severidad,
             (${minutosEspera}) AS minutos_pendiente
      FROM universo u
      ORDER BY u.fecha_creacion DESC NULLS LAST,
               (u.pendiente_por = 'ASESOR') DESC,
               minutos_pendiente DESC NULLS LAST,
               GREATEST(u.ultimo_mensaje_cliente_at,u.ultimo_mensaje_asesor_at) DESC NULLS LAST
      LIMIT 100`, params),

    // --- Semaforo de severidad: cuantos criticos / graves hay ahora mismo ------
    pool.query(`${universo}, clasificado AS (
      SELECT u.*, (${severidad}) AS severidad, (${minutosEspera}) AS minutos_espera FROM universo u
    )
      SELECT COUNT(*) FILTER (WHERE severidad = 'CRITICO')::int AS critico,
             COUNT(*) FILTER (WHERE severidad = 'GRAVE')::int   AS grave,
             COUNT(*) FILTER (WHERE severidad = 'ALERTA')::int  AS alerta,
             COUNT(*) FILTER (WHERE severidad = 'OK')::int      AS ok,
             MAX(minutos_espera) FILTER (WHERE severidad <> 'OK')::int AS espera_maxima_min,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY minutos_espera)
               FILTER (WHERE minutos_espera IS NOT NULL) AS espera_mediana_min
      FROM clasificado`, params),

    // --- Responsables: quien tiene los casos criticos y graves ----------------
    pool.query(`${universo}, clasificado AS (
      SELECT u.*, (${severidad}) AS severidad, (${minutosEspera}) AS minutos_espera FROM universo u
    )
      SELECT asesor_id,
             COALESCE(NULLIF(TRIM(asesor_nombre),''),'SIN ASESOR') AS asesor_nombre,
             COUNT(*)::int AS leads,
             COUNT(*) FILTER (WHERE severidad = 'CRITICO')::int AS critico,
             COUNT(*) FILTER (WHERE severidad = 'GRAVE')::int   AS grave,
             COUNT(*) FILTER (WHERE severidad = 'ALERTA')::int  AS alerta,
             MAX(minutos_espera)::int AS espera_maxima_min
      FROM clasificado
      GROUP BY asesor_id, COALESCE(NULLIF(TRIM(asesor_nombre),''),'SIN ASESOR')
      HAVING COUNT(*) FILTER (WHERE severidad <> 'OK') > 0
      ORDER BY critico DESC, grave DESC, espera_maxima_min DESC NULLS LAST
      LIMIT 50`, params),

    // --- Donde duele: etapa y origen con mas casos vencidos -------------------
    pool.query(`${universo}, clasificado AS (
      SELECT u.*, (${severidad}) AS severidad, (${minutosEspera}) AS minutos_espera FROM universo u
    )
      SELECT COALESCE(NULLIF(TRIM(etapa_nombre),''),etapa_id,'SIN ETAPA') AS etiqueta,
             'ETAPA' AS dimension,
             COUNT(*)::int AS leads,
             COUNT(*) FILTER (WHERE severidad = 'CRITICO')::int AS critico,
             COUNT(*) FILTER (WHERE severidad = 'GRAVE')::int   AS grave,
             COUNT(*) FILTER (WHERE severidad = 'ALERTA')::int  AS alerta,
             MAX(minutos_espera)::int AS espera_maxima_min
      FROM clasificado GROUP BY 1
      UNION ALL
      SELECT COALESCE(NULLIF(TRIM(origen_nombre),''),'SIN ORIGEN') AS etiqueta,
             'ORIGEN' AS dimension,
             COUNT(*)::int, COUNT(*) FILTER (WHERE severidad = 'CRITICO')::int,
             COUNT(*) FILTER (WHERE severidad = 'GRAVE')::int,
             COUNT(*) FILTER (WHERE severidad = 'ALERTA')::int,
             MAX(minutos_espera)::int
      FROM clasificado GROUP BY 1
      ORDER BY critico DESC, grave DESC, leads DESC`, params),

    pool.query(`${universo}
      SELECT COUNT(*)::int AS leads,
             COUNT(*) FILTER (WHERE NULLIF(TRIM(u.origen_nombre),'') IS NOT NULL)::int AS con_origen,
             COUNT(*) FILTER (WHERE NULLIF(TRIM(u.asesor_nombre),'') IS NOT NULL)::int AS con_asesor,
             COUNT(*) FILTER (WHERE NULLIF(TRIM(u.etapa_nombre),'') IS NOT NULL)::int AS con_etapa,
             COUNT(*) FILTER (WHERE u.mensajes_cliente_total + u.mensajes_asesor_total > 0)::int AS con_mensajes,
             MAX(u.ultima_sincronizacion_at) AS ultima_sincronizacion
      FROM universo u`, params),
  ];

  const [resumenR, origenR, asesorR, etapaR, horaR, embudoR, operativoR,
    severidadR, alertaAsesorR, alertaDimensionR, calidadR] = await Promise.all(consultas);
  const severidadRow = severidadR.rows[0] || {};
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
    operativo: operativoR.rows.map((r) => ({ ...r, mensajes_cliente_total: numero(r.mensajes_cliente_total), mensajes_asesor_total: numero(r.mensajes_asesor_total), minutos_pendiente: numeroONull(r.minutos_pendiente), tiempo_primera_respuesta_seg: numeroONull(r.tiempo_primera_respuesta_seg) })),
    alertas: {
      resumen: {
        critico: numero(severidadRow.critico), grave: numero(severidadRow.grave),
        alerta: numero(severidadRow.alerta), ok: numero(severidadRow.ok),
        espera_maxima_min: numeroONull(severidadRow.espera_maxima_min),
        espera_mediana_min: numeroONull(severidadRow.espera_mediana_min),
      },
      por_asesor: alertaAsesorR.rows.map((r) => ({ ...r, leads: numero(r.leads), critico: numero(r.critico), grave: numero(r.grave), alerta: numero(r.alerta), espera_maxima_min: numeroONull(r.espera_maxima_min) })),
      por_etapa: alertaDimensionR.rows.filter((r) => r.dimension === 'ETAPA').map((r) => ({ ...r, leads: numero(r.leads), critico: numero(r.critico), grave: numero(r.grave), alerta: numero(r.alerta), espera_maxima_min: numeroONull(r.espera_maxima_min) })),
      por_origen: alertaDimensionR.rows.filter((r) => r.dimension === 'ORIGEN').map((r) => ({ ...r, leads: numero(r.leads), critico: numero(r.critico), grave: numero(r.grave), alerta: numero(r.alerta), espera_maxima_min: numeroONull(r.espera_maxima_min) })),
    },
    umbrales,
    calidad_datos: {
      leads: numero(calidadRow.leads), con_origen: numero(calidadRow.con_origen),
      con_asesor: numero(calidadRow.con_asesor), con_etapa: numero(calidadRow.con_etapa),
      con_mensajes: numero(calidadRow.con_mensajes), ultima_sincronizacion: calidadRow.ultima_sincronizacion || null,
    },
  };
}
