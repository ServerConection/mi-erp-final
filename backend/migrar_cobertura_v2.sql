-- ════════════════════════════════════════════════════════════════════════════
-- EJECUTA ESTO EN PGADMIN una sola vez
-- ════════════════════════════════════════════════════════════════════════════

-- Agregar columna kml_text si no existe
ALTER TABLE public.coverage_cache
  ADD COLUMN IF NOT EXISTS kml_text TEXT;

-- Hacer zones nullable (si venía NOT NULL del schema anterior)
ALTER TABLE public.coverage_cache
  ALTER COLUMN zones DROP NOT NULL;

-- Verificar resultado
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'coverage_cache'
ORDER BY ordinal_position;
