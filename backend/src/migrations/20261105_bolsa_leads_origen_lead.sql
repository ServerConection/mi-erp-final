-- ============================================================================
-- BOLSA LEADS — guardar el Origen (campaña) de Bitrix de cada lead entregado
-- Base: erp_database. Correr a mano en pgAdmin. Seguro de re-ejecutar.
-- (La columna "origen" que ya existe dice por dónde entró a la Bolsa:
--  webhook / pendientes / manual. Por eso estas columnas son nuevas.)
-- ============================================================================
ALTER TABLE bolsa_leads_entregas ADD COLUMN IF NOT EXISTS origen_lead_id VARCHAR(80);  -- SOURCE_ID de Bitrix
ALTER TABLE bolsa_leads_entregas ADD COLUMN IF NOT EXISTS origen_lead    TEXT;         -- nombre del origen
