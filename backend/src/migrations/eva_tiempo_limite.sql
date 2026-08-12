-- ═══════════════════════════════════════════════════════════════════════════════
-- EVALUACIONES · Límite de tiempo por evaluación — Migración incremental
-- ═══════════════════════════════════════════════════════════════════════════════
-- Base de datos : bddgeneral (Render / PostgreSQL)
-- Se aplica sobre la tabla que ya crea evaluaciones.sql.
--
--   tiempo_limite_min NULL = sin límite de tiempo (comportamiento anterior,
--   compatible con las evaluaciones ya creadas).
--
-- Idempotente: se puede correr varias veces sin romper nada.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.eva_evaluaciones
    ADD COLUMN IF NOT EXISTS tiempo_limite_min SMALLINT;

COMMENT ON COLUMN public.eva_evaluaciones.tiempo_limite_min IS
    'Minutos disponibles para responder, contados desde que se abre la evaluación. NULL = sin límite.';

DO $$
BEGIN
    ALTER TABLE public.eva_evaluaciones
        ADD CONSTRAINT chk_eva_tiempo_limite
        CHECK (tiempo_limite_min IS NULL OR tiempo_limite_min BETWEEN 1 AND 180);
EXCEPTION WHEN duplicate_object THEN
    NULL; -- ya existía, no hay nada que hacer
END $$;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN (opcional, ejecutar después del COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════════
/*
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'eva_evaluaciones' AND column_name = 'tiempo_limite_min';
*/
