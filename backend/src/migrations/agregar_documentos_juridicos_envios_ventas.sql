-- Documentos adicionales solicitados para clientes JURÍDICOS con RUC PERSONAL.
ALTER TABLE public.envios_ventas
  ADD COLUMN IF NOT EXISTS archivo_nombramiento TEXT,
  ADD COLUMN IF NOT EXISTS archivo_registro_mercantil TEXT,
  ADD COLUMN IF NOT EXISTS archivo_ruc TEXT;
