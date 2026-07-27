-- ============================================================
-- VISTA MATERIALIZADA: mv_consultor_velsa
-- ------------------------------------------------------------
-- Propósito: fuente RÁPIDA e indexada para la API de consulta
-- externa de Velsa (/api/consultor-velsa/buscar).
--
-- Problema que resuelve:
--   La vista base public.vw_jotform_velsa_netlife_completo arma
--   todo el join Jotform + Netlife en cada consulta. Filtrarla por
--   id_bitrix_ghl (derivado de JSON, sin índice) obliga a recalcular
--   la vista entera -> la consulta supera el statement_timeout de 90 s
--   del pool y la API devuelve 500. Por eso se precalcula aquí.
--
-- Este MV es PEQUEÑO (solo 4 columnas, 1 fila por id_bitrix_ghl) e
-- INDEPENDIENTE de mv_indicadores_velsa_completo: no afecta en nada
-- al dashboard de Velsa.
--
-- Ejecutar UNA vez en pgAdmin (Query Tool > F5) conectado a la base
-- del backend (la misma que usa config/db.js -> DB_NAME).
-- Uso: SELECT * FROM public.mv_consultor_velsa WHERE j_id_bitrix = '55498';
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_consultor_velsa CASCADE;

CREATE MATERIALIZED VIEW public.mv_consultor_velsa AS
SELECT DISTINCT ON (jf.id_bitrix_ghl::text)
  jf.id_bitrix_ghl::text     AS j_id_bitrix,
  jf.ciudad                  AS j_ciudad,
  jf.estado_venta_netlife    AS j_netlife_estatus_real,
  jf.forma_pago              AS j_forma_pago
FROM public.vw_jotform_velsa_netlife_completo jf
WHERE jf.id_bitrix_ghl IS NOT NULL
  AND btrim(jf.id_bitrix_ghl::text) <> ''
-- DISTINCT ON deja 1 fila por id_bitrix_ghl (evita duplicados en el índice único).
ORDER BY jf.id_bitrix_ghl::text;

-- Índice ÚNICO: (1) hace la búsqueda por j_id_bitrix instantánea y
-- (2) habilita REFRESH MATERIALIZED VIEW CONCURRENTLY (no bloquea lecturas).
CREATE UNIQUE INDEX idx_mv_consultor_velsa_id
  ON public.mv_consultor_velsa (j_id_bitrix);

GRANT SELECT ON public.mv_consultor_velsa TO PUBLIC;
