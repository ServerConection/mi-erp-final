-- Foto del cartel requerida para ventas del segmento PYME.
ALTER TABLE public.envios_ventas
  ADD COLUMN IF NOT EXISTS foto_cartel TEXT;

COMMENT ON COLUMN public.envios_ventas.foto_cartel IS
  'Ruta protegida de la foto del cartel para ventas PYME.';
