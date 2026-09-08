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
  -- Algunos procesos sincronizan el registro ejecutando UPDATE aunque todos
  -- los valores sean iguales. Eso no debe considerarse una modificación real.
  -- Se excluye este mismo campo de la comparación para evitar que se actualice
  -- por sí solo o que pueda ser alterado manualmente sin cambiar otro dato.
  IF (to_jsonb(NEW) - 'fecha_ultima_actualizacion')
       IS DISTINCT FROM
     (to_jsonb(OLD) - 'fecha_ultima_actualizacion') THEN
    NEW.fecha_ultima_actualizacion := NOW();
  ELSE
    NEW.fecha_ultima_actualizacion := OLD.fecha_ultima_actualizacion;
  END IF;

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
  'Fecha y hora de la última modificación real del registro, asignada automáticamente por trigger.';
