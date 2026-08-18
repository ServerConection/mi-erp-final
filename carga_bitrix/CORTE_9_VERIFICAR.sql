SELECT UPPER(TRIM(etapa_bitrix)) AS etapa, COUNT(*) AS en_la_base
FROM public.bitrix_webhook_leads
WHERE empresa = 'novonet'
  AND (created_at AT TIME ZONE 'America/Guayaquil')::date >= DATE '2026-08-01'
GROUP BY 1 ORDER BY 2 DESC;

-- ESPERADO segun el corte (creados desde el 01/08):
--   ATC                                         2591
--   Duplicado                                    868
--   Descarte                                     708
--   Venta Subida                                 557
--   Innegociable                                 230
--   Fuera de Cobertura                           188
--   Gestion Diaria/Pendiente Cierre              153
--   Seguimiento Negociacion                      131
--   Mas de 15 dias para cierre                    55
--   Volver a llamar no contesta                   54
--   Regularización                                33
--   Zona Peligrosa                                30
--   Remarketing                                   26
--   Contacto Nuevo                                16
--   Envio Requisitos/Documentos Pendientes        15
