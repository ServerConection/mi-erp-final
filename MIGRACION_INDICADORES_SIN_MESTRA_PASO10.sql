-- ============================================================================
-- PASO 10 — Crea vw_bitrix_novonet_v2: copia EXACTA de vw_bitrix_novonet,
-- cambiando solo mestra_bitrix -> vw_mestra_novonet_live. No toca la original.
-- Al final compara las dos fila por fila. Esperado: solo las 3 ventas conocidas.
-- REVERTIR: DROP VIEW public.vw_bitrix_novonet_v2;
-- ============================================================================
DO $$
DECLARE def text;
BEGIN
  def := pg_get_viewdef('public.vw_bitrix_novonet'::regclass, true);
  def := regexp_replace(def, '(public\.)?\mmestra_bitrix\M', 'public.vw_mestra_novonet_live', 'g');
  def := regexp_replace(def, ';\s*$', '');
  EXECUTE 'CREATE OR REPLACE VIEW public.vw_bitrix_novonet_v2 AS ' || def;
END $$;

WITH a AS (SELECT (v.*)::text AS fila FROM public.vw_bitrix_novonet v),
     n AS (SELECT (v.*)::text AS fila FROM public.vw_bitrix_novonet_v2 v)
SELECT 'filas_original' AS medida, COUNT(*) AS valor FROM a
UNION ALL SELECT 'filas_v2', COUNT(*) FROM n
UNION ALL SELECT 'difiere_original', COUNT(*) FROM (SELECT fila FROM a EXCEPT ALL SELECT fila FROM n) x
UNION ALL SELECT 'difiere_v2',       COUNT(*) FROM (SELECT fila FROM n EXCEPT ALL SELECT fila FROM a) y
UNION ALL SELECT 'v2_aun_usa_mestra', (pg_get_viewdef('public.vw_bitrix_novonet_v2'::regclass) ~ '\mmestra_bitrix\M')::int;
