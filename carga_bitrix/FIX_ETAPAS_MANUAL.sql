-- ============================================================================
-- CORRECCION MANUAL DE ETAPAS — lista revisada contra Bitrix (2026-08-17)
-- ============================================================================
-- 1) Corrige la etapa de 43 leads al valor que tiene Bitrix.
-- 2) Borra 3 leads que ya NO existen en Bitrix.
--
-- Nota: los "Regularizacion" se guardaban SIN tilde. Ahora quedan con tilde,
-- igual que Bitrix. Para los indicadores da lo mismo: shared/etapas.js
-- contempla las dos escrituras.
-- ============================================================================

DROP TABLE IF EXISTS bkp_fix_manual_20260817;
CREATE TABLE bkp_fix_manual_20260817 AS
SELECT * FROM public.bitrix_webhook_leads WHERE empresa='novonet';

BEGIN;

UPDATE public.bitrix_webhook_leads l
SET etapa = v.slug, etapa_bitrix = v.nombre, updated_at = NOW()
FROM (VALUES
  ('554285','descarte','DESCARTE'),
  ('554499','regularizacion','REGULARIZACIÓN'),
  ('555225','regularizacion','REGULARIZACIÓN'),
  ('555279','regularizacion','REGULARIZACIÓN'),
  ('555419','regularizacion','REGULARIZACIÓN'),
  ('556901','regularizacion','REGULARIZACIÓN'),
  ('557311','regularizacion','REGULARIZACIÓN'),
  ('557317','regularizacion','REGULARIZACIÓN'),
  ('558949','regularizacion','REGULARIZACIÓN'),
  ('559091','mas_de_15_dias_para_cierre','MAS DE 15 DIAS PARA CIERRE'),
  ('559693','venta_subida','VENTA SUBIDA'),
  ('562415','regularizacion','REGULARIZACIÓN'),
  ('563519','regularizacion','REGULARIZACIÓN'),
  ('563533','regularizacion','REGULARIZACIÓN'),
  ('563535','regularizacion','REGULARIZACIÓN'),
  ('563559','regularizacion','REGULARIZACIÓN'),
  ('563577','regularizacion','REGULARIZACIÓN'),
  ('563597','regularizacion','REGULARIZACIÓN'),
  ('563605','regularizacion','REGULARIZACIÓN'),
  ('563617','regularizacion','REGULARIZACIÓN'),
  ('563637','regularizacion','REGULARIZACIÓN'),
  ('563639','regularizacion','REGULARIZACIÓN'),
  ('563647','regularizacion','REGULARIZACIÓN'),
  ('563653','regularizacion','REGULARIZACIÓN'),
  ('563655','regularizacion','REGULARIZACIÓN'),
  ('563657','regularizacion','REGULARIZACIÓN'),
  ('563677','regularizacion','REGULARIZACIÓN'),
  ('563827','regularizacion','REGULARIZACIÓN'),
  ('564003','regularizacion','REGULARIZACIÓN'),
  ('564207','regularizacion','REGULARIZACIÓN'),
  ('564221','regularizacion','REGULARIZACIÓN'),
  ('564305','regularizacion','REGULARIZACIÓN'),
  ('565205','regularizacion','REGULARIZACIÓN'),
  ('565247','regularizacion','REGULARIZACIÓN'),
  ('565259','regularizacion','REGULARIZACIÓN'),
  ('565541','seguimiento_negociacion','SEGUIMIENTO NEGOCIACION'),
  ('565651','seguimiento_negociacion','SEGUIMIENTO NEGOCIACION'),
  ('565709','seguimiento_negociacion','SEGUIMIENTO NEGOCIACION'),
  ('565713','envio_requisitos_documentos_pendientes','ENVIO REQUISITOS/DOCUMENTOS PENDIENTES'),
  ('565861','regularizacion','REGULARIZACIÓN'),
  ('565927','venta_subida','VENTA SUBIDA'),
  ('565993','atc','ATC'),
  ('566069','volver_a_llamar_no_contesta','VOLVER A LLAMAR NO CONTESTA')
) AS v(bitrix_id, slug, nombre)
WHERE l.empresa = 'novonet' AND l.bitrix_id = v.bitrix_id;

DELETE FROM public.bitrix_webhook_leads
WHERE empresa = 'novonet' AND bitrix_id IN ('559719', '560253', '566031');

COMMIT;

-- Verificacion
SELECT etapa_bitrix, COUNT(*)
FROM public.bitrix_webhook_leads
WHERE empresa='novonet' AND bitrix_id IN ('554285', '554499', '555225', '555279', '555419', '556901', '557311', '557317', '558949', '559091', '559693', '562415', '563519', '563533', '563535', '563559', '563577', '563597', '563605', '563617', '563637', '563639', '563647', '563653', '563655', '563657', '563677', '563827', '564003', '564207', '564221', '564305', '565205', '565247', '565259', '565541', '565651', '565709', '565713', '565861', '565927', '565993', '566069')
GROUP BY 1 ORDER BY 2 DESC;
