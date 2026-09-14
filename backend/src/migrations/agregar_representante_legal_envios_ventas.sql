ALTER TABLE public.envios_ventas
  ADD COLUMN IF NOT EXISTS representante_legal TEXT;

COMMENT ON COLUMN public.envios_ventas.representante_legal
  IS 'Nombres y apellidos del representante legal; aplica solo a RUC EMPRESA.';
