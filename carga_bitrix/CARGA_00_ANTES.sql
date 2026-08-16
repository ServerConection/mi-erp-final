-- ============================================================================
-- PASO 0 — RESPALDO Y FOTO "ANTES"   (correr en bddgeneral)
-- ============================================================================
-- El respaldo anterior (bkp_bwl_20260815) es de ANTES de la carga de ayer.
-- Este es nuevo y refleja el estado actual, justo antes de esta carga.

DROP TABLE IF EXISTS bkp_bwl_20260816;
CREATE TABLE bkp_bwl_20260816 AS
SELECT * FROM public.bitrix_webhook_leads WHERE empresa = 'novonet';

SELECT COUNT(*) AS respaldados FROM bkp_bwl_20260816;

-- Foto de leads por mes ANTES de cargar (guardá el resultado)
SELECT to_char(created_at AT TIME ZONE 'America/Guayaquil', 'YYYY-MM') AS mes,
       COUNT(*) AS leads
FROM public.bitrix_webhook_leads
WHERE empresa = 'novonet'
GROUP BY 1 ORDER BY 1 DESC;
