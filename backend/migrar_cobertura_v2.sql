-- ════════════════════════════════════════════════════════════════════════════
-- EJECUTA ESTO EN PGADMIN una sola vez
-- Crea la tabla nueva coverage_zones (filas individuales por zona)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.coverage_zones (
  id          SERIAL PRIMARY KEY,
  file_name   TEXT    NOT NULL,
  name        TEXT,
  coordinates JSONB   NOT NULL,
  bbox_minlon FLOAT,
  bbox_minlat FLOAT,
  bbox_maxlon FLOAT,
  bbox_maxlat FLOAT,
  loaded_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Índice en bbox para acelerar queries espaciales futuras
CREATE INDEX IF NOT EXISTS idx_coverage_zones_bbox
  ON public.coverage_zones (bbox_minlon, bbox_maxlon, bbox_minlat, bbox_maxlat);

-- Verificar
SELECT COUNT(*) AS zonas_guardadas FROM public.coverage_zones;
