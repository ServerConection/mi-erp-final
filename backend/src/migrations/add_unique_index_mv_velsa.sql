-- ============================================================================
-- MIGRACIÓN (ejecutar UNA sola vez en pgAdmin, de preferencia fuera de horas pico)
-- Objetivo: habilitar "REFRESH MATERIALIZED VIEW CONCURRENTLY" sobre
--           public.mv_indicadores_velsa_completo para que el botón
--           "Forzar Refresh" refresque los datos SIN bloquear las lecturas.
--
-- Postgres exige un ÍNDICE ÚNICO en la MV para poder refrescar con CONCURRENTLY.
-- La MV no tiene una columna naturalmente única (el FULL OUTER JOIN con Jotform
-- puede producir varias filas por id_negociacion_bitrix), así que agregamos una
-- columna surrogate "mv_row_id" (numeración de fila) y creamos el índice único
-- sobre ella. Añadir la columna NO rompe nada: los controllers seleccionan
-- columnas específicas, nunca SELECT *.
--
-- IMPORTANTE:
--   • Este script recrea la MV. Se corre dentro de una TRANSACCIÓN: si algo
--     falla (p.ej. una vista dependiente), hace ROLLBACK y la MV actual queda
--     INTACTA. No se pierde nada.
--   • Si el DROP falla por dependencias, Postgres listará los objetos que
--     dependen de la MV. Pásame ese mensaje y te doy el script para recrearlos.
-- ============================================================================

-- (Opcional) Diagnóstico previo: ver si ya existe algún índice único en la MV.
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename = 'mv_indicadores_velsa_completo';

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS public.mv_indicadores_velsa_completo;

CREATE MATERIALIZED VIEW public.mv_indicadores_velsa_completo AS
SELECT
  -- Surrogate único (numeración estable de fila) para REFRESH CONCURRENTLY
  ROW_NUMBER() OVER (
    ORDER BY COALESCE(nr.id, jf.id_negociacion_bitrix::integer),
             jf.id_negociacion_bitrix
  ) AS mv_row_id,
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

-- ÍNDICE ÚNICO obligatorio para REFRESH ... CONCURRENTLY
CREATE UNIQUE INDEX ux_mv_velsa_row_id ON public.mv_indicadores_velsa_completo(mv_row_id);

-- Índices de rendimiento (mismos que la definición original)
CREATE INDEX idx_mv_velsa_id_crm        ON public.mv_indicadores_velsa_completo(id_crm);
CREATE INDEX idx_mv_velsa_id_jotform    ON public.mv_indicadores_velsa_completo(id_jotform);
CREATE INDEX idx_mv_velsa_asesor        ON public.mv_indicadores_velsa_completo(asesor_id);
CREATE INDEX idx_mv_velsa_supervisor    ON public.mv_indicadores_velsa_completo(supervisor_id);
CREATE INDEX idx_mv_velsa_etapa         ON public.mv_indicadores_velsa_completo(etapa_crm);
CREATE INDEX idx_mv_velsa_estado        ON public.mv_indicadores_velsa_completo(estado_venta);
CREATE INDEX idx_mv_velsa_fecha_crm     ON public.mv_indicadores_velsa_completo(fecha_creacion_date);
CREATE INDEX idx_mv_velsa_fecha_jot     ON public.mv_indicadores_velsa_completo(fecha_registro_date);
CREATE INDEX idx_mv_velsa_ts_crm        ON public.mv_indicadores_velsa_completo(fecha_creacion_crm);
CREATE INDEX idx_mv_velsa_ts_jot        ON public.mv_indicadores_velsa_completo(fecha_registro_jotform);

GRANT SELECT ON public.mv_indicadores_velsa_completo TO PUBLIC;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN (correr después del COMMIT):
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'mv_indicadores_velsa_completo' AND indexname = 'ux_mv_velsa_row_id';
--   -- Debe devolver 1 fila.
--
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_indicadores_velsa_completo;
--   -- Debe ejecutarse SIN error. A partir de aquí el botón "Forzar Refresh"
--   -- usará el modo CONCURRENTLY (no bloqueante) automáticamente.
-- ============================================================================
