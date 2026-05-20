-- ════════════════════════════════════════════════════════════════════════════
-- EJECUTA ESTO EN PGADMIN / RENDER una sola vez
-- Actualiza la tabla coverage_cache para soportar archivos grandes
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Agregar columna para guardar el archivo original comprimido
ALTER TABLE public.coverage_cache
  ADD COLUMN IF NOT EXISTS file_data BYTEA;

-- 2. Hacer zones opcional (antes era NOT NULL, ahora puede ser NULL temporalmente)
ALTER TABLE public.coverage_cache
  ALTER COLUMN zones DROP NOT NULL;

-- 3. Verificar resultado
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'coverage_cache'
ORDER BY ordinal_position;
-- Deberías ver: id, file_name, zones (nullable), file_data, saved_at
