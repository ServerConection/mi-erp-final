-- INVENTARIO DE ACTIVOS TI: capacidades numericas en GB
-- Ejecutar manualmente en la base de datos del ERP (pgAdmin / psql).
-- Conserva ram y disco_espacio para compatibilidad.

ALTER TABLE public.inventario_activos
  ADD COLUMN IF NOT EXISTS ram_gb NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS disco_gb NUMERIC(12,2);

ALTER TABLE public.inventario_activos
  DROP CONSTRAINT IF EXISTS inventario_activos_ram_gb_chk,
  DROP CONSTRAINT IF EXISTS inventario_activos_disco_gb_chk;

ALTER TABLE public.inventario_activos
  ADD CONSTRAINT inventario_activos_ram_gb_chk
    CHECK (ram_gb IS NULL OR ram_gb >= 0),
  ADD CONSTRAINT inventario_activos_disco_gb_chk
    CHECK (disco_gb IS NULL OR disco_gb >= 0);

-- Solo convierte valores inequívocos: numero + unidad MB, GB o TB.
-- Los textos sin unidad, con varias capacidades o con contenido adicional
-- quedan NULL para revision manual.
UPDATE public.inventario_activos
SET ram_gb = CASE
  WHEN UPPER(TRIM(ram)) ~ '^[0-9]+([.,][0-9]+)?[[:space:]]*MB$'
    THEN ROUND((REPLACE(REGEXP_REPLACE(UPPER(TRIM(ram)), '[^0-9.,]', '', 'g'), ',', '.')::NUMERIC / 1024), 2)
  WHEN UPPER(TRIM(ram)) ~ '^[0-9]+([.,][0-9]+)?[[:space:]]*GB$'
    THEN REPLACE(REGEXP_REPLACE(UPPER(TRIM(ram)), '[^0-9.,]', '', 'g'), ',', '.')::NUMERIC
  WHEN UPPER(TRIM(ram)) ~ '^[0-9]+([.,][0-9]+)?[[:space:]]*TB$'
    THEN REPLACE(REGEXP_REPLACE(UPPER(TRIM(ram)), '[^0-9.,]', '', 'g'), ',', '.')::NUMERIC * 1024
  ELSE NULL
END;

UPDATE public.inventario_activos
SET disco_gb = CASE
  WHEN UPPER(TRIM(disco_espacio)) ~ '^[0-9]+([.,][0-9]+)?[[:space:]]*MB$'
    THEN ROUND((REPLACE(REGEXP_REPLACE(UPPER(TRIM(disco_espacio)), '[^0-9.,]', '', 'g'), ',', '.')::NUMERIC / 1024), 2)
  WHEN UPPER(TRIM(disco_espacio)) ~ '^[0-9]+([.,][0-9]+)?[[:space:]]*GB$'
    THEN REPLACE(REGEXP_REPLACE(UPPER(TRIM(disco_espacio)), '[^0-9.,]', '', 'g'), ',', '.')::NUMERIC
  WHEN UPPER(TRIM(disco_espacio)) ~ '^[0-9]+([.,][0-9]+)?[[:space:]]*TB$'
    THEN REPLACE(REGEXP_REPLACE(UPPER(TRIM(disco_espacio)), '[^0-9.,]', '', 'g'), ',', '.')::NUMERIC * 1024
  ELSE NULL
END;

-- Mantiene las columnas historicas sincronizadas en un formato canonico.
-- Los valores ambiguos conservan su texto original para facilitar la revision.
UPDATE public.inventario_activos
SET ram = TO_CHAR(ram_gb, 'FM999999999990.##') || ' GB'
WHERE ram_gb IS NOT NULL;

UPDATE public.inventario_activos
SET disco_espacio = TO_CHAR(disco_gb, 'FM999999999990.##') || ' GB'
WHERE disco_gb IS NOT NULL;

-- Diagnostico posterior al backfill: conteos y filas para revision manual.
SELECT
  COUNT(*) FILTER (WHERE ram_gb IS NULL)::INTEGER AS ram_gb_null,
  COUNT(*) FILTER (WHERE disco_gb IS NULL)::INTEGER AS disco_gb_null
FROM public.inventario_activos;

SELECT id, ram, ram_gb, disco_espacio, disco_gb
FROM public.inventario_activos
WHERE ram_gb IS NULL OR disco_gb IS NULL
ORDER BY id;

