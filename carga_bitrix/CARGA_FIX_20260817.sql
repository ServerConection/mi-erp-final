-- ============================================================================
-- FIX: la vista vw_bitrix_novonet ya NO excluye duplicados
-- ============================================================================
-- ANTES: los duplicados sin venta Jotform no llegaban al dashboard.
--        Por eso el embudo mostraba 5 duplicados en vez de 873.
-- AHORA: entran TODOS los leads, todas las etapas.
--
-- Los indicadores de leads totales / gestionables siguen excluyendo
-- DUPLICADO / REMARKETING / REGULARIZACION del CALCULO, pero los registros
-- ya se ven en el detalle, el embudo y el backoffice.
--
-- CREATE OR REPLACE: no rompe ninguna vista que dependa de esta.
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_bitrix_novonet AS
WITH wn AS (
    -- El filtro por empresa va ACÁ y no en el WHERE final: con FULL OUTER JOIN,
    -- "WHERE w.empresa='novonet'" descartaría todas las filas que vienen solo
    -- del lado Jotform (donde w.* es NULL), que es precisamente lo que se
    -- quiere recuperar.
    SELECT * FROM public.bitrix_webhook_leads WHERE empresa = 'novonet'
)
SELECT
    -- ── Identidad ────────────────────────────────────────────────────────
    -- Se deja w.bitrix_id crudo (no COALESCE) por dos razones:
    --   a) conserva el tipo varchar(50) original → CREATE OR REPLACE no falla
    --   b) COUNT(DISTINCT b_id) ignora NULL, así las filas que son SOLO Jotform
    --      no inflan los conteos del lado Bitrix (leads_totales, gestionables).
    --      Para identificar esas filas está j_id_bitrix.
    w.bitrix_id                                             AS b_id,

    CASE
        WHEN w.etapa IN ('inegociable', 'innegociable') THEN 'INNEGOCIABLE'
        WHEN w.etapa = 'regularizacion'                 THEN 'REGULARIZACION'
        ELSE UPPER(TRIM(w.etapa_bitrix))
    END                                                     AS b_etapa_de_la_negociacion,

    w.etapa                                                 AS b_etapa_slug,

    -- ── Fechas ya tipadas ────────────────────────────────────────────────
    (w.created_at AT TIME ZONE 'America/Guayaquil')::date   AS b_creado_el_fecha,
    (w.updated_at AT TIME ZONE 'America/Guayaquil')::date   AS b_modificado_el_fecha,
    to_char(w.created_at AT TIME ZONE 'America/Guayaquil',
            'HH24:MI:SS')                                   AS b_creado_el_hora,
    to_char(w.updated_at AT TIME ZONE 'America/Guayaquil',
            'HH24:MI:SS')                                   AS b_modificado_el_hora,
    NULL::text                                              AS b_cerrado,
    NULLIF(TRIM(w.fecha_venta_subida), '')                  AS b_fecha_venta_subida,
    NULLIF(TRIM(w.fecha_concretar),    '')                  AS b_fecha_concretar,

    -- ── HÍBRIDO BITRIX + JOTFORM (hallazgo 4) ────────────────────────────
    -- Antes: solo w.responsible. Si el webhook no traía responsable, el lead
    -- caía en 'SIN ASIGNAR' aunque mestra_bitrix sí supiera quién era.
    -- Orden: webhook (fuente viva) → mestra_bitrix (histórico).
    -- 'REVISAR' es el placeholder de la carga histórica, NO un asesor: se
    -- descarta para que no gane sobre un nombre real.
    COALESCE(
        NULLIF(BTRIM(w.responsible), ''),
        CASE WHEN UPPER(BTRIM(j.b_persona_responsable)) = 'REVISAR'
             THEN NULL
             ELSE NULLIF(BTRIM(j.b_persona_responsable), '')
        END
    )                                                       AS b_persona_responsable,

    NULLIF(TRIM(w.source),        '')                       AS b_origen,
    NULLIF(TRIM(w.pipeline),      '')                       AS b_pipeline,
    NULLIF(TRIM(w.creado_por),    '')                       AS b_creado_por,
    NULLIF(TRIM(w.modificado_por),'')                       AS b_modificado_por,

    -- ── Campos de gestión ────────────────────────────────────────────────
    NULLIF(TRIM(w.city),                  '')               AS b_ciudad,
    NULLIF(TRIM(w.phone),                 '')               AS b_telefono,
    NULLIF(TRIM(w.razon_descarte),        '')               AS b_razon_descarte,
    NULLIF(TRIM(w.motivo_atc),            '')               AS b_motivo_atc,
    NULLIF(TRIM(w.documentos_pendientes), '')               AS b_documentos_pendientes,
    NULLIF(TRIM(w.innegociable),          '')               AS b_innegocioable,
    NULLIF(TRIM(w.volver_a_llamar),       '')               AS b_volver_llamar,
    NULLIF(TRIM(w.otro_proveedor),        '')               AS b_desiste_compra,
    NULLIF(TRIM(w.comentario),            '')               AS b_comentario,
    NULLIF(TRIM(w.repeated),              '')               AS b_repetido,

    -- ── UTMs ─────────────────────────────────────────────────────────────
    NULLIF(TRIM(w.utm_source),   '')                        AS b_utm_source,
    NULLIF(TRIM(w.utm_medium),   '')                        AS b_utm_medium,
    NULLIF(TRIM(w.utm_campaign), '')                        AS b_utm_campaign,

    w.created_at,
    w.updated_at,

    -- ── LADO JOTFORM ─────────────────────────────────────────────────────
    j.j_fecha_registro_sistema,
    j.j_id_bitrix,
    j.j_netlife_estatus_real,
    j.j_fecha_activacion_netlife,
    j.j_novedades_atc,
    j.j_estatus_regularizacion,
    j.j_detalle_regularizacion,
    j.j_forma_pago,
    j.j_netlife_login,
    j.j_fecha_agenda,
    j.j_codigo_asesor,
    j.j_supervisor,
    j.j_origen_venta,
    j.j_aplica_descuento_3ra_edad,
    j.j_provincia,
    j.j_ciudad,
    j.j_calidad_venta_analista,
    j.j_venta_efectiva,
    j.j_auditado_por,
    j.j_errores_telcos,
    j.j_plan_contratado_final,
    j.j_servicios_digitales,
    j.j_venta_nueva_o_reingreso,
    j.j_tipo_documento,
    j.j_mes_regularizacion,
    j.j_observacion_venta_original,
    j.estadogeneral

-- ── HALLAZGO 1 y 3: FULL OUTER JOIN, sin LATERAL, sin LIMIT 1 ────────────
FROM wn w
FULL OUTER JOIN public.mestra_bitrix j
  ON BTRIM(j.j_id_bitrix::text) = BTRIM(w.bitrix_id::text)

-- ── HALLAZGO 2: 'duplicado' ya no borra la venta Jotform ─────────────────
-- IS DISTINCT FROM y no <> : con FULL OUTER JOIN w.etapa puede ser NULL, y
-- "NULL <> 'duplicado'" da NULL (se evalúa como falso) → borraría justamente
-- las filas que solo vienen de Jotform.
-- SIN FILTRO: entran TODOS los leads, duplicados incluidos.
-- La linea anterior era:
--   WHERE (w.etapa IS DISTINCT FROM 'duplicado' OR j.j_id_bitrix IS NOT NULL)
-- y borraba los duplicados sin venta Jotform (873 de agosto quedaban en 5).
;



COMMENT ON VIEW public.vw_bitrix_novonet IS
  'Novonet: webhook Bitrix + Jotform (mestra_bitrix), FULL OUTER JOIN. Sin filtro de etapa: entran todos los leads.';

-- Verificacion: duplicados de agosto visibles en la vista (debe dar ~873)
SELECT COUNT(*) AS duplicados_visibles
FROM public.vw_bitrix_novonet
WHERE UPPER(TRIM(COALESCE(b_etapa_de_la_negociacion,''))) = 'DUPLICADO'
  AND b_creado_el_fecha >= DATE '2026-08-01';