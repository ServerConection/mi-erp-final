-- ============================================================================
-- Comisiones v2 (catálogo oficial "CATALOGOS DE PLANES", oct-2026)
-- Ejecutar UNA vez en pgAdmin. Solo AGREGA una columna; no borra ni cambia datos.
--   categoria = Consideración del Excel: TABLA | PYME | COMISION | NO_VENDER
--   (com_t1 = tabla "hasta 40", com_t2 = "desde 41", com_t3 = valor por venta del asegurado)
-- Sin esta columna el módulo sigue funcionando, pero todo cuenta como TABLA.
-- ============================================================================
ALTER TABLE public.comisiones_catalogo ADD COLUMN IF NOT EXISTS categoria TEXT;
