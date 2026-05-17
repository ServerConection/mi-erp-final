-- ════════════════════════════════════════════════════════════════════════════
-- Persistencia de zonas de cobertura en PostgreSQL
-- Ejecutar UNA sola vez en la BD
-- ════════════════════════════════════════════════════════════════════════════

-- Tabla de una sola fila: siempre se hace UPSERT con id=1
CREATE TABLE IF NOT EXISTS public.coverage_cache (
  id          INT         PRIMARY KEY DEFAULT 1,
  file_name   TEXT        NOT NULL,
  zones       JSONB       NOT NULL,
  saved_at    TIMESTAMPTZ DEFAULT NOW(),
  zones_count INT         GENERATED ALWAYS AS (jsonb_array_length(zones)) STORED
);

-- Restricción: solo puede existir la fila id=1
ALTER TABLE public.coverage_cache
  ADD CONSTRAINT coverage_cache_single_row CHECK (id = 1);
