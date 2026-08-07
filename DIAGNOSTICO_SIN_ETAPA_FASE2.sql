-- ============================================================================
-- DIAGNÓSTICO SIN ETAPA — FASE 2 (con b_id ya confirmado)
--
-- Estado tras la fase 1:
--   ✓ Son NULL reales, no vacíos            (Q1)
--   ✓ Repartidos parejo, no un fallo puntual (Q2: 10-16.5% todos los días)
--   ✓ Viene desde ABRIL, no de este mes      (Q5: pico 43.9% en mayo → 13% hoy)
--   ✓ Sin variantes de mayúsculas            (Q9 vacía)
--   ✓ Filas SIN datos de JotForm (j_* vacío) (Q4) → son leads solo-CRM
--   ⚠ 5 etapas del webhook no existen en mestra_bitrix:
--       seguimiento_negociacion(132), innegociable(77), fuera_de_cobertura(48),
--       zona_peligrosa(8), regularizacion(7)  = 272 leads
--
-- HIPÓTESIS A PROBAR: el ETL (mestra-bitrix-etl) no mapea esas etapas → NULL
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- R1. ⭐⭐ LA CONSULTA DEFINITIVA
--
-- Toma los leads que en mestra_bitrix tienen etapa NULL y pregunta al webhook
-- qué etapa tenían esos MISMOS leads.
--
-- LECTURA DEL RESULTADO:
--   → Salen seguimiento_negociacion / innegociable / fuera_de_cobertura /
--     zona_peligrosa / regularizacion
--       ⇒ CONFIRMADO: el ETL no mapea esas etapas. Se arregla en el ETL.
--   → Sale un mix de TODAS las etapas (incluidas atc, descarte, venta_subida)
--       ⇒ NO es mapeo: el ETL está perdiendo el campo entero en ciertas filas.
--   → Devuelve muy pocas filas
--       ⇒ esos leads el webhook nunca los vio → ver R2.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    w.etapa                                   AS etapa_segun_webhook,
    COUNT(*)::int                             AS leads,
    MIN(mb.b_creado_el_fecha)                 AS primera_fecha,
    MAX(mb.b_creado_el_fecha)                 AS ultima_fecha
FROM public.mestra_bitrix mb
JOIN public.bitrix_webhook_leads w
     ON  w.bitrix_id = mb.b_id
     AND w.empresa   = 'novonet'
WHERE mb.b_etapa_de_la_negociacion IS NULL
  AND public.parse_fecha_flex(mb.b_creado_el_fecha::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
GROUP BY 1
ORDER BY leads DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- R2. De los 167, ¿cuántos el webhook SÍ conoce y cuántos no?
--
--   → Mayoría "SI_ESTA_EN_WEBHOOK" ⇒ el dato existe, el ETL lo pierde.
--   → Mayoría "NO_ESTA_EN_WEBHOOK" ⇒ son leads que nunca dispararon una
--     automatización de etapa en Bitrix (¿importados? ¿creados por API?).
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    CASE WHEN w.bitrix_id IS NULL THEN 'NO_ESTA_EN_WEBHOOK'
         ELSE 'SI_ESTA_EN_WEBHOOK' END        AS situacion,
    COUNT(*)::int                             AS leads
FROM public.mestra_bitrix mb
LEFT JOIN public.bitrix_webhook_leads w
     ON  w.bitrix_id = mb.b_id
     AND w.empresa   = 'novonet'
WHERE mb.b_etapa_de_la_negociacion IS NULL
  AND public.parse_fecha_flex(mb.b_creado_el_fecha::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
GROUP BY 1;


-- ────────────────────────────────────────────────────────────────────────────
-- R3. ¿Es cuestión de PIPELINE? (la tabla tiene columna b_pipeline)
--
-- Los IDs de etapa en Bitrix son por embudo (C1:..., C2:...). Si un embudo
-- concentra los NULL, el ETL solo mapea las etapas del embudo principal.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    COALESCE(NULLIF(TRIM(b_pipeline), ''), '(vacío)')              AS pipeline,
    COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion IS NULL)::int AS sin_etapa,
    COUNT(*)::int                                                  AS total,
    ROUND(100.0 * COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion IS NULL)
          / NULLIF(COUNT(*), 0), 1)                                AS pct
FROM public.mestra_bitrix
WHERE public.parse_fecha_flex(b_creado_el_fecha::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
GROUP BY 1
ORDER BY sin_etapa DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- R4. ¿Las filas con etapa NULL están vacías en TODO lo demás?
--
-- Q4 mostró j_* siempre vacío y b_persona_responsable a veces vacío.
-- Esto mide qué tan incompleta viene la fila del ETL.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    COUNT(*)::int                                                        AS total_sin_etapa,
    COUNT(*) FILTER (WHERE NULLIF(TRIM(b_persona_responsable),'') IS NULL)::int AS sin_responsable,
    COUNT(*) FILTER (WHERE NULLIF(TRIM(b_origen),'')             IS NULL)::int AS sin_origen,
    COUNT(*) FILTER (WHERE NULLIF(TRIM(b_pipeline),'')           IS NULL)::int AS sin_pipeline,
    COUNT(*) FILTER (WHERE NULLIF(TRIM(b_nombre),'')             IS NULL)::int AS sin_nombre,
    COUNT(*) FILTER (WHERE NULLIF(TRIM(b_id),'')                 IS NULL)::int AS sin_b_id,
    COUNT(*) FILTER (WHERE NULLIF(TRIM(estadogeneral),'')        IS NULL)::int AS sin_estadogeneral
FROM public.mestra_bitrix
WHERE b_etapa_de_la_negociacion IS NULL
  AND public.parse_fecha_flex(b_creado_el_fecha::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE;


-- ────────────────────────────────────────────────────────────────────────────
-- R5. ¿Cuándo escribió el ETL esas filas? (created_at / updated_at)
--
-- Si updated_at quedó pegado al created_at, el ETL insertó la fila y nunca
-- volvió a tocarla — o sea, nunca le llegó la etapa en una pasada posterior.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    (updated_at = created_at)                 AS nunca_actualizada,
    COUNT(*)::int                             AS leads,
    MIN(created_at)                           AS primer_insert,
    MAX(updated_at)                           AS ultimo_update
FROM public.mestra_bitrix
WHERE b_etapa_de_la_negociacion IS NULL
  AND public.parse_fecha_flex(b_creado_el_fecha::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
GROUP BY 1;


-- ────────────────────────────────────────────────────────────────────────────
-- R6. ANOMALÍA HISTÓRICA — feb/mar tienen ~100 filas vs ~6.800 de may-jul
--
-- Eso no es estacionalidad. O falta data anterior a abril, o b_creado_el_fecha
-- viene en otro formato y parse_fecha_flex lo descarta (devuelve NULL).
-- Esta consulta separa las dos causas.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    CASE
        WHEN b_creado_el_fecha IS NULL
             OR TRIM(b_creado_el_fecha) = ''                     THEN '1_fecha_vacia'
        WHEN public.parse_fecha_flex(b_creado_el_fecha::text) IS NULL
                                                                 THEN '2_formato_no_parseable'
        ELSE                                                          '3_ok'
    END                                       AS estado_fecha,
    COUNT(*)::int                             AS filas,
    MIN(b_creado_el_fecha)                    AS ejemplo_min,
    MAX(b_creado_el_fecha)                    AS ejemplo_max
FROM public.mestra_bitrix
GROUP BY 1
ORDER BY 1;
