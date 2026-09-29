BEGIN;

-- Corrige valores de modalidad (p. ej. "Simétrica") guardados por error en
-- velocidad_plan. Los Mbps reales se extraen del nombre separado del plan.
UPDATE public.envios_ventas
SET velocidad_plan = CONCAT(
  (regexp_match(plan_contratado, '(\d+(?:[.,]\d+)?)\s*(Mbps?|Megas?|Gbps?)', 'i'))[1],
  ' ',
  (regexp_match(plan_contratado, '(\d+(?:[.,]\d+)?)\s*(Mbps?|Megas?|Gbps?)', 'i'))[2]
)
WHERE plan_contratado ~* '(\d+(?:[.,]\d+)?)\s*(Mbps?|Megas?|Gbps?)'
  AND (velocidad_plan IS NULL OR velocidad_plan !~ '\d');

COMMIT;
