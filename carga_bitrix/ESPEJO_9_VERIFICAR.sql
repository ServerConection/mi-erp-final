SELECT UPPER(TRIM(etapa_bitrix)) AS etapa, COUNT(*) AS en_la_base
FROM public.bitrix_webhook_leads
WHERE empresa='novonet'
  AND (created_at AT TIME ZONE 'America/Guayaquil')::date >= DATE '2026-08-01'
GROUP BY 1 ORDER BY 2 DESC;

-- ESPERADO (identico a Bitrix, creados desde 01/08):
--   ATC                                         2625
--   Duplicado                                    871
--   Descarte                                     718
--   Venta Subida                                 560
--   Innegociable                                 232
--   Fuera de Cobertura                           189
--   Seguimiento Negociacion                      157
--   Gestion Diaria/Pendiente Cierre              140
--   Volver a llamar no contesta                   67
--   Mas de 15 dias para cierre                    57
--   Regularización                                33
--   Zona Peligrosa                                30
--   Envio Requisitos/Documentos Pendientes        19
--   Contacto Nuevo                                 9
