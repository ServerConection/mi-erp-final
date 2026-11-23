BEGIN;

CREATE TABLE IF NOT EXISTS public.auditoria_archivos_windows (
  id BIGSERIAL PRIMARY KEY,
  empresa VARCHAR(20) NOT NULL CHECK (empresa IN ('NOVONET', 'VELSA')),
  equipo TEXT NOT NULL,
  usuario_windows TEXT NOT NULL,
  perfil_usuario TEXT,
  mac TEXT,
  raiz_perfil TEXT NOT NULL,
  rutas_auditadas JSONB NOT NULL DEFAULT '[]'::JSONB,
  total_archivos INTEGER NOT NULL CHECK (total_archivos >= 0),
  total_descargas INTEGER NOT NULL CHECK (total_descargas >= 0),
  total_imagenes INTEGER NOT NULL CHECK (total_imagenes >= 0),
  total_carpetas INTEGER NOT NULL CHECK (total_carpetas >= 0),
  carpetas JSONB NOT NULL DEFAULT '[]'::JSONB,
  archivos JSONB NOT NULL DEFAULT '[]'::JSONB,
  errores JSONB NOT NULL DEFAULT '[]'::JSONB,
  iniciada_en TIMESTAMPTZ NOT NULL,
  finalizada_en TIMESTAMPTZ NOT NULL,
  recibida_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  registrada_por TEXT NOT NULL,
  token_id BIGINT REFERENCES public.inventario_activos_api_tokens(id) ON DELETE SET NULL,
  version_script VARCHAR(30) NOT NULL,
  CHECK (jsonb_typeof(rutas_auditadas) = 'array'),
  CHECK (jsonb_typeof(carpetas) = 'array'),
  CHECK (jsonb_typeof(archivos) = 'array'),
  CHECK (jsonb_typeof(errores) = 'array')
);

CREATE INDEX IF NOT EXISTS auditoria_archivos_windows_equipo_fecha_idx
  ON public.auditoria_archivos_windows (equipo, iniciada_en DESC);
CREATE INDEX IF NOT EXISTS auditoria_archivos_windows_empresa_fecha_idx
  ON public.auditoria_archivos_windows (empresa, iniciada_en DESC);

COMMIT;
