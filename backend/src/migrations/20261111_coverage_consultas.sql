-- Historial centralizado de consultas individuales de cobertura.
-- La fecha/hora se genera en PostgreSQL para que no dependa del navegador.
CREATE TABLE IF NOT EXISTS public.coverage_consultas (
  id                  BIGSERIAL PRIMARY KEY,
  usuario_id          BIGINT,
  usuario             TEXT NOT NULL,
  asesor              TEXT NOT NULL,
  empresa             TEXT,
  negociacion_id      TEXT,
  negociacion_titulo  TEXT,
  chat                JSONB,
  latitud             DOUBLE PRECISION NOT NULL,
  longitud            DOUBLE PRECISION NOT NULL,
  tiene_cobertura     BOOLEAN NOT NULL,
  zona_nombre         TEXT,
  cobertura_via       TEXT,
  cobertura_metros    DOUBLE PRECISION,
  cobertura_detalle   TEXT,
  zona_mas_cercana    JSONB,
  es_zona_peligrosa   BOOLEAN NOT NULL DEFAULT FALSE,
  peligro_tipo        TEXT,
  peligro_etiqueta    TEXT,
  peligro_zonas       JSONB NOT NULL DEFAULT '[]'::jsonb,
  consultado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.coverage_consultas ADD COLUMN IF NOT EXISTS negociacion_id TEXT;
ALTER TABLE public.coverage_consultas ADD COLUMN IF NOT EXISTS negociacion_titulo TEXT;
ALTER TABLE public.coverage_consultas ADD COLUMN IF NOT EXISTS chat JSONB;

CREATE INDEX IF NOT EXISTS idx_coverage_consultas_fecha
  ON public.coverage_consultas (consultado_en DESC);

CREATE INDEX IF NOT EXISTS idx_coverage_consultas_usuario_fecha
  ON public.coverage_consultas (usuario_id, consultado_en DESC);

CREATE INDEX IF NOT EXISTS idx_coverage_consultas_resultado_fecha
  ON public.coverage_consultas (tiene_cobertura, consultado_en DESC);
CREATE INDEX IF NOT EXISTS idx_coverage_consultas_negociacion_fecha
  ON public.coverage_consultas (negociacion_id, consultado_en DESC);

-- La distancia solo aplica cuando la cobertura fue otorgada por cercania a
-- un trazado. En poligonos, 0 se interpretaba erroneamente como una medicion.
UPDATE public.coverage_consultas
SET cobertura_metros = NULL
WHERE cobertura_via IS DISTINCT FROM 'trazado';
