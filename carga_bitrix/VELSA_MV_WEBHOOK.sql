-- ============================================================================
-- VELSA: la vista materializada pasa a leer del WEBHOOK
-- ============================================================================
-- ANTES: mv_indicadores_velsa_completo leia public.negociaciones_reporteria
--        (la fuente vieja, con ETL atrasado).
-- AHORA: lee public.bitrix_webhook_leads WHERE empresa='velsa', que es la
--        misma tabla que ya usa Novonet y se actualiza en tiempo real.
--
-- El lado Jotform NO cambia: sigue siendo vw_jotform_velsa_netlife_completo,
-- que es la fuente propia de Velsa.
--
-- SUPERVISOR: Velsa no maneja supervisor por asesor (son 2 para todos), asi
-- que queda NULL y el dashboard lo agrupa como "SIN ASIGNAR". Antes se
-- resolvia por responsable_id contra employees, campo que el webhook no trae.
--
-- Los nombres de columna son IDENTICOS a los de antes, asi que
-- indicadoresVelsaMaterialized.controller.js NO necesita ningun cambio.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_indicadores_velsa_completo CASCADE;

CREATE MATERIALIZED VIEW public.mv_indicadores_velsa_completo AS
SELECT
  COALESCE(w.bitrix_id::integer, jf.id_negociacion_bitrix::integer) AS id_registro,
  w.bitrix_id::integer                          AS id_crm,
  jf.id_negociacion_bitrix::integer             AS id_jotform,
  NULLIF(BTRIM(w.responsible), '')              AS asesor,
  NULL::integer                                 AS asesor_id,
  NULL::varchar                                 AS supervisor,
  NULL::integer                                 AS supervisor_id,

  -- Etapa normalizada, mismo criterio que vw_bitrix_novonet
  CASE
    WHEN w.etapa IN ('inegociable', 'innegociable') THEN 'INNEGOCIABLE'
    WHEN w.etapa = 'regularizacion'                 THEN 'REGULARIZACION'
    ELSE UPPER(BTRIM(w.etapa_bitrix))
  END                                           AS etapa_crm,

  -- Fechas del CRM ya en hora Ecuador (el controller hace ::date directo)
  (w.created_at AT TIME ZONE 'America/Guayaquil') AS fecha_creacion_crm,
  (w.updated_at AT TIME ZONE 'America/Guayaquil') AS fecha_modificacion_crm,

  NULLIF(BTRIM(w.source), '')                   AS origen,

  -- Lado Jotform: sin cambios
  jf.estado_venta_netlife                       AS estado_venta,
  jf.fecha_registro_sistema                     AS fecha_registro_jotform,
  jf.fecha_activacion                           AS fecha_activacion,
  jf.forma_pago                                 AS forma_pago,
  jf.estado_regularizacion                      AS estado_regularizacion,
  jf.descuento_3era_edad                        AS aplica_descuento,

  (w.created_at AT TIME ZONE 'America/Guayaquil')::date AS fecha_creacion_date,
  (w.updated_at AT TIME ZONE 'America/Guayaquil')::date AS fecha_modificacion_date,
  jf.fecha_registro_sistema::date               AS fecha_registro_date,
  jf.fecha_activacion::date                     AS fecha_activacion_date,
  CURRENT_TIMESTAMP                             AS refresh_timestamp
FROM (SELECT * FROM public.bitrix_webhook_leads WHERE empresa = 'velsa') w
FULL OUTER JOIN public.vw_jotform_velsa_netlife_completo jf
  ON BTRIM(w.bitrix_id::text) = BTRIM(jf.id_negociacion_bitrix::text);

CREATE INDEX idx_mv_velsa_id_crm     ON public.mv_indicadores_velsa_completo(id_crm);
CREATE INDEX idx_mv_velsa_id_jotform ON public.mv_indicadores_velsa_completo(id_jotform);
CREATE INDEX idx_mv_velsa_etapa      ON public.mv_indicadores_velsa_completo(etapa_crm);
CREATE INDEX idx_mv_velsa_estado     ON public.mv_indicadores_velsa_completo(estado_venta);
CREATE INDEX idx_mv_velsa_fecha_crm  ON public.mv_indicadores_velsa_completo(fecha_creacion_date);
CREATE INDEX idx_mv_velsa_fecha_jot  ON public.mv_indicadores_velsa_completo(fecha_registro_date);
CREATE INDEX idx_mv_velsa_ts_crm     ON public.mv_indicadores_velsa_completo(fecha_creacion_crm);
CREATE INDEX idx_mv_velsa_ts_jot     ON public.mv_indicadores_velsa_completo(fecha_registro_jotform);

GRANT SELECT ON public.mv_indicadores_velsa_completo TO PUBLIC;


-- ── VERIFICACION: etapas de agosto en Velsa ─────────────────────────────────
SELECT etapa_crm, COUNT(*) AS leads
FROM public.mv_indicadores_velsa_completo
WHERE fecha_creacion_date >= DATE '2026-08-01'
GROUP BY 1 ORDER BY 2 DESC;

-- Comparalo contra Bitrix Velsa filtrando por "Creado" desde el 01/08.
