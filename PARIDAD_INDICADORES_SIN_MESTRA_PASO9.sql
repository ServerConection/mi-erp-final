-- PASO 9 — SOLO LECTURA. Prueba de velocidad con una consulta típica de Indicadores
-- (ingresos y activas de octubre 2026 por asesor) sobre la vista nueva.
-- Ver la última línea "Execution Time". Aceptable: menos de 3000 ms.
EXPLAIN ANALYZE
SELECT mb.b_persona_responsable,
       COUNT(*) FILTER (WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-10-01' AND '2026-10-31') AS ingresos,
       COUNT(*) FILTER (WHERE mb.j_netlife_estatus_real = 'ACTIVO'
                          AND public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text) BETWEEN '2026-10-01' AND '2026-10-31') AS activas
FROM public.vw_mestra_novonet_live mb
WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text) BETWEEN '2026-10-01' AND '2026-10-31'
   OR public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text) BETWEEN '2026-10-01' AND '2026-10-31'
GROUP BY 1;
