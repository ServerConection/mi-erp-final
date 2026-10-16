-- INVENTARIO DE ACTIVOS TI: historial de auditorias y tokens dedicados
-- Ejecutar manualmente en la base de datos del ERP (pgAdmin / psql).

ALTER TABLE public.inventario_activos
  DROP CONSTRAINT IF EXISTS inventario_activos_empresa_check;

ALTER TABLE public.inventario_activos
  ADD CONSTRAINT inventario_activos_empresa_check
    CHECK (empresa IN ('NOVONET', 'VELSA', 'POR DEFINIR'));

CREATE TABLE IF NOT EXISTS public.inventario_activos_auditoria (
  id                  BIGSERIAL PRIMARY KEY,
  activo_id           VARCHAR(30) NOT NULL
                        REFERENCES public.inventario_activos(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  perfil_windows      VARCHAR(10) NOT NULL
                        CHECK (perfil_windows IN ('USUARIO', 'ADMIN')),
  usb_bloqueado       BOOLEAN NOT NULL,
  descargas_totales   INTEGER NOT NULL DEFAULT 0
                        CHECK (descargas_totales >= 0),
  accesos              JSONB NOT NULL DEFAULT '0'::JSONB,
  paginas_bloqueadas_ok BOOLEAN NOT NULL,
  usuario_windows     TEXT,
  datos_extra         JSONB NOT NULL DEFAULT '{}'::JSONB,
  fecha_auditoria     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventario_activos_auditoria_activo_fecha_idx
  ON public.inventario_activos_auditoria (activo_id, fecha_auditoria DESC);

-- Solo se almacena el hash. El token completo se muestra una vez al crearlo.
CREATE TABLE IF NOT EXISTS public.inventario_activos_api_tokens (
  id            BIGSERIAL PRIMARY KEY,
  nombre        VARCHAR(150) NOT NULL,
  token_hash    CHAR(64) NOT NULL UNIQUE,
  token_prefijo VARCHAR(16) NOT NULL,
  empresa       VARCHAR(20) NOT NULL
                  CHECK (empresa IN ('NOVONET', 'VELSA', 'POR DEFINIR')),
  expira_en     TIMESTAMPTZ NOT NULL,
  revocado      BOOLEAN NOT NULL DEFAULT FALSE,
  creado_por    VARCHAR(150) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_uso    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS inventario_activos_api_tokens_vigentes_idx
  ON public.inventario_activos_api_tokens (token_hash, expira_en)
  WHERE revocado = FALSE;

