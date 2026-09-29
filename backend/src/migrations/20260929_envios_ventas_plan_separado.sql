BEGIN;

ALTER TABLE public.envios_ventas
  ADD COLUMN IF NOT EXISTS plan_contratado text,
  ADD COLUMN IF NOT EXISTS velocidad_plan text;

-- Recupera el nombre del plan para registros históricos. La velocidad se
-- completará desde el catálogo al crear o editar una venta, pues no siempre
-- puede deducirse de manera confiable del texto anterior.
UPDATE public.envios_ventas
SET plan_contratado = NULLIF(BTRIM(
  CASE
    WHEN POSITION(' — ' IN COALESCE(plan_contratado_final, '')) > 0
      THEN SPLIT_PART(plan_contratado_final, ' — ', 2)
    ELSE plan_contratado_final
  END
), '')
WHERE plan_contratado IS NULL
  AND NULLIF(BTRIM(COALESCE(plan_contratado_final, '')), '') IS NOT NULL;

COMMIT;
