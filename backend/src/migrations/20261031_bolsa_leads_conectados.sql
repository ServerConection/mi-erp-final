-- ============================================================================
-- BOLSA LEADS — redirigir a la empresa que tenga asesores conectados
-- Base: erp_database. Correr a mano en pgAdmin ANTES del deploy. Seguro de re-ejecutar.
-- Si la empresa de la casilla no tiene a NADIE conectado en Bitrix (jornada
-- abierta), el lead pasa a la siguiente casilla cuya empresa sí tenga gente.
-- ============================================================================
ALTER TABLE bolsa_leads_config ADD COLUMN IF NOT EXISTS redirigir_sin_conectados BOOLEAN NOT NULL DEFAULT TRUE;
-- Cuántos conectados había en cada empresa al momento de entregar (trazabilidad)
ALTER TABLE bolsa_leads_entregas ADD COLUMN IF NOT EXISTS conectados JSONB;
