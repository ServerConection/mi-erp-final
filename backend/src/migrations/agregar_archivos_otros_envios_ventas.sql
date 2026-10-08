-- Adjuntos libres que carga Backoffice en el detalle del registro (Otro 1 – Otro 4).
ALTER TABLE public.envios_ventas
  ADD COLUMN IF NOT EXISTS archivo_otro1 TEXT,
  ADD COLUMN IF NOT EXISTS archivo_otro2 TEXT,
  ADD COLUMN IF NOT EXISTS archivo_otro3 TEXT,
  ADD COLUMN IF NOT EXISTS archivo_otro4 TEXT;
