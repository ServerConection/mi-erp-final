-- ============================================================
-- Permite guardar BORRADORES en envios_ventas.
-- La regla chk_estatus_envio (creada directo en la BD) no incluía
-- 'BORRADOR' y bloqueaba el botón "Registrar venta (borrador)".
-- Ejecutar en pgAdmin contra la base de datos de PRODUCCIÓN.
-- ============================================================

-- 1) (Informativo) Qué permite la regla actual
SELECT pg_get_constraintdef(oid) AS regla_actual
FROM pg_constraint
WHERE conname = 'chk_estatus_envio';

-- 2) (Informativo) Qué estados existen hoy en la tabla
SELECT estatus_envio, COUNT(*) FROM public.envios_ventas GROUP BY 1;

-- 3) Reemplazar la regla incluyendo BORRADOR.
--    NOT VALID = no revisa filas antiguas (no puede fallar por datos viejos);
--    las filas nuevas sí quedan validadas.
ALTER TABLE public.envios_ventas DROP CONSTRAINT IF EXISTS chk_estatus_envio;
ALTER TABLE public.envios_ventas ADD CONSTRAINT chk_estatus_envio
  CHECK (estatus_envio IN (
    'BORRADOR', 'PENDIENTE', 'EN PROCESO',
    'REGULARIZADA', 'ANULADA', 'SIN NOVEDAD'
  )) NOT VALID;
