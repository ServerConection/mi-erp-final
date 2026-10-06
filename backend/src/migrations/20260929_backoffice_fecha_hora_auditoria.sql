-- Sellos separados solicitados para reportes y visualización de auditoría.
-- La ruta de Backoffice los genera en zona America/Guayaquil al seleccionar
-- auditado_por; el navegador nunca envía estos valores.
ALTER TABLE public.envios_ventas
  ADD COLUMN IF NOT EXISTS fecha_auditoria DATE,
  ADD COLUMN IF NOT EXISTS hora_auditoria TIME;

COMMENT ON COLUMN public.envios_ventas.fecha_auditoria IS
  'Fecha local Ecuador de la primera auditoría registrada desde Backoffice.';
COMMENT ON COLUMN public.envios_ventas.hora_auditoria IS
  'Hora local Ecuador de la primera auditoría registrada desde Backoffice.';
