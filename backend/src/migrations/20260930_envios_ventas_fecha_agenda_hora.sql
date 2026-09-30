-- Se conserva fecha_agenda con su tipo actual para no romper vistas, índices ni
-- filtros históricos. La hora local se almacena por separado y la interfaz las
-- presenta como un único control de fecha y hora.
ALTER TABLE public.envios_ventas
  ADD COLUMN IF NOT EXISTS hora_agenda TIME;

COMMENT ON COLUMN public.envios_ventas.hora_agenda IS
  'Hora local de Ecuador acordada para el agendamiento.';
