CREATE TABLE IF NOT EXISTS public.accesos_modulos (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa VARCHAR(30) NOT NULL,
  modulo VARCHAR(30) NOT NULL,
  modulo_empresa VARCHAR(30),
  accedido_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT accesos_modulos_modulo_check
    CHECK (modulo IN ('INDICADORES', 'CONTACTABILIDAD', 'VISTA_ASESOR'))
);
CREATE INDEX IF NOT EXISTS idx_accesos_modulos_fecha_empresa
  ON public.accesos_modulos (accedido_en DESC, empresa, modulo);
CREATE INDEX IF NOT EXISTS idx_accesos_modulos_usuario_fecha
  ON public.accesos_modulos (usuario_id, accedido_en DESC);

CREATE TABLE IF NOT EXISTS public.acciones_modulos (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  empresa VARCHAR(30) NOT NULL,
  modulo VARCHAR(30) NOT NULL,
  modulo_empresa VARCHAR(30),
  accion VARCHAR(40) NOT NULL,
  detalle TEXT,
  realizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT acciones_modulos_modulo_check
    CHECK (modulo IN ('INDICADORES', 'CONTACTABILIDAD', 'VISTA_ASESOR'))
);
CREATE INDEX IF NOT EXISTS idx_acciones_modulos_fecha_empresa
  ON public.acciones_modulos (realizado_en DESC, empresa, modulo);
ALTER TABLE public.acciones_modulos ALTER COLUMN detalle TYPE TEXT;
ALTER TABLE public.accesos_modulos ADD COLUMN IF NOT EXISTS modulo_empresa VARCHAR(30);
ALTER TABLE public.acciones_modulos ADD COLUMN IF NOT EXISTS modulo_empresa VARCHAR(30);
