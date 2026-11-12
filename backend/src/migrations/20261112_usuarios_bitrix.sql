-- Identidad estable entre una cuenta del ERP y su usuario en cada Bitrix.
-- Los IDs de Bitrix solo son únicos dentro de la empresa/portal.
CREATE TABLE IF NOT EXISTS public.usuarios_bitrix (
  usuario_id      BIGINT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa         TEXT NOT NULL,
  bitrix_user_id  TEXT NOT NULL,
  bitrix_nombre   TEXT,
  vinculado_por   TEXT NOT NULL DEFAULT 'nombre_normalizado',
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, empresa),
  UNIQUE (empresa, bitrix_user_id)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_bitrix_usuario
  ON public.usuarios_bitrix (usuario_id);
