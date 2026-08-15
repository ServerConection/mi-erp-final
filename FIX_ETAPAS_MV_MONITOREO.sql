-- ============================================================================
-- FIX ETAPAS DUPLICADO / REMARKETING / REGULARIZACION  →  LADO BASE DE DATOS
-- ============================================================================
-- Contexto: el backend ya quedó corregido (backend/src/shared/etapas.js es la
-- fuente única de verdad y todos los controladores la usan). PERO el módulo
-- MONITOREO REDES y FORECAST leen columnas YA AGREGADAS desde vistas
-- materializadas, cuya definición vive SOLO en la base de datos:
--
--     public.mv_monitoreo_publicidad   → n_leads, negociables, total_gestionables
--     public.mv_monitoreo_hora         → n_leads
--     public.mv_monitoreo_ciudad       → total_leads
--
-- Mientras estas MV no se corrijan, esas pantallas seguirán mostrando los leads
-- inflados aunque el código Node ya esté bien. Ejecutar este script en pgAdmin.
--
-- Ejecutar por PASOS, en orden. NO correr todo de una.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 1 · DIAGNÓSTICO: ¿cuánto están inflando estas 3 etapas?
-- Correr ANTES de tocar nada y guardar el resultado para mostrar a gerencia.
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    mb.b_creado_el_fecha::date                                   AS fecha,
    COUNT(*)                                                     AS leads_contados_hoy,
    COUNT(*) FILTER (
        WHERE UPPER(TRIM(COALESCE(mb.b_etapa_de_la_negociacion, ''))) IN
              ('DUPLICADO','DUPLLICADO','REGULARIZACION','REGULARIZACIÓN','REMARKETING')
    )                                                            AS leads_a_descontar,
    COUNT(*) FILTER (
        WHERE UPPER(TRIM(COALESCE(mb.b_etapa_de_la_negociacion, ''))) NOT IN
              ('DUPLICADO','DUPLLICADO','REGULARIZACION','REGULARIZACIÓN','REMARKETING')
    )                                                            AS leads_reales,
    ROUND(
        COUNT(*) FILTER (
            WHERE UPPER(TRIM(COALESCE(mb.b_etapa_de_la_negociacion, ''))) IN
                  ('DUPLICADO','DUPLLICADO','REGULARIZACION','REGULARIZACIÓN','REMARKETING')
        )::numeric / NULLIF(COUNT(*), 0) * 100, 2
    )                                                            AS pct_desviacion
FROM public.mestra_bitrix mb
WHERE mb.b_creado_el_fecha::date >= (CURRENT_DATE - INTERVAL '30 days')
GROUP BY 1
ORDER BY 1 DESC;


-- Desglose por etapa exacta (para confirmar que no hay más variantes de texto
-- que se estén escapando del filtro, ej. tildes o typos nuevos):
SELECT
    UPPER(TRIM(COALESCE(mb.b_etapa_de_la_negociacion, '(SIN ETAPA)'))) AS etapa,
    COUNT(*)                                                           AS registros
FROM public.mestra_bitrix mb
WHERE mb.b_creado_el_fecha::date >= (CURRENT_DATE - INTERVAL '30 days')
  AND (
        UPPER(TRIM(COALESCE(mb.b_etapa_de_la_negociacion, ''))) LIKE '%DUPL%'
     OR UPPER(TRIM(COALESCE(mb.b_etapa_de_la_negociacion, ''))) LIKE '%REGULARIZ%'
     OR UPPER(TRIM(COALESCE(mb.b_etapa_de_la_negociacion, ''))) LIKE '%REMARKET%'
  )
GROUP BY 1
ORDER BY registros DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 2 · EXTRAER LA DEFINICIÓN ACTUAL DE LAS VISTAS
-- La definición no está versionada en el repo. Copiar el resultado de esta
-- consulta a un archivo antes de modificar nada (es el respaldo).
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    c.relname                                AS vista,
    CASE c.relkind WHEN 'm' THEN 'MATERIALIZADA' ELSE 'NORMAL' END AS tipo,
    pg_get_viewdef(c.oid, true)              AS definicion
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('mv_monitoreo_publicidad', 'mv_monitoreo_hora', 'mv_monitoreo_ciudad')
ORDER BY 1;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 3 · PREDICADO OFICIAL A APLICAR
-- Sobre la definición obtenida en el PASO 2, reemplazar el conteo de leads.
--
--   ANTES (típico):
--       COUNT(*) AS n_leads
--   o bien:
--       COUNT(*) FILTER (WHERE b_etapa_de_la_negociacion NOT ILIKE '%DUPLICADO%'
--                          AND b_etapa_de_la_negociacion NOT ILIKE '%REGULARIZA%') AS n_leads
--
--   DESPUÉS (pegar exactamente esto):
--       COUNT(*) FILTER (
--           WHERE UPPER(TRIM(COALESCE(b_etapa_de_la_negociacion, ''))) NOT IN
--                 ('DUPLICADO','DUPLLICADO','REGULARIZACION','REGULARIZACIÓN','REMARKETING')
--       ) AS n_leads
--
-- Aplicar el MISMO criterio a:
--   · n_leads            (mv_monitoreo_publicidad, mv_monitoreo_hora)
--   · total_leads        (mv_monitoreo_ciudad)
--   · negociables        (mv_monitoreo_publicidad) — ya son gestionables, pero
--     verificar que la lista de no-gestionables incluya REMARKETING
--   · total_gestionables (mv_monitoreo_publicidad) — ídem
--
-- Debe coincidir 1 a 1 con backend/src/shared/etapas.js:
--   ETAPAS_NO_SUMAN_LEAD      = DUPLICADO, DUPLLICADO, REGULARIZACION,
--                               REGULARIZACIÓN, REMARKETING
--   ETAPAS_NO_GESTIONABLES    = las anteriores + ATC, ATC/SOPORTE,
--                               FUERA DE COBERTURA, ZONA(S) PELIGROSA(S),
--                               POSTVENTA, CONTRATO PARAMOUNT,
--                               PARAMOUNT SEGU(I)MIENTO POR CERRAR, INNEGOCIABLE
--
-- Luego recrear la vista:
--       DROP MATERIALIZED VIEW public.mv_monitoreo_publicidad;
--       CREATE MATERIALIZED VIEW public.mv_monitoreo_publicidad AS <definición corregida>;
--       -- volver a crear los índices que tuviera la vista original
--       REFRESH MATERIALIZED VIEW public.mv_monitoreo_publicidad;
--
-- OJO: backend/src/services/monitoreoService.js hace ALTER COLUMN ... TYPE sobre
-- estas vistas al arrancar. Si se recrean, revisar que los tipos de columna
-- sigan siendo los que ese servicio espera (date / integer).
-- ────────────────────────────────────────────────────────────────────────────


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 4 · VERIFICACIÓN POST-FIX
-- La MV debe coincidir con el cálculo directo sobre mestra_bitrix.
-- Si `diferencia` no es 0, la vista quedó mal o falta refrescarla.
-- ────────────────────────────────────────────────────────────────────────────
WITH desde_mv AS (
    SELECT fecha::date AS fecha, SUM(n_leads) AS leads_mv
    FROM public.mv_monitoreo_publicidad
    WHERE fecha::date >= (CURRENT_DATE - INTERVAL '7 days')
      AND canal_inversion NOT IN ('MAL INGRESO','SIN MAPEO')
    GROUP BY 1
),
desde_origen AS (
    SELECT mb.b_creado_el_fecha::date AS fecha, COUNT(*) AS leads_ok
    FROM public.mestra_bitrix mb
    WHERE mb.b_creado_el_fecha::date >= (CURRENT_DATE - INTERVAL '7 days')
      AND mb.j_id_bitrix IS NULL
      AND UPPER(TRIM(COALESCE(mb.b_etapa_de_la_negociacion, ''))) NOT IN
          ('DUPLICADO','DUPLLICADO','REGULARIZACION','REGULARIZACIÓN','REMARKETING')
    GROUP BY 1
)
SELECT
    COALESCE(m.fecha, o.fecha)                       AS fecha,
    COALESCE(m.leads_mv, 0)                          AS leads_en_la_vista,
    COALESCE(o.leads_ok, 0)                          AS leads_calculados,
    COALESCE(m.leads_mv, 0) - COALESCE(o.leads_ok, 0) AS diferencia
FROM desde_mv m
FULL OUTER JOIN desde_origen o ON o.fecha = m.fecha
ORDER BY 1 DESC;
