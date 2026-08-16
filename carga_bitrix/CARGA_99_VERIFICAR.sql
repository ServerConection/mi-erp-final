-- ============================================================================
-- PASO FINAL — VERIFICACIÓN   (correr en bddgeneral después de las 6 partes)
-- ============================================================================

-- 1) Cuántos entraron por esta carga
SELECT COUNT(*) AS cargados_por_backfill
FROM public.bitrix_webhook_leads
WHERE empresa = 'novonet'
  AND raw_query->>'origen' = 'backfill_csv_20260815_completo';

-- 2) Leads por día de agosto — el D-1 debe reflejar estos números
SELECT (created_at AT TIME ZONE 'America/Guayaquil')::date AS fecha,
       COUNT(*)                                            AS leads,
       COUNT(*) FILTER (WHERE etapa = 'venta_subida')       AS ventas_subidas,
       COUNT(*) FILTER (WHERE etapa = 'descarte')           AS descartes,
       COUNT(*) FILTER (WHERE etapa IN ('duplicado','dupllicado','regularizacion','remarketing'))
                                                            AS no_cuentan_como_lead
FROM public.bitrix_webhook_leads
WHERE empresa = 'novonet'
  AND (created_at AT TIME ZONE 'America/Guayaquil')::date >= DATE '2026-08-01'
GROUP BY 1 ORDER BY 1;

-- 3) Contraste contra la vista que consume el dashboard (deben cuadrar)
SELECT b_creado_el_fecha AS fecha, COUNT(DISTINCT b_id) AS leads
FROM public.vw_bitrix_novonet
WHERE b_creado_el_fecha >= DATE '2026-08-01'
GROUP BY 1 ORDER BY 1;

-- 4) Cuántos leads quedaron PROTEGIDOS por la guarda anti-pisado
--    (el webhook los actualizó después de la foto del export y no se tocaron)
SELECT COUNT(*) AS protegidos_por_la_guarda
FROM public.bitrix_webhook_leads
WHERE empresa = 'novonet'
  AND updated_at > (TIMESTAMP '2026-08-15 15:26:08' AT TIME ZONE 'America/Guayaquil')
  AND (raw_query->>'origen') IS DISTINCT FROM 'backfill_csv_20260815_completo';

-- ── DESHACER (solo si algo salió mal) ───────────────────────────────────────
-- BEGIN;
-- DELETE FROM public.bitrix_webhook_leads WHERE empresa = 'novonet';
-- INSERT INTO public.bitrix_webhook_leads SELECT * FROM bkp_bwl_20260816;
-- COMMIT;
