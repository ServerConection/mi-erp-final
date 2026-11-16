-- Reclasifica como NOVONET las ventas de noviembre de 2026 que fueron
-- registradas como SEMILLERO. No modifica IDs ni datos del CRM/Bitrix.
--
-- La copia JSON permite revertir individualmente cada fila si fuera necesario.
-- La PK vuelve esta migracion idempotente: una fila se audita una sola vez.

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
  WHERE public.parse_fecha_flex(e.fecha_registro_sistema::text) >= DATE '2026-11-01'
    AND public.parse_fecha_flex(e.fecha_registro_sistema::text) <  DATE '2026-12-01'
    AND UPPER(BTRIM(e.distribuidor_autorizado)) = 'SEMILLERO'
),
auditadas AS (
  INSERT INTO public.auditoria_migracion_empresa_ventas (
    migracion, envio_venta_id, empresa_anterior, empresa_nueva, fila_anterior
  )
  SELECT
    '20261116_semillero_novonet_noviembre',
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
RETURNING e.id, e.id_bitrix, e.estatus_envio, e.distribuidor_autorizado;

COMMIT;

