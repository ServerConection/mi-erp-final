-- VERIFICAR_PLANES_VELSA.sql  (2026-08-17)
-- Confirma que la MV de Velsa SÍ tiene los planes poblados.
-- Si estas cuentas dan > 0, el fix del controller ya muestra los planes.

SELECT
  COUNT(*)                                                              AS filas_jotform,
  COUNT(*) FILTER (WHERE COALESCE(TRIM(plan_casa::text),'') <> '')                AS plan_casa,
  COUNT(*) FILTER (WHERE COALESCE(TRIM(plan_pyme::text),'') <> '')                AS plan_pyme,
  COUNT(*) FILTER (WHERE COALESCE(TRIM(plan_pyme_corp::text),'') <> '')           AS plan_pyme_corp,
  COUNT(*) FILTER (WHERE COALESCE(TRIM(plan_hogar_adulto_mayor::text),'') <> '')  AS plan_adulto_mayor,
  COUNT(*) FILTER (WHERE COALESCE(TRIM(plan_profesional::text),'') <> '')         AS plan_profesional
FROM public.mv_indicadores_velsa_completo
WHERE (fecha_registro_jotform - INTERVAL '5 hours')::date
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE;

-- Ventas del día (lo que alimenta la tarjeta V. DÍA FORM)
SELECT COUNT(DISTINCT id_crm) AS ventas_del_dia
FROM public.mv_indicadores_velsa_completo
WHERE UPPER(TRIM(etapa_crm)) = 'VENTA SUBIDA'
  AND (fecha_registro_jotform - INTERVAL '5 hours')::date
      BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE
  AND (fecha_creacion_crm - INTERVAL '5 hours')::date
    = (fecha_registro_jotform - INTERVAL '5 hours')::date;
