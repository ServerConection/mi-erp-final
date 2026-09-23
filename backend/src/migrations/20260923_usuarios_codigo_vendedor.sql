-- Código comercial utilizado para relacionar al usuario del ERP con sus ventas.
-- Es opcional porque no todos los usuarios tienen un código asignado.
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS codigo_vendedor VARCHAR(100);

COMMENT ON COLUMN public.usuarios.codigo_vendedor IS
  'Código de vendedor/asesor usado para relacionar al usuario con registros comerciales';
