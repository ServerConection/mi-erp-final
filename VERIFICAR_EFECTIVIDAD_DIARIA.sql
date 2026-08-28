-- ============================================================================
-- VERIFICAR_EFECTIVIDAD_DIARIA.sql   (2026-08-28)
-- ----------------------------------------------------------------------------
-- Query espejo del módulo "EFECTIVIDAD DIARIA" (pestaña nueva al lado de
-- CONSULTA en Indicadores Novonet y Velsa).
--
-- Sirve para dos cosas:
--   1) Comprobar en pgAdmin que la pantalla dice lo mismo que la base.
--   2) Tener el cálculo escrito en SQL puro, sin pasar por el backend, el día
--      que alguien discuta un número.
--
-- FUENTE: public.bitrix_webhook_leads (tabla viva del webhook de Bitrix).
--         La agencia sale del catálogo editable de Redes
--         (novonet_lineas_canal / velsa_lineas_canal).
--
-- REGLAS (idénticas a backend/src/controllers/efectividadDiaria.controller.js):
--   · Todo se cuenta por FECHA DE CREACIÓN del lead (hora Ecuador).
--   · TOTAL LEADS  = leads cuya etapa suma (excluye DUPLICADO / REGULARIZACION
--                    / REMARKETING). Es el 100 % de la validación.
--   · GESTIONABLE  = etapas gestionables según shared/etapas.js. Meta: 50 %.
--   · INGRESOS CRM = etapa VENTA SUBIDA. Meta: 30 % de la META de gestionables.
--   · FALTANTE     = max(0, meta_ingresos − ingresos_crm).
--
-- NO MODIFICA NADA. Es solo SELECT.
--
-- CAMBIAR ACÁ ANTES DE EJECUTAR: empresa y rango de fechas.
-- ============================================================================

WITH parametros AS (
    SELECT 'novonet'::text          AS empresa,      -- 'novonet' | 'velsa'
           DATE '2026-08-01'        AS fecha_desde,
           DATE '2026-08-31'        AS fecha_hasta
),
base AS (
    SELECT
        (w.created_at AT TIME ZONE 'America/Guayaquil')::date AS fecha,
        w.bitrix_id                                           AS id,
        COALESCE(
            NULLIF(BTRIM(m.agencia), ''),
            CASE WHEN p.empresa = 'velsa' THEN 'VELSA' ELSE 'SIN AGENCIA ASIGNADA' END
        )                                                     AS agencia,
        NULLIF(CASE
            WHEN LOWER(TRIM(COALESCE(w.etapa, ''))) IN ('inegociable', 'innegociable') THEN 'INNEGOCIABLE'
            WHEN LOWER(TRIM(COALESCE(w.etapa, ''))) = 'regularizacion'                 THEN 'REGULARIZACION'
            ELSE UPPER(TRIM(COALESCE(w.etapa_bitrix, w.etapa, '')))
        END, '')                                              AS etapa_norm
    FROM public.bitrix_webhook_leads w
    CROSS JOIN parametros p
    LEFT JOIN LATERAL (
        SELECT lc.agencia
        FROM public.novonet_lineas_canal lc
        WHERE p.empresa = 'novonet'
          AND BTRIM(lc.origen) = NULLIF(BTRIM(w.source), '')
        UNION ALL
        SELECT lc.agencia
        FROM public.velsa_lineas_canal lc
        WHERE p.empresa = 'velsa'
          AND BTRIM(lc.origen) = NULLIF(BTRIM(w.source), '')
        LIMIT 1
    ) m ON TRUE
    WHERE w.empresa = p.empresa
      AND (w.created_at AT TIME ZONE 'America/Guayaquil')::date
          BETWEEN p.fecha_desde AND p.fecha_hasta
      -- Novonet excluye el origen literal REMARKETING (VENTA SUBIDA siempre suma).
      AND (
            p.empresa <> 'novonet'
         OR UPPER(TRIM(COALESCE(w.etapa_bitrix, w.etapa, ''))) = 'VENTA SUBIDA'
         OR UPPER(TRIM(COALESCE(w.source, ''))) <> 'REMARKETING'
      )
),
conteos AS (
    SELECT
        agencia,
        fecha,
        COUNT(DISTINCT id) FILTER (
            WHERE UPPER(TRIM(COALESCE(etapa_norm, ''))) NOT IN
                  ('DUPLICADO', 'DUPLLICADO', 'REGULARIZACION', 'REGULARIZACIÓN', 'REMARKETING')
        ) AS total_leads,
        COUNT(DISTINCT id) FILTER (
            WHERE etapa_norm IS NOT NULL
              AND etapa_norm !~ '^DUPL+ICADO$'
              AND etapa_norm !~ '^ATC([ /-]?SOPORTE)?$'
              AND etapa_norm <> 'FUERA DE COBERTURA'
              AND etapa_norm !~ '^ZONAS? PELIGROSAS?$'
              AND etapa_norm !~ '^IN+EGOCIABLE$'
              AND etapa_norm !~ '^REMARKETING( .*)?$'
              AND etapa_norm !~ '^REGULARIZA'
              AND etapa_norm NOT IN ('POSTVENTA', 'CONTRATO PARAMOUNT',
                                     'PARAMOUNT SEGUMIENTO POR CERRAR',
                                     'PARAMOUNT SEGUIMIENTO POR CERRAR')
        ) AS gestionables,
        COUNT(DISTINCT id) FILTER (WHERE etapa_norm = 'VENTA SUBIDA') AS ingresos_crm
    FROM base
    GROUP BY agencia, fecha
)
SELECT
    agencia,
    fecha,
    total_leads,
    gestionables,
    ROUND(gestionables::numeric / NULLIF(total_leads, 0) * 100, 1)  AS pct_gestionable,
    ROUND(total_leads * 0.50)                                       AS meta_gestionables,
    ingresos_crm,
    ROUND(ingresos_crm::numeric / NULLIF(gestionables, 0) * 100, 1) AS pct_ingresos,
    FLOOR(ROUND(total_leads * 0.50) * 0.30)                         AS meta_ingresos,
    GREATEST(0, FLOOR(ROUND(total_leads * 0.50) * 0.30) - ingresos_crm) AS faltante
FROM conteos
ORDER BY agencia, fecha;

-- ---------------------------------------------------------------------------
-- CUADRE DE REFERENCIA (el ejemplo que dio gerencia):
--   110 leads · 50 gestionables · 15 ventas
--     → meta gestionables 55 · meta ingresos floor(55 × 0,30) = 16 · faltante 1
--   100 leads · 50 gestionables · 30 ventas
--     → meta gestionables 50 · meta ingresos 15 · faltante 0  (cuadre perfecto)
-- ---------------------------------------------------------------------------
