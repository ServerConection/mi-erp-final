-- Reclasifica como NOVONET las ventas que siguen como SEMILLERO y cuya fecha
-- de activacion corresponde a noviembre de 2026. Complementa la migracion del
-- 16-11, que se basaba en la fecha de registro y no cubria el backlog.
--
-- Cada fila se respalda completa en JSON antes del UPDATE. La clave primaria
-- de auditoria hace que la migracion sea idempotente y permite revertirla.

BEGIN;

CREATE TABLE IF NOT EXISTS public.auditoria_migracion_empresa_ventas (
  migracion             text        NOT NULL,
  envio_venta_id        bigint      NOT NULL,
  empresa_anterior      text,
  empresa_nueva         text        NOT NULL,
  fila_anterior         jsonb       NOT NULL,
  migrado_en            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (migracion, envio_venta_id)
);

WITH candidatas AS (
  SELECT e.*
  FROM public.envios_ventas e
  WHERE public.parse_fecha_flex(e.fecha_activacion_netlife::text) >= DATE '2026-11-01'
    AND public.parse_fecha_flex(e.fecha_activacion_netlife::text) <  DATE '2026-12-01'
    AND UPPER(BTRIM(e.distribuidor_autorizado)) = 'SEMILLERO'
),
auditadas AS (
  INSERT INTO public.auditoria_migracion_empresa_ventas (
    migracion, envio_venta_id, empresa_anterior, empresa_nueva, fila_anterior
  )
  SELECT
    '20261118_semillero_novonet_activadas_noviembre',
    c.id,
    c.distribuidor_autorizado,
    'NOVONET',
    to_jsonb(c)
  FROM candidatas c
  ON CONFLICT (migracion, envio_venta_id) DO NOTHING
  RETURNING envio_venta_id
)
UPDATE public.envios_ventas e
SET distribuidor_autorizado = 'NOVONET'
FROM auditadas a
WHERE e.id = a.envio_venta_id
RETURNING e.id, e.id_bitrix, e.fecha_activacion_netlife,
          e.estatus_envio, e.distribuidor_autorizado;

COMMIT;
