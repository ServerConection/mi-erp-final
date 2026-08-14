-- ============================================================================
-- DIAGNÓSTICO REPORTE D-1 — por qué los filtros no cuadran
-- Ejecutar en pgAdmin sobre bddgeneral. TODO es SOLO LECTURA.
-- No cambia nada. Primero medimos, después decidimos.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- HALLAZGO 1 — vw_bitrix_novonet NO es un FULL OUTER JOIN
-- ─────────────────────────────────────────────────────────────────────────────
-- El comentario en indicadores.controller.js (línea ~517) dice:
--     "La vista los une con FULL OUTER JOIN, así ninguno de los dos pierde
--      registros"
-- Pero la definición real (migrations/vw_bitrix_novonet.sql) es:
--     FROM public.bitrix_webhook_leads w
--     LEFT JOIN LATERAL (SELECT ... FROM mestra_bitrix ...) j ON TRUE
-- Es LEFT JOIN desde el WEBHOOK. Manda el webhook.
-- Consecuencia: TODA venta Jotform cuyo j_id_bitrix NO exista en el webhook
-- desaparece del reporte. Los regularizados viven en Jotform → se pierden.
--
-- ¿CUÁNTOS SE PIERDEN? (este es el número que importa)
SELECT
    COUNT(*)                                                   AS jotform_en_rango,
    COUNT(*) FILTER (WHERE w.bitrix_id IS NULL)                AS invisibles_en_el_reporte,
    COUNT(*) FILTER (WHERE w.bitrix_id IS NULL
                       AND mb.j_estatus_regularizacion = 'POR REGULARIZAR')
                                                               AS regularizados_perdidos
FROM public.mestra_bitrix mb
LEFT JOIN public.bitrix_webhook_leads w
       ON BTRIM(w.bitrix_id::text) = BTRIM(mb.j_id_bitrix::text)
      AND w.empresa = 'novonet'
WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text)
      BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE - 1;   -- D-1


-- ─────────────────────────────────────────────────────────────────────────────
-- HALLAZGO 2 — el filtro "etapa <> duplicado" borra la venta Jotform
-- ─────────────────────────────────────────────────────────────────────────────
-- La vista excluye por ETAPA DE BITRIX. Si un lead quedó marcado 'duplicado'
-- en Bitrix pero SÍ tiene venta real en Jotform, la venta se cae del reporte.
SELECT
    COUNT(*)                                                        AS ventas_jot_en_leads_duplicados,
    COUNT(*) FILTER (WHERE mb.j_netlife_estatus_real = 'ACTIVO')     AS activas_perdidas,
    COUNT(*) FILTER (WHERE mb.j_estatus_regularizacion = 'POR REGULARIZAR')
                                                                     AS regularizados_perdidos
FROM public.bitrix_webhook_leads w
JOIN public.mestra_bitrix mb
  ON BTRIM(mb.j_id_bitrix::text) = BTRIM(w.bitrix_id::text)
WHERE w.empresa = 'novonet'
  AND w.etapa = 'duplicado'
  AND public.parse_fecha_flex(mb.j_fecha_registro_sistema::text)
      >= date_trunc('month', CURRENT_DATE)::date;


-- ─────────────────────────────────────────────────────────────────────────────
-- HALLAZGO 3 — el LATERAL ... LIMIT 1 aplasta ventas múltiples
-- ─────────────────────────────────────────────────────────────────────────────
-- La vista trae SOLO UNA venta Jotform por lead (LIMIT 1).
-- Pero indicadores.controller.js asume lo contrario; su comentario dice:
--     "un lead puede aparecer en varias filas cuando tiene más de una venta
--      Jotform asociada (ej. un cliente con 5 servicios)"
-- y por eso los conteos del lado Jotform usan COUNT(*) en vez de COUNT(DISTINCT).
-- Con LIMIT 1 ese COUNT(*) NUNCA ve la segunda venta → subconteo silencioso.
SELECT
    COUNT(*)                        AS leads_con_mas_de_una_venta_jot,
    SUM(ventas - 1)                 AS ventas_que_no_se_estan_contando
FROM (
    SELECT BTRIM(j_id_bitrix::text) AS k, COUNT(*) AS ventas
    FROM public.mestra_bitrix
    WHERE j_id_bitrix IS NOT NULL
      AND public.parse_fecha_flex(j_fecha_registro_sistema::text)
          >= date_trunc('month', CURRENT_DATE)::date
    GROUP BY 1
    HAVING COUNT(*) > 1
) t;


-- ─────────────────────────────────────────────────────────────────────────────
-- HALLAZGO 4 — el ASESOR sale SOLO del webhook (no es híbrido)
-- ─────────────────────────────────────────────────────────────────────────────
-- En la vista:  b_persona_responsable = NULLIF(TRIM(w.responsible),'')
-- O sea, solo el lado Bitrix. La vista trae mestra_bitrix con "mb.*" pero
-- NO expone el b_persona_responsable histórico de mestra_bitrix.
-- Si el webhook no tiene responsible, el lead cae en 'SIN ASIGNAR' aunque
-- mestra_bitrix SÍ sepa quién es el asesor.
SELECT
    COUNT(*)                                                          AS total,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(w.responsible),'') IS NOT NULL)     AS solo_webhook_ok,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(w.responsible),'') IS NULL
                       AND NULLIF(BTRIM(mb.b_persona_responsable),'') IS NOT NULL
                       AND UPPER(BTRIM(mb.b_persona_responsable)) <> 'REVISAR')
                                                                      AS recuperables_con_hibrido,
    COUNT(*) FILTER (WHERE NULLIF(BTRIM(w.responsible),'') IS NULL
                       AND COALESCE(NULLIF(UPPER(BTRIM(mb.b_persona_responsable)),'REVISAR'),'') = '')
                                                                      AS sin_asesor_en_ninguna
FROM public.bitrix_webhook_leads w
LEFT JOIN public.mestra_bitrix mb
       ON BTRIM(mb.j_id_bitrix::text) = BTRIM(w.bitrix_id::text)
WHERE w.empresa = 'novonet'
  AND (w.created_at AT TIME ZONE 'America/Guayaquil')::date
      >= date_trunc('month', CURRENT_DATE)::date;


-- ─────────────────────────────────────────────────────────────────────────────
-- HALLAZGO 5 — el filtro de asesor del dashboard usa la columna equivocada
-- ─────────────────────────────────────────────────────────────────────────────
-- indicadores.controller.js línea ~313:
--     filtersJoin += ' AND UPPER(TRIM(mb.b_persona_responsable)) = ...'
-- Sobre vw_bitrix_novonet eso es el responsible del WEBHOOK. Si filtrás por un
-- asesor cuyo nombre solo figura en Jotform/mestra, devuelve CERO filas.
-- Reemplazá 'NOMBRE DEL ASESOR' y comparalo:
SELECT
    COUNT(*) FILTER (WHERE UPPER(BTRIM(w.responsible)) = UPPER('NOMBRE DEL ASESOR'))
        AS lo_que_ve_el_filtro_hoy,
    COUNT(*) FILTER (WHERE UPPER(COALESCE(NULLIF(BTRIM(w.responsible),''),
                                          BTRIM(mb.b_persona_responsable))) = UPPER('NOMBRE DEL ASESOR'))
        AS lo_que_veria_con_hibrido
FROM public.bitrix_webhook_leads w
LEFT JOIN public.mestra_bitrix mb
       ON BTRIM(mb.j_id_bitrix::text) = BTRIM(w.bitrix_id::text)
WHERE w.empresa = 'novonet'
  AND (w.created_at AT TIME ZONE 'America/Guayaquil')::date
      >= date_trunc('month', CURRENT_DATE)::date;
