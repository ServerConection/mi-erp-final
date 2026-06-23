-- ================================================================
-- EJECUTA ESTO EN SUPABASE → SQL Editor
-- Amplía envios_ventas para: resumen de venta auto-generado, fotos de
-- documentos (cédula frontal/trasera, carnet, resumen) y flujo de
-- borradores (REGISTRAR VENTA) que el asesor completa después.
-- ================================================================

ALTER TABLE public.envios_ventas
  -- Propietario real del registro (para "Mis ventas pendientes" y permisos de edición de borrador).
  -- Se completa siempre desde el token (req.user.id), nunca desde el formulario.
  ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES public.usuarios(id),

  -- Campos nuevos requeridos por el resumen de venta
  ADD COLUMN IF NOT EXISTS banco                   TEXT,
  ADD COLUMN IF NOT EXISTS ciclo_facturacion        TEXT,
  ADD COLUMN IF NOT EXISTS costo_instalacion         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS descuento_instalacion     TEXT,
  ADD COLUMN IF NOT EXISTS beneficios_adicionales    TEXT,
  ADD COLUMN IF NOT EXISTS beneficios_de_ley         TEXT,         -- 'SI' | 'NO'
  ADD COLUMN IF NOT EXISTS plazo_contrato_meses      INTEGER DEFAULT 36,
  ADD COLUMN IF NOT EXISTS resumen_venta             TEXT,         -- texto generado automáticamente

  -- Documentos (rutas relativas servidas vía /uploads/envios_ventas/<archivo>)
  ADD COLUMN IF NOT EXISTS foto_cedula_frontal       TEXT,
  ADD COLUMN IF NOT EXISTS foto_cedula_trasera       TEXT,
  ADD COLUMN IF NOT EXISTS foto_carnet               TEXT,
  ADD COLUMN IF NOT EXISTS archivo_resumen           TEXT;

-- estatus_envio ahora también admite 'BORRADOR' (ya es TEXT libre, no requiere ALTER de tipo).
-- Índice para listar rápido "mis borradores pendientes" por asesor.
CREATE INDEX IF NOT EXISTS idx_envios_ventas_borrador
  ON public.envios_ventas (usuario_id, estatus_envio)
  WHERE estatus_envio = 'BORRADOR';
