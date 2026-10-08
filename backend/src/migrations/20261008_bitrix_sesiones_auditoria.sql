CREATE TABLE IF NOT EXISTS public.bitrix_sesiones_auditoria (
  id                    BIGSERIAL PRIMARY KEY,
  actor_usuario_id      INTEGER NOT NULL,
  actor_usuario         VARCHAR(200),
  actor_perfil          VARCHAR(50) NOT NULL,
  actor_empresa         VARCHAR(50) NOT NULL,
  objetivo_bitrix_id    VARCHAR(50) NOT NULL,
  objetivo_nombre       VARCHAR(250),
  objetivo_empresa      VARCHAR(50) NOT NULL,
  accion                VARCHAR(50) NOT NULL,
  resultado             VARCHAR(20) NOT NULL,
  detalle               TEXT,
  ip                    VARCHAR(100),
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bitrix_sesiones_auditoria_creado
  ON public.bitrix_sesiones_auditoria (creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_bitrix_sesiones_auditoria_objetivo
  ON public.bitrix_sesiones_auditoria (objetivo_empresa, objetivo_bitrix_id, creado_en DESC);
