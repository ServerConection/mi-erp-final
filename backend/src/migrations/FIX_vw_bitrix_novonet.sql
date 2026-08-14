-- ============================================================================
-- FIX vw_bitrix_novonet — Novonet
-- Corrige los 5 hallazgos del reporte D-1.
-- Ejecutar en pgAdmin sobre bddgeneral.
--
-- QUÉ CAMBIA
--   1. LEFT JOIN (webhook manda) → FULL OUTER JOIN: las ventas Jotform sin
--      lead en el webhook DEJAN de desaparecer. Ahí estaban los regularizados.
--   2. 'duplicado' ya no borra la venta: se excluye el lead duplicado SOLO si
--      no tiene venta Jotform asociada.
--   3. Se quita el LATERAL ... LIMIT 1: un lead con N ventas Jotform ahora
--      produce N filas, que es justo lo que el controller asume al usar
--      COUNT(*) del lado Jotform y COUNT(DISTINCT b_id) del lado Bitrix.
--   4. b_persona_responsable pasa a ser HÍBRIDO: webhook → mestra_bitrix.
--      'REVISAR' se trata como "sin dato", no como nombre.
--   5. Como el filtro de asesor del dashboard pega contra
--      mb.b_persona_responsable, al volverse híbrida esa columna el filtro
--      queda arreglado solo. No hay que tocar el controller.
--
-- LA LISTA DE COLUMNAS Y SUS TIPOS NO CAMBIA → CREATE OR REPLACE funciona sin
-- DROP, así que ninguna vista/MV que dependa de esta se rompe.
-- Al final está el ROLLBACK con la definición original.
-- ============================================================================


-- ── PASO 0: ¿algo depende de esta vista? (informativo, no bloquea) ──────────
SELECT DISTINCT dependente.relname AS objeto_dependiente, dependente.relkind
FROM pg_depend d
JOIN pg_rewrite r    ON r.oid = d.objid
JOIN pg_class dependente ON dependente.oid = r.ev_class
JOIN pg_class origen     ON origen.oid = d.refobjid
WHERE origen.relname = 'vw_bitrix_novonet'
  AND dependente.relname <> 'vw_bitrix_novonet';


-- ── PASO 1: índices funcionales para que el nuevo JOIN no se arrastre ──────
-- El cruce usa BTRIM(...::text) en los dos lados; sin estos índices Postgres
-- no puede usar los que ya existen y hace seq scan de las dos tablas.
CREATE INDEX IF NOT EXISTS idx_bwl_bitrix_id_btrim
    ON public.bitrix_webhook_leads (BTRIM(bitrix_id::text));

CREATE INDEX IF NOT EXISTS idx_mb_j_id_bitrix_btrim
    ON public.mestra_bitrix (BTRIM(j_id_bitrix::text));


-- ── PASO 2: la vista corregida ─────────────────────────────────────────────
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
WHERE (w.etapa IS DISTINCT FROM 'duplicado' OR j.j_id_bitrix IS NOT NULL);

COMMENT ON VIEW public.vw_bitrix_novonet IS
    'Novonet: webhook Bitrix + Jotform (mestra_bitrix) con FULL OUTER JOIN — ningun lado pierde registros. b_persona_responsable es hibrido webhook->mestra. Excluye duplicados solo si no tienen venta Jotform.';


-- ── PASO 3: VERIFICACIÓN — correr ANTES y DESPUÉS y comparar ───────────────
SELECT
    COUNT(*)                                                    AS filas,
    COUNT(DISTINCT b_id)                                        AS leads_bitrix,
    COUNT(j_id_bitrix)                                          AS filas_con_jotform,
    COUNT(*) FILTER (WHERE b_id IS NULL)                        AS solo_jotform_recuperadas,
    COUNT(*) FILTER (WHERE j_estatus_regularizacion = 'POR REGULARIZAR')
                                                                AS por_regularizar,
    COUNT(*) FILTER (WHERE b_persona_responsable IS NULL)        AS sin_asesor
FROM public.vw_bitrix_novonet
WHERE b_creado_el_fecha >= date_trunc('month', CURRENT_DATE)::date
   OR public.parse_fecha_flex(j_fecha_registro_sistema::text)
      >= date_trunc('month', CURRENT_DATE)::date;


-- ============================================================================
-- ROLLBACK — definición original, tal cual estaba
-- ============================================================================
/*
CREATE OR REPLACE VIEW public.vw_bitrix_novonet AS
SELECT
    w.bitrix_id AS b_id,
    CASE
        WHEN w.etapa IN ('inegociable', 'innegociable') THEN 'INNEGOCIABLE'
        WHEN w.etapa = 'regularizacion'                 THEN 'REGULARIZACION'
        ELSE UPPER(TRIM(w.etapa_bitrix))
    END AS b_etapa_de_la_negociacion,
    w.etapa AS b_etapa_slug,
    (w.created_at AT TIME ZONE 'America/Guayaquil')::date AS b_creado_el_fecha,
    (w.updated_at AT TIME ZONE 'America/Guayaquil')::date AS b_modificado_el_fecha,
    to_char(w.created_at AT TIME ZONE 'America/Guayaquil', 'HH24:MI:SS') AS b_creado_el_hora,
    to_char(w.updated_at AT TIME ZONE 'America/Guayaquil', 'HH24:MI:SS') AS b_modificado_el_hora,
    NULL::text AS b_cerrado,
    NULLIF(TRIM(w.fecha_venta_subida), '') AS b_fecha_venta_subida,
    NULLIF(TRIM(w.fecha_concretar),    '') AS b_fecha_concretar,
    NULLIF(TRIM(w.responsible),   '') AS b_persona_responsable,
    NULLIF(TRIM(w.source),        '') AS b_origen,
    NULLIF(TRIM(w.pipeline),      '') AS b_pipeline,
    NULLIF(TRIM(w.creado_por),    '') AS b_creado_por,
    NULLIF(TRIM(w.modificado_por),'') AS b_modificado_por,
    NULLIF(TRIM(w.city),                  '') AS b_ciudad,
    NULLIF(TRIM(w.phone),                 '') AS b_telefono,
    NULLIF(TRIM(w.razon_descarte),        '') AS b_razon_descarte,
    NULLIF(TRIM(w.motivo_atc),            '') AS b_motivo_atc,
    NULLIF(TRIM(w.documentos_pendientes), '') AS b_documentos_pendientes,
    NULLIF(TRIM(w.innegociable),          '') AS b_innegocioable,
    NULLIF(TRIM(w.volver_a_llamar),       '') AS b_volver_llamar,
    NULLIF(TRIM(w.otro_proveedor),        '') AS b_desiste_compra,
    NULLIF(TRIM(w.comentario),            '') AS b_comentario,
    NULLIF(TRIM(w.repeated),              '') AS b_repetido,
    NULLIF(TRIM(w.utm_source),   '') AS b_utm_source,
    NULLIF(TRIM(w.utm_medium),   '') AS b_utm_medium,
    NULLIF(TRIM(w.utm_campaign), '') AS b_utm_campaign,
    w.created_at,
    w.updated_at,
    j.j_fecha_registro_sistema, j.j_id_bitrix, j.j_netlife_estatus_real,
    j.j_fecha_activacion_netlife, j.j_novedades_atc, j.j_estatus_regularizacion,
    j.j_detalle_regularizacion, j.j_forma_pago, j.j_netlife_login,
    j.j_fecha_agenda, j.j_codigo_asesor, j.j_supervisor, j.j_origen_venta,
    j.j_aplica_descuento_3ra_edad, j.j_provincia, j.j_ciudad,
    j.j_calidad_venta_analista, j.j_venta_efectiva, j.j_auditado_por,
    j.j_errores_telcos, j.j_plan_contratado_final, j.j_servicios_digitales,
    j.j_venta_nueva_o_reingreso, j.j_tipo_documento, j.j_mes_regularizacion,
    j.j_observacion_venta_original, j.estadogeneral
FROM public.bitrix_webhook_leads w
LEFT JOIN LATERAL (
    SELECT mb.* FROM public.mestra_bitrix mb
    WHERE mb.j_id_bitrix = w.bitrix_id LIMIT 1
) j ON TRUE
WHERE w.empresa = 'novonet'
  AND w.etapa  <> 'duplicado';
*/
