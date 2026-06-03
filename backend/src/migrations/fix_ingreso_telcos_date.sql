-- Migración: cambia ingreso_telcos de NUMERIC a DATE
-- Los valores existentes en esa columna probablemente son NULL
-- ya que Number("2024-06-03") = NaN siempre fue rechazado por Postgres.
-- Si hubiera valores numéricos (epoch seconds) se convierten también.

ALTER TABLE ventas_registros
  ALTER COLUMN ingreso_telcos TYPE DATE
  USING CASE
    WHEN ingreso_telcos IS NULL THEN NULL
    -- Si quedó algún epoch en segundos, conviértelo a fecha
    ELSE to_timestamp(ingreso_telcos)::date
  END;
