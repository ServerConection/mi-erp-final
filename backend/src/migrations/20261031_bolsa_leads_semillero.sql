-- ============================================================================
-- BOLSA LEADS — agrega SEMILLERO (letra S) como tercera empresa del ciclo
-- Base: erp_database. Correr a mano en pgAdmin ANTES del deploy. Seguro de re-ejecutar.
-- Requiere haber corrido antes 20261029_bolsa_leads.sql.
-- ============================================================================

-- 1) El patrón ahora acepta N, V y S
ALTER TABLE bolsa_leads_config DROP CONSTRAINT IF EXISTS bolsa_leads_config_patron_check;
ALTER TABLE bolsa_leads_config ADD CONSTRAINT bolsa_leads_config_patron_check CHECK (patron ~ '^[NVS]{1,50}$');

-- 2) Nuevo modo "Todo a SEMILLERO"
ALTER TABLE bolsa_leads_config DROP CONSTRAINT IF EXISTS bolsa_leads_config_modo_check;
ALTER TABLE bolsa_leads_config ADD CONSTRAINT bolsa_leads_config_modo_check
    CHECK (modo IN ('proporcion', 'solo_novonet', 'solo_velsa', 'solo_semillero'));

-- 3) Ciclo de 12: 7 NOVONET / 4 VELSA / 1 SEMILLERO → N V N N V N S N V N N V
ALTER TABLE bolsa_leads_config ALTER COLUMN patron SET DEFAULT 'NVNNVNSNVNNV';
-- Solo si todavía tiene el ciclo inicial de 10 (no pisa uno que ya hayas editado)
UPDATE bolsa_leads_config
   SET patron = 'NVNNVNSNVNNV', posicion = 0, actualizado_en = NOW(), actualizado_por = 'migración semillero'
 WHERE id = 1 AND patron = 'NVNVNNVNVN';
