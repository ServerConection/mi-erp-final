-- Mantiene la base viva de Semillero alineada con el pipeline 41 de Bitrix.
-- Alcance deliberadamente limitado a empresa='semillero'.
--
-- 1. Unifica slugs historicos que representan la misma etapa oficial.
-- 2. Evita que negocios que ya salieron de la categoria 41 sigan apareciendo
--    al consultar exclusivamente pipeline='SEMILLERO'.
-- 3. Completa el pipeline de filas creadas por la reconciliacion.

BEGIN;

UPDATE public.bitrix_webhook_leads
   SET etapa = 'contacto_nuevo_2',
       updated_at = NOW()
 WHERE LOWER(BTRIM(empresa)) = 'semillero'
   AND etapa = 'contacto_nuevo2'
   AND UPPER(BTRIM(COALESCE(etapa_bitrix, ''))) = 'CONTACTO NUEVO 2';

UPDATE public.bitrix_webhook_leads
   SET etapa = 'gestion_diaria_pendiente_cierre',
       updated_at = NOW()
 WHERE LOWER(BTRIM(empresa)) = 'semillero'
   AND etapa = 'gestion_diaria'
   AND UPPER(BTRIM(COALESCE(etapa_bitrix, ''))) IN (
     'GESTION DIARIA/PENDIENTE CIERRE',
     'GESTIÓN DIARIA/PENDIENTE CIERRE'
   );

UPDATE public.bitrix_webhook_leads
   SET pipeline = 'SEMILLERO',
       updated_at = NOW()
 WHERE LOWER(BTRIM(empresa)) = 'semillero'
   AND BTRIM(COALESCE(categoria_id, '')) = '41'
   AND BTRIM(COALESCE(pipeline, '')) IS DISTINCT FROM 'SEMILLERO';

UPDATE public.bitrix_webhook_leads
   SET pipeline = 'FUERA_SEMILLERO',
       updated_at = NOW()
 WHERE LOWER(BTRIM(empresa)) = 'semillero'
   AND BTRIM(COALESCE(categoria_id, '')) = 'FUERA_41'
   AND BTRIM(COALESCE(pipeline, '')) = 'SEMILLERO';

COMMIT;
