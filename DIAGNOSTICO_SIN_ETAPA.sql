-- ============================================================================
-- DIAGNÓSTICO: "167 SIN ETAPA este mes" en Indicadores → Embudo CRM
--
-- Origen del síntoma: backend/src/controllers/indicadores.controller.js:678-686
--   COALESCE(mb.b_etapa_de_la_negociacion, 'SIN ETAPA')
--   FROM public.mestra_bitrix
--   WHERE parse_fecha_flex(mb.b_creado_el_fecha) BETWEEN $1 AND $2
--
-- La columna b_etapa_de_la_negociacion NO la escribe V1: la escribe el
-- servicio "mestra-bitrix-etl" del orquestador. V1 solo lee.
--
-- Corre las consultas EN ORDEN. Cada una descarta hipótesis.
-- Base: bddgeneral
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- Q1. ¿Son NULL de verdad, o son cadenas vacías?
--
-- El COALESCE del embudo SOLO atrapa NULL. Si hubiera cadenas vacías ('')
-- aparecerían como una barra en blanco aparte, no como "SIN ETAPA".
-- Esperado: la fila 'NULL' debería dar ~167.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    CASE
        WHEN b_etapa_de_la_negociacion IS NULL          THEN '1_NULL'
        WHEN TRIM(b_etapa_de_la_negociacion) = ''       THEN '2_VACIO'
        ELSE                                                 '3_CON_VALOR'
    END                                     AS tipo,
    COUNT(*)::int                           AS registros
FROM public.mestra_bitrix
WHERE public.parse_fecha_flex(b_creado_el_fecha::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
GROUP BY 1
ORDER BY 1;


-- ────────────────────────────────────────────────────────────────────────────
-- Q2. ¿Se concentran en días puntuales, o están repartidos todo el mes?
--
--   → Concentrados en 1-2 días  = el ETL falló esos días (hipótesis 3)
--   → Repartidos parejo         = etapa/pipeline sin mapear (hipótesis 1 o 2)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    public.parse_fecha_flex(b_creado_el_fecha::text)                        AS dia,
    COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion IS NULL)::int          AS sin_etapa,
    COUNT(*)::int                                                          AS total_dia,
    ROUND(100.0 * COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion IS NULL)
          / NULLIF(COUNT(*), 0), 1)                                        AS pct_sin_etapa
FROM public.mestra_bitrix
WHERE public.parse_fecha_flex(b_creado_el_fecha::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
GROUP BY 1
ORDER BY 1;


-- ────────────────────────────────────────────────────────────────────────────
-- Q3. ¿Qué columnas b_* existen realmente?
--
-- Necesario para el resto del diagnóstico: hay que saber el nombre real de la
-- columna del ID de Bitrix y si existe alguna columna de embudo/pipeline.
-- ────────────────────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'mestra_bitrix'
ORDER BY ordinal_position;


-- ────────────────────────────────────────────────────────────────────────────
-- Q4. ¿Cómo se ven esas filas? ¿Están completas salvo la etapa?
--
--   → Resto de campos LLENO  = el ETL sí procesó la fila, falló solo el mapeo
--                              de etapa (hipótesis 1 o 2)
--   → Resto de campos VACÍO  = la fila entró a medias (hipótesis 3)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    b_creado_el_fecha,
    b_persona_responsable,
    b_origen,
    j_fecha_registro_sistema,
    j_netlife_estatus_real
FROM public.mestra_bitrix
WHERE b_etapa_de_la_negociacion IS NULL
  AND public.parse_fecha_flex(b_creado_el_fecha::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
LIMIT 25;


-- ────────────────────────────────────────────────────────────────────────────
-- Q5. ¿Es un problema NUEVO o viene de antes?
--
-- Compara los últimos 6 meses. Si el % salta justo este mes, algo cambió en
-- Bitrix o en el ETL en esa fecha — ahí está la causa.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    date_trunc('month', public.parse_fecha_flex(b_creado_el_fecha::text))::date AS mes,
    COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion IS NULL)::int              AS sin_etapa,
    COUNT(*)::int                                                              AS total_mes,
    ROUND(100.0 * COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion IS NULL)
          / NULLIF(COUNT(*), 0), 1)                                            AS pct
FROM public.mestra_bitrix
WHERE public.parse_fecha_flex(b_creado_el_fecha::text)
      >= (date_trunc('month', CURRENT_DATE) - INTERVAL '6 months')::date
GROUP BY 1
ORDER BY 1;


-- ────────────────────────────────────────────────────────────────────────────
-- Q6. ⭐ LA CONSULTA DECISIVA
--
-- El webhook de V1 (bitrix_webhook_leads) recibe la etapa por su cuenta,
-- directo desde las automatizaciones de Bitrix. Si esos MISMOS leads SÍ tienen
-- etapa ahí pero NO en mestra_bitrix, el problema está 100% en el ETL del
-- orquestador y no en Bitrix ni en V1.
--
-- ⚠️ AJUSTA "mb.<COLUMNA_ID>" con el nombre real que te devuelva Q3
--    (candidatos: b_id, b_id_negociacion, id_bitrix, j_id_bitrix)
-- ────────────────────────────────────────────────────────────────────────────
/*
SELECT
    COUNT(*)::int AS con_etapa_en_webhook_pero_null_en_mestra
FROM public.mestra_bitrix mb
JOIN public.bitrix_webhook_leads w
     ON  w.bitrix_id = mb.<COLUMNA_ID>::text
     AND w.empresa   = 'novonet'
WHERE mb.b_etapa_de_la_negociacion IS NULL
  AND NULLIF(TRIM(w.etapa), '') IS NOT NULL
  AND public.parse_fecha_flex(mb.b_creado_el_fecha::text)
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE;
*/


-- ────────────────────────────────────────────────────────────────────────────
-- Q7. ¿Qué etapas SÍ está escribiendo el webhook este mes?
--
-- Si aquí aparece un slug que NO existe en el catálogo del embudo, esa es la
-- etapa nueva que el ETL no tiene mapeada.
-- ────────────────────────────────────────────────────────────────────────────
SELECT etapa, COUNT(*)::int AS total, MAX(updated_at) AS ultimo
FROM public.bitrix_webhook_leads
WHERE empresa = 'novonet'
  AND updated_at >= date_trunc('month', CURRENT_DATE)
GROUP BY etapa
ORDER BY total DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- Q8. Catálogo actual de etapas en mestra_bitrix (para comparar con Q7)
-- ────────────────────────────────────────────────────────────────────────────
SELECT b_etapa_de_la_negociacion AS etapa, COUNT(*)::int AS total
FROM public.mestra_bitrix
WHERE public.parse_fecha_flex(b_creado_el_fecha::text)
      >= (date_trunc('month', CURRENT_DATE) - INTERVAL '2 months')::date
GROUP BY 1
ORDER BY total DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- Q9. BONUS — bug latente detectado durante la investigación
--
-- indicadores.controller.js  usa: COALESCE(col, 'SIN ETAPA')
-- reporteDetalle.controller.js usa: COALESCE(NULLIF(TRIM(UPPER(col)),''), 'SIN ETAPA')
--
-- La segunda normaliza mayúsculas; la primera no. Si esta consulta devuelve
-- filas, las dos pantallas están contando etapas distinto para el mismo dato.
-- ────────────────────────────────────────────────────────────────────────────
SELECT UPPER(TRIM(b_etapa_de_la_negociacion))     AS etapa_normalizada,
       COUNT(DISTINCT b_etapa_de_la_negociacion)  AS variantes_de_escritura,
       ARRAY_AGG(DISTINCT b_etapa_de_la_negociacion) AS cuales
FROM public.mestra_bitrix
WHERE b_etapa_de_la_negociacion IS NOT NULL
GROUP BY 1
HAVING COUNT(DISTINCT b_etapa_de_la_negociacion) > 1
ORDER BY 2 DESC;
