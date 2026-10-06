-- Ãndices para los filtros operativos de Backoffice con volÃºmenes altos.
-- Las expresiones coinciden con backoffice.routes.js y son parciales para no
-- indexar borradores, que nunca forman parte de estos submÃ³dulos.

CREATE INDEX IF NOT EXISTS idx_envios_ventas_netlife_estado_activos
  ON public.envios_ventas ((UPPER(TRIM(netlife_estatus_real))))
  WHERE estatus_envio <> 'BORRADOR';

CREATE INDEX IF NOT EXISTS idx_envios_ventas_regularizacion_estado_activos
  ON public.envios_ventas ((UPPER(TRIM(estatus_regularizacion))))
  WHERE estatus_envio <> 'BORRADOR';

CREATE INDEX IF NOT EXISTS idx_envios_ventas_empresa_fecha_activos
  ON public.envios_ventas (
    (UPPER(TRIM(distribuidor_autorizado))),
    (LEFT(fecha_registro_sistema::text, 10))
  )
  WHERE estatus_envio <> 'BORRADOR';

CREATE INDEX IF NOT EXISTS idx_envios_ventas_netlife_fecha_activos
  ON public.envios_ventas (
    (UPPER(TRIM(netlife_estatus_real))),
    (LEFT(fecha_registro_sistema::text, 10))
  )
  WHERE estatus_envio <> 'BORRADOR';

CREATE INDEX IF NOT EXISTS idx_envios_ventas_regularizacion_fecha_activos
  ON public.envios_ventas (
    (UPPER(TRIM(estatus_regularizacion))),
    (LEFT(fecha_registro_sistema::text, 10))
  )
  WHERE estatus_envio <> 'BORRADOR';
