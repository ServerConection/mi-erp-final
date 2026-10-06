BEGIN;

-- Corrige valores de modalidad (p. ej. "Simétrica") guardados por error en
-- velocidad_plan. Los Mbps reales se extraen del nombre separado del plan.
UPDATE public.envios_ventas
SET velocidad_plan = CONCAT(
  (regexp_match(plan_contratado_final, '(\d+(?:[.,]\d+)?)\s*(Mbps?|Megas?|Gbps?)', 'i'))[1],
  ' ',
  (regexp_match(plan_contratado_final, '(\d+(?:[.,]\d+)?)\s*(Mbps?|Megas?|Gbps?)', 'i'))[2]
)
WHERE plan_contratado_final ~* '(\d+(?:[.,]\d+)?)\s*(Mbps?|Megas?|Gbps?)'
  AND (velocidad_plan IS NULL OR velocidad_plan !~ '\d');

-- plan_contratado conserva únicamente el segmento/tipo. El nombre completo
-- con su velocidad permanece en plan_contratado_final por compatibilidad.
UPDATE public.envios_ventas
SET plan_contratado = NULLIF(BTRIM(
  CASE
    WHEN POSITION(' — ' IN COALESCE(plan_contratado_final, '')) > 0
      THEN SPLIT_PART(plan_contratado_final, ' — ', 1)
    ELSE REGEXP_REPLACE(
      plan_contratado_final,
      '\s*\d+(?:[.,]\d+)?\s*(Mbps?|Megas?|Gbps?).*$',
      '',
      'i'
    )
  END
), '')
WHERE NULLIF(BTRIM(COALESCE(plan_contratado_final, '')), '') IS NOT NULL;

COMMIT;
