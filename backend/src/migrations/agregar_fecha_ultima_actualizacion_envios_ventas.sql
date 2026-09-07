-- Registra automáticamente la fecha del último cambio de cada venta.
-- El trigger cubre actualizaciones hechas desde cualquier submódulo,
-- endpoint, proceso automático o consulta SQL sobre envios_ventas.

ALTER TABLE public.envios_ventas
  ADD COLUMN IF NOT EXISTS fecha_ultima_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.actualizar_fecha_ultima_actualizacion_envios_ventas()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.fecha_ultima_actualizacion := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_envios_ventas_fecha_ultima_actualizacion
  ON public.envios_ventas;

CREATE TRIGGER trg_envios_ventas_fecha_ultima_actualizacion
BEFORE UPDATE ON public.envios_ventas
FOR EACH ROW
EXECUTE FUNCTION public.actualizar_fecha_ultima_actualizacion_envios_ventas();

COMMENT ON COLUMN public.envios_ventas.fecha_ultima_actualizacion IS
  'Fecha y hora del último UPDATE del registro, asignada automáticamente por trigger.';
