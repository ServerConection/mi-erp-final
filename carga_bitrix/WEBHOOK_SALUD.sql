-- ============================================================================
-- WEBHOOK_SALUD.sql   (2026-08-18)
-- Revision completa del webhook de Bitrix para NOVONET y VELSA.
-- Solo consulta. No modifica nada. Corre bloque por bloque (pgAdmin muestra
-- solo el ultimo resultado si los corres todos juntos).
-- ============================================================================


-- ===========================================================================
-- 1) PULSO — llegan leads AHORA? (ultimas 12 horas, por empresa y hora)
--    Si una empresa deja de aparecer, su automatizacion en Bitrix se apago.
-- ===========================================================================
SELECT
    w.empresa,
    date_trunc('hour', w.updated_at AT TIME ZONE 'America/Guayaquil') AS hora,
    COUNT(*)::int                                     AS eventos,
    COUNT(DISTINCT w.bitrix_id)::int                  AS leads_distintos
FROM public.bitrix_webhook_leads w
WHERE w.updated_at >= now() - INTERVAL '12 hours'
GROUP BY 1, 2
ORDER BY 2 DESC, 1;


-- ===========================================================================
-- 2) ULTIMO LATIDO por empresa — hace cuanto no llega nada
--    minutos_sin_recibir > 60 en horario laboral = algo esta caido.
-- ===========================================================================
SELECT
    w.empresa,
    MAX(w.updated_at AT TIME ZONE 'America/Guayaquil')                       AS ultimo_evento,
    ROUND(EXTRACT(epoch FROM (now() - MAX(w.updated_at))) / 60)::int         AS minutos_sin_recibir,
    COUNT(*) FILTER (WHERE w.created_at::date = CURRENT_DATE)::int           AS creados_hoy,
    COUNT(*) FILTER (WHERE w.updated_at::date = CURRENT_DATE)::int           AS tocados_hoy
FROM public.bitrix_webhook_leads w
GROUP BY 1
ORDER BY 1;


-- ===========================================================================
-- 3) ETAPAS QUE ESTAN LLEGANDO HOY, por empresa.
--    Si una etapa que existe en Bitrix NO aparece aqui, es que esa etapa
--    puntual no tiene el nodo de automatizacion configurado. Asi se detecto
--    en agosto que DESCARTE habia dejado de enviar.
-- ===========================================================================
SELECT
    w.empresa,
    UPPER(TRIM(COALESCE(w.etapa_bitrix, '(sin etapa)'))) AS etapa,
    COUNT(*)::int                                        AS eventos_hoy,
    MAX(w.updated_at AT TIME ZONE 'America/Guayaquil')   AS ultimo
FROM public.bitrix_webhook_leads w
WHERE w.updated_at::date = CURRENT_DATE
GROUP BY 1, 2
ORDER BY 1, 3 DESC;


-- ===========================================================================
-- 4) ETAPAS DORMIDAS — existen en la base pero HOY no mandaron nada.
--    Esta es la consulta que hay que mirar todos los dias.
-- ===========================================================================
WITH todas AS (
    SELECT DISTINCT w.empresa, UPPER(TRIM(w.etapa_bitrix)) AS etapa
    FROM public.bitrix_webhook_leads w
    WHERE NULLIF(TRIM(w.etapa_bitrix), '') IS NOT NULL
      AND w.updated_at >= CURRENT_DATE - INTERVAL '30 days'
), hoy AS (
    SELECT DISTINCT w.empresa, UPPER(TRIM(w.etapa_bitrix)) AS etapa
    FROM public.bitrix_webhook_leads w
    WHERE w.updated_at::date = CURRENT_DATE
)
SELECT t.empresa, t.etapa, '*** HOY NO ENVIO ***' AS alerta
FROM todas t
LEFT JOIN hoy h ON h.empresa = t.empresa AND h.etapa = t.etapa
WHERE h.etapa IS NULL
ORDER BY 1, 2;


-- ===========================================================================
-- 5) EL WEBHOOK ESTA ACTUALIZANDO O SOLO INSERTANDO?
--    Un lead sano se crea una vez y se ACTUALIZA cada vez que cambia de etapa.
--    Si "solo_insertados" es casi el total, el ON CONFLICT no esta corriendo
--    y las etapas se quedan congeladas en la primera que llego.
-- ===========================================================================
SELECT
    w.empresa,
    COUNT(*)::int                                                   AS leads,
    COUNT(*) FILTER (WHERE w.updated_at > w.created_at)::int         AS actualizados_alguna_vez,
    COUNT(*) FILTER (WHERE w.updated_at <= w.created_at)::int        AS solo_insertados,
    ROUND(100.0 * COUNT(*) FILTER (WHERE w.updated_at > w.created_at)
          / NULLIF(COUNT(*), 0), 1)                                  AS pct_actualizados
FROM public.bitrix_webhook_leads w
WHERE w.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;


-- ===========================================================================
-- 6) HISTORIAL — cuantos eventos por lead (el historial es append-only).
--    Promedio sano: 2 a 5 eventos por lead. Si da 1.0 exacto, el historial
--    solo guarda la creacion y se perdio la traza de cambios de etapa.
-- ===========================================================================
SELECT
    h.empresa,
    COUNT(*)::int                                              AS eventos,
    COUNT(DISTINCT h.bitrix_id)::int                           AS leads,
    ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT h.bitrix_id), 0), 2) AS eventos_por_lead
FROM public.bitrix_webhook_leads_historial h
WHERE h.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1;


-- ===========================================================================
-- 7) CAMPOS QUE LLEGAN VACIOS — que placeholder de Bitrix esta mal puesto.
--    Un 100% de vacio en un campo = ese {{campo}} no existe o esta mal escrito
--    en la automatizacion de esa empresa.
-- ===========================================================================
SELECT
    w.empresa,
    ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(BTRIM(w.source),      '') IS NULL) / COUNT(*), 1) AS pct_sin_origen,
    ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(BTRIM(w.responsible), '') IS NULL) / COUNT(*), 1) AS pct_sin_responsable,
    ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(BTRIM(w.etapa_bitrix),'') IS NULL) / COUNT(*), 1) AS pct_sin_etapa,
    ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(BTRIM(w.phone),       '') IS NULL) / COUNT(*), 1) AS pct_sin_telefono,
    ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(BTRIM(w.city),        '') IS NULL) / COUNT(*), 1) AS pct_sin_ciudad,
    ROUND(100.0 * COUNT(*) FILTER (WHERE NULLIF(BTRIM(w.pipeline),    '') IS NULL) / COUNT(*), 1) AS pct_sin_pipeline,
    COUNT(*)::int                                                                                 AS base
FROM public.bitrix_webhook_leads w
WHERE w.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1;


-- ===========================================================================
-- 8) ORIGENES DE VELSA — respuesta directa a "Velsa tiene origenes o no?"
-- ===========================================================================
SELECT
    COALESCE(NULLIF(BTRIM(w.source), ''), '(SIN ORIGEN)') AS origen,
    COUNT(*)::int                                         AS leads,
    MIN(w.created_at)::date                               AS desde,
    MAX(w.created_at)::date                               AS hasta
FROM public.bitrix_webhook_leads w
WHERE w.empresa = 'velsa'
GROUP BY 1
ORDER BY 2 DESC;
