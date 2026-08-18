-- ============================================================================
-- ORIGENES_02_CATALOGO.sql   (2026-08-18)
-- ----------------------------------------------------------------------------
-- Catalogo oficial de ORIGENES de Bitrix (crm.status.list, ENTITY_ID='SOURCE').
-- 46 origenes, tal cual los devolvio la API de Bitrix de NOVONET.
--
-- PARA QUE SIRVE
--   El webhook guarda en bitrix_webhook_leads.source lo que Bitrix manda en
--   {{Origen}}. Cuando Bitrix manda el codigo en vez del nombre, en el ERP se
--   ve un numero. Esta tabla permite traducir codigo -> nombre sin depender de
--   como venga cada lead.
--
-- COMO RESUELVE
--   Bitrix identifica un origen de 3 formas y aqui se aceptan las 3:
--     · ID        -> 539
--     · STATUS_ID -> '34'  o  '103|WZ_WHATSAPP_CF8B...'
--     · prefijo numerico del STATUS_ID  -> '103'
--   Si el valor ya viene con nombre, se devuelve tal cual (no rompe nada).
--
-- ES IDEMPOTENTE: se puede correr las veces que haga falta.
-- NO MODIFICA ningun dato de leads. Solo crea catalogo + funcion + reporte.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.bitrix_origenes (
    empresa      text        NOT NULL DEFAULT 'novonet',
    source_id    text        NOT NULL,
    status_id    text,
    nombre       text        NOT NULL,
    es_sistema   boolean     NOT NULL DEFAULT false,
    actualizado  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_bitrix_origenes PRIMARY KEY (empresa, source_id)
);

CREATE INDEX IF NOT EXISTS idx_bitrix_origenes_status
    ON public.bitrix_origenes (empresa, status_id);

-- ---------------------------------------------------------------------------
-- CARGA (NOVONET)
-- ---------------------------------------------------------------------------
INSERT INTO public.bitrix_origenes (empresa, source_id, status_id, nombre, es_sistema)
VALUES
  ('novonet', '11', 'CALL', 'Llamada', true),
  ('novonet', '25', 'WEBFORM', 'Formulario del CRM', true),
  ('novonet', '27', 'CALLBACK', 'Devolver la llamada', true),
  ('novonet', '29', 'RC_GENERATOR', 'Impulso de ventas', true),
  ('novonet', '31', 'STORE', 'Tienda online', true),
  ('novonet', '203', '1', 'Base 593-962881280', false),
  ('novonet', '217', '8', 'Base 593-987133635', false),
  ('novonet', '229', '10', 'Fomulario Landing 3', false),
  ('novonet', '231', '15', 'Llamada Landing 3', false),
  ('novonet', '341', '20', 'Formulario Landing 4', false),
  ('novonet', '343', '21', 'Llamada Landing 4', false),
  ('novonet', '345', 'REPEAT_SALE', 'Ventas recurrentes', true),
  ('novonet', '507', 'WZ50076c9d-53d3-434b-90ea-988b560c4c0d', 'Whatsapp 593958993371', false),
  ('novonet', '509', '33', 'BASE API 593963463480', false),
  ('novonet', '539', '34', 'API 484', false),
  ('novonet', '663', 'WZf2647c26-ba5b-48cb-a115-03a4f286727e', 'Whatsapp 593962881280', false),
  ('novonet', '725', '11|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - PAUTA 1', false),
  ('novonet', '739', '62', 'RECLUTAMIENTO 6896', false),
  ('novonet', '755', '66', '593992620501', false),
  ('novonet', '757', '67', 'API 963999000', false),
  ('novonet', '759', '103|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - API  963999000', false),
  ('novonet', '761', '104', 'FB Messenger - Novo', false),
  ('novonet', '763', '105', 'IG Direct - Novo', false),
  ('novonet', '765', '1|OPENLINE', 'Chat en vivo - Chat en vivo', false),
  ('novonet', '1005', '107|OPENLINE', 'Chat en vivo - Prueba Bryan', false),
  ('novonet', '1007', '105|OPENLINE', 'Chat en vivo - Prueba Leonardo Asesores', false),
  ('novonet', '1009', '79|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - MONICA PILCO', false),
  ('novonet', '1059', '57|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - GRACE ARIAS', false),
  ('novonet', '1061', '81|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - JENNY RODRIGUEZ', false),
  ('novonet', '1063', '13|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - Base 593-995211968', false),
  ('novonet', '1064', '91|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - EDISON CAIZA', false),
  ('novonet', '1065', '5|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - Base 593-992827793', false),
  ('novonet', '1067', '61|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - MONICA QUILLAY', false),
  ('novonet', '1069', '43|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - DANILO SANGUCHO', false),
  ('novonet', '1071', '51|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - NATASHA CALERO', false),
  ('novonet', '1073', '63|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - KRISTAL TORRES', false),
  ('novonet', '1075', '87|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - GENESIS MARTINEZ', false),
  ('novonet', '1077', '75|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - LEONARDO CARLOSAMA', false),
  ('novonet', '1079', '77|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - SERGIO ALMEIDA', false),
  ('novonet', '1081', '39|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - DIEGO REYES', false),
  ('novonet', '1127', '31|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - api 59399900975', false),
  ('novonet', '1129', '49|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - DIANA TABANGO', false),
  ('novonet', '1135', '108', 'ENVIO_2 (ANDRES RODRIGUEZ)', false),
  ('novonet', '1137', '85|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - CHRISTIAN PONCE', false),
  ('novonet', '1143', '73|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - ESTEFANIA CHIRIBOGA', false),
  ('novonet', '1145', '71|WZ_WHATSAPP_CF8B0DCE5C4B3D5AD777A17FB24BD5600', 'WAZZUP: WhatsApp - DAYANA BAILON', false)
ON CONFLICT (empresa, source_id) DO UPDATE
SET status_id   = EXCLUDED.status_id,
    nombre      = EXCLUDED.nombre,
    es_sistema  = EXCLUDED.es_sistema,
    actualizado = now();

COMMIT;

-- ---------------------------------------------------------------------------
-- FUNCION RESOLUTORA
-- Devuelve el NOMBRE del origen a partir de cualquiera de sus claves.
-- Si no lo encuentra, devuelve el valor original (para no perder informacion).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolver_origen(p_empresa text, p_valor text)
RETURNS text
LANGUAGE sql
STABLE
AS $func$
    SELECT COALESCE(
        (SELECT o.nombre
           FROM public.bitrix_origenes o
          WHERE o.empresa = p_empresa
            AND (   o.source_id                     = BTRIM(p_valor)
                 OR o.status_id                     = BTRIM(p_valor)
                 OR split_part(o.status_id, '|', 1) = BTRIM(p_valor) )
          ORDER BY (o.source_id = BTRIM(p_valor)) DESC
          LIMIT 1),
        NULLIF(BTRIM(p_valor), '')
    );
$func$;

-- ===========================================================================
-- REPORTE 1 — que se resuelve y que no (NO modifica nada)
-- Pegame este resultado: aqui salen los 45 / 48 / 50 / 51 que estas viendo.
-- ===========================================================================
SELECT
    COALESCE(NULLIF(BTRIM(w.source), ''), '(vacio)')            AS valor_guardado,
    public.resolver_origen('novonet', w.source)                 AS nombre_resuelto,
    CASE
      WHEN NULLIF(BTRIM(w.source), '') IS NULL           THEN 'VACIO'
      WHEN public.resolver_origen('novonet', w.source)
           IS DISTINCT FROM BTRIM(w.source)              THEN 'RESUELTO'
      WHEN BTRIM(w.source) ~ '^[0-9]+$'                  THEN '*** CODIGO SIN NOMBRE ***'
      ELSE 'YA ERA NOMBRE'
    END                                                          AS estado,
    COUNT(*)::int                                                AS leads,
    MIN(w.created_at)::date                                      AS desde,
    MAX(w.created_at)::date                                      AS hasta
FROM public.bitrix_webhook_leads w
WHERE w.empresa = 'novonet'
GROUP BY 1, 2, 3
ORDER BY 3, 4 DESC;

-- ===========================================================================
-- REPORTE 2 — lo mismo para VELSA
-- ===========================================================================
SELECT
    COALESCE(NULLIF(BTRIM(w.source), ''), '(vacio)') AS valor_guardado,
    COUNT(*)::int                                    AS leads,
    MIN(w.created_at)::date                          AS desde,
    MAX(w.created_at)::date                          AS hasta
FROM public.bitrix_webhook_leads w
WHERE w.empresa = 'velsa'
GROUP BY 1
ORDER BY 2 DESC;

-- ===========================================================================
-- REPORTE 3 — el catalogo cargado (46 filas esperadas)
-- ===========================================================================
SELECT empresa, source_id, status_id, nombre, es_sistema
FROM public.bitrix_origenes
ORDER BY es_sistema, nombre;
