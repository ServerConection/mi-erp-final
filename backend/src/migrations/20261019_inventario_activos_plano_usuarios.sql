-- INVENTARIO DE ACTIVOS TI: usuario asignado e IDs seguros para el plano.
-- EJECUCION MANUAL EN POSTGRESQL (pgAdmin / psql).

BEGIN;

ALTER TABLE public.inventario_activos
  ADD COLUMN IF NOT EXISTS usuario_asignado_id INTEGER
    REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventario_activos_usuario_asignado_idx
  ON public.inventario_activos (usuario_asignado_id);

-- Backfill conservador: solo relaciona el login exacto que ya figura como
-- responsable. Los registros del script quedan sin asignar.
UPDATE public.inventario_activos ia
SET usuario_asignado_id = u.id
FROM public.usuarios u
WHERE ia.usuario_asignado_id IS NULL
  AND UPPER(BTRIM(ia.responsable)) = UPPER(BTRIM(u.usuario));

-- El mismo advisory lock se usa al insertar un id_solicitado. De ese modo una
-- creacion automatica y una explicita no pueden elegir simultaneamente el mismo ID.
CREATE OR REPLACE FUNCTION public.inventario_activos_siguiente_id()
RETURNS VARCHAR(30)
LANGUAGE plpgsql
AS $$
DECLARE
  candidato VARCHAR(30);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('inventario_activos_id'));
  LOOP
    candidato := 'EQ-' || LPAD(NEXTVAL('public.inventario_activos_id_seq')::TEXT, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.inventario_activos WHERE id = candidato
    );
  END LOOP;
  RETURN candidato;
END;
$$;

ALTER TABLE public.inventario_activos
  ALTER COLUMN id SET DEFAULT public.inventario_activos_siguiente_id();

SELECT setval(
  'public.inventario_activos_id_seq',
  GREATEST(
    (SELECT last_value FROM public.inventario_activos_id_seq),
    COALESCE((
      SELECT MAX(SUBSTRING(id FROM '^EQ-([0-9]+)$')::BIGINT)
      FROM public.inventario_activos
      WHERE id ~ '^EQ-[0-9]+$'
    ), 1)
  ),
  true
);

COMMENT ON COLUMN public.inventario_activos.usuario_asignado_id IS
  'Usuario ERP que utiliza el activo; responsable conserva quien lo registro.';

COMMIT;
