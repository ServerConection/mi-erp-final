-- PARIDAD PASO 3 — SOLO LECTURA.
-- Confirma que las filas de mestra_bitrix que NO vienen de envios_ventas
-- (las 18.996 "solo Bitrix") no tienen datos Jotform. Si da 0, cambiar el
-- lado JOT a envios_ventas no pierde ninguna venta. Esperado: 0.
SELECT COUNT(*) AS filas_no_ev_con_datos_jotform
FROM public.mestra_bitrix
WHERE (id_unificado NOT LIKE 'EV-%' OR id_unificado IS NULL)
  AND (NULLIF(BTRIM(j_fecha_registro_sistema::text), '') IS NOT NULL
       OR NULLIF(BTRIM(j_id_bitrix::text), '') IS NOT NULL
       OR NULLIF(BTRIM(j_netlife_estatus_real::text), '') IS NOT NULL);
