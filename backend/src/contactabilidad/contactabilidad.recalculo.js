// =============================================================================
// Contactabilidad — Recalculo de consolidados
// recalcularConsolidados: barrido completo (ciclo largo del cron).
// recalcularLeads:        solo los leads tocados (webhook, cron corto, boton).
// Ambos usan EXACTAMENTE el mismo SQL, asi el dato no depende de por donde entro.
// =============================================================================

const SELECCION_TODOS = `SELECT empresa, id_bitrix FROM contactabilidad_leads`;
const SELECCION_LEADS = `
  SELECT empresa, id_bitrix FROM contactabilidad_leads
  WHERE empresa = $1 AND id_bitrix = ANY($2::text[])`;

function construirSql(seleccion, origenDato) {
  const origen = origenDato ? `'${origenDato}'` : 'l.origen_ultimo_dato';
  return `
WITH objetivo AS (${seleccion}),
ordenados AS (
  SELECT m.empresa, m.id_bitrix, m.id, m.emisor_tipo, m.mensaje_at, m.chat_id,
         LAG(m.emisor_tipo) OVER (
           PARTITION BY m.empresa, m.id_bitrix ORDER BY m.mensaje_at, m.id
         ) AS emisor_anterior
  FROM contactabilidad_mensajes m
  JOIN objetivo o ON o.empresa = m.empresa AND o.id_bitrix = m.id_bitrix
),
grupos AS (
  SELECT empresa, id_bitrix, id, emisor_tipo, mensaje_at,
         SUM(CASE WHEN emisor_tipo = 'CLIENTE'
                       AND emisor_anterior IS DISTINCT FROM 'CLIENTE'
                  THEN 1 ELSE 0 END)
           OVER (PARTITION BY empresa, id_bitrix ORDER BY mensaje_at, id) AS episodio
  FROM ordenados
),
episodios AS (
  SELECT empresa, id_bitrix, episodio,
         MIN(mensaje_at) FILTER (WHERE emisor_tipo = 'CLIENTE') AS cliente_at,
         MIN(mensaje_at) FILTER (WHERE emisor_tipo = 'ASESOR')  AS asesor_at
  FROM grupos WHERE episodio > 0
  GROUP BY empresa, id_bitrix, episodio
),
respuestas AS (
  SELECT empresa, id_bitrix, asesor_at,
         EXTRACT(EPOCH FROM (asesor_at - cliente_at))::bigint AS respuesta_seg,
         ROW_NUMBER() OVER (PARTITION BY empresa, id_bitrix ORDER BY cliente_at) AS orden
  FROM episodios WHERE asesor_at > cliente_at
),
tiempos AS (
  SELECT empresa, id_bitrix,
         MIN(asesor_at)     FILTER (WHERE orden = 1) AS primera_respuesta_at,
         MAX(respuesta_seg) FILTER (WHERE orden = 1) AS primera_seg,
         ROUND(AVG(respuesta_seg))::bigint          AS promedio_seg,
         MAX(respuesta_seg)                          AS maximo_seg
  FROM respuestas GROUP BY empresa, id_bitrix
),
agregados AS (
  SELECT o.empresa, o.id_bitrix,
         COUNT(m.id) FILTER (WHERE m.emisor_tipo = 'CLIENTE')::int AS mensajes_cliente,
         COUNT(m.id) FILTER (WHERE m.emisor_tipo = 'ASESOR')::int  AS mensajes_asesor,
         COUNT(m.id) FILTER (WHERE m.emisor_tipo = 'CLIENTE'
           AND m.etapa_id IS NOT DISTINCT FROM base.etapa_id)::int  AS mensajes_cliente_etapa,
         COUNT(m.id) FILTER (WHERE m.emisor_tipo = 'ASESOR'
           AND m.etapa_id IS NOT DISTINCT FROM base.etapa_id)::int  AS mensajes_asesor_etapa,
         MIN(m.mensaje_at) FILTER (WHERE m.emisor_tipo = 'CLIENTE') AS primer_cliente,
         MAX(m.mensaje_at) FILTER (WHERE m.emisor_tipo = 'CLIENTE') AS ultimo_cliente,
         MAX(m.mensaje_at) FILTER (WHERE m.emisor_tipo = 'ASESOR')  AS ultimo_asesor,
         (ARRAY_AGG(m.chat_id ORDER BY m.mensaje_at DESC, m.id DESC)
            FILTER (WHERE m.chat_id IS NOT NULL))[1]                AS chat_id
  FROM objetivo o
  JOIN contactabilidad_leads base
    ON base.empresa = o.empresa AND base.id_bitrix = o.id_bitrix
  LEFT JOIN contactabilidad_mensajes m
    ON m.empresa = o.empresa AND m.id_bitrix = o.id_bitrix
  GROUP BY o.empresa, o.id_bitrix
)
UPDATE contactabilidad_leads l
SET mensajes_cliente_total      = a.mensajes_cliente,
    mensajes_asesor_total       = a.mensajes_asesor,
    mensajes_cliente_etapa      = a.mensajes_cliente_etapa,
    mensajes_asesor_etapa       = a.mensajes_asesor_etapa,
    primer_mensaje_cliente_at   = a.primer_cliente,
    ultimo_mensaje_cliente_at   = a.ultimo_cliente,
    ultimo_mensaje_asesor_at    = a.ultimo_asesor,
    primera_respuesta_asesor_at = t.primera_respuesta_at,
    tiempo_primera_respuesta_seg  = t.primera_seg,
    tiempo_respuesta_promedio_seg = t.promedio_seg,
    tiempo_respuesta_maximo_seg   = t.maximo_seg,
    chat_id = COALESCE(a.chat_id, l.chat_id),
    pendiente_por = CASE
      WHEN a.ultimo_cliente IS NULL AND a.ultimo_asesor IS NULL THEN NULL
      WHEN a.ultimo_asesor IS NULL OR a.ultimo_cliente > a.ultimo_asesor THEN 'ASESOR'
      ELSE 'CLIENTE'
    END,
    temperatura = CASE
      WHEN GREATEST(a.ultimo_cliente, a.ultimo_asesor) IS NULL THEN NULL
      WHEN GREATEST(a.ultimo_cliente, a.ultimo_asesor) >= NOW() - INTERVAL '24 hours' THEN 'CALIENTE'
      WHEN GREATEST(a.ultimo_cliente, a.ultimo_asesor) >= NOW() - INTERVAL '72 hours' THEN 'TIBIO'
      ELSE 'FRIO'
    END,
    origen_ultimo_dato = ${origen},
    actualizado_at = NOW()
FROM agregados a
LEFT JOIN tiempos t ON t.empresa = a.empresa AND t.id_bitrix = a.id_bitrix
WHERE l.empresa = a.empresa AND l.id_bitrix = a.id_bitrix`;
}

const ORIGENES = new Set(['CRON', 'CRON_CORTO', 'WEBHOOK', 'MANUAL', 'BACKFILL']);
// origen_ultimo_dato solo admite 4 valores; CRON_CORTO se guarda como CRON.
const normalizarOrigen = (valor) => {
  const origen = String(valor || '').toUpperCase();
  if (!ORIGENES.has(origen)) return null;
  return origen === 'CRON_CORTO' ? 'CRON' : origen;
};

/** Barrido completo. Se mantiene la firma original usada por el sincronizador. */
async function recalcularConsolidados(pool, origen = 'CRON') {
  return pool.query(construirSql(SELECCION_TODOS, normalizarOrigen(origen)));
}

/**
 * Recalculo puntual: solo los leads indicados.
 * Es lo que permite que el dato de "ultimo mensaje" se actualice al segundo
 * sin pagar el costo de recorrer toda la tabla.
 */
async function recalcularLeads(pool, empresa, ids, origen = 'WEBHOOK') {
  const lista = [...new Set((Array.isArray(ids) ? ids : [ids])
    .filter((id) => id !== null && id !== undefined && String(id).trim() !== '')
    .map((id) => String(id)))];
  if (!empresa || !lista.length) return { rowCount: 0 };
  return pool.query(construirSql(SELECCION_LEADS, normalizarOrigen(origen)),
    [String(empresa).toUpperCase(), lista]);
}

module.exports = { recalcularConsolidados, recalcularLeads, construirSql };
