-- Campos operativos y trazabilidad inmutable de Backoffice.
ALTER TABLE public.envios_ventas
  ADD COLUMN IF NOT EXISTS franja_horaria_agendamiento VARCHAR(20),
  ADD COLUMN IF NOT EXISTS fecha_hora_regularizacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_auditoria DATE,
  ADD COLUMN IF NOT EXISTS hora_auditoria TIME,
  ADD COLUMN IF NOT EXISTS hist_cambio_estatus JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_envios_ventas_fecha_agenda
  ON public.envios_ventas ((LEFT(fecha_agenda::text, 10)))
  WHERE estatus_envio <> 'BORRADOR';

COMMENT ON COLUMN public.envios_ventas.franja_horaria_agendamiento IS
  'Franja protocolar de agendamiento de dos horas.';
COMMENT ON COLUMN public.envios_ventas.fecha_hora_regularizacion IS
  'Instante inmutable en que el registro pasa por primera vez a REGULARIZADO.';
COMMENT ON COLUMN public.envios_ventas.hist_cambio_estatus IS
  'Log append-only de cambios de estado con usuario y fecha/hora.';
