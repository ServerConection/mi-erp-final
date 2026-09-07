-- Separa el flujo de bienvenida de las novedades operativas de ATC.
ALTER TABLE public.envios_ventas
  ADD COLUMN IF NOT EXISTS estado_welcome TEXT NOT NULL DEFAULT 'SIN_NOTIFICAR',
  ADD COLUMN IF NOT EXISTS fecha_notificacion_welcome TIMESTAMPTZ;

-- Conserva novedades_atc intacto y únicamente copia los estados que el flujo
-- antiguo utilizaba como discriminador de Welcome.
UPDATE public.envios_ventas
SET
  estado_welcome = CASE UPPER(TRIM(COALESCE(novedades_atc, '')))
    WHEN 'PENDIENTE' THEN 'PENDIENTE'
    WHEN 'NOTIFICADO' THEN 'NOTIFICADO'
    ELSE 'SIN_NOTIFICAR'
  END,
  fecha_notificacion_welcome = CASE
    WHEN UPPER(TRIM(COALESCE(novedades_atc, ''))) = 'NOTIFICADO'
      THEN COALESCE(fecha_notificacion_welcome, NOW())
    ELSE fecha_notificacion_welcome
  END
WHERE estado_welcome = 'SIN_NOTIFICAR';

ALTER TABLE public.envios_ventas
  DROP CONSTRAINT IF EXISTS chk_envios_ventas_estado_welcome;

ALTER TABLE public.envios_ventas
  ADD CONSTRAINT chk_envios_ventas_estado_welcome
  CHECK (estado_welcome IN ('SIN_NOTIFICAR', 'PENDIENTE', 'NOTIFICADO'));

CREATE INDEX IF NOT EXISTS idx_envios_ventas_estado_welcome
  ON public.envios_ventas (estado_welcome);

CREATE OR REPLACE FUNCTION public.actualizar_fecha_notificacion_welcome()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado_welcome = 'NOTIFICADO'
     AND OLD.estado_welcome IS DISTINCT FROM 'NOTIFICADO' THEN
    NEW.fecha_notificacion_welcome := NOW();
  ELSIF NEW.estado_welcome <> 'NOTIFICADO' THEN
    NEW.fecha_notificacion_welcome := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_envios_ventas_fecha_notificacion_welcome
  ON public.envios_ventas;

CREATE TRIGGER trg_envios_ventas_fecha_notificacion_welcome
BEFORE UPDATE OF estado_welcome ON public.envios_ventas
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_fecha_notificacion_welcome();

COMMENT ON COLUMN public.envios_ventas.estado_welcome IS
  'Estado independiente del flujo Welcome: SIN_NOTIFICAR, PENDIENTE o NOTIFICADO.';
COMMENT ON COLUMN public.envios_ventas.fecha_notificacion_welcome IS
  'Fecha asignada automáticamente al pasar el flujo Welcome a NOTIFICADO.';
