-- Índices para GET /api/backoffice (submódulo Registros).
-- Ejecutar una vez en PostgreSQL/Supabase. Las expresiones coinciden exactamente
-- con fechaCol() de backoffice.routes.js para que el planner pueda utilizarlas.

CREATE INDEX IF NOT EXISTS idx_envios_ventas_registro_fecha_activos
  ON public.envios_ventas ((LEFT(fecha_registro_sistema::text, 10)))
  WHERE estatus_envio <> 'BORRADOR';

CREATE INDEX IF NOT EXISTS idx_envios_ventas_activacion_fecha_activos
  ON public.envios_ventas ((LEFT(fecha_activacion_netlife::text, 10)))
  WHERE estatus_envio <> 'BORRADOR';

CREATE INDEX IF NOT EXISTS idx_envios_ventas_empresa_normalizada_activos
  ON public.envios_ventas ((UPPER(TRIM(distribuidor_autorizado))))
  WHERE estatus_envio <> 'BORRADOR';

