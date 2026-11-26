CREATE TABLE IF NOT EXISTS public.eva_cursos (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT,
  empresa VARCHAR(20),
  video_url TEXT NOT NULL,
  video_nombre VARCHAR(255) NOT NULL,
  video_bytes BIGINT NOT NULL,
  evaluacion_id INTEGER NOT NULL REFERENCES public.eva_evaluaciones(id),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por INTEGER NOT NULL REFERENCES public.usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_eva_curso_empresa CHECK (empresa IS NULL OR empresa IN ('NOVONET', 'VELSA'))
);

CREATE TABLE IF NOT EXISTS public.eva_curso_progreso (
  curso_id INTEGER NOT NULL REFERENCES public.eva_cursos(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  video_completado BOOLEAN NOT NULL DEFAULT FALSE,
  video_completado_en TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (curso_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_eva_cursos_activos ON public.eva_cursos (activo, empresa, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eva_curso_progreso_usuario ON public.eva_curso_progreso (usuario_id, updated_at DESC);
