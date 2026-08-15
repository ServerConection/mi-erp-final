-- ============================================================================
-- VERIFICACIÓN DE FUENTES — INDICADORES VELSA vs NOVONET
-- Ejecutar en pgAdmin sobre bddgeneral, paso por paso.
-- Responde las 4 preguntas abiertas del informe REVISION_VELSA_VS_NOVONET.md
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 1 · ¿bitrix_webhook_leads tiene datos de VELSA?
-- Si devuelve filas con empresa='velsa', Velsa debería leer de aquí (igual que
-- Novonet) en vez de negociaciones_reporteria.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    empresa,
    COUNT(*)                                                  AS filas,
    MIN((created_at AT TIME ZONE 'America/Guayaquil')::date)   AS desde,
    MAX((created_at AT TIME ZONE 'America/Guayaquil')::date)   AS hasta,
    COUNT(*) FILTER (
        WHERE (created_at AT TIME ZONE 'America/Guayaquil')::date = CURRENT_DATE - 1
    )                                                          AS leads_ayer
FROM public.bitrix_webhook_leads
GROUP BY empresa
ORDER BY filas DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 2 · ¿Qué tan atrasada está negociaciones_reporteria contra el webhook?
-- Este es el mismo diagnóstico que motivó migrar Novonet al webhook.
-- Si "solo_reporteria" o "solo_webhook" son grandes, Velsa está mostrando
-- una foto distinta a la real.
-- ────────────────────────────────────────────────────────────────────────────
WITH rep AS (
    SELECT id::text AS id, creado_en::date AS fecha
    FROM public.negociaciones_reporteria
    WHERE creado_en::date >= CURRENT_DATE - 7
),
web AS (
    SELECT BTRIM(bitrix_id::text) AS id,
           (created_at AT TIME ZONE 'America/Guayaquil')::date AS fecha
    FROM public.bitrix_webhook_leads
    WHERE empresa = 'velsa'
      AND (created_at AT TIME ZONE 'America/Guayaquil')::date >= CURRENT_DATE - 7
)
SELECT
    COALESCE(r.fecha, w.fecha)                       AS fecha,
    COUNT(*) FILTER (WHERE r.id IS NOT NULL)         AS en_reporteria,
    COUNT(*) FILTER (WHERE w.id IS NOT NULL)         AS en_webhook,
    COUNT(*) FILTER (WHERE w.id IS NULL)             AS solo_reporteria,
    COUNT(*) FILTER (WHERE r.id IS NULL)             AS solo_webhook
FROM rep r
FULL OUTER JOIN web w ON w.id = r.id AND w.fecha = r.fecha
GROUP BY 1
ORDER BY 1 DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 3 · ¿Cuánto duplica la MV de Velsa?
-- Cada negociación con más de un servicio Jotform genera N filas en la MV.
-- "filas_de_mas" es exactamente el sobreconteo que tenían leads totales,
-- gestionables y ventas CRM antes del fix COUNT(DISTINCT).
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    COUNT(*)                                  AS filas_en_la_mv,
    COUNT(DISTINCT id_crm)                    AS negociaciones_reales,
    COUNT(*) - COUNT(DISTINCT id_crm)         AS filas_de_mas,
    ROUND(
        (COUNT(*) - COUNT(DISTINCT id_crm))::numeric
        / NULLIF(COUNT(DISTINCT id_crm), 0) * 100, 2
    )                                         AS pct_inflado
FROM public.mv_indicadores_velsa_completo
WHERE id_crm IS NOT NULL
  AND fecha_creacion_crm::date >= date_trunc('month', CURRENT_DATE)::date;

-- Detalle: las negociaciones que más duplican
SELECT id_crm, COUNT(*) AS filas
FROM public.mv_indicadores_velsa_completo
WHERE id_crm IS NOT NULL
  AND fecha_creacion_crm::date >= date_trunc('month', CURRENT_DATE)::date
GROUP BY id_crm
HAVING COUNT(*) > 1
ORDER BY filas DESC
LIMIT 20;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 4 · ¿Existe vw_bitrix_velsa? (la espera kpiComercial.controller.js)
-- Si devuelve 0 filas, ese endpoint está roto para VELSA.
-- ────────────────────────────────────────────────────────────────────────────
SELECT c.relname AS objeto,
       CASE c.relkind WHEN 'm' THEN 'MATERIALIZADA' WHEN 'v' THEN 'VISTA' ELSE c.relkind::text END AS tipo
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('vw_bitrix_velsa', 'vw_bitrix_novonet',
                    'mv_indicadores_velsa_completo', 'negociaciones_reporteria',
                    'bitrix_webhook_leads', 'vw_jotform_velsa_netlife_completo')
ORDER BY 1;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 5 · ANTES / DESPUÉS — correr ANTES de desplegar y guardar el resultado
-- Es el número que van a pedir las gerencias para entender por qué bajó Velsa.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    fecha_creacion_crm::date                                  AS fecha,

    -- Cómo contaba ANTES (COUNT(*), sin excluir etapas):
    COUNT(*)                                                  AS leads_antes,

    -- Cómo cuenta AHORA (DISTINCT + excluye DUPLICADO/REMARKETING/REGULARIZACION):
    COUNT(DISTINCT id_crm) FILTER (
        WHERE UPPER(TRIM(COALESCE(etapa_crm, ''))) NOT IN
              ('DUPLICADO','DUPLLICADO','REGULARIZACION','REGULARIZACIÓN','REMARKETING')
    )                                                         AS leads_ahora,

    -- Desglose de la diferencia:
    COUNT(*) - COUNT(DISTINCT id_crm)                         AS baja_por_duplicacion_mv,
    COUNT(DISTINCT id_crm) FILTER (
        WHERE UPPER(TRIM(COALESCE(etapa_crm, ''))) IN
              ('DUPLICADO','DUPLLICADO','REGULARIZACION','REGULARIZACIÓN','REMARKETING')
    )                                                         AS baja_por_etapas_excluidas
FROM public.mv_indicadores_velsa_completo
WHERE id_crm IS NOT NULL
  AND fecha_creacion_crm::date >= CURRENT_DATE - 30
GROUP BY 1
ORDER BY 1 DESC;
