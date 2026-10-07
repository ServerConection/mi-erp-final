-- ============================================================================
-- REPARTO DE GESTIONABLES — LÍMITE DE % ATC POR ASESOR
-- Base: erp_database (¡no bddgeneral!). Correr a mano en pgAdmin ANTES del deploy.
-- Seguro de re-ejecutar.
--
-- Si de lo que un asesor recibió hoy (bot + humano) el % que está en ATC es
-- >= porcentaje_atc_max, el bot deja de entregarle aunque tenga cupo.
-- Editable por asesor y día, igual que gestionables_permitidos.
-- 100 = sin límite de ATC.
-- ============================================================================
ALTER TABLE gestionables_asesores
  ADD COLUMN IF NOT EXISTS porcentaje_atc_max INTEGER NOT NULL DEFAULT 50;

DO $$ BEGIN
  ALTER TABLE gestionables_asesores
    ADD CONSTRAINT chk_gestionables_porcentaje_atc CHECK (porcentaje_atc_max BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Verificación (todo octubre debe salir con 50)
-- SELECT fecha_carga, MIN(porcentaje_atc_max), MAX(porcentaje_atc_max), COUNT(*)
--   FROM gestionables_asesores WHERE fecha_carga >= '2026-10-01' GROUP BY 1 ORDER BY 1;
