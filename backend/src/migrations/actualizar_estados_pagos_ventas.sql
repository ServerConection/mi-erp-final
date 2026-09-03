-- Actualiza ventas_registros para los códigos actuales del formulario.
-- Ejecutar una vez en PostgreSQL/Render.

BEGIN;

ALTER TABLE public.ventas_registros
  DROP CONSTRAINT IF EXISTS ventas_registros_estado_check,
  DROP CONSTRAINT IF EXISTS ventas_registros_pago_check;

UPDATE public.ventas_registros SET estado = 'REPLANIFICADO'  WHERE UPPER(TRIM(estado)) = 'RE-PLANIFICADO';
UPDATE public.ventas_registros SET estado = 'PREPLANIFICADO' WHERE UPPER(TRIM(estado)) = 'PRE-PLANIFICADO';
UPDATE public.ventas_registros SET estado = 'PRESERVICIO'    WHERE UPPER(TRIM(estado)) = 'PRE-SERVICIO';
UPDATE public.ventas_registros SET pago = 'CC'               WHERE UPPER(TRIM(pago)) = 'CUENTA CORRIENTE';

ALTER TABLE public.ventas_registros
  ADD CONSTRAINT ventas_registros_estado_check CHECK (estado IN (
    'ACTIVO', 'DETENIDO', 'REPLANIFICADO', 'PRESERVICIO', 'FACTIBLE',
    'PLANIFICADO', 'PREPLANIFICADO', 'ASIGNADO', 'SIN ESTADO', 'ANULADA'
  )),
  ADD CONSTRAINT ventas_registros_pago_check CHECK (pago IN ('EFEC', 'TC', 'CA', 'CC'));

COMMIT;
