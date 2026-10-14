BEGIN;

-- El backfill de Jotform conservó el nombre completo del plan, pero algunos
-- registros históricos quedaron sin velocidad_plan. Recuperamos únicamente
-- velocidades explícitas (Mbps/Megas/Gbps); nunca se infiere un valor por el
-- tipo de plan.
UPDATE public.envios_ventas
SET velocidad_plan = CONCAT(
  (regexp_match(plan_contratado_final, '([0-9]+(?:[.,][0-9]+)?)\s*(Mbps?|Mpbs?|Megas?|Gbps?|Gdps?)', 'i'))[1],
  ' ',
  CASE
    WHEN (regexp_match(plan_contratado_final, '([0-9]+(?:[.,][0-9]+)?)\s*(Mbps?|Mpbs?|Megas?|Gbps?|Gdps?)', 'i'))[2] ~* '^(g|gd)'
      THEN 'Gbps'
    ELSE 'Mbps'
  END
)
WHERE distribuidor_autorizado IN ('NOVONET', 'VELSA')
  AND plan_contratado_final ~* '([0-9]+(?:[.,][0-9]+)?)\s*(Mbps?|Mpbs?|Megas?|Gbps?|Gdps?)'
  AND (velocidad_plan IS NULL OR BTRIM(velocidad_plan) = '' OR velocidad_plan !~ '[0-9]')
  -- Hay filas legadas anteriores a los CHECK actuales. PostgreSQL vuelve a
  -- validarlos al actualizar cualquier columna; se omiten aquí y quedan
  -- cubiertas por el fallback de lectura del reporte.
  AND (aplica_descuento_3ra_edad IS NULL OR aplica_descuento_3ra_edad IN ('SÍ', 'NO', 'SI POR TERCERA EDAD', 'SI POR DISCACIDAD'))
  AND estado_welcome IN ('SIN_NOTIFICAR', 'PENDIENTE', 'NOTIFICADO')
  AND estatus_envio IN ('BORRADOR', 'PENDIENTE', 'EN PROCESO', 'REGULARIZADA', 'ANULADA', 'SIN NOVEDAD')
  AND netlife_estatus_real IN (
    'ACTIVO', 'ASIGNADO', 'PREFACTIBILIDAD', 'VENTA PERDIDA/OTRO ASESOR',
    'FIN DE GESTIÓN', 'RECHAZADO', 'PRESERVICIO', 'PREPLANIFICADO', 'ANULADO',
    'DETENIDO', 'DUPLICADO', 'FACTIBLE', 'SIN ESTADO', 'ZONA PELIGROSA',
    'FUERA DE COBERTURA', 'DESISTE DEL SERVICIO', 'ELIMINADO', 'REPLANIFICADO',
    'EN VERIFICACIÓN', 'INCORTE', 'CANCELADO', 'FISCALIZACIÓN',
    'CRUCE DE VENTA CON OTRO ASESOR', 'LIBERAR EDIFICIO'
  );

-- Algunos planes históricos VELSA omiten la unidad, pero conservan formatos
-- inequívocos como "Defense 600" o "PLAN HOME 850 + ...".
UPDATE public.envios_ventas
SET velocidad_plan = CONCAT(
  COALESCE(
    (regexp_match(plan_contratado_final, 'DEFENSE\s+([0-9]{2,4})\s*$', 'i'))[1],
    (regexp_match(plan_contratado_final, 'PLAN(?:\s+HOME)?\s+([0-9]{2,4})\s*\+', 'i'))[1]
  ),
  ' Mbps'
)
WHERE distribuidor_autorizado IN ('NOVONET', 'VELSA')
  AND (
    plan_contratado_final ~* 'DEFENSE\s+([0-9]{2,4})\s*$'
    OR plan_contratado_final ~* 'PLAN(?:\s+HOME)?\s+([0-9]{2,4})\s*\+'
  )
  AND (velocidad_plan IS NULL OR BTRIM(velocidad_plan) = '' OR velocidad_plan !~ '[0-9]')
  AND (aplica_descuento_3ra_edad IS NULL OR aplica_descuento_3ra_edad IN ('SÍ', 'NO', 'SI POR TERCERA EDAD', 'SI POR DISCACIDAD'))
  AND estado_welcome IN ('SIN_NOTIFICAR', 'PENDIENTE', 'NOTIFICADO')
  AND estatus_envio IN ('BORRADOR', 'PENDIENTE', 'EN PROCESO', 'REGULARIZADA', 'ANULADA', 'SIN NOVEDAD')
  AND netlife_estatus_real IN (
    'ACTIVO', 'ASIGNADO', 'PREFACTIBILIDAD', 'VENTA PERDIDA/OTRO ASESOR',
    'FIN DE GESTIÓN', 'RECHAZADO', 'PRESERVICIO', 'PREPLANIFICADO', 'ANULADO',
    'DETENIDO', 'DUPLICADO', 'FACTIBLE', 'SIN ESTADO', 'ZONA PELIGROSA',
    'FUERA DE COBERTURA', 'DESISTE DEL SERVICIO', 'ELIMINADO', 'REPLANIFICADO',
    'EN VERIFICACIÓN', 'INCORTE', 'CANCELADO', 'FISCALIZACIÓN',
    'CRUCE DE VENTA CON OTRO ASESOR', 'LIBERAR EDIFICIO'
  );

COMMIT;
