-- ============================================================================
-- VISTA: public.vw_bitrix_novonet
--
-- Presenta bitrix_webhook_leads (webhook, tiempo real) con los MISMOS nombres
-- de columna que el lado b_* de mestra_bitrix. Asi los controllers cambian
-- solo el nombre de la tabla, sin reescribir cada consulta.
--
-- POR QUE:
--   - mestra_bitrix pierde datos: 1.480 leads en agosto contra 2.363 del webhook
--   - el webhook trae las 5 etapas que hoy caen en SIN ETAPA
--   - las fechas ya vienen tipadas: se elimina parse_fecha_flex(), que hoy se
--     ejecuta fila por fila y es de lo mas caro del dashboard
--
-- DECISIONES APLICADAS:
--   1. Solo empresa = 'novonet'
--   2. Se EXCLUYEN los duplicados (666 leads en agosto, 28% del total).
--      En mestra_bitrix tampoco contaban, asi el numero sigue comparable.
--   3. Variantes de escritura unificadas:
--        Duplicado / DUPLICADO           -> duplicado    (excluido)
--        Innegociable / Inegociable      -> INNEGOCIABLE
--        Regularizacion / REGULARIZACION -> REGULARIZACION
--   4. Etapas en MAYUSCULA, igual que mestra_bitrix
--
-- ES 100% REVERSIBLE: es una vista, no copia ni mueve datos.
-- Para deshacer: DROP VIEW public.vw_bitrix_novonet;
--
-- Ejecutar en pgAdmin sobre bddgeneral.
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_bitrix_novonet AS
SELECT
    -- ── Identidad ────────────────────────────────────────────────────────
    w.bitrix_id                                             AS b_id,

    -- ── Etapa normalizada (mayuscula + typos unificados) ─────────────────
    CASE
        WHEN w.etapa IN ('inegociable', 'innegociable') THEN 'INNEGOCIABLE'
        WHEN w.etapa = 'regularizacion'                 THEN 'REGULARIZACION'
        ELSE UPPER(TRIM(w.etapa_bitrix))
    END                                                     AS b_etapa_de_la_negociacion,

    -- slug crudo, por si se quiere agrupar sin depender del texto
    w.etapa                                                 AS b_etapa_slug,

    -- ── Fechas YA TIPADAS (adios parse_fecha_flex) ───────────────────────
    (w.created_at AT TIME ZONE 'America/Guayaquil')::date   AS b_creado_el_fecha,
    (w.updated_at AT TIME ZONE 'America/Guayaquil')::date   AS b_modificado_el_fecha,
    to_char(w.created_at AT TIME ZONE 'America/Guayaquil',
            'HH24:MI:SS')                                   AS b_creado_el_hora,
    to_char(w.updated_at AT TIME ZONE 'America/Guayaquil',
            'HH24:MI:SS')                                   AS b_modificado_el_hora,
    -- b_cerrado no existe en el webhook. Se expone como NULL para que el
    -- COALESCE de joinEmpleadosDedup caiga en b_creado_el_fecha.
    NULL::text                                              AS b_cerrado,
    NULLIF(TRIM(w.fecha_venta_subida), '')                  AS b_fecha_venta_subida,
    NULLIF(TRIM(w.fecha_concretar),    '')                  AS b_fecha_concretar,

    -- ── Responsable y origen ─────────────────────────────────────────────
    NULLIF(TRIM(w.responsible),   '')                       AS b_persona_responsable,
    NULLIF(TRIM(w.source),        '')                       AS b_origen,
    NULLIF(TRIM(w.pipeline),      '')                       AS b_pipeline,
    NULLIF(TRIM(w.creado_por),    '')                       AS b_creado_por,
    NULLIF(TRIM(w.modificado_por),'')                       AS b_modificado_por,

    -- ── Campos de gestion ────────────────────────────────────────────────
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

    -- ── UTMs (esto mestra_bitrix no lo tiene) ────────────────────────────
    NULLIF(TRIM(w.utm_source),   '')                        AS b_utm_source,
    NULLIF(TRIM(w.utm_medium),   '')                        AS b_utm_medium,
    NULLIF(TRIM(w.utm_campaign), '')                        AS b_utm_campaign,

    -- ── Timestamps crudos ────────────────────────────────────────────────
    w.created_at,
    w.updated_at,

    -- ── LADO JOTFORM ─────────────────────────────────────────────────────
    -- Se trae tal cual de mestra_bitrix: el webhook NO tiene datos Jotform.
    -- Con esto la vista reemplaza a mestra_bitrix por completo y los
    -- controllers solo cambian el nombre de la tabla.
    -- LATERAL + LIMIT 1: garantiza que el JOIN nunca multiplique filas.
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
FROM public.bitrix_webhook_leads w
LEFT JOIN LATERAL (
    SELECT mb.*
    FROM public.mestra_bitrix mb
    WHERE mb.j_id_bitrix = w.bitrix_id
    LIMIT 1
) j ON TRUE
WHERE w.empresa = 'novonet'
  AND w.etapa  <> 'duplicado';

COMMENT ON VIEW public.vw_bitrix_novonet IS
    'Webhook Bitrix de Novonet con la forma de mestra_bitrix (lado b_*). Excluye duplicados. Reemplaza a mestra_bitrix en los indicadores de Novonet.';


-- ---------------------------------------------------------------------------
-- INDICES sobre la tabla base — la vista los aprovecha
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bwl_empresa_created
    ON public.bitrix_webhook_leads (empresa, created_at);

CREATE INDEX IF NOT EXISTS idx_bwl_bitrix_id
    ON public.bitrix_webhook_leads (bitrix_id);

CREATE INDEX IF NOT EXISTS idx_bwl_etapa
    ON public.bitrix_webhook_leads (etapa);

CREATE INDEX IF NOT EXISTS idx_bwl_responsible
    ON public.bitrix_webhook_leads (responsible);

-- Clave del JOIN con el lado Jotform
CREATE INDEX IF NOT EXISTS idx_mb_j_id_bitrix
    ON public.mestra_bitrix (j_id_bitrix);


-- ---------------------------------------------------------------------------
-- VERIFICACION — agosto 2026
-- Esperado: ~1.697 leads (2.363 del webhook menos 666 duplicados)
-- ---------------------------------------------------------------------------
SELECT COUNT(*)::int                              AS leads_agosto,
       COUNT(DISTINCT b_etapa_de_la_negociacion)  AS etapas_distintas,
       COUNT(j_id_bitrix)::int                    AS con_jotform,
       COUNT(*) FILTER (WHERE UPPER(TRIM(j_netlife_estatus_real)) = 'ACTIVO')::int AS activos,
       MIN(b_creado_el_fecha)                     AS desde,
       MAX(b_creado_el_fecha)                     AS hasta
FROM public.vw_bitrix_novonet
WHERE b_creado_el_fecha BETWEEN '2026-08-01' AND '2026-08-31';
