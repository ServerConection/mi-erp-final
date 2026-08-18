SELECT UPPER(TRIM(etapa_bitrix)) AS etapa, COUNT(*) AS en_la_base
FROM public.bitrix_webhook_leads
WHERE empresa='novonet'
  AND (created_at AT TIME ZONE 'America/Guayaquil')::date >= DATE '2026-08-01'
GROUP BY 1 ORDER BY 2 DESC;

-- ESPERADO (creados desde 01/08, TODAS las etapas):
--   ATC                                         2625
--   DUPLICADO                                    871
--   DESCARTE                                     718
--   VENTA SUBIDA                                 560
--   INNEGOCIABLE                                 232
--   FUERA DE COBERTURA                           189
--   SEGUIMIENTO NEGOCIACION                      157
--   GESTION DIARIA/PENDIENTE CIERRE              140
--   VOLVER A LLAMAR NO CONTESTA                   67
--   MAS DE 15 DIAS PARA CIERRE                    57
--   REGULARIZACION                                33
--   ZONA PELIGROSA                                30
--   ENVIO REQUISITOS/DOCUMENTOS PENDIENTES        19
--   CONTACTO NUEVO                                 9
