-- ============================================================
-- VISTA MATERIALIZADA: mv_indicadores_velsa_completo
-- Refresca cada 15 minutos automáticamente
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_indicadores_velsa_completo CASCADE;

CREATE MATERIALIZED VIEW public.mv_indicadores_velsa_completo AS
SELECT
  COALESCE(nr.id, jf.id_negociacion_bitrix::integer) AS id_registro,
  nr.id AS id_crm,
  jf.id_negociacion_bitrix::integer AS id_jotform,
  nr.responsable_nombre AS asesor,
  nr.responsable_id AS asesor_id,
  emp.nombre AS supervisor,
  emp.id AS supervisor_id,
  nr.etapa AS etapa_crm,
  nr.creado_en AS fecha_creacion_crm,
  nr.modificado_en AS fecha_modificacion_crm,
  nr.fuente AS origen,
  jf.estado_venta_netlife AS estado_venta,
  jf.fecha_registro_sistema AS fecha_registro_jotform,
  jf.fecha_activacion AS fecha_activacion,
  jf.forma_pago AS forma_pago,
  jf.estado_regularizacion AS estado_regularizacion,
  jf.descuento_3era_edad AS aplica_descuento,
  nr.creado_en::date AS fecha_creacion_date,
  nr.modificado_en::date AS fecha_modificacion_date,
  jf.fecha_registro_sistema::date AS fecha_registro_date,
  jf.fecha_activacion::date AS fecha_activacion_date,
  CURRENT_TIMESTAMP AS refresh_timestamp
FROM public.negociaciones_reporteria nr
FULL OUTER JOIN public.vw_jotform_velsa_netlife_completo jf
  ON nr.id = jf.id_negociacion_bitrix::integer
LEFT JOIN employees emp
  ON nr.responsable_id = emp.id;

-- Crear índices para mejor rendimiento
CREATE INDEX idx_mv_velsa_id_crm        ON public.mv_indicadores_velsa_completo(id_crm);
CREATE INDEX idx_mv_velsa_id_jotform    ON public.mv_indicadores_velsa_completo(id_jotform);
CREATE INDEX idx_mv_velsa_asesor        ON public.mv_indicadores_velsa_completo(asesor_id);
CREATE INDEX idx_mv_velsa_supervisor    ON public.mv_indicadores_velsa_completo(supervisor_id);
CREATE INDEX idx_mv_velsa_etapa         ON public.mv_indicadores_velsa_completo(etapa_crm);
CREATE INDEX idx_mv_velsa_estado        ON public.mv_indicadores_velsa_completo(estado_venta);
-- Índices en fecha_creacion_date y fecha_registro_date (columnas ::date usadas en filtros)
CREATE INDEX idx_mv_velsa_fecha_crm     ON public.mv_indicadores_velsa_completo(fecha_creacion_date);
CREATE INDEX idx_mv_velsa_fecha_jot     ON public.mv_indicadores_velsa_completo(fecha_registro_date);
-- Índices en los timestamps originales (usados directamente en las queries del controller)
CREATE INDEX idx_mv_velsa_ts_crm        ON public.mv_indicadores_velsa_completo(fecha_creacion_crm);
CREATE INDEX idx_mv_velsa_ts_jot        ON public.mv_indicadores_velsa_completo(fecha_registro_jotform);

GRANT SELECT ON public.mv_indicadores_velsa_completo TO PUBLIC;
