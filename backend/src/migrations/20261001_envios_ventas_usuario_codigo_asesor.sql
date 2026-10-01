BEGIN;

ALTER TABLE public.envios_ventas
  ADD COLUMN IF NOT EXISTS usuario TEXT;

COMMENT ON COLUMN public.envios_ventas.usuario IS
  'Login del usuario ERP que registró la venta.';

COMMENT ON COLUMN public.envios_ventas.codigo_asesor IS
  'Código comercial tomado de usuarios.codigo_vendedor.';

UPDATE public.envios_ventas ev
SET usuario = COALESCE(NULLIF(TRIM(ev.usuario), ''), u.usuario),
    codigo_asesor = COALESCE(NULLIF(TRIM(u.codigo_vendedor), ''), ev.codigo_asesor)
FROM public.usuarios u
WHERE u.id = ev.usuario_id
  AND (
    ev.usuario IS NULL
    OR TRIM(ev.usuario) = ''
    OR NULLIF(TRIM(u.codigo_vendedor), '') IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_envios_ventas_usuario
  ON public.envios_ventas (usuario);

COMMIT;
