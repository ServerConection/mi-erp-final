-- Completa los sellos separados de registros auditados antes de que existieran
-- fecha_auditoria y hora_auditoria, conservando el instante original.
UPDATE public.envios_ventas
SET
  fecha_auditoria = COALESCE(
    fecha_auditoria,
    (fecha_hora_regularizacion AT TIME ZONE 'America/Guayaquil')::date
  ),
  hora_auditoria = COALESCE(
    hora_auditoria,
    (fecha_hora_regularizacion AT TIME ZONE 'America/Guayaquil')::time
  )
WHERE fecha_hora_regularizacion IS NOT NULL
  AND (fecha_auditoria IS NULL OR hora_auditoria IS NULL);
